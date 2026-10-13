import Anthropic from "@anthropic-ai/sdk";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { formatReasoningContext } from "../state.js";
import type { AIBuyRecommendation, AIProvider, AIProviderInput } from "./types.js";
import { buildObservationPrompt, buildDecisionPrompt, type TickerObservation } from "./prompts.js";
import { observationSchema, decisionSchema, strictify } from "./schemas.js";
import {
  resolveClaudeTransport,
  extractStructuredPayload,
  extractMessagesPayload,
} from "./claudeTransport.js";

// ── Structured output ──────────────────────────────────────────────
// Both transports use JSON Schema structured output (`output_config.format` on the API,
// `outputFormat` on the Agent SDK), fed the schemas shared with the other providers (./schemas.ts).

// ── Helpers ────────────────────────────────────────────────────────
// Default to Sonnet 5.5 — best balance of structured-reasoning quality and
// cost for this workload. Override via env if the user has a different tier
// available or wants to use Haiku for cheaper runs.
export const DEFAULT_MODEL = "claude-sonnet-5-5";

// Output ceiling per stage. This is a cap, not a cost — tokens are only billed
// when actually generated. It must comfortably exceed the largest possible
// structured response: Stage 1 emits one verbose observation per ticker across
// the WHOLE universe (portfolio + watch list), so a large watch list can push
// 24+ entries. At 8192 the tool-call JSON was truncated mid-stream for big
// universes, which the SDK surfaces as an empty `observations` array — Claude
// then silently contributed nothing. 64000 since Sonnet/Opus 5.5 think by default, billed to this cap;
// above ~21k the SDK refuses non-streaming calls, hence runApiKeyStage streams.
export const MAX_OUTPUT_TOKENS = 64000;

// The Claude Agent SDK enforces its own output-token ceiling — 32,000 tokens —
// completely separate from the api-key path's `max_tokens` above. A real
// 21-ticker daily run blew through it ("Claude's response exceeded the 32000
// output token maximum"), and Claude was silently dropped from the brief for
// the rest of the run, degrading to whichever other providers were still up.
// 64000 is headroom, not a tuned number — Sonnet 4.6 supports far more.
// Worth noting: on Sonnet 4.6 the api-key path finished the same Stage 2 work within 16384
// tokens, so the subscription transport is evidently emitting substantially
// more output for identical input. Revisit this constant if it ever gets hit
// again — that would mean the asymmetry is drifting, not just a one-off spike.
export const SUBSCRIPTION_MAX_OUTPUT_TOKENS = 64000;

// ── API-key transport ──────────────────────────────────────────────
export async function runApiKeyStage(
  prompt: string,
  schema: Record<string, unknown>,
  model: string,
  stage: string,
): Promise<unknown> {
  // The SDK reads ANTHROPIC_API_KEY from env automatically; passing it
  // explicitly here makes the dependency obvious from the call site.
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await client.messages
    .stream({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      output_config: { format: { type: "json_schema", schema: strictify(schema) } },
      messages: [{ role: "user", content: prompt }],
    })
    .finalMessage();
  return extractMessagesPayload(message, stage);
}

// ── Subscription transport ─────────────────────────────────────────
// Runs one structured stage through the Claude Agent SDK against the user's
// Pro/Max allocation. `tools: []` matters: the Agent SDK ships Claude Code's
// coding harness, and this workload is pure inference — no filesystem, no
// shell, no web access in the run.

function assertShape<T>(value: unknown, key: string, stage: string): T {
  if (!value || typeof value !== "object" || !(key in value)) {
    throw new Error(
      `Claude ${stage} returned no "${key}" — got ` + `${JSON.stringify(value)?.slice(0, 200)}`,
    );
  }
  return value as T;
}

async function runSubscriptionStage<T>(
  prompt: string,
  schema: Record<string, unknown>,
  stage: string,
  rootKey: string,
): Promise<T> {
  // Strip ANTHROPIC_API_KEY from the child env. It outranks OAuth inside Claude
  // Code, so leaving it set would silently bill API credits — the exact outcome
  // this transport exists to avoid.
  const { ANTHROPIC_API_KEY: _dropped, ...env } = process.env;

  // Raise the Agent SDK's own output ceiling (see SUBSCRIPTION_MAX_OUTPUT_TOKENS
  // above) — but respect an operator override if one is already set, rather
  // than clobbering it.
  if (!env.CLAUDE_CODE_MAX_OUTPUT_TOKENS) {
    env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = String(SUBSCRIPTION_MAX_OUTPUT_TOKENS);
  }

  let payload: unknown;

  for await (const message of query({
    prompt,
    options: {
      tools: [],
      outputFormat: { type: "json_schema", schema },
      env,
      // Always pin the model, even when CLAUDE_MODEL is unset — a live spike
      // showed the Agent SDK otherwise inherits an ambient Opus-tier model.
      // This runs 12 stage-calls a day; silently drifting off Sonnet would
      // burn through the Pro allocation this whole change exists to conserve.
      model: process.env.CLAUDE_MODEL || DEFAULT_MODEL,
      // Left unset, the Agent SDK loads every setting source, and
      // Settings.env from a filesystem settings.json (~/.claude/settings.json,
      // .claude/settings.json, or a managed-settings policy) is applied AFTER
      // the env-strip above — so a settings file defining ANTHROPIC_API_KEY
      // (or ANTHROPIC_AUTH_TOKEN) would silently re-inject the credential we
      // just stripped. It also keeps this repo's own CLAUDE.md and coding
      // instructions (git-tracked, so live in CI) out of what's meant to be a
      // pure inference prompt.
      settingSources: [],
    },
  })) {
    if (message.type !== "result") continue;
    const extracted = extractStructuredPayload(message);
    if (extracted !== null) payload = extracted;
  }

  if (payload === undefined) {
    throw new Error(`Claude ${stage} (subscription) produced no result message`);
  }
  return assertShape<T>(payload, rootKey, stage);
}

// ── Provider ───────────────────────────────────────────────────────
export class ClaudeProvider implements AIProvider {
  readonly id = "claude";
  readonly label = "Claude";
  readonly shortLabel = "C";

  get model(): string {
    return process.env.CLAUDE_MODEL || DEFAULT_MODEL;
  }

  get available(): boolean {
    return (
      resolveClaudeTransport(process.env.CLAUDE_CODE_OAUTH_TOKEN, process.env.ANTHROPIC_API_KEY) !==
      null
    );
  }

  async analyze(input: AIProviderInput): Promise<AIBuyRecommendation[]> {
    const transport = resolveClaudeTransport(
      process.env.CLAUDE_CODE_OAUTH_TOKEN,
      process.env.ANTHROPIC_API_KEY,
    );
    if (!transport) return [];

    const model = process.env.CLAUDE_MODEL || DEFAULT_MODEL;
    const { report, priceData, news, technicals, macroContext, reasoningHistory } = input;

    console.log(`Running Claude analysis (Stage 1: Observe, ${model}, ${transport})...`);

    const obsPrompt = buildObservationPrompt(report, priceData, news, technicals, macroContext);

    let observations: TickerObservation[];
    if (transport === "subscription") {
      const obsInput = await runSubscriptionStage<{ observations: TickerObservation[] }>(
        obsPrompt,
        observationSchema,
        "Stage 1",
        "observations",
      );
      observations = obsInput.observations ?? [];
    } else {
      const obsInput = assertShape<{ observations: TickerObservation[] }>(
        await runApiKeyStage(obsPrompt, observationSchema, model, "Stage 1"),
        "observations",
        "Stage 1",
      );
      observations = obsInput.observations ?? [];
    }

    console.log(`  Stage 1 complete — ${observations.length} observations`);
    for (const obs of observations) {
      const signals = [...obs.priceLevelSignals, ...obs.momentumSignals];
      const flags = obs.riskFlags;
      if (signals.length > 0 || flags.length > 0) {
        console.log(`    ${obs.ticker}: ${signals.length} signals, ${flags.length} flags`);
      }
    }

    console.log(`Running Claude analysis (Stage 2: Decide, ${model}, ${transport})...`);
    const reasoningContext = formatReasoningContext(reasoningHistory, this.id);
    const decPrompt = buildDecisionPrompt(
      observations,
      report,
      macroContext,
      reasoningContext,
      technicals,
      priceData,
    );

    if (transport === "subscription") {
      const decInput = await runSubscriptionStage<{ recommendations: AIBuyRecommendation[] }>(
        decPrompt,
        decisionSchema,
        "Stage 2",
        "recommendations",
      );
      return decInput.recommendations ?? [];
    }

    const decInput = assertShape<{ recommendations: AIBuyRecommendation[] }>(
      await runApiKeyStage(decPrompt, decisionSchema, model, "Stage 2"),
      "recommendations",
      "Stage 2",
    );
    return decInput.recommendations ?? [];
  }
}

export const claudeProvider = new ClaudeProvider();
