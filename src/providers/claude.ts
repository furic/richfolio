import Anthropic from "@anthropic-ai/sdk";
import { formatReasoningContext } from "../state.js";
import type { AIBuyRecommendation, AIProvider, AIProviderInput } from "./types.js";
import { buildObservationPrompt, buildDecisionPrompt, type TickerObservation } from "./prompts.js";
import { observationSchema, decisionSchema } from "./schemas.js";

// ── Structured output ──────────────────────────────────────────────
// Anthropic's structured-output pattern is "tool use": declare a tool whose
// `input_schema` describes the JSON we want back, force the model to call it,
// then read its arguments. The schemas are shared with the other JSON Schema
// providers (see ./schemas.ts) so the output contract can't drift between them.

// ── Helpers ────────────────────────────────────────────────────────
// Default to Sonnet 4.6 — best balance of structured-reasoning quality and
// cost for this workload. Override via env if the user has a different tier
// available or wants to use Haiku for cheaper runs.
const DEFAULT_MODEL = "claude-sonnet-4-6";

// Output ceiling per stage. This is a cap, not a cost — tokens are only billed
// when actually generated. It must comfortably exceed the largest possible
// structured response: Stage 1 emits one verbose observation per ticker across
// the WHOLE universe (portfolio + watch list), so a large watch list can push
// 24+ entries. At 8192 the tool-call JSON was truncated mid-stream for big
// universes, which the SDK surfaces as an empty `observations` array — Claude
// then silently contributed nothing. 16384 leaves generous headroom; Sonnet
// 4.6 supports far more.
const MAX_OUTPUT_TOKENS = 16384;

interface ClaudeToolCall {
  type: string;
  name?: string;
  input?: unknown;
}

function extractToolInput(
  contentBlocks: Array<ClaudeToolCall | { type: string }>,
  expectedToolName: string,
): unknown {
  for (const block of contentBlocks) {
    if (block.type === "tool_use" && (block as ClaudeToolCall).name === expectedToolName) {
      return (block as ClaudeToolCall).input;
    }
  }
  throw new Error(
    `Claude response missing expected tool_use block for "${expectedToolName}". ` +
      `Got: ${contentBlocks.map((b) => b.type).join(", ")}`,
  );
}

// ── Provider ───────────────────────────────────────────────────────
export class ClaudeProvider implements AIProvider {
  readonly id = "claude";
  readonly label = "Claude";
  readonly shortLabel = "C";

  get available(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  async analyze(input: AIProviderInput): Promise<AIBuyRecommendation[]> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return [];

    const model = process.env.CLAUDE_MODEL || DEFAULT_MODEL;
    const { report, priceData, news, technicals, macroContext, reasoningHistory } = input;

    console.log(`Running Claude analysis (Stage 1: Observe, ${model})...`);
    // The SDK reads ANTHROPIC_API_KEY from env automatically; passing it
    // explicitly here makes the dependency obvious from the call site.
    const client = new Anthropic({ apiKey });

    const obsPrompt = buildObservationPrompt(report, priceData, news, technicals, macroContext);

    const obsResponse = await client.messages.create({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      tools: [
        {
          name: "submit_observations",
          description: "Submit structured per-ticker observations.",
          input_schema: observationSchema,
        },
      ],
      tool_choice: { type: "tool", name: "submit_observations" },
      messages: [{ role: "user", content: obsPrompt }],
    });

    // A truncated tool call yields a tool_use block whose JSON is incomplete,
    // which the SDK parses into an empty `observations` array. Fail loudly so
    // the orchestrator drops Claude and degrades cleanly, rather than letting
    // Claude "succeed" with zero observations and contribute nothing.
    if (obsResponse.stop_reason === "max_tokens") {
      throw new Error(
        `Claude Stage 1 truncated (stop_reason=max_tokens at ${MAX_OUTPUT_TOKENS} tokens) — ` +
          `observation output exceeded the cap. Raise MAX_OUTPUT_TOKENS.`,
      );
    }

    const obsInput = extractToolInput(obsResponse.content, "submit_observations") as {
      observations: TickerObservation[];
    };
    const observations = obsInput.observations ?? [];

    console.log(`  Stage 1 complete — ${observations.length} observations`);
    for (const obs of observations) {
      const signals = [...obs.priceLevelSignals, ...obs.momentumSignals];
      const flags = obs.riskFlags;
      if (signals.length > 0 || flags.length > 0) {
        console.log(`    ${obs.ticker}: ${signals.length} signals, ${flags.length} flags`);
      }
    }

    console.log(`Running Claude analysis (Stage 2: Decide, ${model})...`);
    const reasoningContext = formatReasoningContext(reasoningHistory, this.id);
    const decPrompt = buildDecisionPrompt(
      observations,
      report,
      macroContext,
      reasoningContext,
      technicals,
      priceData,
    );

    const decResponse = await client.messages.create({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      tools: [
        {
          name: "submit_recommendations",
          description: "Submit final buy/hold/wait recommendations.",
          input_schema: decisionSchema,
        },
      ],
      tool_choice: { type: "tool", name: "submit_recommendations" },
      messages: [{ role: "user", content: decPrompt }],
    });

    if (decResponse.stop_reason === "max_tokens") {
      throw new Error(
        `Claude Stage 2 truncated (stop_reason=max_tokens at ${MAX_OUTPUT_TOKENS} tokens) — ` +
          `recommendation output exceeded the cap. Raise MAX_OUTPUT_TOKENS.`,
      );
    }

    const decInput = extractToolInput(decResponse.content, "submit_recommendations") as {
      recommendations: AIBuyRecommendation[];
    };
    return decInput.recommendations ?? [];
  }
}

export const claudeProvider = new ClaudeProvider();
