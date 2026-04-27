import { GoogleGenAI, Type } from "@google/genai";
import type { AllocationReport } from "./analyze.js";
import type { QuoteData } from "./fetchPrices.js";
import type { TechnicalData } from "./fetchTechnicals.js";
import type { AIBuyRecommendation } from "./aiAnalysis.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ── Types ───────────────────────────────────────────────────────────
export interface DetailedAnalysis {
  ticker: string;
  buyThesis: string;
  risks: string[];
}

// ── Gemini response schema ──────────────────────────────────────────
const detailedSchema = {
  type: Type.OBJECT,
  properties: {
    buyThesis: {
      type: Type.STRING,
      description:
        "3-4 paragraph detailed buy thesis (150-200 words total) covering: why now, valuation, technical setup, portfolio fit",
    },
    risks: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "3-4 specific risk factors, each 1 sentence",
    },
  },
  propertyOrdering: ["buyThesis", "risks"],
};

// ── Build per-ticker prompt ─────────────────────────────────────────
function buildDetailedPrompt(
  ticker: string,
  quote: QuoteData,
  tech: TechnicalData | undefined,
  rec: AIBuyRecommendation,
  report: AllocationReport,
  macroContext: string = "",
): string {
  const item = report.items.find((i) => i.ticker === ticker);
  const gap = item ? `${item.gapPct > 0 ? "+" : ""}${item.gapPct.toFixed(1)}%` : "N/A";
  const current = item ? `${item.currentPct.toFixed(1)}%` : "N/A";
  const target = item ? `${item.targetPct.toFixed(1)}%` : "N/A";

  const lines = [
    `You are a senior investment analyst writing a detailed buy recommendation for a client.`,
    ``,
    `TICKER: ${ticker}${quote.longName ? ` (${quote.longName})` : ""}`,
    `Current price: $${quote.price.toFixed(2)}`,
    `Trailing P/E: ${quote.trailingPE?.toFixed(1) ?? "N/A"} | Forward P/E: ${quote.forwardPE?.toFixed(1) ?? "N/A"} | Avg P/E: ${quote.avgPE?.toFixed(1) ?? "N/A"}`,
    (() => {
      const wpPct =
        quote.fiftyTwoWeekPercent != null ? Math.round(quote.fiftyTwoWeekPercent * 100) : null;
      const belowHigh =
        quote.fiftyTwoWeekHigh != null
          ? (((quote.fiftyTwoWeekHigh - quote.price) / quote.fiftyTwoWeekHigh) * 100).toFixed(1)
          : null;
      const aboveLow =
        quote.fiftyTwoWeekLow != null
          ? (((quote.price - quote.fiftyTwoWeekLow) / quote.fiftyTwoWeekLow) * 100).toFixed(1)
          : null;
      if (wpPct == null)
        return `52-week: low $${quote.fiftyTwoWeekLow?.toFixed(2) ?? "N/A"} — high $${quote.fiftyTwoWeekHigh?.toFixed(2) ?? "N/A"} (position N/A)`;
      const qualifier = wpPct < 20 ? " ← NEAR ANNUAL LOW" : wpPct > 70 ? " ← NEAR ANNUAL HIGH" : "";
      return (
        `52-week: low $${quote.fiftyTwoWeekLow?.toFixed(2)} — high $${quote.fiftyTwoWeekHigh?.toFixed(2)} | ${wpPct}% of range (0%=at low, 100%=at high)${qualifier}` +
        (belowHigh != null ? ` | ${belowHigh}% below 52w high` : "") +
        (aboveLow != null ? ` | ${aboveLow}% above 52w low` : "")
      );
    })(),
    `Dividend yield: ${quote.dividendYield != null ? (quote.dividendYield * 100).toFixed(2) + "%" : "N/A"} | Beta: ${quote.beta?.toFixed(2) ?? "N/A"}`,
    `Allocation: current ${current}, target ${target}, gap ${gap}`,
    `AI summary: "${rec.reason}" (confidence ${rec.confidence}%)`,
  ];

  if (tech) {
    const priceBelow200 =
      tech.sma200 != null && tech.priceVsSma200 != null && tech.priceVsSma200 < 0;
    const goldenCrossNote = tech.goldenCross
      ? priceBelow200
        ? " (golden cross — BUT price is below 200MA, so this is a lagging artifact, NOT a bullish signal)"
        : " (golden cross)"
      : "";
    lines.push(
      `Technical: ${tech.momentumSignal} momentum, RSI ${tech.rsi14}, 50MA $${tech.sma50} (${tech.priceVsSma50 > 0 ? "+" : ""}${tech.priceVsSma50}%)${tech.sma200 != null ? `, 200MA $${tech.sma200} (${tech.priceVsSma200! > 0 ? "+" : ""}${tech.priceVsSma200}%)` : ""}${goldenCrossNote}${tech.deathCross ? " (death cross)" : ""}${tech.macdCrossover ? `, MACD ${tech.macdCrossover}` : tech.macdHistogram != null ? `, MACD hist ${tech.macdHistogram > 0 ? "+" : ""}${tech.macdHistogram}` : ""}${tech.bollPercentB != null ? `, %B=${tech.bollPercentB}` : ""}${tech.bollSqueeze ? " (squeeze)" : ""}`,
    );
  }

  if (quote.returnOnEquity != null || quote.debtToEquity != null) {
    const fundamentals = [
      quote.returnOnEquity != null ? `ROE ${(quote.returnOnEquity * 100).toFixed(1)}%` : null,
      quote.debtToEquity != null ? `D/E ${quote.debtToEquity.toFixed(1)}%` : null,
      quote.profitMargins != null ? `margin ${(quote.profitMargins * 100).toFixed(1)}%` : null,
      quote.revenueGrowth != null ? `rev growth ${(quote.revenueGrowth * 100).toFixed(1)}%` : null,
      quote.earningsGrowth != null
        ? `earnings growth ${(quote.earningsGrowth * 100).toFixed(1)}%`
        : null,
      quote.targetMeanPrice != null ? `analyst target $${quote.targetMeanPrice.toFixed(2)}` : null,
    ].filter(Boolean);
    lines.push(`Fundamentals: ${fundamentals.join(", ")}`);
  }

  if (rec.valueRating) {
    lines.push(`Value rating: ${rec.valueRating}`);
  }
  if (rec.bottomSignal) {
    lines.push(`Bottom signal: ${rec.bottomSignal}`);
  }

  if (macroContext) {
    lines.push("");
    lines.push(macroContext);
  }

  lines.push("");
  lines.push("Write a detailed buy thesis (3-4 paragraphs, 150-200 words total) covering:");
  lines.push("1. Why this is a STRONG BUY opportunity right now (timing + catalyst)");
  lines.push("2. Valuation analysis (P/E vs historical, fundamentals, analyst targets)");
  lines.push("3. Technical setup (momentum, support levels, entry timing)");
  lines.push("4. Portfolio fit (allocation need, diversification benefit)");
  lines.push("");
  lines.push("CRITICAL RULES:");
  lines.push(
    '- Use the full company/ETF name shown next to the ticker above (when available) in your thesis, not generic phrases like "this stock" or "this ETF".',
  );
  lines.push(
    "- The 52-week position percentage is the position WITHIN the annual range (0%=at 52w low, 100%=at 52w high). Do NOT describe it as '% of 52-week high' — that is a different number. Use the explicit '% below 52w high' value provided.",
  );
  lines.push(
    "- If price is below the 200-day MA, do NOT cite a golden cross as bullish — it is a lagging artifact when price has already fallen below the long-term trend.",
  );
  lines.push("");
  lines.push("Also list 3-4 specific risks to watch. Be concise and reference actual numbers.");

  return lines.join("\n");
}

// ── Fetch detailed analyses for STRONG BUY tickers ──────────────────
export async function fetchDetailedAnalyses(
  strongBuyTickers: string[],
  priceData: Record<string, QuoteData>,
  technicals: Record<string, TechnicalData>,
  aiRecs: AIBuyRecommendation[],
  report: AllocationReport,
  macroContext: string = "",
): Promise<Record<string, DetailedAnalysis>> {
  if (!GEMINI_API_KEY || strongBuyTickers.length === 0) return {};

  console.log("Generating detailed analysis for STRONG BUY tickers...");

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const recMap = new Map(aiRecs.map((r) => [r.ticker, r]));
  const result: Record<string, DetailedAnalysis> = {};

  for (const ticker of strongBuyTickers) {
    const quote = priceData[ticker];
    const rec = recMap.get(ticker);
    if (!quote || !rec) continue;

    try {
      const prompt = buildDetailedPrompt(
        ticker,
        quote,
        technicals[ticker],
        rec,
        report,
        macroContext,
      );

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: detailedSchema,
        },
      });

      const parsed = JSON.parse(response.text ?? "{}") as {
        buyThesis?: string;
        risks?: string[];
      };

      if (parsed.buyThesis) {
        result[ticker] = {
          ticker,
          buyThesis: parsed.buyThesis,
          risks: parsed.risks ?? [],
        };
        console.log(`  Detailed analysis ready for ${ticker}`);
      }
    } catch (err) {
      console.warn(`  Detailed analysis failed for ${ticker}: ${(err as Error).message}`);
    }
  }

  return result;
}
