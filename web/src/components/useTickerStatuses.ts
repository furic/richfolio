import { useEffect, useState } from "react";
import { listTickerStatus, type TickerStatus } from "../db";
import { lookupTicker } from "../lib/tickers";
import type { LookupKind } from "../../../supabase/functions/ticker-lookup/lookup";

/** Badge data per symbol; symbols never looked up (e.g. imported) are checked in the background. */
export function useTickerStatuses(entries: { symbol: string; kind: LookupKind }[]) {
  const [statuses, setStatuses] = useState<Map<string, TickerStatus>>(new Map());
  const key = entries
    .map((e) => `${e.kind}:${e.symbol}`)
    .sort()
    .join(",");

  useEffect(() => {
    let cancelled = false;
    const symbols = entries.map((e) => e.symbol);
    (async () => {
      let rows = await listTickerStatus(symbols);
      const seen = new Set(rows.map((r) => r.symbol));
      const missing = entries.filter((e) => !seen.has(e.symbol));
      if (missing.length) {
        await Promise.all(missing.map((e) => lookupTicker(e.symbol, e.kind)));
        rows = await listTickerStatus(symbols);
      }
      if (!cancelled) setStatuses(new Map(rows.map((r) => [r.symbol, r])));
    })().catch((err) => console.error("ticker status load failed", err));
    return () => {
      cancelled = true;
    };
    // `key` captures the entries' content; the array itself is new every render.
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return statuses;
}
