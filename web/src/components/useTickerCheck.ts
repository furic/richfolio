import { useState } from "react";
import {
  isValidEquitySymbol,
  normaliseTicker,
  parsePair,
  type LookupKind,
  type TickerInfo,
} from "../../../supabase/functions/ticker-lookup/lookup";
import { lookupTicker } from "../lib/tickers";

/** Normalise, shape-check, look up. Returns the info to save, or null with `problem` set. */
export function useTickerCheck(kind: LookupKind) {
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function check(raw: string): Promise<TickerInfo | null> {
    const symbol = normaliseTicker(raw, kind);
    const wellFormed = kind === "equity" ? isValidEquitySymbol(symbol) : parsePair(symbol) !== null;
    if (!wellFormed) {
      setProblem(
        kind === "equity" ? `"${symbol}" isn't a valid ticker.` : "Use BASE/QUOTE, e.g. BTC/CRO.",
      );
      return null;
    }
    setChecking(true);
    setProblem(null);
    try {
      const result = await lookupTicker(symbol, kind);
      if (!result.ok) {
        setProblem(result.reason);
        return null;
      }
      return result.info;
    } finally {
      setChecking(false);
    }
  }

  return { check, checking, problem };
}
