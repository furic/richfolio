export type TotalState = "under" | "exact" | "over";

/** Sum of target percentages, rounded to 2dp so 33.33+33.33+33.34 is exactly 100. */
export function targetTotal(targets: { target_pct: number }[]): number {
  return Math.round(targets.reduce((sum, t) => sum + t.target_pct, 0) * 100) / 100;
}

/** Over 100% is a warning, not an error: the database deliberately allows it mid-reallocation. */
export function totalState(total: number): TotalState {
  return total > 100 ? "over" : total === 100 ? "exact" : "under";
}
