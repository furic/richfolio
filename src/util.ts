import type { QuoteData } from "./fetchPrices.js";

// ── Sub-unit currency fix map ────────────────────────────────────────
// Some exchanges quote prices in fractional units (e.g. LSE quotes in pence).
// Divide the raw price by `divisor` to get the real-currency amount.
export const SUB_UNIT_FIX: Record<string, { realCurrency: string; divisor: number }> = {
  GBp: { realCurrency: "GBP", divisor: 100 }, // LSE pence
  GBX: { realCurrency: "GBP", divisor: 100 }, // alias used by some data feeds
  ILA: { realCurrency: "ILS", divisor: 100 }, // TASE agorot
  ZAc: { realCurrency: "ZAR", divisor: 100 }, // JSE cents
};

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
