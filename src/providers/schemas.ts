// ── Shared structured-output schemas ───────────────────────────────
// The two-stage pipeline's output contract, as plain JSON Schema. Every
// provider that speaks JSON Schema (Claude tool-use, Mistral json_schema,
// OpenAI structured outputs) uses these, so adding a field can't leave one
// provider silently returning a different shape from another.
//
// Gemini is the exception: it uses the SDK's own `Type.*` schema constants in
// gemini.ts. Keep the two in sync when changing either.

export const observationSchema = {
  type: "object" as const,
  properties: {
    observations: {
      type: "array",
      description:
        "One entry per ticker shown — both portfolio holdings AND tickers marked [WATCH LIST]. Return entries for ALL tickers even if no signals are present (use empty arrays).",
      items: {
        type: "object",
        properties: {
          ticker: { type: "string" },
          priceLevelSignals: {
            type: "array",
            items: { type: "string" },
            description:
              "Price-level signals present (e.g. 'P/E below historical avg', '52w position < 30%', 'price below 200MA'). Empty array if none.",
          },
          momentumSignals: {
            type: "array",
            items: { type: "string" },
            description:
              "Momentum signals present (e.g. 'RSI < 35', 'bullish MACD crossover', 'Bollinger %B < 0.15', 'Stochastic %K < 20'). Empty array if none.",
          },
          riskFlags: {
            type: "array",
            items: { type: "string" },
            description:
              "Risk flags (e.g. 'overbought RSI > 70', 'near 52w high', 'bearish MACD crossover', 'death cross'). Empty array if none.",
          },
          valueSummary: { type: "string" },
          technicalSummary: { type: "string" },
          newsSentiment: {
            type: "string",
            description: "One of: 'positive', 'negative', 'neutral', 'mixed', 'none'",
          },
          allocationContext: { type: "string" },
        },
        required: [
          "ticker",
          "priceLevelSignals",
          "momentumSignals",
          "riskFlags",
          "valueSummary",
          "technicalSummary",
          "newsSentiment",
          "allocationContext",
        ],
      },
    },
  },
  required: ["observations"],
};

export const decisionSchema = {
  type: "object" as const,
  properties: {
    recommendations: {
      type: "array",
      description: "One entry per ticker. Sort by confidence descending.",
      items: {
        type: "object",
        properties: {
          ticker: { type: "string" },
          action: {
            type: "string",
            enum: ["STRONG BUY", "BUY", "HOLD", "WAIT"],
          },
          confidence: {
            type: "number",
            description: "0-100",
          },
          reason: { type: "string" },
          suggestedBuyValue: {
            type: "number",
            description:
              "USD amount to invest this time based on the calculated gap amount. 0 if HOLD or WAIT.",
          },
          suggestedLimitPrice: {
            type: "number",
            description:
              "For STRONG BUY and BUY: limit order price below market at nearby support. 0 if HOLD or WAIT.",
          },
          limitPriceReason: { type: "string" },
          valueRating: {
            type: "string",
            description:
              "For US stocks only: A (excellent), B (good), C (fair), D (overvalued). Empty string for ETFs/crypto.",
          },
          bottomSignal: {
            type: "string",
            description:
              "Brief bottom/oversold signal if 3+ indicators are present for stocks/ETFs (or 2+ for crypto). Empty string if not enough indicators.",
          },
        },
        required: [
          "ticker",
          "action",
          "confidence",
          "reason",
          "suggestedBuyValue",
          "suggestedLimitPrice",
          "limitPriceReason",
          "valueRating",
          "bottomSignal",
        ],
      },
    },
  },
  required: ["recommendations"],
};

/**
 * The dedicated STRONG BUY "More Details" page. Shared by every JSON Schema
 * provider that can generate it (see detailedAnalysis.ts); Gemini keeps its own
 * `Type.*` copy in that file.
 */
export const detailedSchema = {
  type: "object" as const,
  properties: {
    buyThesis: {
      type: "string",
      description: "3-4 paragraph detailed buy thesis (150-200 words total).",
    },
    risks: {
      type: "array",
      items: { type: "string" },
      description: "3-4 specific risk factors, each 1 sentence.",
    },
  },
  required: ["buyThesis", "risks"],
};

/**
 * Strict-mode dialects (Mistral's `json_schema` with `strict: true`, OpenAI's
 * structured outputs) constrain decoding to the schema, which requires every
 * object to declare `additionalProperties: false` and list all of its
 * properties in `required`. Rather than maintain a second copy of each schema,
 * derive it: walk the tree and add what strict mode demands.
 *
 * Returns a deep copy — the input schemas are shared module-level objects and
 * must not be mutated.
 */
export function strictify<T>(schema: T): T {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node === null || typeof node !== "object") return node;

    const src = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(src)) out[k] = walk(v);

    if (out.type === "object" && out.properties && typeof out.properties === "object") {
      out.additionalProperties = false;
      out.required = Object.keys(out.properties as Record<string, unknown>);
    }
    return out;
  };
  return walk(schema) as T;
}
