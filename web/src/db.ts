import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Database, Json } from "../../supabase/types";
import type { ImportPayload } from "./lib/importConfig";
import type { RowValues } from "./lib/portfolioRows";

type Tables = Database["public"]["Tables"];
export type Profile = Tables["profiles"]["Row"];
export type ProfilePatch = Pick<
  Tables["profiles"]["Update"],
  "display_name" | "default_currency" | "time_zone" | "planned_portfolio_value" | "settings"
>;

export class DbError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

export function unwrap<T>(res: { data: T; error: PostgrestError | null }): T {
  if (res.error) {
    console.error("Supabase error", res.error.code, res.error.message);
    throw new DbError(res.error.message, res.error.code);
  }
  return res.data;
}

/** Typed settings objects are interfaces, which TS won't widen to Json on its own. */
export function toJson(value: object): NonNullable<Json> {
  return value as unknown as NonNullable<Json>;
}

export async function getProfile(id: string): Promise<Profile | null> {
  return unwrap(await supabase.from("profiles").select("*").eq("id", id).maybeSingle());
}

export async function updateProfile(id: string, patch: ProfilePatch): Promise<void> {
  unwrap(await supabase.from("profiles").update(patch).eq("id", id));
}

export type Target = Tables["targets"]["Row"];
export type Transaction = Tables["transactions"]["Row"];
export type TickerStatus = Tables["ticker_status"]["Row"];

export async function listTargets(): Promise<Target[]> {
  return unwrap(await supabase.from("targets").select("*").order("ticker")) ?? [];
}

export async function listOpenings(): Promise<Transaction[]> {
  const res = await supabase.from("transactions").select("*").eq("type", "opening").order("ticker");
  return unwrap(res) ?? [];
}

export async function savePortfolioRow(
  ticker: string,
  values: RowValues & { currency: string | null },
): Promise<void> {
  // The SQL function handles null args explicitly; the generated types just don't say so.
  const n = (v: number | null) => v as unknown as number;
  unwrap(
    await supabase.rpc("save_portfolio_row", {
      p_ticker: ticker,
      p_target_pct: n(values.targetPct),
      p_shares: n(values.shares),
      p_avg_price: n(values.avgPrice),
      p_currency: values.currency as unknown as string,
    }),
  );
}

export async function listTickerStatus(symbols: string[]): Promise<TickerStatus[]> {
  if (symbols.length === 0) return [];
  return unwrap(await supabase.from("ticker_status").select("*").in("symbol", symbols)) ?? [];
}

export type WatchItem = Tables["watchlist"]["Row"];

export async function listWatchlist(): Promise<WatchItem[]> {
  return unwrap(await supabase.from("watchlist").select("*").order("symbol")) ?? [];
}

/** Adding a symbol that is already watched is a no-op. */
export async function addWatch(
  userId: string,
  symbol: string,
  kind: WatchItem["kind"],
): Promise<void> {
  const row = { user_id: userId, symbol, kind };
  const opts = { onConflict: "user_id,symbol", ignoreDuplicates: true };
  unwrap(await supabase.from("watchlist").upsert(row, opts));
}

export async function deleteWatch(userId: string, symbol: string): Promise<void> {
  unwrap(await supabase.from("watchlist").delete().eq("user_id", userId).eq("symbol", symbol));
}

export async function importPortfolio(payload: ImportPayload): Promise<void> {
  unwrap(await supabase.rpc("import_portfolio", { payload: toJson(payload) }));
}
