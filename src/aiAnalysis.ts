import { GoogleGenAI, Type } from "@google/genai";
import type { AllocationReport } from "./analyze.js";
import type { QuoteData } from "./fetchPrices.js";
import type { NewsItem } from "./fetchNews.js";
import type { TechnicalData } from "./fetchTechnicals.js";
import { validateRecommendations } from "./guards.js";
import { formatReasoningContext, type ReasoningHistory } from "./state.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Short-duration bond ETFs (1-5 year) — essentially cash equivalents, ~2% annual price range.
// No equity-style upside. Hard cap at BUY — STRONG BUY is never appropriate here.
const SHORT_DURATION_BOND_ETFS = new Set([
  "BSV",
  "SHY",
  "VGSH",
  "SCHO",
  "BIL",
  "SHV",
  "CLTL",
  "SGOV",
  "VCSH",
  "USIG",
]);

// Long/intermediate-duration bond ETFs — rate-sensitive, can rally 20-30% when rates drop.
// STRONG BUY is valid at rate cycle peaks (near multi-year lows, large allocation gap).
// But RSI/MACD/momentum are still NOT the right signals — rate environment is.
const LONG_DURATION_BOND_ETFS = new Set([
  // Intermediate government
  "BND",
  "AGG",
  "IEF",
  "VGIT",
  "GOVT",
  "GVI",
  // Long-term government
  "TLT",
  "EDV",
  "VGLT",
  "TLH",
  // Corporate (intermediate/long)
  "LQD",
  "VCIT",
  "VCLT",
  "HYG",
  "JNK",
  // TIPS / inflation-protected
  "TIP",
  "SCHP",
  "VTIP",
  "STIP",
  // International
  "BNDX",
  "IAGG",
]);

// ── Types ───────────────────────────────────────────────────────────
export interface AIBuyRecommendation {
  ticker: string;
  tickerFullName: string | null;
  action: string;
  confidence: number;
  reason: string;
  suggestedBuyValue: number;
  suggestedLimitPrice?: number;
  limitPriceReason?: string;
  valueRating?: string;
  bottomSignal?: string;
  analysisUrl?: string;
}

// ── Observation schema (Stage 1: Think — parse data into structured observations) ──
const observationSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      ticker: {
        type: Type.STRING,
        description: "The ticker symbol",
      },
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

// Observation type returned by Stage 1
interface TickerObservation {
  ticker: string;
  priceLevelSignals: string[];
  momentumSignals: string[];
  riskFlags: string[];
  valueSummary: string;
  technicalSummary: string;
  newsSentiment: string;
  allocationContext: string;
}

// ── Decision schema (Stage 2: Plan — decide actions from observations) ──
const responseSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      ticker: {
        type: Type.STRING,
        description: "The ticker symbol",
      },
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

// ── Build the prompt ────────────────────────────────────────────────
function buildPrompt(
  report: AllocationReport,
  priceData: Record<string, QuoteData>,
  news: Record<string, NewsItem[]>,
  technicals: Record<string, TechnicalData> = {},
  macroContext: string = "",
): string {
  const tickerSummaries = report.items.map((item) => {
    const quote = priceData[item.ticker];
    const tech = technicals[item.ticker];
    const newsItems = news[item.ticker] || [];
    const headlines = newsItems
      .map((n) => {
        const tags = n.sentiment && n.impact ? ` [${n.sentiment}, ${n.impact} impact]` : "";
        return `"${n.title}" (${n.source})${tags}`;
      })
      .join("; ");

    const ticker = item.ticker.toUpperCase();
    const isShortBond = SHORT_DURATION_BOND_ETFS.has(ticker);
    const isLongBond = LONG_DURATION_BOND_ETFS.has(ticker);
    const fullName = item.tickerFullName || item.ticker;

    const lines = [
      `${item.ticker} (${fullName}):`,
      isShortBond
        ? `  Asset type: SHORT-DURATION BOND ETF (1-5 year, ~2% price range — apply framework 12a)`
        : null,
      isLongBond
        ? `  Asset type: LONG/INTERMEDIATE-DURATION BOND ETF (rate-sensitive, can rally on rate cuts — apply framework 12b)`
        : null,
      `  Price: $${item.price.toFixed(2)}`,
      `  Trailing P/E: ${quote?.trailingPE?.toFixed(1) ?? "N/A"}`,
      `  Forward P/E: ${quote?.forwardPE?.toFixed(1) ?? "N/A"}`,
      `  Avg P/E (historical): ${quote?.avgPE?.toFixed(1) ?? "N/A"}`,
      (() => {
        const wpPct =
          item.fiftyTwoWeekPercent != null ? Math.round(item.fiftyTwoWeekPercent * 100) : null;
        const belowHigh =
          quote?.fiftyTwoWeekHigh != null
            ? (((quote.fiftyTwoWeekHigh - item.price) / quote.fiftyTwoWeekHigh) * 100).toFixed(1)
            : null;
        const aboveLow =
          quote?.fiftyTwoWeekLow != null
            ? (((item.price - quote.fiftyTwoWeekLow) / quote.fiftyTwoWeekLow) * 100).toFixed(1)
            : null;
        if (wpPct == null) return `  52-week position: N/A`;
        const qualifier =
          wpPct < 20 ? " ← NEAR ANNUAL LOW" : wpPct > 70 ? " ← NEAR ANNUAL HIGH" : "";
        return (
          `  52-week position: ${wpPct}% of annual range (0%=at 52w low, 100%=at 52w high)${qualifier}` +
          (belowHigh != null ? `; ${belowHigh}% below 52w high` : "") +
          (aboveLow != null ? `; ${aboveLow}% above 52w low` : "")
        );
      })(),
      `  Dividend yield: ${item.dividendYield != null ? (item.dividendYield * 100).toFixed(2) + "%" : "N/A"}`,
      `  Beta: ${item.beta?.toFixed(2) ?? "N/A"}`,
      (() => {
        const days = quote?.daysToEarnings;
        if (days == null) return `  Earnings: none upcoming`;
        const dateStr = quote?.earningsDate
          ? quote.earningsDate.toISOString().split("T")[0]
          : "unknown";
        const warning = days <= 3 ? " ⚠ IMMINENT" : days <= 7 ? " ⚠ SOON" : "";
        return `  Earnings: in ${days} days (${dateStr})${warning}`;
      })(),
      `  Current allocation: ${item.currentPct.toFixed(1)}% (target: ${item.targetPct.toFixed(1)}%, gap: ${item.gapPct > 0 ? "+" : ""}${item.gapPct.toFixed(1)}%)`,
      item.suggestedBuyValue > 0
        ? `  Calculated gap amount: $${item.suggestedBuyValue.toFixed(0)} (full amount needed to close allocation gap)`
        : null,
      item.overlapDiscount > 0
        ? `  ETF overlap discount: -$${item.overlapDiscount.toFixed(0)} (${item.overlapPct.toFixed(0)}% of gap covered by held stocks)`
        : null,
      `  P/E signal: ${item.peSignal ?? "none"}`,
    ];

    if (tech) {
      lines.push(`  Technical indicators:`);
      lines.push(
        `    50-day MA: $${tech.sma50} (price ${tech.priceVsSma50 > 0 ? "+" : ""}${tech.priceVsSma50}% vs MA)`,
      );
      if (tech.sma200 != null) {
        lines.push(
          `    200-day MA: $${tech.sma200} (price ${tech.priceVsSma200! > 0 ? "+" : ""}${tech.priceVsSma200}% vs MA)`,
        );
      }
      lines.push(`    RSI(14): ${tech.rsi14} (>70 overbought, <30 oversold)`);
      lines.push(
        `    Momentum: ${tech.momentumSignal}${tech.goldenCross ? " (golden cross)" : ""}${tech.deathCross ? " (death cross)" : ""}`,
      );
      // MACD
      if (tech.macd != null && tech.macdSignal != null) {
        lines.push(
          `    MACD: ${tech.macd} / signal: ${tech.macdSignal} / histogram: ${tech.macdHistogram}${tech.macdCrossover ? ` (${tech.macdCrossover} crossover)` : ""}`,
        );
      }
      // Bollinger Bands
      if (tech.bollMiddle != null) {
        lines.push(
          `    Bollinger Bands: $${tech.bollLower} / $${tech.bollMiddle} / $${tech.bollUpper} (%B=${tech.bollPercentB}, BW=${tech.bollBandwidth})${tech.bollSqueeze ? " (SQUEEZE — low volatility, breakout likely)" : ""}`,
        );
      }
      // ATR
      if (tech.atr14 != null) {
        const volLevel =
          tech.atrPercent! > 3
            ? "high volatility — widen limit orders"
            : tech.atrPercent! < 1
              ? "low volatility — tighter limits"
              : "moderate volatility";
        lines.push(`    ATR(14): $${tech.atr14} (${tech.atrPercent}% of price — ${volLevel})`);
      }
      // Stochastic
      if (tech.stochK != null) {
        const stochLevel =
          tech.stochK < 20 ? " ← OVERSOLD" : tech.stochK > 80 ? " ← OVERBOUGHT" : "";
        lines.push(
          `    Stochastic: %K=${tech.stochK}, %D=${tech.stochD} (<20 oversold, >80 overbought)${stochLevel}`,
        );
      }
      // OBV
      if (tech.obvTrend != null) {
        const obvLabel =
          tech.obvTrend === "rising"
            ? "accumulation"
            : tech.obvTrend === "falling"
              ? "distribution"
              : "neutral";
        lines.push(`    OBV trend: ${tech.obvTrend} (${obvLabel})`);
      }
      lines.push(`    7-day low: $${tech.recentLow7d}, 30-day low: $${tech.recentLow30d}`);
      if (tech.volumeChange7d != null) {
        lines.push(
          `    Volume change (7d vs 30d avg): ${tech.volumeChange7d > 0 ? "+" : ""}${tech.volumeChange7d}%${tech.volumeChange7d < -20 ? " (contraction)" : tech.volumeChange7d > 50 ? " (surge)" : ""}`,
        );
      }
    }

    // Fundamental data (stocks only — null for ETFs/crypto)
    if (
      quote &&
      (quote.returnOnEquity != null || quote.debtToEquity != null || quote.freeCashflow != null)
    ) {
      lines.push(`  Fundamentals:`);
      if (quote.returnOnEquity != null) {
        lines.push(`    ROE: ${(quote.returnOnEquity * 100).toFixed(1)}% (>15% is strong)`);
      }
      if (quote.debtToEquity != null) {
        lines.push(`    Debt/Equity: ${quote.debtToEquity.toFixed(1)}% (<50% is conservative)`);
      }
      if (
        quote.freeCashflow != null &&
        quote.operatingCashflow != null &&
        quote.operatingCashflow > 0
      ) {
        const fcfRatio = (quote.freeCashflow / quote.operatingCashflow) * 100;
        lines.push(
          `    FCF/Operating CF: ${fcfRatio.toFixed(0)}% (>80% shows strong cash conversion)`,
        );
      }
      if (quote.profitMargins != null) {
        lines.push(`    Profit margin: ${(quote.profitMargins * 100).toFixed(1)}%`);
      }
      if (quote.revenueGrowth != null) {
        lines.push(`    Revenue growth: ${(quote.revenueGrowth * 100).toFixed(1)}% YoY`);
      }
      if (quote.earningsGrowth != null) {
        lines.push(`    Earnings growth: ${(quote.earningsGrowth * 100).toFixed(1)}% YoY`);
      }
      if (quote.targetMeanPrice != null) {
        lines.push(
          `    Analyst target: $${quote.targetMeanPrice.toFixed(2)} (${quote.recommendationKey ?? "N/A"})`,
        );
      }
    }

    if (headlines) {
      lines.push(`  Recent news: ${headlines}`);
      // Compute overall sentiment from individual articles
      const sentiments = newsItems.filter((n) => n.sentiment).map((n) => n.sentiment!);
      if (sentiments.length > 0) {
        const bullish = sentiments.filter((s) => s === "bullish").length;
        const bearish = sentiments.filter((s) => s === "bearish").length;
        const overall =
          bullish > bearish
            ? "bullish"
            : bearish > bullish
              ? "bearish"
              : bullish === bearish && bullish > 0
                ? "mixed"
                : "neutral";
        lines.push(`  Overall news sentiment: ${overall}`);
      }
    } else {
      lines.push(`  Recent news: none`);
    }

    return lines.filter(Boolean).join("\n");
  });

  return `You are a portfolio analyst. Analyze these tickers and recommend which to buy.

${macroContext ? macroContext + "\n" : ""}PORTFOLIO CONTEXT:
- Total portfolio value: $${report.totalCurrentValue.toLocaleString()} (target: $50,000)
- Portfolio beta: ${report.portfolioBeta?.toFixed(2) ?? "N/A"}
- Estimated annual dividends: $${report.estimatedAnnualDividend.toFixed(0)}

TICKER DATA:
${tickerSummaries.join("\n\n")}

INSTRUCTIONS:
1. Only recommend tickers that are in the target portfolio (target > 0%).
   When writing the reason field, use the full company/ETF name shown in parentheses next to each ticker (e.g. "Microsoft is oversold" rather than "this stock is oversold"). Do not invent or guess names — only use names that appear in the data.
2. Prioritize tickers that have BOTH allocation need AND good entry price. A small gap with excellent valuation (low P/E, near 52w low) should rank ABOVE a large gap with poor valuation (high P/E, near 52w high).
3. Consider news sentiment — negative news may mean a buying opportunity (contrarian) or genuine risk.
4. For each ticker, assign:
   - action: STRONG BUY, BUY, HOLD, or WAIT (see strict criteria below)
   - confidence: 0-100 (how confident you are in this recommendation)
   STRONG BUY CRITERIA (ALL must be met — this is the highest bar, reserve for truly exceptional setups):
   a) Allocation gap ≥ 2% (meaningful underweight — small gaps don't justify urgency)
   b) Confidence ≥ 80% BEFORE any indicator boosts (the raw setup must be strong on its own)
   c) At least 2 entry signals, including AT LEAST 1 price-level signal:
      Price-level signals (absolute cheapness — confirm the price is genuinely depressed):
      - P/E below historical average (undervalued vs own history)
      - 52-week position < 30% (near annual lows — price is structurally low)
      - Price below 200-day MA (sustained decline, not a brief dip — especially useful for ETFs that lack P/E)
      Momentum signals (recent selloff only — do NOT confirm price cheapness alone):
      - RSI < 35
      - Bullish MACD crossover
      - Price near/below lower Bollinger Band (%B < 0.15)
      - Stochastic %K < 20 (oversold confirmation)
      CRITICAL RULE: 2 momentum signals alone (e.g. RSI + Bollinger) are NOT sufficient
      for STRONG BUY. A brief sharp dip can trigger both while the price is still near
      its annual highs. If 52-week position > 60%, the "near low" signal does NOT apply.
      ITA example: RSI 21 + Bollinger %B 0.13 at 77% of annual range = BUY (not STRONG BUY).
   d) No major red flags (bearish MACD divergence + overbought RSI together = disqualify)
   If ANY criterion is not met, cap at BUY. Most tickers most days should be HOLD or WAIT.
   BUY: Decent opportunity — has allocation need and reasonable entry, but missing one or more STRONG BUY criteria.
   HOLD: Near target allocation, or entry timing is poor (overbought, near highs).
   WAIT: Overvalued, risky, or no allocation need.
   MAXIMUM: At most 2 tickers can be STRONG BUY at any time. If more qualify, keep only the top 2 by conviction and downgrade the rest to BUY.
   - reason: 1-2 sentences explaining why
   - suggestedBuyValue: USD amount to invest this time. Use the "Calculated gap amount" as the reference. Rules:
     * If gap ≤ $5,000: suggest the FULL gap amount. Small positions aren't worth splitting — commit fully if the setup is good.
     * If gap > $5,000: decide whether to buy all at once or in a tranche. For high conviction (confidence ≥ 85%, STRONG BUY), suggest at least 60-100% of the gap. For moderate conviction, suggest a first tranche of $3,000-$5,000 and note "first tranche" in the reason.
     * $0 for HOLD/WAIT.
5. Return only tickers with target > 0%. Sort by confidence descending (best buys first).
6. Be concise and specific in reasons. Reference actual numbers (P/E, 52w%, gap).
7. For ETFs with an "ETF overlap discount", the suggested buy has already been reduced. Mention the overlap when it significantly affects the recommendation.
8. For STRONG BUY and BUY tickers, suggest a limit order price slightly below current market. Base it on the nearest support level: 50-day MA, recent 7d/30d low, or a round number. Set suggestedLimitPrice (the price) and limitPriceReason (1 sentence explaining the level). Set both to 0/"" for HOLD/WAIT.
9. Use technical indicators (MA, RSI, MACD, Bollinger Bands, momentum) to refine confidence:
   - A bullish momentum signal with oversold RSI strengthens a buy case. A bearish signal or overbought RSI weakens it.
   - MACD: A bullish crossover (MACD crosses above signal) confirms upward momentum. A positive and rising histogram strengthens conviction. A bearish crossover is a caution signal. If MACD is bearish, reduce confidence by 10pts regardless of other signals.
   - Golden cross (50MA > 200MA): only meaningful as a bullish signal when price is ABOVE the 200MA. If price is currently BELOW the 200MA (even with 50MA > 200MA), the golden cross is a lagging artifact of a prior uptrend — treat momentum as neutral, not bullish. A death cross risk increases in this scenario.
   - Bollinger Bands: %B near 0 (at lower band) suggests oversold/mean-reversion opportunity. %B near 1 (at upper band) suggests overbought. A squeeze (low bandwidth) signals an imminent breakout — wait for direction confirmation from MACD before acting.
   INDICATOR CONFLICT RESOLUTION (follow this hierarchy when indicators disagree):
   a) MACD is best for TRENDING markets — trust it over Bollinger Bands when price is clearly trending (above/below both MAs, strong momentum).
   b) Bollinger Bands are best for RANGE-BOUND markets — trust them over MACD when price is oscillating between bands with no clear trend (flat MAs, neutral momentum).
   c) When MACD says bullish but Bollinger %B > 0.9 (near upper band): reduce confidence by 10-15pts — momentum is overextended. Prefer a limit order near the middle band.
   d) When Bollinger %B < 0.1 (near lower band) but MACD histogram is still falling: do NOT buy the dip yet — wait for MACD histogram to flatten or turn up. Reduce confidence by 15pts.
   e) When both MACD and Bollinger agree (e.g., bullish crossover + bounce off lower band, or bearish crossover + rejection at upper band): boost confidence by 5pts — confirming signal but not a free pass.
   f) A Bollinger Squeeze with a simultaneous MACD crossover is a strong entry signal — boost confidence by 5-10pts (not sufficient alone for STRONG BUY).
10. VALUE INVESTING FRAMEWORK (individual stocks only — skip for ETFs and crypto):
   Rate each stock A through D based on these criteria:
   - ROE > 15% (strong profitability)
   - Debt/Equity < 50% (conservative leverage)
   - FCF/Operating CF > 80% (strong cash conversion)
   - Positive earnings growth
   - Current price below analyst target
   Rating: A (excellent, meets 4-5 criteria), B (good, meets 3), C (fair, meets 1-2), D (overvalued, meets 0 or negative growth with high debt).
   If fundamental data is unavailable (ETFs, crypto), set valueRating to empty string.
   Factor the value rating into your confidence: A boosts confidence ~5pts, D reduces ~10pts.
11. BOTTOM-FISHING MODEL (all tickers — stocks, ETFs, and crypto):
   Evaluate these bottom indicators for every ticker:
   - RSI < 30 (oversold)
   - Volume contraction > 20% (selling exhaustion)
   - Price below 200-day MA (deep value territory)
   - Death cross present (may already be priced in — contrarian signal if RSI is very low)
   Thresholds differ by asset type:
   - Crypto (BTC, ETH): flag bottomSignal when 2+ indicators are present. A bottom signal alone does NOT justify STRONG BUY — the ticker must still meet all STRONG BUY criteria above.
   - Stocks and ETFs: flag bottomSignal when 3+ indicators are present (stricter — avoids false signals from single dips). A bottom signal is a supporting factor, not a STRONG BUY trigger on its own.
   Set bottomSignal to a brief description (e.g. "RSI oversold + volume contraction + below 200MA").
   If not enough indicators are present, set bottomSignal to empty string.
12. BOND ETFs — two frameworks depending on duration:
   For ALL bond ETFs: DO NOT use RSI, MACD, Bollinger Bands, or momentum crossovers as buy signals.
   Bond prices are driven by interest rates, not sentiment. "Oversold RSI" means rates rose.
   A golden cross where 50MA and 200MA differ by $0.05 is noise. Never say "rebound potential."

   12a. SHORT-DURATION BOND ETFs (marked "SHORT-DURATION BOND ETF"):
      - 1-5 year maturities, ~2% annual price range. These are cash equivalents.
      - MAX ACTION IS BUY — NEVER STRONG BUY. There is no meaningful capital appreciation upside.
      - Best time to buy: whenever you have an allocation gap. Entry price barely matters.
      - Focus: allocation gap size and yield competitiveness. Nothing else is material.
      - CONFIDENCE SCALING (by gap size, not technicals):
        * Gap ≥ 5%: confidence 70-75% — meaningful underweight, buy now
        * Gap 3-5%: confidence 60-70% — moderate gap, steady accumulation
        * Gap 1-3%: confidence 45-55% — small gap, low priority
        * Gap < 1%: HOLD — essentially on target
      - Framing: "Systematic accumulation to fill X% allocation gap; yield of Y% is acceptable"

   12b. LONG/INTERMEDIATE-DURATION BOND ETFs (marked "LONG/INTERMEDIATE-DURATION BOND ETF"):
      - Intermediate (7-10yr) and long-term (20yr+) funds are RATE-SENSITIVE.
      - TLT can rally 20-30% when rates drop significantly. This IS a real opportunity.
      - STRONG BUY IS VALID when ALL of these align:
        * Allocation gap ≥ 2%
        * Price near 52-week low (implies rates are currently elevated — upside when they fall)
        * Rate environment context suggests rates may be near a cycle peak
        * Confidence ≥ 80% based on gap + rate reasoning (not RSI/MACD)
      - BUY when: allocation gap exists and price is in lower half of 52-week range
      - WAIT when: price near 52-week high (rates already fell, upside is limited)
      - Focus: allocation gap, 52-week position (proxy for rate cycle position), yield, duration
      - Framing: "Long-duration bond ETF near 52w low with X% gap; elevated rates suggest
        potential capital gains if rates decline" NOT "oversold RSI signals rebound"
13. EARNINGS PROXIMITY GUARD:
   - If earnings are within 7 days: Cap at BUY (never STRONG BUY). Note "earnings in X days" in the reason.
   - If earnings are within 3 days: Cap at HOLD. The risk/reward of holding through earnings is too asymmetric for a buy recommendation.
   - If no earnings date is shown, ignore this rule.`;
}

// ── Stage 1: Observation prompt (Think — parse data, no decisions) ──
function buildObservationPrompt(
  report: AllocationReport,
  priceData: Record<string, QuoteData>,
  news: Record<string, NewsItem[]>,
  technicals: Record<string, TechnicalData> = {},
  macroContext: string = "",
): string {
  // Reuse the same data block from buildPrompt
  const dataBlock = buildPrompt(report, priceData, news, technicals, macroContext);
  // Strip the INSTRUCTIONS section — we'll replace it with observation-only instructions
  const dataOnly = dataBlock.split("\nINSTRUCTIONS:")[0];

  return `${dataOnly}
TASK: For EVERY ticker in the portfolio list above, produce STRUCTURED OBSERVATIONS only. Do NOT recommend any actions (no BUY/SELL/HOLD).
CRITICAL: Return observations for ALL tickers, even if they have no signals. Use empty arrays [] for signals/flags when none are present.

For each ticker, identify:
1. PRICE-LEVEL SIGNALS — signals that confirm the price is genuinely cheap:
   - "P/E below historical avg" (if trailing P/E < avg P/E)
   - "52w position < 30%" (if near annual lows)
   - "price below 200MA" (if current price < 200-day MA)
   Only include signals that are actually present in the data. Do not invent signals.

2. MOMENTUM SIGNALS — signals of recent selloff or reversal:
   - "RSI < 35" (if RSI is below 35)
   - "bullish MACD crossover" (if MACD just crossed above signal)
   - "Bollinger %B < 0.15" (if near/below lower band)
   - "Stochastic %K < 20" (if Stochastic is oversold)
   - "OBV rising" (if accumulation trend detected)
   Only include signals that are actually present in the data.

3. RISK FLAGS — anything that suggests caution:
   - "overbought RSI > 70" / "near 52w high" / "bearish MACD crossover" / "death cross"
   - "overvalued P/E" (if P/E significantly above historical average)
   - Any bearish divergence or confluence of negative signals

4. VALUE SUMMARY — 1 sentence summarizing valuation (reference P/E, 52w%, fundamentals)

5. TECHNICAL SUMMARY — 1 sentence summarizing technical setup (reference MA, RSI, MACD, Bollinger)

6. NEWS SENTIMENT — "positive", "negative", "neutral", "mixed", or "none" based on headlines

7. ALLOCATION CONTEXT — 1 sentence on the allocation gap (e.g. "3.2% underweight, needs $1600")

Be precise. Reference actual numbers from the data. Do not editorialize or recommend actions.
For bond ETFs, note that RSI/MACD/momentum are NOT valid signals — focus on rate environment and allocation gap.`;
}

// ── Stage 2: Decision prompt (Plan — decide from observations) ──
function buildDecisionPrompt(
  observations: TickerObservation[],
  report: AllocationReport,
  macroContext: string = "",
  reasoningContext: string = "",
): string {
  // Build key metrics per ticker so the decision stage has actual numbers for limit prices etc.
  const metricsMap: Record<string, string[]> = {};
  for (const item of report.items) {
    const lines: string[] = [];
    lines.push(`  Price: $${item.price.toFixed(2)}`);
    if (item.fiftyTwoWeekPercent != null)
      lines.push(`  52w position: ${Math.round(item.fiftyTwoWeekPercent * 100)}%`);
    lines.push(`  Gap: ${item.gapPct > 0 ? "+" : ""}${item.gapPct.toFixed(1)}%`);
    if (item.trailingPE != null) lines.push(`  P/E: ${item.trailingPE.toFixed(1)}`);
    metricsMap[item.ticker] = lines;
  }

  const obsText = observations
    .map((obs) => {
      const lines = [
        `${obs.ticker}:`,
        ...(metricsMap[obs.ticker] ?? []),
        `  Price-level signals: ${obs.priceLevelSignals.length > 0 ? obs.priceLevelSignals.join(", ") : "none"}`,
        `  Momentum signals: ${obs.momentumSignals.length > 0 ? obs.momentumSignals.join(", ") : "none"}`,
        `  Risk flags: ${obs.riskFlags.length > 0 ? obs.riskFlags.join(", ") : "none"}`,
        `  Valuation: ${obs.valueSummary}`,
        `  Technical: ${obs.technicalSummary}`,
        `  News: ${obs.newsSentiment}`,
        `  Allocation: ${obs.allocationContext}`,
      ];
      return lines.join("\n");
    })
    .join("\n\n");

  // Find gap amounts from the report for suggestedBuyValue sizing guidance
  const gapMap: Record<string, number> = {};
  for (const item of report.items) {
    gapMap[item.ticker] = item.suggestedBuyValue;
  }

  return `You are a portfolio analyst making final buy/hold recommendations based on pre-analyzed observations.

${macroContext ? macroContext + "\n" : ""}${reasoningContext ? reasoningContext + "\n\n" : ""}PORTFOLIO CONTEXT:
- Total portfolio value: $${report.totalCurrentValue.toLocaleString()}
- Portfolio beta: ${report.portfolioBeta?.toFixed(2) ?? "N/A"}
- Estimated annual dividends: $${report.estimatedAnnualDividend.toFixed(0)}

GAP AMOUNTS (for suggestedBuyValue sizing):
${report.items
  .filter((i) => i.suggestedBuyValue > 0)
  .map((i) => `  ${i.ticker}: $${i.suggestedBuyValue.toFixed(0)} gap`)
  .join("\n")}

STRUCTURED OBSERVATIONS:
${obsText}

DECISION RULES:
1. Only recommend tickers with allocation need (gap > 0%).
2. Prioritize tickers with BOTH allocation need AND good entry price.

STRONG BUY CRITERIA (ALL must be met):
a) Allocation gap ≥ 2%
b) Confidence ≥ 80% BEFORE any indicator boosts
c) At least 2 entry signals, including AT LEAST 1 price-level signal.
   CRITICAL: 2 momentum signals alone (e.g. RSI + Bollinger) are NOT sufficient.
d) No major risk flags (bearish MACD divergence + overbought RSI together = disqualify)
MAXIMUM 2 tickers can be STRONG BUY. If more qualify, keep top 2 by conviction.

BUY: Has allocation need + reasonable entry, but missing one or more STRONG BUY criteria.
HOLD: Near target allocation, or entry timing is poor.
WAIT: Overvalued, risky, or no allocation need.

3. suggestedBuyValue: Use gap amounts above. If gap ≤ $5,000: full amount. If gap > $5,000: 60-100% for high conviction, $3,000-$5,000 first tranche for moderate. $0 for HOLD/WAIT.
4. suggestedLimitPrice: For BUY/STRONG BUY, set below market at nearest support. $0 for HOLD/WAIT.
5. INDICATOR CONFLICT RESOLUTION:
   - MACD is best for trending markets; Bollinger for range-bound.
   - Both agreeing: +5pts confidence. Disagreeing: -10 to -15pts.
   - Bollinger Squeeze + MACD crossover: +5-10pts (not alone sufficient for STRONG BUY).
6. VALUE RATING (stocks only): A (4-5 criteria met), B (3), C (1-2), D (0 or negative growth). Empty for ETFs/crypto.
   A boosts confidence ~5pts, D reduces ~10pts.
7. BOTTOM SIGNAL: Flag if 2+ bottom indicators (crypto) or 3+ (stocks/ETFs): RSI<30, volume contraction >20%, price below 200MA, death cross. Bottom signal alone does NOT justify STRONG BUY.
8. BOND ETFs: Do NOT use RSI/MACD/Bollinger as buy signals.
   Short-duration: MAX BUY. NEVER STRONG BUY. Scale confidence by gap size:
     gap≥5% → 70-75%, gap 3-5% → 60-70%, gap 1-3% → 45-55%, gap<1% → HOLD.
   Long/intermediate: STRONG BUY valid when gap≥2% + near 52w low + rate environment suggests peak.
9. Sort by confidence descending.`;
}

// ── Gemini call with retry for transient errors (503, 429) ─────────
async function geminiWithRetry(
  ai: InstanceType<typeof GoogleGenAI>,
  prompt: string,
  schema: Record<string, unknown>,
  maxRetries: number = 2,
): Promise<string> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
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
        const delay = (attempt + 1) * 5000; // 5s, 10s
        console.log(
          `  ⚠ Gemini ${msg.includes("503") ? "503" : "429"} — retrying in ${delay / 1000}s (attempt ${attempt + 1}/${maxRetries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
  return "[]"; // unreachable, but satisfies TS
}

// ── Call Gemini ─────────────────────────────────────────────────────
export async function aiAnalyze(
  report: AllocationReport,
  priceData: Record<string, QuoteData>,
  news: Record<string, NewsItem[]>,
  technicals: Record<string, TechnicalData> = {},
  macroContext: string = "",
  reasoningHistory: ReasoningHistory = { snapshots: {} },
): Promise<AIBuyRecommendation[]> {
  if (!GEMINI_API_KEY) {
    console.warn("GEMINI_API_KEY not set — skipping AI analysis\n");
    return [];
  }

  console.log("Running AI analysis (Stage 1: Observe)...");

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    // ── Stage 1: Think — structured observations ──
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

    // ── Stage 2: Plan — decisions from observations ──
    console.log("Running AI analysis (Stage 2: Decide)...");
    const reasoningContext = formatReasoningContext(reasoningHistory);
    const decPrompt = buildDecisionPrompt(observations, report, macroContext, reasoningContext);

    const decResponse = await geminiWithRetry(ai, decPrompt, responseSchema);

    const recommendations = JSON.parse(decResponse ?? "[]") as AIBuyRecommendation[];

    // Attach tickerFullName from price data (deterministic — not model-supplied)
    const longNameMap = new Map(
      Object.values(priceData).map((q) => [q.ticker, q.longName ?? null]),
    );
    for (const rec of recommendations) {
      rec.tickerFullName = longNameMap.get(rec.ticker) ?? null;
    }

    // Run guard validation pipeline (bond ETF cap, earnings proximity, STRONG BUY criteria, etc.)
    validateRecommendations(recommendations, priceData, technicals, report);

    // Log summary
    for (const rec of recommendations) {
      if (rec.action === "STRONG BUY" || rec.action === "BUY") {
        console.log(
          `  ${rec.action} ${rec.ticker} (${rec.confidence}%)` +
            (rec.valueRating ? ` [${rec.valueRating}]` : "") +
            (rec.bottomSignal ? ` [${rec.bottomSignal}]` : "") +
            ` — ${rec.reason}` +
            (rec.suggestedLimitPrice ? ` [limit: $${rec.suggestedLimitPrice}]` : ""),
        );
      }
    }
    console.log(`AI analysis complete — ${recommendations.length} tickers scored\n`);

    return recommendations;
  } catch (err) {
    console.error("AI analysis failed:", (err as Error).message);
    console.log("Falling back to gap-based recommendations\n");
    return [];
  }
}
