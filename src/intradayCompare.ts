import type { AIBuyRecommendation } from "./aiAnalysis.js";
import type { MorningBaseline } from "./state.js";
import type { IntradayAlertConfig } from "./config.js";
import { isAlertableStrongBuy, findStrongBuyVoter } from "./aiAggregation.js";

// ── Types ───────────────────────────────────────────────────────────
export interface IntradayAlert {
  ticker: string;
  tickerFullName: string | null;
  originalCurrency: string;
  morningAction: string;
  morningConfidence: number;
  currentAction: string;
  currentConfidence: number;
  confidenceDelta: number;
  reason: string;
  suggestedBuyValue: number;
  suggestedLimitPrice?: number;
  limitPriceReason?: string;
  valueRating?: string;
  bottomSignal?: string;
  analysisUrl?: string;
  triggerType: "confidence_change" | "action_upgrade" | "action_downgrade";
  currentPrice: number;
  morningPrice: number;
  priceDelta: number;
  // Carried from the current recommendation this alert was raised against, so
  // intraday renderers can show the same per-AI breakdown / degradation
  // safety badge the daily brief shows. All optional: undefined in
  // single-provider mode, exactly like on AIBuyRecommendation itself.
  providers?: AIBuyRecommendation["providers"];
  agreement?: AIBuyRecommendation["agreement"];
  degradation?: AIBuyRecommendation["degradation"];
  /**
   * Currency of `currentPrice` / `suggestedLimitPrice`. Renderers must format
   * against this, not `defaultCurrency` — a crypto cross-pair is quoted in its
   * own coin. Deliberately NOT `originalCurrency`, which for an equity is the
   * pre-conversion label while the numbers beside it are already converted.
   */
  quoteCurrency?: string;
  /** Set for instruments needing special handling; see AssetKind. */
  assetKind?: AIBuyRecommendation["assetKind"];
  /** True when the ticker is watch-only (no allocation target). */
  isWatching?: boolean;
}

// ── Action ranking for upgrade detection ────────────────────────────
const ACTION_RANK: Record<string, number> = {
  WAIT: 0,
  HOLD: 1,
  BUY: 2,
  "STRONG BUY": 3,
};

// ── Compare current AI recs against morning baseline ────────────────
export function compareWithBaseline(
  currentRecs: AIBuyRecommendation[],
  currentPrices: Record<string, number>,
  baseline: MorningBaseline,
  config: IntradayAlertConfig,
): IntradayAlert[] {
  const alerts: IntradayAlert[] = [];

  const baselineMap = new Map(baseline.recommendations.map((r) => [r.ticker, r]));

  for (const rec of currentRecs) {
    const morning = baselineMap.get(rec.ticker);
    const morningAction = morning?.action ?? "N/A";
    const morningConfidence = morning?.confidence ?? 0;
    const morningPrice = baseline.prices[rec.ticker] ?? 0;
    const currentPrice = currentPrices[rec.ticker] ?? 0;
    const priceDelta = morningPrice > 0 ? ((currentPrice - morningPrice) / morningPrice) * 100 : 0;

    const confidenceDelta = rec.confidence - morningConfidence;
    // Both sides use isAlertableStrongBuy, never the bare action. The baseline
    // stores whole recommendations, so `providers[]` is available on the morning
    // rec too — and the symmetry matters twice over. Mixing a vote-aware "now"
    // with an action-only "morning" would fire a phantom upgrade on every run
    // for any ticker sitting at BUY with a standing STRONG BUY vote behind it.
    // And the predicate has to be the *alertable* one on both sides, not just in
    // the confidence gate below: a downgrade bypasses that gate entirely, so a
    // ticker whose lone far-dissented STRONG BUY vote disappeared would announce
    // the loss of a signal you were never told about in the first place.
    const wasStrongBuy = morning ? isAlertableStrongBuy(morning) : false;
    const isStrongBuy = isAlertableStrongBuy(rec);

    let triggerType: IntradayAlert["triggerType"] | null = null;

    // Trigger 1: Downgraded FROM STRONG BUY to any other level
    if (wasStrongBuy && !isStrongBuy) {
      triggerType = "action_downgrade";
    }

    // Trigger 2: Upgraded TO STRONG BUY from any other level
    if (!wasStrongBuy && isStrongBuy) {
      triggerType = "action_upgrade";
    }

    // Trigger 3: Confidence changed ≥ threshold while staying STRONG BUY
    if (
      wasStrongBuy &&
      isStrongBuy &&
      Math.abs(confidenceDelta) >= config.confidenceIncreaseThreshold
    ) {
      triggerType = "confidence_change";
    }

    // Frozen-data guard: intraday technicals are computed from daily candles
    // that only update at the US close, and every intraday run fires while the
    // US market is shut — so the indicators are identical between runs. An
    // action/confidence flip with no material price move is AI scoring noise,
    // not a real signal, so suppress it. Fail open when we lack both prices
    // (can't prove it's noise) or when the threshold is disabled (0).
    if (
      triggerType &&
      config.minPriceMovePctToAlert > 0 &&
      morningPrice > 0 &&
      currentPrice > 0 &&
      Math.abs(priceDelta) < config.minPriceMovePctToAlert
    ) {
      triggerType = null;
    }

    // Skip alerts below minimum confidence threshold
    // Confidence gate — measured on the SAME thing the trigger fired on.
    //
    // The triggers above are vote-aware (hasStrongBuyVote: does ANY provider say
    // STRONG BUY?), so the gate has to be too. Comparing the threshold against
    // `rec.confidence` — the mean across every provider — mixes units: averaging
    // compresses toward the middle, so one confident model can never clear a bar
    // calibrated for a single model's own conviction. With three providers a
    // Claude STRONG BUY at 82 alongside a Gemini BUY at 45 averages to 66, and
    // an 80 threshold silently rejects it.
    //
    // That is exactly what happened: across ten consecutive intraday runs
    // (2026-08-12→14) the highest consensus confidence was 76, so every
    // non-downgrade trigger was discarded and no intraday alert fired for a
    // week. Adding the third provider in v1.10 made the averaging harsher.
    //
    // So gate on the STRONG BUY voter's own confidence when there is one, and
    // fall back to the consensus otherwise (single-provider runs, or a trigger
    // with no STRONG BUY vote behind it). 80 keeps its original meaning: one
    // model is at least 80% confident.
    //
    // Only an *alertable* vote supplies that figure. Reading the raw voter would
    // reduce the gate to "did the most confident model say STRONG BUY", which on
    // this provider mix means Mistral alone — it runs ~20 points hotter than
    // Claude for the same action. A far-dissented vote falls back to the
    // consensus, which is exactly the diluted number that should not clear 80.
    const voter = isAlertableStrongBuy(rec) ? findStrongBuyVoter(rec) : null;
    const gateConfidence = voter?.confidence ?? rec.confidence;

    if (
      triggerType &&
      triggerType !== "action_downgrade" &&
      gateConfidence < config.minConfidenceToAlert
    ) {
      triggerType = null;
    }

    if (triggerType) {
      alerts.push({
        ticker: rec.ticker,
        tickerFullName: rec.tickerFullName ?? null,
        originalCurrency: rec.originalCurrency,
        morningAction,
        morningConfidence,
        currentAction: rec.action,
        currentConfidence: rec.confidence,
        confidenceDelta,
        reason: rec.reason,
        suggestedBuyValue: rec.suggestedBuyValue,
        suggestedLimitPrice: rec.suggestedLimitPrice,
        limitPriceReason: rec.limitPriceReason,
        valueRating: rec.valueRating,
        bottomSignal: rec.bottomSignal,
        analysisUrl: rec.analysisUrl,
        triggerType,
        currentPrice,
        morningPrice,
        priceDelta,
        providers: rec.providers,
        agreement: rec.agreement,
        degradation: rec.degradation,
        quoteCurrency: rec.quoteCurrency,
        assetKind: rec.assetKind,
        isWatching: rec.isWatching,
      });
    }
  }

  // Strongest signals first
  alerts.sort((a, b) => b.currentConfidence - a.currentConfidence);

  return alerts;
}
