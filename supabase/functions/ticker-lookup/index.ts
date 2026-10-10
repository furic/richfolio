import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/http.ts";
import {
  classifyYahooChart,
  findPairInstrument,
  normaliseTicker,
  parsePair,
  statusWrite,
  toYahooSymbol,
  unverifiedInfo,
  type LookupKind,
  type LookupResult,
} from "./lookup.ts";

const TIMEOUT_MS = 5000;
const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart/";
const CRYPTO_INSTRUMENTS = "https://api.crypto.com/exchange/v1/public/get-instruments";

async function lookupEquity(symbol: string): Promise<LookupResult> {
  const res = await fetch(
    `${YAHOO_CHART}${encodeURIComponent(toYahooSymbol(symbol))}?range=1d&interval=1d`,
    { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  return classifyYahooChart(symbol, res.status, await res.json().catch(() => null));
}

async function lookupPair(symbol: string): Promise<LookupResult> {
  if (!parsePair(symbol)) return findPairInstrument(symbol, []); // format error, no fetch
  const res = await fetch(CRYPTO_INSTRUMENTS, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) return { ok: true, info: unverifiedInfo(symbol, "crypto_pair") };
  const body = await res.json();
  return findPairInstrument(symbol, body?.result?.data ?? []);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { symbol: raw, kind } = (await req.json().catch(() => ({}))) as {
    symbol?: unknown;
    kind?: LookupKind;
  };
  if (typeof raw !== "string" || (kind !== "equity" && kind !== "crypto_pair")) {
    return json({ ok: false, reason: "symbol and kind are required." }, 400);
  }
  const symbol = normaliseTicker(raw, kind);

  let result: LookupResult;
  try {
    result = kind === "equity" ? await lookupEquity(symbol) : await lookupPair(symbol);
  } catch (err) {
    // Timeout or network failure: never block the user, save unverified.
    console.error(`lookup ${kind} ${symbol} failed:`, err);
    result = { ok: true, info: unverifiedInfo(symbol, kind) };
  }

  if (result.ok) {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { row, ignoreDuplicates } = statusWrite(result.info);
    const { error } = await admin
      .from("ticker_status")
      .upsert(row, { onConflict: "symbol", ignoreDuplicates });
    if (error) console.error("ticker_status upsert failed:", error);
  }
  return json(result);
});
