import { GoogleGenAI, Type } from "@google/genai";
import { formatReasoningContext } from "../state.js";
import type { AIBuyRecommendation, AIProvider, AIProviderInput } from "./types.js";
import { buildObservationPrompt, buildDecisionPrompt, type TickerObservation } from "./prompts.js";

// ── Gemini-specific JSON schemas ───────────────────────────────────
// These use `@google/genai`'s `Type` enum and are not portable to other SDKs.
// When Claude/OpenAI providers are added, each owns its own equivalent in its
// own SDK's idiom (Anthropic tool-use JSON Schema, OpenAI function-call, etc.).

const observationSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      ticker: { type: Type.STRING, description: "The ticker symbol" },
      priceLevelSignals: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description:
          "Price-level signals present: e.g. 'P/E below historical avg', '52w position < 30%', 'price below 200MA'. Empty array if none.",
      },
      momentumSignals: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description:
          "Momentum signals present: e.g. 'RSI < 35', 'bullish MACD crossover', 'Bollinger %B < 0.15'. Empty array if none.",
      },
      riskFlags: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description:
          "Risk flags: e.g. 'bearish MACD divergence', 'overbought RSI > 70', 'near 52w high', 'death cross'. Empty array if none.",
      },
      valueSummary: {
        type: Type.STRING,
        description:
          "1-sentence valuation assessment referencing P/E, 52w position, and fundamental data",
      },
      technicalSummary: {
        type: Type.STRING,
        description:
          "1-sentence technical assessment referencing MA, RSI, MACD, Bollinger, momentum",
      },
      newsSentiment: {
        type: Type.STRING,
        description:
          "Overall news sentiment: 'positive', 'negative', 'neutral', 'mixed', or 'none'",
      },
      allocationContext: {
        type: Type.STRING,
        description: "1-sentence allocation context: gap %, direction, and dollar amount needed",
      },
    },
    propertyOrdering: [
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
};

const decisionSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      ticker: { type: Type.STRING, description: "The ticker symbol" },
      action: {
        type: Type.STRING,
        description: "One of: STRONG BUY, BUY, HOLD, WAIT",
      },
      confidence: {
        type: Type.NUMBER,
        description: "Confidence level 0-100",
      },
      reason: {
        type: Type.STRING,
        description: "1-2 sentence explanation of why this action is recommended",
      },
      suggestedBuyValue: {
        type: Type.NUMBER,
        description:
          "USD amount to invest this time based on the calculated gap amount. For gaps ≤$5000 use full amount; for gaps >$5000 use 60-100% for high conviction or $3000-5000 first tranche for moderate. 0 if HOLD or WAIT.",
      },
      suggestedLimitPrice: {
        type: Type.NUMBER,
        description:
          "For STRONG BUY and BUY: a limit order price below current market based on nearby support (moving average, recent low, round number). 0 if HOLD or WAIT.",
      },
      limitPriceReason: {
        type: Type.STRING,
        description:
          "1 sentence explaining the limit price level, e.g. 'Near 50-day MA support at $218'",
      },
      valueRating: {
        type: Type.STRING,
        description:
          "For US stocks only: A (excellent value), B (good), C (fair), D (overvalued). Empty string for ETFs and crypto.",
      },
      bottomSignal: {
        type: Type.STRING,
        description:
          "Brief bottom/oversold signal if bottom indicators are present (e.g. 'RSI oversold + volume contraction'). Applies to all tickers (stocks, ETFs, crypto). Empty string if no bottom signal.",
      },
    },
    propertyOrdering: [
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
};

// ── Model selection ────────────────────────────────────────────────
// Overridable via GEMINI_MODEL, which brings Gemini in line with CLAUDE_MODEL
// and MISTRAL_MODEL — it was previously the only provider with its model
// hardcoded, and that turned out to matter.
//
// Google retires models *for new API keys first*: on 2026-08-14 a freshly
// created key got `404 ... gemini-2.5-flash is no longer available to new users`
// while an older key on the same model kept working. Without an override the
// only fix would have been a code change, and pinning a newer default would
// have silently moved the model under every existing key.
//
// The default is therefore left as-is (established keys keep working) and the
// override is how a new key opts into a current model. `gemini-flash-latest` is
// an alias that tracks the current Flash and is the most robust value against
// this recurring.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// ── Retry wrapper for transient errors (503, 429) ──────────────────
async function geminiWithRetry(
  ai: InstanceType<typeof GoogleGenAI>,
  prompt: string,
  schema: Record<string, unknown>,
  maxRetries: number = 2,
): Promise<string> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      });
      return response.text ?? "[]";
    } catch (err) {
      const msg = (err as Error).message ?? "";
      const isRetryable =
        msg.includes("503") ||
        msg.includes("429") ||
        msg.includes("UNAVAILABLE") ||
        msg.includes("RESOURCE_EXHAUSTED");
      if (isRetryable && attempt < maxRetries) {
        const delay = (attempt + 1) * 5000;
        console.log(
          `  ⚠ Gemini ${msg.includes("503") ? "503" : "429"} — retrying in ${delay / 1000}s (attempt ${attempt + 1}/${maxRetries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
  return "[]";
}

// ── Provider ───────────────────────────────────────────────────────
export class GeminiProvider implements AIProvider {
  readonly id = "gemini";
  readonly label = "Gemini";
  readonly shortLabel = "G";

  get available(): boolean {
    return !!process.env.GEMINI_API_KEY;
  }

  async analyze(input: AIProviderInput): Promise<AIBuyRecommendation[]> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return [];

    const { report, priceData, news, technicals, macroContext, reasoningHistory } = input;

    console.log("Running Gemini analysis (Stage 1: Observe)...");
    const ai = new GoogleGenAI({ apiKey });

    const obsPrompt = buildObservationPrompt(report, priceData, news, technicals, macroContext);
    const obsResponse = await geminiWithRetry(ai, obsPrompt, observationSchema);
    const observations = JSON.parse(obsResponse ?? "[]") as TickerObservation[];

    console.log(`  Stage 1 complete — ${observations.length} observations`);
    for (const obs of observations) {
      const signals = [...obs.priceLevelSignals, ...obs.momentumSignals];
      const flags = obs.riskFlags;
      if (signals.length > 0 || flags.length > 0) {
        console.log(`    ${obs.ticker}: ${signals.length} signals, ${flags.length} flags`);
      }
    }

    console.log("Running Gemini analysis (Stage 2: Decide)...");
    const reasoningContext = formatReasoningContext(reasoningHistory, this.id);
    const decPrompt = buildDecisionPrompt(
      observations,
      report,
      macroContext,
      reasoningContext,
      technicals,
      priceData,
    );

    const decResponse = await geminiWithRetry(ai, decPrompt, decisionSchema);
    return JSON.parse(decResponse ?? "[]") as AIBuyRecommendation[];
  }
}

export const geminiProvider = new GeminiProvider();
