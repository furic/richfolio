import type { AIBuyRecommendation } from "./aiAnalysis.js";
import type { QuoteData } from "./fetchPrices.js";
import type { TechnicalData } from "./fetchTechnicals.js";
import type { AllocationReport } from "./analyze.js";
import { formatMoney } from "./util.js";

// Short-duration bond ETFs — duplicated from aiAnalysis.ts for guard independence
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

// Apply a downgrade in a consistent way: rewrite action, soften phrases in the
// AI's original reason that would contradict the new (lower) action, and prepend
// a clear marker explaining why the guard pipeline overrode the model's call.
//
// This exists because LLMs (Claude especially, anchored on multi-day conviction
// from the reasoning history) routinely return STRONG BUY with a self-contradictory
// reason — e.g. "MSFT meets all STRONG BUY criteria... Allocation gap of 1%
// is small". The guard pipeline correctly downgrades the action, but leaving
// the original reason text in place produces a brief that says BUY in the
// badge and "STRONG BUY criteria met" in the description. This helper makes
// the displayed text coherent with the final action.
function applyDowngrade(rec: AIBuyRecommendation, newAction: string, note: string): void {
  rec.action = newAction;
  // Strip phrases that would now contradict the downgraded action. Soft rewrite —
  // preserves the AI's actual reasoning for transparency.
  const softened = rec.reason
    .replace(/meets? all STRONG BUY criteria/gi, "shows a strong setup")
    .replace(
      /satisf(?:y|ies|ied|ying)\s+(?:the\s+)?STRONG BUY\s+(?:criteria|gate)/gi,
      "passes the strong setup checks",
    )
    .replace(/STRONG BUY criteria (?:are|is) met/gi, "strong setup is present")
    .replace(/qualif(?:y|ies|ied|ying) (?:as|for) (?:a )?STRONG BUY/gi, "qualifies as a BUY");
  rec.reason = `[Guard: ${note}] ${softened}`;
}

/**
 * Post-AI validation pipeline. Runs sequential guards to catch common AI mistakes
 * before recommendations reach the user. Inspired by OpenAlice's guard pipeline.
 *
 * Each guard is independent and modifies recommendations in place.
 */
export function validateRecommendations(
  recs: AIBuyRecommendation[],
  priceData: Record<string, QuoteData>,
  technicals: Record<string, TechnicalData>,
  report: AllocationReport,
): void {
  guardOverweightHold(recs, report);
  guardBondETFCap(recs, report);
  guardEarningsProximity(recs, priceData);
  guardStrongBuyCriteria(recs, report, priceData, technicals);
  guardMaxStrongBuy(recs);
  guardConfidenceSanity(recs);
  guardBuyValueSanity(recs, report);
  guardBottomSignal(recs, priceData, technicals);
  guardLimitBelowAnnualLow(recs, priceData);
}

// ── Guard 0: Overweight positions must HOLD ─────────────────────────
// The decision prompt says "Only recommend tickers with allocation need
// (gap > 0%)" but Claude in particular has been observed violating this —
// anchoring on multi-day reasoning-history conviction and producing BUY
// recommendations on already-overweight tickers. Programmatic enforcement
// here makes the rule binding regardless of which provider returned it.
//
// Threshold is `gap <= 0` (strictly at/over target). A position at exactly
// the target doesn't warrant adding; only underweight positions do.
function guardOverweightHold(recs: AIBuyRecommendation[], report: AllocationReport): void {
  const gapMap: Record<string, number> = {};
  for (const item of report.items) {
    gapMap[item.ticker] = item.gapPct;
  }

  for (const rec of recs) {
    // Watch tickers have no allocation target — skip the overweight check.
    if (rec.isWatching) continue;
    if (rec.action !== "BUY" && rec.action !== "STRONG BUY") continue;
    const gap = gapMap[rec.ticker];
    if (gap == null) continue;
    if (gap <= 0) {
      console.log(
        `  [guard:overweight] ${rec.ticker}: gap ${gap.toFixed(1)}% (at/over target) → HOLD`,
      );
      applyDowngrade(rec, "HOLD", `at/over target (gap ${gap.toFixed(1)}%)`);
      rec.suggestedBuyValue = 0;
      if (rec.suggestedLimitPrice) {
        rec.suggestedLimitPrice = 0;
        rec.limitPriceReason = "";
      }
    }
  }
}

// ── Guard 1: Bond ETF cap ──────────────────────────────────────────
// Short-duration bonds (BSV, SHY, ...) can never be STRONG BUY — they have no
// meaningful capital-appreciation upside. They also can't carry a limit price:
// daily price range is so tight that "limit at 50MA support" is noise.
//
// Confidence is NOT gap-capped here anymore. Framework 12a in aiAnalysis.ts
// drives confidence via timing modifiers (90d percentile, 10Y rate change,
// distribution yield) so BSV reflects whether today is actually a good entry.
// Absolute ceiling of 95 matches the equity confidence cap in
// guardConfidenceSanity — STRONG BUY/BUY tier ordering keeps BSV from
// crowding genuine equity STRONG BUYs visually, so the cap can be permissive.
function guardBondETFCap(recs: AIBuyRecommendation[], report?: AllocationReport): void {
  const gapMap: Record<string, number> = {};
  if (report) {
    for (const item of report.items) {
      gapMap[item.ticker] = item.gapPct;
    }
  }

  for (const rec of recs) {
    if (!SHORT_DURATION_BOND_ETFS.has(rec.ticker.toUpperCase())) continue;

    // Never STRONG BUY short-duration bonds
    if (rec.action === "STRONG BUY") {
      console.log(`  [guard:bond] ${rec.ticker}: short-duration bond ETF → capping at BUY`);
      applyDowngrade(
        rec,
        "BUY",
        "short-duration bond ETF capped at BUY (no upside for STRONG BUY)",
      );
    }

    // Strip limit-price suggestion — meaningless on a low-volatility instrument
    if (rec.suggestedLimitPrice && rec.suggestedLimitPrice > 0) {
      console.log(`  [guard:bond] ${rec.ticker}: stripping limit price (short-duration bond)`);
      rec.suggestedLimitPrice = 0;
      rec.limitPriceReason = "";
    }

    // Absolute confidence ceiling (safety net for AI overshoot)
    if (rec.confidence > 95) {
      rec.confidence = 95;
    }

    // If gap < 1%, position is essentially on target — downgrade to HOLD
    const gap = gapMap[rec.ticker] ?? 0;
    if (gap < 1 && rec.action === "BUY") {
      applyDowngrade(rec, "HOLD", `bond ETF essentially at target (gap ${gap.toFixed(1)}%)`);
      rec.suggestedBuyValue = 0;
    }
  }
}

// ── Guard 2: Earnings proximity ────────────────────────────────────
function guardEarningsProximity(
  recs: AIBuyRecommendation[],
  priceData: Record<string, QuoteData>,
): void {
  for (const rec of recs) {
    const quote = priceData[rec.ticker];
    if (quote?.daysToEarnings == null) continue;

    if (quote.daysToEarnings <= 3 && rec.action !== "HOLD" && rec.action !== "WAIT") {
      console.log(`  [guard:earnings] ${rec.ticker}: earnings in ${quote.daysToEarnings}d → HOLD`);
      applyDowngrade(rec, "HOLD", `earnings in ${quote.daysToEarnings} days — too risky for buy`);
      rec.suggestedBuyValue = 0;
      rec.suggestedLimitPrice = 0;
      rec.limitPriceReason = "";
    } else if (quote.daysToEarnings <= 7 && rec.action === "STRONG BUY") {
      console.log(`  [guard:earnings] ${rec.ticker}: earnings in ${quote.daysToEarnings}d → BUY`);
      applyDowngrade(rec, "BUY", `earnings in ${quote.daysToEarnings} days — capped at BUY`);
    }
  }
}

// ── Guard 3: STRONG BUY criteria enforcement ───────────────────────

// Price-level signals the code can verify; the prompt lists exactly these two (P/E is not one).
// A signal whose data is missing counts as absent: the AI saw the same N/A.
export function priceLevelSignals(
  quote: QuoteData | undefined,
  tech: TechnicalData | undefined,
): string[] {
  const signals: string[] = [];
  if (quote?.fiftyTwoWeekPercent != null && quote.fiftyTwoWeekPercent < 0.3) {
    signals.push("52w position < 30%");
  }
  if (tech?.sma200 != null && tech.priceVsSma200 != null && tech.priceVsSma200 < 0) {
    signals.push("price below 200MA");
  }
  return signals;
}

function momentumSignalCount(tech: TechnicalData | undefined): number {
  if (!tech) return 0;
  return [
    tech.rsi14 < 35,
    tech.macdCrossover === "bullish",
    tech.bollPercentB != null && tech.bollPercentB < 0.15,
    tech.stochK != null && tech.stochK < 20,
    tech.obvTrend === "rising",
  ].filter(Boolean).length;
}

function guardStrongBuyCriteria(
  recs: AIBuyRecommendation[],
  report: AllocationReport,
  priceData: Record<string, QuoteData>,
  technicals: Record<string, TechnicalData>,
): void {
  const gapMap: Record<string, number> = {};
  for (const item of report.items) {
    gapMap[item.ticker] = item.gapPct;
  }

  for (const rec of recs) {
    if (rec.action !== "STRONG BUY") continue;
    const label = rec.isWatching ? `${rec.ticker} (watch)` : rec.ticker;

    // Watch tickers have no allocation target, so only the gap check is skipped for them.
    if (!rec.isWatching) {
      const gap = gapMap[rec.ticker] ?? 0;
      if (gap < 2) {
        console.log(`  [guard:criteria] ${label}: gap ${gap.toFixed(1)}% < 2% → BUY`);
        applyDowngrade(rec, "BUY", `gap ${gap.toFixed(1)}% < 2% STRONG BUY threshold`);
        continue;
      }
    }

    if (rec.confidence < 80) {
      console.log(`  [guard:criteria] ${label}: confidence ${rec.confidence}% < 80% → BUY`);
      applyDowngrade(rec, "BUY", `confidence ${rec.confidence}% < 80% STRONG BUY threshold`);
      continue;
    }

    const quote = priceData[rec.ticker];
    const tech = technicals[rec.ticker];
    const priceLevel = priceLevelSignals(quote, tech);
    if (priceLevel.length === 0) {
      const pos =
        quote?.fiftyTwoWeekPercent != null
          ? `52w ${Math.round(quote.fiftyTwoWeekPercent * 100)}%`
          : "52w N/A";
      const ma =
        tech?.priceVsSma200 != null
          ? `${tech.priceVsSma200 > 0 ? "+" : ""}${tech.priceVsSma200}% vs 200MA`
          : "200MA N/A";
      console.log(`  [guard:criteria] ${label}: no price-level signal (${pos}, ${ma}) → BUY`);
      applyDowngrade(rec, "BUY", `no price-level signal (${pos}, ${ma})`);
      continue;
    }

    if (priceLevel.length + momentumSignalCount(tech) < 2) {
      console.log(`  [guard:criteria] ${label}: only 1 entry signal (${priceLevel[0]}) → BUY`);
      applyDowngrade(rec, "BUY", `only 1 entry signal (${priceLevel[0]}) — STRONG BUY needs 2+`);
    }
  }
}

// ── Guard 4: Max 2 STRONG BUY ──────────────────────────────────────
// Cap applies only to PORTFOLIO STRONG BUYs — watch-list STRONG BUYs are
// research signals, not capital-deployment decisions, so they don't compete
// for the same quota. Surface every qualifying watch STRONG BUY.
function guardMaxStrongBuy(recs: AIBuyRecommendation[]): void {
  const strongBuys = recs
    .filter((r) => r.action === "STRONG BUY" && !r.isWatching)
    .sort((a, b) => b.confidence - a.confidence);

  if (strongBuys.length > 2) {
    for (const rec of strongBuys.slice(2)) {
      console.log(`  [guard:max2] ${rec.ticker}: >2 STRONG BUYs → BUY`);
      applyDowngrade(rec, "BUY", "max 2 STRONG BUY cap — outside top 2 by conviction");
    }
  }
}

// ── Guard 5: Confidence sanity ─────────────────────────────────────
function guardConfidenceSanity(recs: AIBuyRecommendation[]): void {
  for (const rec of recs) {
    if (rec.confidence > 95) {
      rec.confidence = 95;
    }
    if ((rec.action === "HOLD" || rec.action === "WAIT") && rec.confidence > 70) {
      console.log(
        `  [guard:sanity] ${rec.ticker}: ${rec.action} with ${rec.confidence}% → capping at 70%`,
      );
      rec.confidence = 70;
    }
  }
}

// ── Guard 6: Buy value sanity ──────────────────────────────────────
function guardBuyValueSanity(recs: AIBuyRecommendation[], report: AllocationReport): void {
  const gapValueMap: Record<string, number> = {};
  for (const item of report.items) {
    gapValueMap[item.ticker] = item.suggestedBuyValue;
  }

  for (const rec of recs) {
    if (rec.action === "HOLD" || rec.action === "WAIT") {
      if (rec.suggestedBuyValue > 0) {
        rec.suggestedBuyValue = 0;
      }
      if (rec.suggestedLimitPrice && rec.suggestedLimitPrice > 0) {
        rec.suggestedLimitPrice = 0;
        rec.limitPriceReason = "";
      }
      continue;
    }

    // Watch tickers have no allocation gap to anchor a buy size — user sizes
    // manually. Force suggestedBuyValue to 0 regardless of what the AI returned.
    if (rec.isWatching) {
      if (rec.suggestedBuyValue > 0) {
        rec.suggestedBuyValue = 0;
      }
      continue;
    }

    const maxGap = gapValueMap[rec.ticker] ?? 0;
    if (maxGap > 0 && rec.suggestedBuyValue > maxGap * 1.1) {
      console.log(
        `  [guard:value] ${rec.ticker}: suggestedBuyValue $${rec.suggestedBuyValue.toFixed(0)} > gap $${maxGap.toFixed(0)} → capping`,
      );
      rec.suggestedBuyValue = maxGap;
    }
  }
}

// ── Guard 7: Bottom signal computed, not trusted ───────────────────
// The bottom-fishing model is a count of four indicators; models miscounted (RSI 30.2 as "RSI<30").
export function bottomSignalIndicators(tech: TechnicalData | undefined): string[] {
  if (!tech) return [];
  const found: string[] = [];
  if (tech.rsi14 < 30) found.push(`RSI ${tech.rsi14.toFixed(1)} < 30`);
  if (tech.volumeChange7d != null && tech.volumeChange7d < -20) {
    found.push(`volume ${tech.volumeChange7d.toFixed(0)}% (7d)`);
  }
  if (tech.sma200 != null && tech.priceVsSma200 != null && tech.priceVsSma200 < 0) {
    found.push(`${tech.priceVsSma200}% below 200MA`);
  }
  if (tech.deathCross) found.push("death cross");
  return found;
}

function isCrypto(quote: QuoteData | undefined): boolean {
  return quote?.assetKind === "crypto-cross" || quote?.quoteType === "CRYPTOCURRENCY";
}

function guardBottomSignal(
  recs: AIBuyRecommendation[],
  priceData: Record<string, QuoteData>,
  technicals: Record<string, TechnicalData>,
): void {
  for (const rec of recs) {
    const quote = priceData[rec.ticker];
    const found = bottomSignalIndicators(technicals[rec.ticker]);
    const needed = isCrypto(quote) ? 2 : 3;
    const computed = found.length >= needed ? found.join(" + ") : "";
    if ((rec.bottomSignal ?? "") !== computed && rec.bottomSignal) {
      console.log(`  [guard:bottom] ${rec.ticker}: "${rec.bottomSignal}" → "${computed}"`);
    }
    rec.bottomSignal = computed;
  }
}

// ── Guard 8: Limit below the 52-week low ───────────────────────────
// Such a limit fills only once annual support breaks — the opposite of a buy-the-dip entry. Flag, don't move it.
function guardLimitBelowAnnualLow(
  recs: AIBuyRecommendation[],
  priceData: Record<string, QuoteData>,
): void {
  for (const rec of recs) {
    if (rec.action !== "STRONG BUY" && rec.action !== "BUY") continue;
    const low = priceData[rec.ticker]?.fiftyTwoWeekLow;
    const limit = rec.suggestedLimitPrice;
    if (!limit || low == null || limit >= low) continue;
    const cur = priceData[rec.ticker]?.currency ?? "USD";
    const note = `⚠ Below the 52-week low (${formatMoney(low, cur)}) — fills only if that support breaks.`;
    rec.limitPriceReason = rec.limitPriceReason ? `${rec.limitPriceReason} ${note}` : note;
    console.log(`  [guard:limit] ${rec.ticker}: limit ${limit} < 52w low ${low}`);
  }
}
