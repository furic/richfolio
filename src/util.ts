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
