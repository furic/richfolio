import type { QuoteData } from "./fetchPrices.js";
import type { AllocationReport } from "./analyze.js";

// ── Recommendation price map ─────────────────────────────────────────
// Ticker → price for every ticker that can carry a recommendation: target
// portfolio holdings AND watch-list tickers.
//
// Watch-list tickers are deliberately absent from `report.items` (they have no
// allocation), but they DO receive AI recommendations and DO raise intraday
// alerts. Building the price map from `items` alone therefore left the
// frozen-data guard in `intradayCompare.ts` with no prices for them — and that
// guard fails open on a missing price, so every AI scoring flip on a watch
// ticker alerted. That is exactly the whipsaw the guard exists to suppress:
// observed on GOOG on 2026-08-04, weakened → strengthened → weakened inside
// 6½ hours, two of those runs with the US market shut (candles frozen).
//
// Both the daily baseline and the intraday comparison must use this, or the two
// maps disagree and the guard silently stops applying to part of the universe.
// Lives here rather than analyze.ts so it stays unit-testable: analyze.ts reads
// config.json at module load, and CI runs without one.
export function buildPriceMap(report: AllocationReport): Record<string, number> {
  const map: Record<string, number> = {};
  for (const item of report.items) map[item.ticker] = item.price;
  for (const item of report.watchingItems) map[item.ticker] = item.price;
  return map;
}

// ── Sub-unit currency fix map ────────────────────────────────────────
// Some exchanges quote prices in fractional units (e.g. LSE quotes in pence).
// Divide the raw price by `divisor` to get the real-currency amount.
export const SUB_UNIT_FIX: Record<string, { realCurrency: string; divisor: number }> = {
  GBp: { realCurrency: "GBP", divisor: 100 }, // LSE pence
  GBX: { realCurrency: "GBP", divisor: 100 }, // alias used by some data feeds
  ILA: { realCurrency: "ILS", divisor: 100 }, // TASE agorot
  ZAc: { realCurrency: "ZAR", divisor: 100 }, // JSE cents
};

// ── Latest price selection + price-derived rescale ───────────────────
// Prefer the freshest available quote: after-hours → pre-market → regular.
export function getLatestPrice(quote: QuoteData): { price: number; source: string } {
  if (quote.postMarketPrice != null && quote.postMarketPrice > 0) {
    return { price: quote.postMarketPrice, source: "after-hours" };
  }
  if (quote.preMarketPrice != null && quote.preMarketPrice > 0) {
    return { price: quote.preMarketPrice, source: "pre-market" };
  }
  return { price: quote.price, source: "regular" };
}

// Swap the quote's price to the latest available (after-hours/pre-market)
// value and rescale the price-derived fields so they stay consistent with it:
//   • trailing/forward P/E scale by latest/regularClose (P/E = price / EPS,
//     and EPS is fixed between earnings)
//   • 52-week position is recomputed from the fresh price within the 52w range
// Momentum technicals (RSI, MACD, MA-distance, Bollinger) are intentionally
// NOT adjusted — they come from daily chart candles in fetchTechnicals and
// cannot be derived from a single spot price. No-op when only the regular
// price is available. Returns the source and the original regular close (both
// for logging). Matters most on large after-hours gaps (e.g. earnings) where
// Yahoo's close-based P/E would otherwise lag the price we actually use.
export function applyLatestPrice(quote: QuoteData): { source: string; regularPrice: number } {
  const regularPrice = quote.price;
  const latest = getLatestPrice(quote);
  if (latest.source === "regular" || regularPrice <= 0) {
    return { source: "regular", regularPrice };
  }
  const ratio = latest.price / regularPrice;
  if (quote.trailingPE != null) quote.trailingPE *= ratio;
  if (quote.forwardPE != null) quote.forwardPE *= ratio;
  if (
    quote.fiftyTwoWeekHigh != null &&
    quote.fiftyTwoWeekLow != null &&
    quote.fiftyTwoWeekHigh > quote.fiftyTwoWeekLow
  ) {
    quote.fiftyTwoWeekPercent =
      Math.round(
        ((latest.price - quote.fiftyTwoWeekLow) /
          (quote.fiftyTwoWeekHigh - quote.fiftyTwoWeekLow)) *
          1000,
      ) / 1000;
  }
  quote.price = latest.price;
  return { source: latest.source, regularPrice };
}

// Pick the price to measure trend-position metrics against (distance from the
// 50/200-day moving averages, and the momentum trend label). Prefer the fresh
// spot price (`quote.price`, which by this point holds the after-hours /
// pre-market value) so MA-distance stays consistent with the price used for
// allocation and P/E — instead of the chart's last daily close. Falls back to
// the close when the spot price is missing, or when its ratio to the close is
// outside ±50%: that band flags a units mismatch (sub-unit currencies such as
// LSE pence are quoted ÷100 in `quote.price` but not in the raw chart closes)
// or an erroneous thin after-hours print, neither of which is a real move.
export function resolveTrendPrice(closeLast: number, spotPrice?: number | null): number {
  if (spotPrice != null && spotPrice > 0 && closeLast > 0) {
    const ratio = spotPrice / closeLast;
    if (ratio >= 0.5 && ratio <= 2) return spotPrice;
  }
  return closeLast;
}

// ── FX conversion ────────────────────────────────────────────────────
// Multiply the 9 monetary fields of a QuoteData by `rate`. Non-monetary
// fields (P/E ratios, yield, beta, etc.) are left untouched.
// When rate === 1 only the currency label is updated — no numeric work.
export function applyFxRate(q: QuoteData, rate: number, defaultCurrency: string): QuoteData {
  if (rate === 1) {
    return { ...q, currency: defaultCurrency };
  }
  return {
    ...q,
    currency: defaultCurrency,
    price: q.price * rate,
    fiftyTwoWeekHigh: q.fiftyTwoWeekHigh != null ? q.fiftyTwoWeekHigh * rate : null,
    fiftyTwoWeekLow: q.fiftyTwoWeekLow != null ? q.fiftyTwoWeekLow * rate : null,
    marketCap: q.marketCap != null ? q.marketCap * rate : null,
    freeCashflow: q.freeCashflow != null ? q.freeCashflow * rate : null,
    operatingCashflow: q.operatingCashflow != null ? q.operatingCashflow * rate : null,
    targetMeanPrice: q.targetMeanPrice != null ? q.targetMeanPrice * rate : null,
    postMarketPrice: q.postMarketPrice != null ? q.postMarketPrice * rate : null,
    preMarketPrice: q.preMarketPrice != null ? q.preMarketPrice * rate : null,
  };
}

// Escape an arbitrary string so it is safe to embed inside an HTML attribute
// value (e.g. `title="..."`). Covers the five characters that have special
// meaning in HTML attributes.
export function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Escape for HTML text content. Telegram's HTML mode only requires the first
// three replacements; quotes pass through fine in text nodes.
export function escapeHtmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const CURRENCY_FORMAT: Record<string, { prefix: string; decimals: number }> = {
  USD: { prefix: "$", decimals: 0 },
  GBP: { prefix: "£", decimals: 0 },
  EUR: { prefix: "€", decimals: 0 },
  JPY: { prefix: "¥", decimals: 0 },
  AUD: { prefix: "A$", decimals: 0 },
  CAD: { prefix: "CA$", decimals: 0 },
  NZD: { prefix: "NZ$", decimals: 0 },
  CHF: { prefix: "CHF ", decimals: 0 },
  HKD: { prefix: "HK$", decimals: 0 },
  SGD: { prefix: "S$", decimals: 0 },
};

export function formatMoney(amount: number, currency: string): string {
  const fmt = CURRENCY_FORMAT[currency];
  if (!fmt) {
    const negative = amount < 0;
    const rounded = Math.round(Math.abs(amount)).toLocaleString("en-US");
    return `${negative ? "-" : ""}${rounded} ${currency}`;
  }
  const negative = amount < 0;
  const rounded = Math.round(Math.abs(amount)).toLocaleString("en-US", {
    minimumFractionDigits: fmt.decimals,
    maximumFractionDigits: fmt.decimals,
  });
  return `${negative ? "-" : ""}${fmt.prefix}${rounded}`;
}
