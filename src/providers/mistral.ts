import { formatReasoningContext } from "../state.js";
import type { AIBuyRecommendation, AIProvider, AIProviderInput } from "./types.js";
import { buildObservationPrompt, buildDecisionPrompt, type TickerObservation } from "./prompts.js";
import { observationSchema, decisionSchema, strictify } from "./schemas.js";

// ── Mistral provider ───────────────────────────────────────────────
// Uses La Plateforme's OpenAI-compatible chat-completions endpoint over native
// fetch — no SDK dependency, same approach as src/social.ts takes for four
// platforms. Structured output uses `response_format: json_schema` with
// `strict: true`, which constrains decoding to the schema rather than merely
// asking for JSON, so responses parse reliably without repair heuristics.
//
// Chosen as the second provider because the free Experiment tier is permanent
// (~1B tokens/month against this workload's ~7M) and Mistral is an independent
// model lineage from Gemini. That independence is the point: with the unanimity
// rule, a second model only adds information if its disagreement reflects the
// data rather than the model being weaker.

const API_URL = "https://api.mistral.ai/v1/chat/completions";

// Large is the strongest model on the free Experiment tier. Override with
// MISTRAL_MODEL (e.g. mistral-medium-latest) to trade quality for headroom.
const DEFAULT_MODEL = "mistral-large-latest";

// Matches Claude's ceiling and for the same reason: Stage 1 emits one verbose
// observation per ticker across the whole universe, so a large watch list can
// push 24+ entries. A cap, not a cost — only generated tokens are billed.
const MAX_OUTPUT_TOKENS = 16384;

// Strict mode needs additionalProperties:false and exhaustive `required` on
// every object. Derived once at module load rather than maintained by hand.
const strictObservationSchema = strictify(observationSchema);
const strictDecisionSchema = strictify(decisionSchema);

interface MistralResponse {
  choices?: Array<{
    finish_reason?: string;
    message?: { content?: string | null };
  }>;
}

/** The model this run uses — env override, else the default. */
export function mistralModel(): string {
  return process.env.MISTRAL_MODEL || DEFAULT_MODEL;
}

/**
 * One schema-constrained call, with retry on the transient failures a
 * rate-limited free tier actually produces: 429 (rate limit) and 5xx.
 *
 * Exported so detailedAnalysis.ts can generate the STRONG BUY page through the
 * same transport — retries, truncation detection and error shape included —
 * rather than hand-rolling a second fetch that drifts from this one.
 */
export async function mistralCall(
  apiKey: string,
  model: string,
  prompt: string,
  schemaName: string,
  schema: unknown,
  maxRetries = 2,
  maxTokens = MAX_OUTPUT_TOKENS,
): Promise<string> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
        response_format: {
          type: "json_schema",
          json_schema: { name: schemaName, schema, strict: true },
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < maxRetries) {
        const delay = (attempt + 1) * 5000;
        console.log(
          `  ⚠ Mistral ${res.status} — retrying in ${delay / 1000}s (attempt ${attempt + 1}/${maxRetries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw new Error(`Mistral ${res.status}: ${body.slice(0, 300)}`);
    }

    const json = (await res.json()) as MistralResponse;
    const choice = json.choices?.[0];

    // A truncated response yields incomplete JSON that would either throw in
    // JSON.parse or parse into a short array — either way the provider would
    // contribute less than it should. Fail loudly so the orchestrator drops
    // Mistral and marks the run degraded, rather than silently under-reporting.
    if (choice?.finish_reason === "length") {
      throw new Error(
        `Mistral "${schemaName}" truncated (finish_reason=length at ${maxTokens} tokens) — ` +
          `output exceeded the cap. Raise MAX_OUTPUT_TOKENS.`,
      );
    }

    const content = choice?.message?.content;
    if (!content) {
      throw new Error(
        `Mistral returned no content for "${schemaName}" (finish_reason=${choice?.finish_reason ?? "none"})`,
      );
    }
    return content;
  }
  throw new Error(`Mistral "${schemaName}" failed after ${maxRetries} retries`);
}

function parseJson<T>(raw: string, what: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    throw new Error(
      `Mistral ${what} was not valid JSON despite strict mode: ${(err as Error).message}`,
    );
  }
}

// ── Provider ───────────────────────────────────────────────────────
export class MistralProvider implements AIProvider {
  readonly id = "mistral";
  readonly label = "Mistral";
  readonly shortLabel = "M";

  get available(): boolean {
    return !!process.env.MISTRAL_API_KEY;
  }

  async analyze(input: AIProviderInput): Promise<AIBuyRecommendation[]> {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) return [];

    const model = mistralModel();
    const { report, priceData, news, technicals, macroContext, reasoningHistory } = input;

    console.log(`Running Mistral analysis (Stage 1: Observe, ${model})...`);
    const obsPrompt = buildObservationPrompt(report, priceData, news, technicals, macroContext);
    const obsRaw = await mistralCall(
      apiKey,
      model,
      obsPrompt,
      "submit_observations",
      strictObservationSchema,
    );
    const observations =
      parseJson<{ observations: TickerObservation[] }>(obsRaw, "Stage 1").observations ?? [];

    console.log(`  Stage 1 complete — ${observations.length} observations`);
    for (const obs of observations) {
      const signals = [...obs.priceLevelSignals, ...obs.momentumSignals];
      if (signals.length > 0 || obs.riskFlags.length > 0) {
        console.log(`    ${obs.ticker}: ${signals.length} signals, ${obs.riskFlags.length} flags`);
      }
    }

    console.log(`Running Mistral analysis (Stage 2: Decide, ${model})...`);
    const reasoningContext = formatReasoningContext(reasoningHistory, this.id);
    const decPrompt = buildDecisionPrompt(
      observations,
      report,
      macroContext,
      reasoningContext,
      technicals,
      priceData,
    );
    const decRaw = await mistralCall(
      apiKey,
      model,
      decPrompt,
      "submit_recommendations",
      strictDecisionSchema,
    );
    return (
      parseJson<{ recommendations: AIBuyRecommendation[] }>(decRaw, "Stage 2").recommendations ?? []
    );
  }
}

export const mistralProvider = new MistralProvider();
