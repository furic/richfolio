import { targetPortfolio, currentHoldings, totalPortfolioValue } from "./config.js";
import type { QuoteData } from "./fetchPrices.js";

// ── Types ───────────────────────────────────────────────────────────
export interface AllocationItem {
  ticker: string;
  tickerFullName: string | null;
  originalCurrency: string;
  currentShares: number;
  currentValue: number;
  currentPct: number;
  targetPct: number;
  gapPct: number;
  suggestedBuyShares: number;
  suggestedBuyValue: number;
  overlapDiscount: number;
  overlapPct: number;
  price: number;
  trailingPE: number | null;
  peSignal: "✅ below avg" | "⚠️ above avg" | null;
  weekSignal: "🟢 near low" | "🟡 near high" | "—" | null;
  fiftyTwoWeekPercent: number | null;
  dividendYield: number | null;
  beta: number | null;
}

export interface AllocationReport {
  items: AllocationItem[];
  portfolioBeta: number | null;
  estimatedAnnualDividend: number;
  totalCurrentValue: number;
}

// ── Analysis ────────────────────────────────────────────────────────
export function runAnalysis(priceData: Record<string, QuoteData>): AllocationReport {
  // 1. Calculate current value per ticker
  const currentValues: Record<string, number> = {};
  let totalCurrentValue = 0;

  for (const [ticker, shares] of Object.entries(currentHoldings)) {
    const quote = priceData[ticker];
    if (!quote) continue;
    const value = shares * quote.price;
    currentValues[ticker] = value;
    totalCurrentValue += value;
  }

  // Use the higher of actual value or configured estimate for allocation math
  const portfolioValue = Math.max(totalCurrentValue, totalPortfolioValue);

  // 2. Build allocation items for ALL tickers (target + held)
  const allTickers = new Set([...Object.keys(targetPortfolio), ...Object.keys(currentHoldings)]);

  const items: AllocationItem[] = [];

  for (const ticker of allTickers) {
    const quote = priceData[ticker];
    if (!quote) continue;

    const shares = currentHoldings[ticker] ?? 0;
    const value = currentValues[ticker] ?? 0;
    const currentPct = portfolioValue > 0 ? (value / portfolioValue) * 100 : 0;
    const targetPct = targetPortfolio[ticker] ?? 0;
    const gapPct = targetPct - currentPct;

    // Suggested buy: only if underweight (gap > 0)
    let suggestedBuyValue = gapPct > 0 ? (gapPct / 100) * portfolioValue : 0;

    // ETF overlap discount: reduce buy amount by indirect exposure through held stocks
    let overlapDiscount = 0;
    if (quote.holdings && suggestedBuyValue > 0) {
      for (const h of quote.holdings) {
        const heldShares = currentHoldings[h.symbol] ?? 0;
        const heldQuote = priceData[h.symbol];
        if (heldShares > 0 && heldQuote) {
          const heldValue = heldShares * heldQuote.price;
          const etfExposure = h.holdingPercent * suggestedBuyValue;
          overlapDiscount += Math.min(etfExposure, heldValue);
        }
      }
      overlapDiscount = Math.min(overlapDiscount, suggestedBuyValue);
      suggestedBuyValue -= overlapDiscount;
    }
    const overlapPct =
      overlapDiscount > 0 && gapPct > 0
        ? (overlapDiscount / ((gapPct / 100) * portfolioValue)) * 100
        : 0;

    const suggestedBuyShares = suggestedBuyValue > 0 ? suggestedBuyValue / quote.price : 0;

    // P/E signal: compare trailing P/E against dynamic avgPE from Yahoo earnings history
    let peSignal: AllocationItem["peSignal"] = null;
    const benchmark = quote.avgPE ?? null;
    if (quote.trailingPE != null && benchmark != null) {
      peSignal = quote.trailingPE < benchmark ? "✅ below avg" : "⚠️ above avg";
    }

    // 52-week position signal
    let weekSignal: AllocationItem["weekSignal"] = null;
    if (quote.fiftyTwoWeekPercent != null) {
      if (quote.fiftyTwoWeekPercent < 0.2) {
        weekSignal = "🟢 near low";
      } else if (quote.fiftyTwoWeekPercent > 0.8) {
        weekSignal = "🟡 near high";
      } else {
        weekSignal = "—";
      }
    }

    items.push({
      ticker,
      tickerFullName: quote.longName ?? null,
      originalCurrency: quote.originalCurrency,
      currentShares: shares,
      currentValue: value,
      currentPct: Math.round(currentPct * 100) / 100,
      targetPct,
      gapPct: Math.round(gapPct * 100) / 100,
      suggestedBuyShares: Math.round(suggestedBuyShares * 100) / 100,
      suggestedBuyValue: Math.round(suggestedBuyValue * 100) / 100,
      overlapDiscount: Math.round(overlapDiscount * 100) / 100,
      overlapPct: Math.round(overlapPct * 100) / 100,
      price: quote.price,
      trailingPE: quote.trailingPE,
      peSignal,
      weekSignal,
      fiftyTwoWeekPercent: quote.fiftyTwoWeekPercent,
      dividendYield: quote.dividendYield,
      beta: quote.beta,
    });
  }

  // Sort by gap descending (largest underweight first)
  items.sort((a, b) => b.gapPct - a.gapPct);

  // 3. Portfolio-wide weighted beta
  let weightedBetaSum = 0;
  let weightedBetaTotal = 0;
  for (const item of items) {
    if (item.beta != null && item.currentValue > 0) {
      weightedBetaSum += item.beta * item.currentValue;
      weightedBetaTotal += item.currentValue;
    }
  }
  const portfolioBeta =
    weightedBetaTotal > 0 ? Math.round((weightedBetaSum / weightedBetaTotal) * 100) / 100 : null;

  // 4. Estimated annual dividend income
  let estimatedAnnualDividend = 0;
  for (const item of items) {
    if (item.dividendYield != null && item.currentValue > 0) {
      estimatedAnnualDividend += item.currentValue * item.dividendYield;
    }
  }
  estimatedAnnualDividend = Math.round(estimatedAnnualDividend * 100) / 100;

  return {
    items,
    portfolioBeta,
    estimatedAnnualDividend,
    totalCurrentValue: Math.round(totalCurrentValue * 100) / 100,
  };
}
