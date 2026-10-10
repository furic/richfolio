// Pure ticker-lookup logic: no Deno APIs, no imports (shared by the Edge Function,
// the web app and test/tickerLookup.test.ts).

export type LookupKind = "equity" | "crypto_pair";

export interface TickerInfo {
  symbol: string;
  kind: LookupKind;
  verified: boolean;
  name: string | null;
  exchange: string | null;
  quoteCurrency: string | null;
}

export type LookupResult = { ok: true; info: TickerInfo } | { ok: false; reason: string };

export interface CryptoInstrument {
  symbol: string;
  inst_type: string;
  tradable: boolean;
}

// Mirrors tickerMap in src/config.ts: other coins would be stored, never reported.
const CRYPTO_HOLDINGS: Record<string, string> = { BTC: "BTC-USD", ETH: "ETH-USD" };

// Same patterns as the CHECK constraints in the foundation migration.
const EQUITY_RE = /^[A-Z0-9][A-Z0-9.=^-]{0,14}$/;
const PAIR_RE = /^([A-Z0-9]+)\/([A-Z0-9]+)$/;

export function normaliseTicker(raw: string, kind: LookupKind): string {
  const upper = raw.trim().toUpperCase();
  return kind === "crypto_pair"
    ? upper
        .split("/")
        .map((p) => p.trim())
        .join("/")
    : upper.replace(/\s+/g, "");
}

export function isValidEquitySymbol(symbol: string): boolean {
  return EQUITY_RE.test(symbol);
}

export function parsePair(symbol: string): { base: string; quote: string } | null {
  const m = PAIR_RE.exec(symbol);
  if (!m || m[1] === m[2]) return null;
  return { base: m[1], quote: m[2] };
}

export function toYahooSymbol(ticker: string): string {
  return CRYPTO_HOLDINGS[ticker] ?? ticker;
}

export function unverifiedInfo(symbol: string, kind: LookupKind): TickerInfo {
  return { symbol, kind, verified: false, name: null, exchange: null, quoteCurrency: null };
}

interface ChartMeta {
  instrumentType?: string;
  longName?: string;
  shortName?: string;
  fullExchangeName?: string;
  exchangeName?: string;
  currency?: string;
}

interface ChartBody {
  chart?: { result?: Array<{ meta?: ChartMeta }> | null; error?: { code?: string } | null };
}

export function classifyYahooChart(symbol: string, status: number, body: unknown): LookupResult {
  const chart = (body as ChartBody | null)?.chart;
  // 404 / "Not Found" is definitive; 401/403/429/5xx say nothing about the symbol, so save unverified.
  if (status === 404 || chart?.error?.code === "Not Found") {
    return {
      ok: false,
      reason: `Yahoo Finance has no ticker "${symbol}". Check the spelling and exchange suffix (e.g. AZN.L).`,
    };
  }
  const meta = chart?.result?.[0]?.meta;
  if (status !== 200 || !meta) return { ok: true, info: unverifiedInfo(symbol, "equity") };

  if (meta.instrumentType === "CRYPTOCURRENCY" && !(symbol in CRYPTO_HOLDINGS)) {
    return { ok: false, reason: "Only BTC and ETH are supported as crypto holdings for now." };
  }
  return {
    ok: true,
    info: {
      symbol,
      kind: "equity",
      verified: true,
      name: meta.longName ?? meta.shortName ?? null,
      exchange: meta.fullExchangeName ?? meta.exchangeName ?? null,
      quoteCurrency: meta.currency ?? null,
    },
  };
}

// Spot-only, either-direction rule as resolveInstrument() in src/fetchCrypto.ts
// (duplicated: Edge Functions deploy only supabase/functions).
export function findPairInstrument(symbol: string, instruments: CryptoInstrument[]): LookupResult {
  const pair = parsePair(symbol);
  if (!pair) return { ok: false, reason: "Use BASE/QUOTE, e.g. BTC/CRO." };
  const { base, quote } = pair;
  const spot = new Map(
    instruments.filter((i) => i.inst_type === "CCY_PAIR" && i.tradable).map((i) => [i.symbol, i]),
  );
  if (!spot.has(`${base}_${quote}`) && !spot.has(`${quote}_${base}`)) {
    return { ok: false, reason: `crypto.com has no tradable ${base}/${quote} market in either direction.` };
  }
  return {
    ok: true,
    info: {
      symbol,
      kind: "crypto_pair",
      verified: true,
      name: `${base} priced in ${quote}`,
      exchange: "crypto.com",
      quoteCurrency: quote,
    },
  };
}

export interface TickerStatusRow {
  symbol: string;
  kind: LookupKind;
  verified: boolean;
  name: string | null;
  exchange: string | null;
  quote_currency: string | null;
  checked_at: string;
}

export function statusWrite(info: TickerInfo): { row: TickerStatusRow; ignoreDuplicates: boolean } {
  return {
    row: {
      symbol: info.symbol,
      kind: info.kind,
      verified: info.verified,
      name: info.name,
      exchange: info.exchange,
      quote_currency: info.quoteCurrency,
      checked_at: new Date().toISOString(),
    },
    // An unverified result may insert a new symbol but never overwrite a row.
    ignoreDuplicates: !info.verified,
  };
}
