import type { AIBuyRecommendation } from "./aiAnalysis.js";
import type { MorningBaseline } from "./state.js";
import type { IntradayAlertConfig } from "./config.js";

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

    const confidenceDelta = rec.confidence - morningConfidence;
    const wasStrongBuy = morningAction === "STRONG BUY";
    const isStrongBuy = rec.action === "STRONG BUY";

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

    // Skip alerts below minimum confidence threshold
    if (
      triggerType &&
      triggerType !== "action_downgrade" &&
      rec.confidence < config.minConfidenceToAlert
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
        priceDelta: morningPrice > 0 ? ((currentPrice - morningPrice) / morningPrice) * 100 : 0,
      });
    }
  }

  // Strongest signals first
  alerts.sort((a, b) => b.currentConfidence - a.currentConfidence);

  return alerts;
}
