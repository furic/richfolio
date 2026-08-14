import type { AllocationReport } from "../analyze.js";
import type { QuoteData } from "../fetchPrices.js";
import type { NewsItem } from "../fetchNews.js";
import type { TechnicalData } from "../fetchTechnicals.js";
import { defaultCurrency } from "../config.js";
import { formatMoney } from "../util.js";

// ── Bond ETF asset class lists ─────────────────────────────────────
// These are referenced by the prompt builders AND by guards.ts. The guards
// module keeps its own copy to remain self-contained, but if you change
// these here, mirror the SHORT_DURATION_BOND_ETFS list there too.

// Short-duration bond ETFs (1-5 year) — essentially cash equivalents, ~2% annual
// price range. No equity-style upside. Hard cap at BUY — STRONG BUY is never
// appropriate here.
export const SHORT_DURATION_BOND_ETFS = new Set([
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

// Long/intermediate-duration bond ETFs — rate-sensitive, can rally 20-30% when
// rates drop. STRONG BUY is valid at rate cycle peaks (near multi-year lows,
// large allocation gap). But RSI/MACD/momentum are still NOT the right signals
// — rate environment is.
export const LONG_DURATION_BOND_ETFS = new Set([
  "BND",
  "AGG",
  "IEF",
  "VGIT",
  "GOVT",
  "GVI",
  "TLT",
  "EDV",
  "VGLT",
  "TLH",
  "LQD",
  "VCIT",
  "VCLT",
  "HYG",
  "JNK",
  "TIP",
  "SCHP",
  "VTIP",
  "STIP",
  "BNDX",
  "IAGG",
]);

// ── Stage 1 observation shape (cross-provider) ─────────────────────
// Stage 1 producers return arrays of this shape; Stage 2 consumes them.
// Lives here (not in types.ts) because it's tied to the prompt schema.
export interface TickerObservation {
  ticker: string;
  priceLevelSignals: string[];
  momentumSignals: string[];
  riskFlags: string[];
  valueSummary: string;
  technicalSummary: string;
  newsSentiment: string;
  allocationContext: string;
}

// ── Combined prompt (legacy / data-block source) ───────────────────
// This is the original single-call prompt. It's still used as the source
// of the "TICKER DATA" block that the observation prompt strips and reuses.
// Not exported as a public entry point — the two-stage builders compose it.
// ── Crypto cross-pair semantics ──────────────────────────────────────
// A cross-pair carries a meaning the model cannot infer from a ticker and a
// number, and getting it backwards inverts every recommendation. `BTC_CRO` is
// "how much CRO one BTC costs", so a LOW value is the good entry — the same
// buy-the-dip polarity as every equity in the brief, which is exactly why pairs
// are normalised this way rather than left in whatever direction the exchange
// happens to list them.
export function crossPairSemantics(ticker: string, quoteCurrency: string): string {
  const [base, quote] = ticker.split("_");
  const spend = quote ?? quoteCurrency;
  return (
    `  Pair meaning: price = how much ${spend} it costs to buy 1 ${base}. ` +
    `LOWER = ${base} is cheaper in ${spend} terms = BETTER entry for converting ${spend} into ${base}. ` +
    `Standard dip logic applies (near 52w low, RSI<35, below 200MA, lower Bollinger = favourable).`
  );
}

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

    const priceLine =
      item.originalCurrency !== defaultCurrency
        ? `  Price: ${formatMoney(item.price, defaultCurrency)} (originally ${item.originalCurrency})`
        : `  Price: ${formatMoney(item.price, defaultCurrency)}`;

    const lines = [
      `${item.ticker} (${fullName}):`,
      isShortBond
        ? `  Asset type: SHORT-DURATION BOND ETF (1-5 year, ~2% price range — apply framework 12a)`
        : null,
      isLongBond
        ? `  Asset type: LONG/INTERMEDIATE-DURATION BOND ETF (rate-sensitive, can rally on rate cuts — apply framework 12b)`
        : null,
      priceLine,
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
      quote?.distributionYield != null && quote.distributionYield !== (item.dividendYield ?? -1)
        ? `  Distribution yield (SEC/12m): ${(quote.distributionYield * 100).toFixed(2)}%`
        : null,
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
        ? `  Calculated gap amount: ${formatMoney(item.suggestedBuyValue, defaultCurrency)} (full amount needed to close allocation gap)`
        : null,
      item.overlapDiscount > 0
        ? `  ETF overlap discount: -${formatMoney(item.overlapDiscount, defaultCurrency)} (${item.overlapPct.toFixed(0)}% of gap covered by held stocks)`
        : null,
      `  P/E signal: ${item.peSignal ?? "none"}`,
    ];

    if (tech) {
      lines.push(`  Technical indicators:`);
      lines.push(
        `    50-day MA: ${formatMoney(tech.sma50, defaultCurrency)} (price ${tech.priceVsSma50 > 0 ? "+" : ""}${tech.priceVsSma50}% vs MA)`,
      );
      if (tech.sma200 != null) {
        lines.push(
          `    200-day MA: ${formatMoney(tech.sma200, defaultCurrency)} (price ${tech.priceVsSma200! > 0 ? "+" : ""}${tech.priceVsSma200}% vs MA)`,
        );
      }
      lines.push(`    RSI(14): ${tech.rsi14} (>70 overbought, <30 oversold)`);
      lines.push(
        `    Momentum: ${tech.momentumSignal}${tech.goldenCross ? " (golden cross)" : ""}${tech.deathCross ? " (death cross)" : ""}`,
      );
      if (tech.macd != null && tech.macdSignal != null) {
        lines.push(
          `    MACD: ${tech.macd} / signal: ${tech.macdSignal} / histogram: ${tech.macdHistogram}${tech.macdCrossover ? ` (${tech.macdCrossover} crossover)` : ""}`,
        );
      }
      if (tech.bollMiddle != null) {
        lines.push(
          `    Bollinger Bands: ${formatMoney(tech.bollLower!, defaultCurrency)} / ${formatMoney(tech.bollMiddle, defaultCurrency)} / ${formatMoney(tech.bollUpper!, defaultCurrency)} (%B=${tech.bollPercentB}, BW=${tech.bollBandwidth})${tech.bollSqueeze ? " (SQUEEZE — low volatility, breakout likely)" : ""}`,
        );
      }
      if (tech.atr14 != null) {
        const volLevel =
          tech.atrPercent! > 3
            ? "high volatility — widen limit orders"
            : tech.atrPercent! < 1
              ? "low volatility — tighter limits"
              : "moderate volatility";
        lines.push(
          `    ATR(14): ${formatMoney(tech.atr14!, defaultCurrency)} (${tech.atrPercent}% of price — ${volLevel})`,
        );
      }
      if (tech.stochK != null) {
        const stochLevel =
          tech.stochK < 20 ? " ← OVERSOLD" : tech.stochK > 80 ? " ← OVERBOUGHT" : "";
        lines.push(
          `    Stochastic: %K=${tech.stochK}, %D=${tech.stochD} (<20 oversold, >80 overbought)${stochLevel}`,
        );
      }
      if (tech.obvTrend != null) {
        const obvLabel =
          tech.obvTrend === "rising"
            ? "accumulation"
            : tech.obvTrend === "falling"
              ? "distribution"
              : "neutral";
        lines.push(`    OBV trend: ${tech.obvTrend} (${obvLabel})`);
      }
      lines.push(
        `    7-day low: ${formatMoney(tech.recentLow7d, defaultCurrency)}, 30-day low: ${formatMoney(tech.recentLow30d, defaultCurrency)}`,
      );
      if (tech.pricePercentile90d != null) {
        const p = tech.pricePercentile90d;
        const tag =
          p <= 20
            ? " ← NEAR 90-DAY LOW (good entry)"
            : p >= 80
              ? " ← NEAR 90-DAY HIGH (poor entry)"
              : "";
        lines.push(`    90-day price percentile: ${p}% (0=at 90d low, 100=at 90d high)${tag}`);
      }
      if (tech.volumeChange7d != null) {
        lines.push(
          `    Volume change (7d vs 30d avg): ${tech.volumeChange7d > 0 ? "+" : ""}${tech.volumeChange7d}%${tech.volumeChange7d < -20 ? " (contraction)" : tech.volumeChange7d > 50 ? " (surge)" : ""}`,
        );
      }
      // Single-day volume spike + price change. Pair these to detect
      // distribution (spike + down day) vs accumulation (spike + up day) —
      // signals the 7d/30d smoothing in volumeChange7d would otherwise hide.
      if (tech.volumeLatest1d != null && tech.priceChange1d != null) {
        const v = tech.volumeLatest1d;
        const p = tech.priceChange1d;
        let interp = "";
        if (v >= 1.5 && p <= -1) {
          interp = " ← DISTRIBUTION (high volume + down day, bearish breakdown)";
        } else if (v >= 1.5 && p >= 1) {
          interp = " ← ACCUMULATION (high volume + up day, bullish confirmation)";
        } else if (v >= 1.5) {
          interp = " ← HIGH VOLUME (1-day spike, watch direction)";
        }
        lines.push(`    Latest day: vol ${v}x avg, price ${p > 0 ? "+" : ""}${p}%${interp}`);
      }
    }

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
          `    Analyst target: ${formatMoney(quote.targetMeanPrice, defaultCurrency)} (${quote.recommendationKey ?? "N/A"})`,
        );
      }
    }

    if (headlines) {
      lines.push(`  Recent news: ${headlines}`);
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

  // ── Watch list summaries (no allocation context — pure signal merit) ──
  // Watch tickers go through the same fetch pipeline but bypass the allocation
  // math. The block tag `[WATCH LIST]` cues the model into the WATCH LIST
  // CRITERIA section of the INSTRUCTIONS below.
  const watchSummaries = report.watchingItems.map((item) => {
    const quote = priceData[item.ticker];
    const tech = technicals[item.ticker];
    const newsItems = news[item.ticker] || [];
    const headlines = newsItems
      .map((n) => {
        const tags = n.sentiment && n.impact ? ` [${n.sentiment}, ${n.impact} impact]` : "";
        return `"${n.title}" (${n.source})${tags}`;
      })
      .join("; ");

    const fullName = item.tickerFullName || item.ticker;
    // A cross-pair is quoted in its own coin and never FX-converted, so its
    // figures must be labelled with that coin — not the report currency, and
    // certainly not "originally X", which implies a conversion that never
    // happened.
    const isCross = item.assetKind === "crypto-cross";
    const itemCurrency = item.quoteCurrency ?? defaultCurrency;
    const priceLine = isCross
      ? `  Price: ${formatMoney(item.price, itemCurrency)} (quoted in ${itemCurrency}, NOT ${defaultCurrency})`
      : item.originalCurrency !== defaultCurrency
        ? `  Price: ${formatMoney(item.price, defaultCurrency)} (originally ${item.originalCurrency})`
        : `  Price: ${formatMoney(item.price, defaultCurrency)}`;

    const lines: (string | null)[] = [
      `${item.ticker} (${fullName}) [WATCH LIST]:`,
      isCross
        ? `  Asset type: CRYPTO CROSS-PAIR on WATCH LIST — apply WATCH LIST CRITERIA (rule 14) and CRYPTO CROSS-PAIRS (rule 15), not portfolio gap rules`
        : `  Asset type: WATCH LIST (no allocation target — apply WATCH LIST CRITERIA, not portfolio gap rules)`,
      isCross ? crossPairSemantics(item.ticker, itemCurrency) : null,
      priceLine,
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
          `  52-week position: ${wpPct}%${qualifier}` +
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
      `  P/E signal: ${item.peSignal ?? "none"}`,
    ];

    if (tech) {
      lines.push(`  Technical indicators:`);
      lines.push(
        `    50-day MA: ${formatMoney(tech.sma50, itemCurrency)} (price ${tech.priceVsSma50 > 0 ? "+" : ""}${tech.priceVsSma50}% vs MA)`,
      );
      if (tech.sma200 != null) {
        lines.push(
          `    200-day MA: ${formatMoney(tech.sma200, itemCurrency)} (price ${tech.priceVsSma200! > 0 ? "+" : ""}${tech.priceVsSma200}% vs MA)`,
        );
      }
      lines.push(`    RSI(14): ${tech.rsi14} (>70 overbought, <30 oversold)`);
      lines.push(
        `    Momentum: ${tech.momentumSignal}${tech.goldenCross ? " (golden cross)" : ""}${tech.deathCross ? " (death cross)" : ""}`,
      );
      if (tech.macd != null && tech.macdSignal != null) {
        lines.push(
          `    MACD: ${tech.macd} / signal: ${tech.macdSignal} / histogram: ${tech.macdHistogram}${tech.macdCrossover ? ` (${tech.macdCrossover} crossover)` : ""}`,
        );
      }
      if (tech.bollMiddle != null) {
        lines.push(
          `    Bollinger Bands: %B=${tech.bollPercentB}${tech.bollSqueeze ? " (SQUEEZE)" : ""}`,
        );
      }
      if (tech.stochK != null) {
        const stochLevel =
          tech.stochK < 20 ? " ← OVERSOLD" : tech.stochK > 80 ? " ← OVERBOUGHT" : "";
        lines.push(`    Stochastic: %K=${tech.stochK}, %D=${tech.stochD}${stochLevel}`);
      }
      if (tech.obvTrend != null) {
        lines.push(`    OBV trend: ${tech.obvTrend}`);
      }
      if (tech.pricePercentile90d != null) {
        lines.push(`    90-day price percentile: ${tech.pricePercentile90d}%`);
      }
    }

    if (
      quote &&
      (quote.returnOnEquity != null || quote.debtToEquity != null || quote.freeCashflow != null)
    ) {
      lines.push(`  Fundamentals:`);
      if (quote.returnOnEquity != null)
        lines.push(`    ROE: ${(quote.returnOnEquity * 100).toFixed(1)}%`);
      if (quote.debtToEquity != null)
        lines.push(`    Debt/Equity: ${quote.debtToEquity.toFixed(1)}%`);
      if (quote.earningsGrowth != null)
        lines.push(`    Earnings growth: ${(quote.earningsGrowth * 100).toFixed(1)}% YoY`);
      if (quote.targetMeanPrice != null) {
        lines.push(
          `    Analyst target: ${formatMoney(quote.targetMeanPrice, defaultCurrency)} (${quote.recommendationKey ?? "N/A"})`,
        );
      }
    }

    if (headlines) lines.push(`  Recent news: ${headlines}`);

    return lines.filter(Boolean).join("\n");
  });

  const watchBlock =
    watchSummaries.length > 0
      ? `\n\nWATCH LIST DATA (tickers tracked but NOT in target portfolio — allocation rules do NOT apply):\n${watchSummaries.join("\n\n")}`
      : "";

  // A watch-only run (e.g. --crypto mode) has an empty target portfolio. Left
  // alone, the header would announce a $0 portfolio and the instructions would
  // tell the model to recommend only portfolio tickers — of which there are none
  // — so a strict-schema call plausibly returns an empty list and the whole run
  // silently produces nothing. Swap the framing instead of contradicting itself.
  const watchOnly = report.items.length === 0;

  return `You are a ${watchOnly ? "market" : "portfolio"} analyst. Analyze these tickers and recommend which to buy.

${macroContext ? macroContext + "\n" : ""}CURRENCY: Monetary values are denominated in ${defaultCurrency} UNLESS a line states its own currency (crypto cross-pairs are quoted in another coin and are never converted — use the currency shown on the line, and never compare a cross-pair's price level against a ${defaultCurrency} one).

${
  watchOnly
    ? `SCOPE: This is a WATCH-LIST-ONLY run. There is no target portfolio and no allocation context at all. Every ticker below is watch-only: judge each purely on signal merit per WATCH LIST CRITERIA (rule 14), and ignore every instruction that refers to allocation gaps, target weights or portfolio value — none of them apply here. You MUST still return one recommendation for EVERY ticker listed.`
    : `PORTFOLIO CONTEXT:
- Total portfolio value: ${formatMoney(report.totalCurrentValue, defaultCurrency)} (target: ${formatMoney(50000, defaultCurrency)})
- Portfolio beta: ${report.portfolioBeta?.toFixed(2) ?? "N/A"}
- Estimated annual dividends: ${formatMoney(report.estimatedAnnualDividend, defaultCurrency)}`
}

${watchOnly ? "" : `TICKER DATA:\n${tickerSummaries.join("\n\n")}`}${watchBlock}

INSTRUCTIONS:
1. ${watchOnly ? "Recommend every ticker listed — all are watch-only (see SCOPE above)." : "Only recommend tickers that are in the target portfolio (target > 0%)."}
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
5. ${watchOnly ? "Return every ticker listed above." : "Return only tickers with target > 0%."} Sort by confidence descending (best buys first).
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
   g) DISTRIBUTION OVERRIDE: when "Latest day" technicals show DISTRIBUTION (high volume + down day ≥ -1%), "price below 200-day MA" must NOT count as a bullish price-level signal — it's confirming a breakdown, not signalling cheapness. Reduce confidence by 15pts. STRONG BUY is disqualified unless RSI is deeply oversold (< 25) AND price is more than 5% below 200MA AND MACD histogram has stopped falling (flat or rising). Default to BUY or WAIT.
   h) MACRO DISCORDANCE: when the trade thesis depends on a macro tailwind that the macro context contradicts, downgrade. Examples: long gold/GLD with DXY spiking (5d change > +0.5); long long-duration bonds with 10Y rising fast (> +0.15% over 20d); long multinationals with DXY > 103. Reduce confidence by 10pts and surface the discordance in the reason field.
10. VALUE INVESTING FRAMEWORK (individual stocks only — skip for ETFs and crypto):
   Rate each stock A through D based on these criteria:
   - ROE > 15% (strong profitability)
   - Debt/Equity < 50% (conservative leverage)
   - FCF/Operating CF > 80% (strong cash conversion)
   - Positive earnings growth
   - Current price below analyst target
   Rating: A (excellent, meets 4-5 criteria), B (good, meets 3), C (fair, meets 1-2), D (overvalued, meets 0 or negative growth with high debt).
   If fundamental data is unavailable, set valueRating to empty string. This ALWAYS applies to ETFs, crypto, and anything whose "Asset type" line says CRYPTO CROSS-PAIR — a coin pair has no earnings, no balance sheet and no analyst target, so any letter grade would be fabricated. Do not treat the absent rating as a negative.
   Factor the value rating into your confidence: A boosts confidence ~5pts, D reduces ~10pts.
11. BOTTOM-FISHING MODEL (all tickers — stocks, ETFs, and crypto):
   Evaluate these bottom indicators for every ticker:
   - RSI < 30 (oversold)
   - Volume contraction > 20% (selling exhaustion)
   - Price below 200-day MA (deep value territory)
   - Death cross present (may already be priced in — contrarian signal if RSI is very low)
   Thresholds differ by asset type:
   - Crypto (single coins and cross-pairs — anything whose "Asset type" line says CRYPTO): flag bottomSignal when 2+ indicators are present. A bottom signal alone does NOT justify STRONG BUY — the ticker must still meet all STRONG BUY criteria above.
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
      - DO NOT suggest a limit order. Set suggestedLimitPrice = 0 and limitPriceReason = "".
        A limit price is meaningless on a ticker that moves < 0.5% intraday — leave it blank.
      - Confidence is driven by TIMING SIGNALS, not gap size alone. Score as follows:

        BASE CONFIDENCE (from gap, before modifiers):
          Gap ≥ 5%: base 55, max 95
          Gap 3-5%: base 45, max 85
          Gap 1-3%: base 35, max 72
          Gap < 1%: action = HOLD, confidence ≤ 40

        TIMING MODIFIERS (sum then clamp to [25, max-above]):
        - 90-day price percentile (where today's price sits in the recent 90-day range):
            ≤ 20% (near 90-day low): +12 (good entry — price is cheap vs recent range)
            21-40%: +6
            41-60%: 0
            61-80%: -6
            > 80% (near 90-day high): -15 (poor entry — wait for pullback)
        - 10Y treasury 20-day change (from MACRO ENVIRONMENT):
            Rising fast (> +0.15%): +6  (bonds got cheaper — favorable)
            Rising (+0.05 to +0.15%): +3
            Flat (-0.05 to +0.05%): 0
            Falling (-0.05 to -0.15%): -6  (rally underway — chasing)
            Falling fast (< -0.15%): -12
        - Distribution yield level:
            > 4.5%: +3 (high income premium)
            3.5-4.5%: +1
            < 3.0%: -2

      - Framing for the reason field: explicitly cite the percentile and rate direction.
        Good day: "BSV at 12% of 90-day range with 10Y rising +0.18% over 20d —
        deploy idle cash, locking in 4.8% yield at a 90-day-low entry."
        Bad day: "BSV at 84% of 90-day range with 10Y falling — wait for a pullback.
        Gap remains 5% but timing is poor."
      - Do NOT invoke RSI/MACD/Bollinger in the reason. Those signals are noise for bonds.

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
   - If no earnings date is shown, ignore this rule.
14. WATCH LIST CRITERIA (only for tickers marked [WATCH LIST]):
   These are tracked but NOT in the user's target portfolio — allocation-gap
   rules (rule 4a "gap ≥ 2%", rule 4 "Only recommend tickers with allocation
   need") DO NOT apply. Evaluate purely on technical/fundamental signal merit.
   - STRONG BUY (watch): ALL must be met
     * ≥ 1 price-level signal (P/E below avg, 52w < 30%, or price below 200MA)
     * ≥ 2 momentum signals confirming the price-level signal (RSI < 35, bullish
       MACD crossover, Bollinger %B < 0.15, Stochastic %K < 20, OBV rising)
     * No major red flags
     * Confidence ≥ 80% based on signal confluence alone
     * Value rating A or B (if it's a stock; ETF/crypto/cross-pair skip this check)
     * For a CRYPTO CROSS-PAIR, P/E does not exist, so the available price-level
       signals are exactly two: 52w position < 30% and price below 200MA. A
       missing P/E is NOT a failed check — ignore it entirely.
   - BUY (watch): 2+ entry signals with at least 1 price-level
   - HOLD/WAIT (watch): less compelling setups
   - suggestedBuyValue MUST be 0 for watch tickers (user sizes manually).
   - suggestedLimitPrice: still suggest one for STRONG BUY / BUY.
   - The "MAX 2 STRONG BUY" cap (rule 4) applies ONLY to portfolio tickers;
     watch tickers don't compete for that quota — flag every watch ticker that
     genuinely qualifies.
   - Framing: "MSFT (watch) shows STRONG BUY setup: oversold across RSI 22,
     Bollinger %B 0.08, and below 200MA — value rating A. Add to portfolio
     consideration." — note "(watch)" in the reason for clarity.
15. CRYPTO CROSS-PAIRS (tickers whose "Asset type" line says CRYPTO CROSS-PAIR, e.g. BTC_CRO):
   These are conversion signals, not purchases with new money: the user already
   holds the quote coin and wants to know when to swap it for the base coin.
   - The price is "how much of the quote coin one unit of the base coin costs",
     stated on the ticker's "Pair meaning" line. LOWER is a BETTER entry, so all
     the usual dip signals keep their normal meaning. Do NOT invert them.
   - "BUY" here means "convert quote coin into base coin now". There is no cash
     outlay, so suggestedBuyValue MUST be 0.
   - suggestedLimitPrice must be expressed in the pair's own quote coin, using the
     price levels shown for that ticker. Never quote it in ${defaultCurrency}, and
     never compare its level to a ${defaultCurrency}-priced ticker.
   - No P/E, no fundamentals, no earnings date, no dividend and no analyst target
     exist for a coin pair. Leave valueRating empty and do not penalise the
     absence.
   - Both coins are volatile, so a favourable pair price can come from either the
     base coin falling or the quote coin rallying. Say which in the reason when
     the data supports it.
   - Framing: "BTC_CRO (watch): BTC is cheap in CRO terms — 18% of the 52-week
     range, RSI 28, below the 200-day MA. Favourable window to convert CRO into
     BTC." `;
}

// ── Stage 1: Observation prompt (Think — parse data, no decisions) ──
export function buildObservationPrompt(
  report: AllocationReport,
  priceData: Record<string, QuoteData>,
  news: Record<string, NewsItem[]>,
  technicals: Record<string, TechnicalData> = {},
  macroContext: string = "",
): string {
  const dataBlock = buildPrompt(report, priceData, news, technicals, macroContext);
  const dataOnly = dataBlock.split("\nINSTRUCTIONS:")[0];

  return `${dataOnly}
TASK: For EVERY ticker shown above — both portfolio holdings AND any tickers marked [WATCH LIST] — produce STRUCTURED OBSERVATIONS only. Do NOT recommend any actions (no BUY/SELL/HOLD).
CRITICAL: Return observations for ALL tickers (portfolio AND watch list), even if they have no signals. Use empty arrays [] for signals/flags when none are present. Watch-list tickers have no allocation target — leave their allocationContext as "watch list, no allocation target".

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
export function buildDecisionPrompt(
  observations: TickerObservation[],
  report: AllocationReport,
  macroContext: string = "",
  reasoningContext: string = "",
  technicals: Record<string, TechnicalData> = {},
  priceData: Record<string, QuoteData> = {},
): string {
  const metricsMap: Record<string, string[]> = {};
  for (const item of report.items) {
    const lines: string[] = [];
    lines.push(`  Price: ${formatMoney(item.price, defaultCurrency)}`);
    if (item.fiftyTwoWeekPercent != null)
      lines.push(`  52w position: ${Math.round(item.fiftyTwoWeekPercent * 100)}%`);
    lines.push(`  Gap: ${item.gapPct > 0 ? "+" : ""}${item.gapPct.toFixed(1)}%`);
    if (item.trailingPE != null) lines.push(`  P/E: ${item.trailingPE.toFixed(1)}`);
    if (SHORT_DURATION_BOND_ETFS.has(item.ticker.toUpperCase())) {
      const tech = technicals[item.ticker];
      const quote = priceData[item.ticker];
      if (tech?.pricePercentile90d != null) {
        lines.push(`  90d percentile: ${tech.pricePercentile90d}%`);
      }
      if (quote?.distributionYield != null) {
        lines.push(`  Distribution yield: ${(quote.distributionYield * 100).toFixed(2)}%`);
      }
      lines.push(`  Asset type: SHORT-DURATION BOND ETF (apply framework 12a)`);
    }
    metricsMap[item.ticker] = lines;
  }
  // Watch list tickers — flagged so Stage 2 applies WATCH LIST CRITERIA.
  for (const item of report.watchingItems) {
    const lines: string[] = [];
    const isCross = item.assetKind === "crypto-cross";
    const itemCurrency = item.quoteCurrency ?? defaultCurrency;
    lines.push(
      isCross
        ? `  Price: ${formatMoney(item.price, itemCurrency)} (quoted in ${itemCurrency}, NOT ${defaultCurrency})`
        : `  Price: ${formatMoney(item.price, defaultCurrency)}`,
    );
    if (item.fiftyTwoWeekPercent != null)
      lines.push(`  52w position: ${Math.round(item.fiftyTwoWeekPercent * 100)}%`);
    if (item.trailingPE != null) lines.push(`  P/E: ${item.trailingPE.toFixed(1)}`);
    // Stage 2 never sees Stage 1's data block, so the asset type and the pair
    // semantics have to be restated here or the Decide stage loses them.
    if (isCross) {
      lines.push(
        `  Asset type: CRYPTO CROSS-PAIR on WATCH LIST — apply WATCH LIST CRITERIA (rule 9) and CRYPTO CROSS-PAIRS (rule 10)`,
      );
      lines.push(crossPairSemantics(item.ticker, itemCurrency));
    } else {
      lines.push(`  Asset type: WATCH LIST (no allocation target — apply WATCH LIST CRITERIA)`);
    }
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

  // See the note in buildPrompt: a watch-only run has no portfolio, so the
  // portfolio framing and the gap-based decision rules must step aside rather
  // than instruct the model to return nothing.
  const watchOnly = report.items.length === 0;

  return `You are a ${watchOnly ? "market" : "portfolio"} analyst making final buy/hold recommendations based on pre-analyzed observations.

${macroContext ? macroContext + "\n" : ""}CURRENCY: Monetary values are denominated in ${defaultCurrency} UNLESS a line states its own currency (crypto cross-pairs are quoted in another coin and are never converted — use the currency shown on the line, and never compare a cross-pair's price level against a ${defaultCurrency} one).

${reasoningContext ? reasoningContext + "\n\n" : ""}${
    watchOnly
      ? `SCOPE: This is a WATCH-LIST-ONLY run. There is no target portfolio, no allocation gap and no portfolio value. Judge every ticker purely on signal merit per rule 9 below, ignore every rule that refers to allocation need or gap size, and set suggestedBuyValue to 0 for all of them. You MUST return one recommendation for EVERY ticker in the observations.`
      : `PORTFOLIO CONTEXT:
- Total portfolio value: ${formatMoney(report.totalCurrentValue, defaultCurrency)}
- Portfolio beta: ${report.portfolioBeta?.toFixed(2) ?? "N/A"}
- Estimated annual dividends: ${formatMoney(report.estimatedAnnualDividend, defaultCurrency)}

GAP AMOUNTS (for suggestedBuyValue sizing):
${report.items
  .filter((i) => i.suggestedBuyValue > 0)
  .map((i) => `  ${i.ticker}: ${formatMoney(i.suggestedBuyValue, defaultCurrency)} gap`)
  .join("\n")}`
  }

STRUCTURED OBSERVATIONS:
${obsText}

DECISION RULES:
1. ${watchOnly ? "Recommend every ticker in the observations — all are watch-only (see SCOPE above)." : "Only recommend tickers with allocation need (gap > 0%)."}
2. ${watchOnly ? "Rank by signal strength." : "Prioritize tickers with BOTH allocation need AND good entry price."}

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
   Short-duration: MAX BUY. NEVER STRONG BUY. NEVER suggest a limit price (set to 0).
     Score with base + timing modifiers (see framework 12a in the observation prompt):
       Base by gap — gap≥5%: 55 (max 95), gap 3-5%: 45 (max 85), gap 1-3%: 35 (max 72), gap<1%: HOLD.
       Modifiers: 90-day price percentile (≤20% → +12, ≥80% → -15);
                  10Y 20d change (>+0.15% → +6, <-0.15% → -12);
                  distribution yield (>4.5% → +3, <3% → -2).
     Frame the reason around percentile + rate direction, NOT momentum indicators.
   Long/intermediate: STRONG BUY valid when gap≥2% + near 52w low + rate environment suggests peak.
9. WATCH LIST tickers (any ticker whose "Asset type" line says WATCH LIST):
   Allocation-gap rules above (1, 4a, 4 max-2 cap) do NOT apply. Evaluate purely on signal merit:
   - STRONG BUY: ≥1 price-level signal + ≥2 momentum signals confirming + no major red flags + confidence ≥ 80 + value rating A/B (stocks only).
   - BUY: 2+ entry signals with at least 1 price-level.
   - HOLD/WAIT: less compelling setups.
   - suggestedBuyValue MUST be 0 (user sizes manually).
   - suggestedLimitPrice: still suggest one for STRONG BUY / BUY.
   - max-2 STRONG BUY cap does NOT apply — flag every qualifying watch ticker.
   - Note "(watch)" in the reason for clarity.
   - For a CRYPTO CROSS-PAIR, P/E does not exist, so the only price-level signals
     available are 52w position < 30% and price below 200MA. A missing P/E is NOT
     a failed check.
10. CRYPTO CROSS-PAIRS (marked "Asset type: CRYPTO CROSS-PAIR", e.g. BTC_CRO):
   A conversion signal, not a purchase — the user already holds the quote coin and
   wants to know when to swap it for the base coin.
   - Price = how much of the quote coin one unit of the base coin costs (see the
     ticker's "Pair meaning" line). LOWER is a BETTER entry: normal dip logic
     applies, do NOT invert it.
   - suggestedBuyValue MUST be 0 — there is no cash outlay.
   - suggestedLimitPrice must be in the pair's own quote coin, never in
     ${defaultCurrency}, and its level must never be compared to a
     ${defaultCurrency}-priced ticker.
   - valueRating stays empty: a coin pair has no earnings, balance sheet or
     analyst target. Do not penalise the absence.
   - A favourable price can come from the base coin falling OR the quote coin
     rallying — say which when the data supports it.
11. Sort by confidence descending.`;
}
