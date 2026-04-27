import type { AIBuyRecommendation } from "./aiAnalysis.js";
import type { QuoteData } from "./fetchPrices.js";
import type { TechnicalData } from "./fetchTechnicals.js";
import type { AllocationReport } from "./analyze.js";

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
  guardBondETFCap(recs, report);
  guardEarningsProximity(recs, priceData);
  guardStrongBuyCriteria(recs, report, technicals);
  guardMaxStrongBuy(recs);
  guardConfidenceSanity(recs);
  guardBuyValueSanity(recs, report);
}

// ── Guard 1: Bond ETF cap ──────────────────────────────────────────
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
      rec.action = "BUY";
    }

    // Scale confidence by gap size (not technicals)
    const gap = gapMap[rec.ticker] ?? 0;
    let maxConfidence: number;
    if (gap >= 5) maxConfidence = 75;
    else if (gap >= 3) maxConfidence = 70;
    else if (gap >= 1) maxConfidence = 55;
    else maxConfidence = 40; // near target → low confidence

    if (rec.confidence > maxConfidence) {
      rec.confidence = maxConfidence;
    }

    // If gap < 1%, downgrade to HOLD
    if (gap < 1 && rec.action === "BUY") {
      rec.action = "HOLD";
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
      rec.action = "HOLD";
      rec.reason = `Earnings in ${quote.daysToEarnings} days — too risky for buy. ${rec.reason}`;
      rec.suggestedBuyValue = 0;
      rec.suggestedLimitPrice = 0;
      rec.limitPriceReason = "";
    } else if (quote.daysToEarnings <= 7 && rec.action === "STRONG BUY") {
      console.log(`  [guard:earnings] ${rec.ticker}: earnings in ${quote.daysToEarnings}d → BUY`);
      rec.action = "BUY";
      rec.reason = `Earnings in ${quote.daysToEarnings} days — downgraded from STRONG BUY. ${rec.reason}`;
    }
  }
}

// ── Guard 3: STRONG BUY criteria enforcement ───────────────────────
function guardStrongBuyCriteria(
  recs: AIBuyRecommendation[],
  report: AllocationReport,
  technicals: Record<string, TechnicalData>,
): void {
  const gapMap: Record<string, number> = {};
  for (const item of report.items) {
    gapMap[item.ticker] = item.gapPct;
  }

  for (const rec of recs) {
    if (rec.action !== "STRONG BUY") continue;

    const gap = gapMap[rec.ticker] ?? 0;
    const tech = technicals[rec.ticker];

    // Check gap >= 2%
    if (gap < 2) {
      console.log(`  [guard:criteria] ${rec.ticker}: gap ${gap.toFixed(1)}% < 2% → BUY`);
      rec.action = "BUY";
      continue;
    }

    // Check confidence >= 80%
    if (rec.confidence < 80) {
      console.log(`  [guard:criteria] ${rec.ticker}: confidence ${rec.confidence}% < 80% → BUY`);
      rec.action = "BUY";
      continue;
    }

    // Soft check for signal presence — the AI already applies strict criteria,
    // this guard only catches obvious misses (no signals at all).
    // We can't perfectly verify P/E signals here without avgPE data.
    if (tech) {
      const priceBelow200MA =
        tech.sma200 != null && tech.priceVsSma200 != null && tech.priceVsSma200 < 0;
      const hasAnyMomentum =
        tech.rsi14 < 35 ||
        tech.macdCrossover === "bullish" ||
        (tech.bollPercentB != null && tech.bollPercentB < 0.15) ||
        (tech.stochK != null && tech.stochK < 20);
      // Only downgrade if there are truly NO signals at all
      if (!priceBelow200MA && !hasAnyMomentum) {
        console.log(`  [guard:criteria] ${rec.ticker}: no price-level or momentum signals → BUY`);
        rec.action = "BUY";
      }
    }
  }
}

// ── Guard 4: Max 2 STRONG BUY ──────────────────────────────────────
function guardMaxStrongBuy(recs: AIBuyRecommendation[]): void {
  const strongBuys = recs
    .filter((r) => r.action === "STRONG BUY")
    .sort((a, b) => b.confidence - a.confidence);

  if (strongBuys.length > 2) {
    for (const rec of strongBuys.slice(2)) {
      console.log(`  [guard:max2] ${rec.ticker}: >2 STRONG BUYs → BUY`);
      rec.action = "BUY";
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

    const maxGap = gapValueMap[rec.ticker] ?? 0;
    if (maxGap > 0 && rec.suggestedBuyValue > maxGap * 1.1) {
      console.log(
        `  [guard:value] ${rec.ticker}: suggestedBuyValue $${rec.suggestedBuyValue.toFixed(0)} > gap $${maxGap.toFixed(0)} → capping`,
      );
      rec.suggestedBuyValue = maxGap;
    }
  }
}
