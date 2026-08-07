import { targetPortfolio, currentHoldings, totalPortfolioValue, watchingSet } from "./config.js";
import { buildAllocationReport } from "./allocation.js";
import type { QuoteData } from "./fetchPrices.js";
import type { AllocationReport } from "./allocation.js";

// The allocation maths lives in ./allocation.ts, which imports no config so it
// stays unit-testable (config.js reads config.json at import time and throws
// when absent — CI runs without one). This module is the thin wrapper that
// injects the real portfolio config.
export type { AllocationItem, WatchingItem, AllocationReport } from "./allocation.js";

export function runAnalysis(priceData: Record<string, QuoteData>): AllocationReport {
  return buildAllocationReport(priceData, {
    targetPortfolio,
    currentHoldings,
    totalPortfolioValue,
    watchingSet,
  });
}
