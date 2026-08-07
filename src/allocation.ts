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

/**
 * Lightweight item for a watch-list ticker. No allocation context — pure
 * price/value snapshot to hand to the AI prompt. The AI evaluates these on
 * signal merit; allocation-based guard logic skips them.
 */
export interface WatchingItem {
  ticker: string;
  tickerFullName: string | null;
  originalCurrency: string;
  price: number;
  trailingPE: number | null;
  peSignal: "✅ below avg" | "⚠️ above avg" | null;
  weekSignal: "🟢 near low" | "🟡 near high" | "—" | null;
  fiftyTwoWeekPercent: number | null;
  dividendYield: number | null;
  beta: number | null;
}

export interface AllocationReport {
  /** Tickers WITH a targetPortfolio entry. The only ones the AI scores. */
  items: AllocationItem[];
  /**
   * Held-only tickers: present in `currentHoldings`, absent from
   * `targetPortfolio`, absent from `watching`. Held deliberately (to keep
   * portfolio totals honest and to inform ETF overlap) but with no allocation
   * target, so they have nothing to buy toward and — Richfolio being buy-only —
   * no real sell logic behind a trim suggestion either.
   *
   * Kept out of `items` so they generate no daily recommendation, no allocation
   * row, no weekly TRIM, and cost zero AI tokens. Same `AllocationItem` shape so
   * renderers can display them without special-casing.
   */
  untrackedItems: AllocationItem[];
  /** Tickers tracked but not in the target portfolio (config.watching). */
  watchingItems: WatchingItem[];
  portfolioBeta: number | null;
  estimatedAnnualDividend: number;
  totalCurrentValue: number;
}

/**
 * The portfolio configuration the report is computed against. Passed in rather
 * than imported so this module stays free of `config.js` — that module reads
 * config.json at import time and throws when it's absent, which would make
 * every consumer (and CI, which runs without a config.json) unable to even
 * import this file. `analyze.ts` is the thin wrapper that injects the real one.
 */
export interface AllocationInputs {
  targetPortfolio: Record<string, number>;
  currentHoldings: Record<string, number>;
  totalPortfolioValue: number;
  watchingSet: Set<string>;
}

// ── Analysis ────────────────────────────────────────────────────────
export function buildAllocationReport(
  priceData: Record<string, QuoteData>,
  cfg: AllocationInputs,
): AllocationReport {
  const { targetPortfolio, currentHoldings, totalPortfolioValue, watchingSet } = cfg;

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

  // 2. Build allocation items for ALL tickers (target + held).
  //    Watch-list tickers are excluded here — they go in a separate watchingItems
  //    array so they don't pollute allocation maths or compete with portfolio
  //    recommendations for the max-2 STRONG BUY cap.
  //
  //    Held-only tickers (held, no target, not watched) are routed to
  //    untrackedItems for the same reason: with an implied 0% target their gap is
  //    always negative, which used to render as permanent "N% overweight" noise
  //    in the daily brief and a standing TRIM in the weekly report — neither
  //    actionable, since Richfolio has no sell logic.
  const allTickers = new Set([...Object.keys(targetPortfolio), ...Object.keys(currentHoldings)]);

  const items: AllocationItem[] = [];
  const untrackedItems: AllocationItem[] = [];

  for (const ticker of allTickers) {
    if (watchingSet.has(ticker)) continue;
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

    const item: AllocationItem = {
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
    };

    // Routing: a targetPortfolio entry makes it a tracked allocation item.
    // Otherwise it is only here because it's held → untracked.
    if (ticker in targetPortfolio) {
      items.push(item);
    } else {
      untrackedItems.push(item);
    }
  }

  // Sort by gap descending (largest underweight first)
  items.sort((a, b) => b.gapPct - a.gapPct);
  untrackedItems.sort((a, b) => b.currentValue - a.currentValue);

  // 3. Portfolio-wide weighted beta
  //    Iterates BOTH arrays: held-only tickers are real exposure, so excluding
  //    them would understate portfolio risk.
  const valued = [...items, ...untrackedItems];

  let weightedBetaSum = 0;
  let weightedBetaTotal = 0;
  for (const item of valued) {
    if (item.beta != null && item.currentValue > 0) {
      weightedBetaSum += item.beta * item.currentValue;
      weightedBetaTotal += item.currentValue;
    }
  }
  const portfolioBeta =
    weightedBetaTotal > 0 ? Math.round((weightedBetaSum / weightedBetaTotal) * 100) / 100 : null;

  // 4. Estimated annual dividend income — likewise counts held-only holdings,
  //    which pay real dividends regardless of having no target weight.
  let estimatedAnnualDividend = 0;
  for (const item of valued) {
    if (item.dividendYield != null && item.currentValue > 0) {
      estimatedAnnualDividend += item.currentValue * item.dividendYield;
    }
  }
  estimatedAnnualDividend = Math.round(estimatedAnnualDividend * 100) / 100;

  // 5. Build the watch-list items (no allocation context — pure snapshots).
  const watchingItems: WatchingItem[] = [];
  for (const ticker of watchingSet) {
    const quote = priceData[ticker];
    if (!quote) continue;

    let peSignal: WatchingItem["peSignal"] = null;
    if (quote.trailingPE != null && quote.avgPE != null) {
      peSignal = quote.trailingPE < quote.avgPE ? "✅ below avg" : "⚠️ above avg";
    }

    let weekSignal: WatchingItem["weekSignal"] = null;
    if (quote.fiftyTwoWeekPercent != null) {
      if (quote.fiftyTwoWeekPercent < 0.2) weekSignal = "🟢 near low";
      else if (quote.fiftyTwoWeekPercent > 0.8) weekSignal = "🟡 near high";
      else weekSignal = "—";
    }

    watchingItems.push({
      ticker,
      tickerFullName: quote.longName ?? null,
      originalCurrency: quote.originalCurrency,
      price: quote.price,
      trailingPE: quote.trailingPE,
      peSignal,
      weekSignal,
      fiftyTwoWeekPercent: quote.fiftyTwoWeekPercent,
      dividendYield: quote.dividendYield,
      beta: quote.beta,
    });
  }

  return {
    items,
    untrackedItems,
    watchingItems,
    portfolioBeta,
    estimatedAnnualDividend,
    totalCurrentValue: Math.round(totalCurrentValue * 100) / 100,
  };
}
