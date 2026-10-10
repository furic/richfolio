export interface PortfolioRow {
  ticker: string;
  targetPct: number | null;
  shares: number | null;
  avgPrice: number | null;
  currency: string | null;
}

/** One row per ticker from the two underlying tables, sorted by ticker. */
export function buildRows(
  targets: { ticker: string; target_pct: number }[],
  openings: { ticker: string; shares: number; price: number | null; currency: string | null }[],
): PortfolioRow[] {
  const rows = new Map<string, PortfolioRow>();
  const row = (ticker: string) =>
    rows.get(ticker) ??
    rows
      .set(ticker, { ticker, targetPct: null, shares: null, avgPrice: null, currency: null })
      .get(ticker)!;
  for (const t of targets) row(t.ticker).targetPct = t.target_pct;
  for (const o of openings) {
    Object.assign(row(o.ticker), { shares: o.shares, avgPrice: o.price, currency: o.currency });
  }
  return [...rows.values()].sort((a, b) => a.ticker.localeCompare(b.ticker));
}

export interface RowInput {
  targetPct: string;
  shares: string;
  avgPrice: string;
}

export type RowValues = Pick<PortfolioRow, "targetPct" | "shares" | "avgPrice">;

const num = (s: string) => (s.trim() === "" ? null : Number(s));

/** Parsed values, or a plain-English message for the first problem. */
export function parseRowInput(input: RowInput): RowValues | string {
  const targetPct = num(input.targetPct);
  const shares = num(input.shares);
  const avgPrice = num(input.avgPrice);
  if (targetPct === null && shares === null) return "Enter a target %, shares held, or both.";
  // target_pct is numeric(5,2): anything that rounds to 0.00 would fail the DB check
  if (
    targetPct !== null &&
    !(Number.isFinite(targetPct) && Math.round(targetPct * 100) > 0 && targetPct <= 100)
  ) {
    return "Target % must be more than 0 and at most 100.";
  }
  if (shares !== null && !(Number.isFinite(shares) && shares > 0)) {
    return "Shares held must be more than 0.";
  }
  if (avgPrice !== null && shares === null) return "Enter shares held to record an average price.";
  if (avgPrice !== null && !(Number.isFinite(avgPrice) && avgPrice >= 0)) {
    return "Average price can't be negative.";
  }
  return { targetPct, shares, avgPrice };
}
