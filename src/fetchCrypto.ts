// ── crypto.com Exchange v1 public market data ───────────────────────
// Supplies crypto cross-pairs — "how much of coin Y does one coin X cost" — as
// watch-only instruments, so the existing analysis stack can time a conversion
// between two coins you already hold.
//
// Why crypto.com: it is the only source checked that carries these pairs
// natively with real daily OHLCV and needs no API key. CoinMarketCap's free tier
// has no historical OHLCV at all, CoinGecko degrades to 4-day candles beyond
// 30 days, and neither Binance nor Kraken lists CRO cross-pairs.
//
// This module imports no config (and, being type-only on QuoteData, nothing that
// reads config transitively), so every transform below is unit-testable in CI
// where config.json is absent. Same split as allocation.ts/analyze.ts.

import type { AssetKind, QuoteData } from "./fetchPrices.js";
import type { Candle } from "./technicals.js";

const API_BASE = "https://api.crypto.com/exchange/v1/public";

// crypto.com caps `count` at 300 per get-candlestick request. Ask for windows
// comfortably inside that so a window is never silently truncated, and page to
// reach a full 52 weeks — 365 daily candles cannot come from one request.
const WINDOW_DAYS = 190;
const LOOKBACK_DAYS = 370; // a little over 52 weeks, so the 365-day slice is full
const MS_PER_DAY = 86_400_000;
const CANDLE_COUNT_CAP = 300;
const FIFTY_TWO_WEEK_DAYS = 365;

// Display names for the coins we know about. Purely cosmetic: an unlisted symbol
// falls back to its own ticker, which degrades the label and nothing else. Same
// optional-lookup-with-fallback shape as TICKER_NAMES in fetchNews.ts.
const CRYPTO_NAMES: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  CRO: "Cronos",
  SOL: "Solana",
  XRP: "XRP",
  ADA: "Cardano",
  DOGE: "Dogecoin",
  AVAX: "Avalanche",
  DOT: "Polkadot",
  MATIC: "Polygon",
  LINK: "Chainlink",
  LTC: "Litecoin",
  ATOM: "Cosmos",
  USDT: "Tether",
  USDC: "USD Coin",
};

export function coinName(symbol: string): string {
  return CRYPTO_NAMES[symbol] ?? symbol;
}

// ── Types ───────────────────────────────────────────────────────────

/** A pair to analyse, already parsed from config's "BASE/QUOTE" notation. */
export interface CryptoPairSpec {
  /** Internal id, `BASE_QUOTE` (underscore — a slash breaks URL query params). */
  ticker: string;
  /** The coin being bought. */
  base: string;
  /** The coin being spent; prices are denominated in this. */
  quote: string;
}

/** One row of crypto.com's get-instruments response (fields we rely on). */
export interface CryptoInstrument {
  symbol: string;
  inst_type: string;
  base_ccy: string;
  quote_ccy: string;
  tradable: boolean;
}

/** A candle carrying its open time, needed to merge and dedupe paged windows. */
export interface TimedCandle extends Candle {
  t: number;
}

export type ResolvedInstrument =
  | { ok: true; symbol: string; invert: boolean }
  | { ok: false; reason: string };

export interface CryptoFetchResult {
  quotes: QuoteData[];
  candles: Record<string, TimedCandle[]>;
  skipped: Array<{ ticker: string; reason: string }>;
}

// ── Config parsing ──────────────────────────────────────────────────
/**
 * Parse config's `"BASE/QUOTE"` notation into a pair spec.
 *
 * `BASE/QUOTE` reads as "the price of BASE denominated in QUOTE" — the thing you
 * are buying over the thing you are spending. `"BTC/CRO"` is therefore "what one
 * BTC costs in CRO", which is the number you want low before converting.
 *
 * The internal ticker uses an underscore (`BTC_CRO`). The slash is config-facing
 * only: the id ends up as a key in the price/technicals maps, in the saved
 * baseline JSON, and in an analysis-URL query param, where a `/` would need
 * escaping.
 *
 * Returns null for anything malformed so the caller can warn and skip rather
 * than taking down the run.
 */
export function parseCryptoPair(entry: string): CryptoPairSpec | null {
  if (typeof entry !== "string") return null;
  const parts = entry.trim().toUpperCase().split("/");
  if (parts.length !== 2) return null;
  const [base, quote] = parts.map((p) => p.trim());
  // Symbols are alphanumeric on every venue we care about; reject anything else
  // rather than forwarding it to the exchange as a bogus instrument name.
  if (!/^[A-Z0-9]+$/.test(base) || !/^[A-Z0-9]+$/.test(quote)) return null;
  if (base === quote) return null;
  return { ticker: `${base}_${quote}`, base, quote };
}

// ── Instrument resolution ───────────────────────────────────────────
// Exchanges list whichever side of a market they please: CRO is the base of
// CRO_BTC but the quote of ETH_CRO. Left alone that means two opposite
// polarities in one brief — you want CRO_BTC high to convert CRO into BTC, but
// ETH_CRO low to convert CRO into ETH.
//
// So the caller always asks for "BASE priced in QUOTE" and this decides how to
// get it: use BASE_QUOTE directly when it exists, otherwise take QUOTE_BASE and
// invert it. Every analysed series then means the same thing — low = the asset is
// cheap in the currency you are spending = a good moment to convert — which is
// exactly the polarity the existing buy-the-dip prompt rules already assume.
//
// Pure so it can be tested without touching the network.
export function resolveInstrument(
  base: string,
  quote: string,
  instruments: CryptoInstrument[],
): ResolvedInstrument {
  const direct = `${base}_${quote}`;
  const reverse = `${quote}_${base}`;

  // Spot only. Perpetuals (BTCUSD-PERP) are a different product with different
  // pricing and must never satisfy a spot conversion query.
  const spot = new Map(
    instruments.filter((i) => i.inst_type === "CCY_PAIR").map((i) => [i.symbol, i]),
  );

  const hit = spot.get(direct);
  if (hit?.tradable) return { ok: true, symbol: direct, invert: false };

  const rev = spot.get(reverse);
  if (rev?.tradable) return { ok: true, symbol: reverse, invert: true };

  const seen = hit ?? rev;
  const reason = seen
    ? `${seen.symbol} exists but is not tradable`
    : `no tradable spot market for ${direct} or ${reverse}`;
  return { ok: false, reason };
}

// ── Candle transforms ───────────────────────────────────────────────

/**
 * Coerce one of crypto.com's string-valued fields to a number.
 *
 * `Number()` alone is not safe here: `Number("")` and `Number(null)` are both 0,
 * so a blank high would silently become a price of zero — which corrupts ATR and
 * Stochastic, and turns into Infinity once inverted. Blank, missing and
 * non-numeric all have to mean "absent".
 */
function num(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse crypto.com's string-valued candles into numbers, sorted oldest-first.
 *
 * Rows without a usable positive close are dropped — no indicator can use them,
 * and a zero close would divide by zero on inversion. High/low must also be
 * positive to count as real prices; volume may legitimately be zero on a day
 * with no trades.
 */
export function toCandles(raw: unknown[]): TimedCandle[] {
  const out: TimedCandle[] = [];
  for (const r of raw) {
    const row = r as Record<string, unknown>;
    const t = num(row.t);
    const close = num(row.c);
    if (t == null || close == null || close <= 0) continue;
    const high = num(row.h);
    const low = num(row.l);
    const volume = num(row.v);
    out.push({
      t,
      close,
      high: high != null && high > 0 ? high : null,
      low: low != null && low > 0 ? low : null,
      volume: volume != null && volume >= 0 ? volume : null,
    });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Merge paged windows, dedupe on open time, keep ascending order. */
export function mergeCandles(...pages: TimedCandle[][]): TimedCandle[] {
  const byTime = new Map<number, TimedCandle>();
  for (const page of pages) {
    for (const c of page) byTime.set(c.t, c);
  }
  return [...byTime.values()].sort((a, b) => a.t - b.t);
}

/**
 * Flip a series to its reciprocal, converting "X priced in Y" into "Y priced
 * in X".
 *
 * Three things have to move, not just the close:
 *  - high and low **swap**, because 1/x reverses ordering: the cheapest price of
 *    X in Y is the dearest price of Y in X. Getting this wrong silently corrupts
 *    ATR, Stochastic and the Bollinger bands.
 *  - volume is rebased. crypto.com reports volume in the base coin, so after
 *    inversion it must be expressed in what is now the base: quantity × price.
 *  - non-positive or missing values become null rather than Infinity/NaN, which
 *    would poison every downstream average.
 */
export function invertCandles(candles: TimedCandle[]): TimedCandle[] {
  const inv = (v: number | null): number | null =>
    v != null && v > 0 && Number.isFinite(v) ? 1 / v : null;

  return candles
    .map((c) => ({
      t: c.t,
      close: inv(c.close),
      // Deliberate swap — see above.
      high: inv(c.low),
      low: inv(c.high),
      volume:
        c.volume != null && c.volume > 0 && c.close != null && c.close > 0
          ? c.volume * c.close
          : null,
    }))
    .filter((c): c is TimedCandle => c.close != null);
}

/**
 * Derive the 52-week range from the candle series.
 *
 * crypto.com's ticker endpoint only reports a 24-hour high/low, but "position in
 * the 52-week range" is one of only two price-level entry signals available to a
 * cross-pair (P/E being permanently absent), so it has to come from history.
 *
 * Uses 365 candles rather than the ~252 that would be right for equities: crypto
 * trades every calendar day, so 252 daily candles is roughly eight months and
 * would be a 52-week label on a window that is nothing of the sort.
 *
 * `percent` is a 0-1 fraction at 3dp, matching the convention in fetchPrices /
 * applyLatestPrice.
 */
export function deriveFiftyTwoWeek(candles: TimedCandle[]): {
  high: number | null;
  low: number | null;
  percent: number | null;
} {
  const window = candles.slice(-FIFTY_TWO_WEEK_DAYS);
  if (window.length === 0) return { high: null, low: null, percent: null };

  let high = -Infinity;
  let low = Infinity;
  for (const c of window) {
    // Fall back to the close when a candle has no high/low of its own.
    const hi = c.high ?? c.close;
    const lo = c.low ?? c.close;
    if (hi != null && hi > high) high = hi;
    if (lo != null && lo < low) low = lo;
  }
  if (!Number.isFinite(high) || !Number.isFinite(low)) {
    return { high: null, low: null, percent: null };
  }

  const last = window[window.length - 1].close;
  const percent =
    last != null && high > low ? Math.round(((last - low) / (high - low)) * 1000) / 1000 : null;

  return { high, low, percent };
}

/**
 * Assemble a QuoteData for a cross-pair.
 *
 * Only price, identity and the 52-week range can be populated — a coin pair has
 * no P/E, no fundamentals, no dividend, no beta, no earnings date and no
 * holdings. Every one of those fields is already nullable on QuoteData, which is
 * what lets a cross-pair travel the existing pipeline untouched.
 *
 * `currency` and `originalCurrency` are both the quote coin, and deliberately so:
 * these numbers are never FX-converted, and `currency` is the field every
 * renderer should format against.
 */
export function buildCryptoQuote(spec: CryptoPairSpec, candles: TimedCandle[]): QuoteData | null {
  const last = candles[candles.length - 1];
  if (!last || last.close == null || last.close <= 0) return null;

  const { high, low, percent } = deriveFiftyTwoWeek(candles);
  const label = `${coinName(spec.base)} priced in ${coinName(spec.quote)}`;

  return {
    ticker: spec.ticker,
    name: label,
    longName: label,
    currency: spec.quote,
    originalCurrency: spec.quote,
    assetKind: "crypto-cross" satisfies AssetKind,
    price: last.close,
    trailingPE: null,
    forwardPE: null,
    avgPE: null,
    fiftyTwoWeekHigh: high,
    fiftyTwoWeekLow: low,
    fiftyTwoWeekPercent: percent,
    marketCap: null,
    dividendYield: null,
    distributionYield: null,
    beta: null,
    holdings: null,
    returnOnEquity: null,
    debtToEquity: null,
    freeCashflow: null,
    operatingCashflow: null,
    profitMargins: null,
    revenueGrowth: null,
    earningsGrowth: null,
    targetMeanPrice: null,
    recommendationKey: null,
    postMarketPrice: null,
    preMarketPrice: null,
    earningsDate: null,
    daysToEarnings: null,
  };
}

// ── HTTP ────────────────────────────────────────────────────────────
async function apiGet(path: string): Promise<any> {
  const res = await fetch(`${API_BASE}/${path}`);
  if (!res.ok) {
    // 403/451 would mean the egress IP is geo-blocked; say so rather than
    // leaving a bare status to interpret.
    const geo = res.status === 403 || res.status === 451 ? " (possible geo-block)" : "";
    throw new Error(`HTTP ${res.status} ${res.statusText}${geo}`);
  }
  const json = await res.json();
  if (json?.code !== 0) {
    throw new Error(`API error code ${json?.code}`);
  }
  return json;
}

async function fetchInstruments(): Promise<CryptoInstrument[]> {
  const json = await apiGet("get-instruments");
  return (json.result?.data ?? []) as CryptoInstrument[];
}

/** Fetch `LOOKBACK_DAYS` of daily candles, paging under the 300-candle cap. */
async function fetchCandles(symbol: string): Promise<TimedCandle[]> {
  const now = Date.now();
  const oldest = now - LOOKBACK_DAYS * MS_PER_DAY;
  const pages: TimedCandle[][] = [];

  for (let end = now; end > oldest; end -= WINDOW_DAYS * MS_PER_DAY) {
    const start = Math.max(end - WINDOW_DAYS * MS_PER_DAY, oldest);
    const json = await apiGet(
      `get-candlestick?instrument_name=${encodeURIComponent(symbol)}` +
        `&timeframe=1D&count=${CANDLE_COUNT_CAP}` +
        `&start_ts=${Math.floor(start)}&end_ts=${Math.floor(end)}`,
    );
    const page = toCandles(json.result?.data ?? []);
    if (page.length >= CANDLE_COUNT_CAP) {
      console.warn(
        `  ⚠ ${symbol}: window returned the ${CANDLE_COUNT_CAP}-candle cap — history may be truncated`,
      );
    }
    pages.push(page);
  }

  return mergeCandles(...pages);
}

// ── Entry point ─────────────────────────────────────────────────────
/**
 * Fetch quotes and daily candles for every configured cross-pair.
 *
 * Resilient per pair, like fetchPrices: one bad market logs and is reported in
 * `skipped` rather than failing the run. Returns candles alongside quotes because
 * the caller feeds them straight into `computeTechnicals` — these pairs never go
 * near Yahoo or the FX layer.
 */
export async function fetchCryptoPairs(specs: CryptoPairSpec[]): Promise<CryptoFetchResult> {
  const result: CryptoFetchResult = { quotes: [], candles: {}, skipped: [] };
  if (specs.length === 0) return result;

  console.log(`Fetching ${specs.length} crypto cross-pair(s) from crypto.com...`);

  let instruments: CryptoInstrument[];
  try {
    instruments = await fetchInstruments();
  } catch (err) {
    // Without the instrument list nothing can be resolved — fail every pair
    // with the same reason rather than hammering the API per pair.
    const reason = `instrument list unavailable — ${(err as Error).message}`;
    console.error(`  ✗ ${reason}`);
    return { quotes: [], candles: {}, skipped: specs.map((s) => ({ ticker: s.ticker, reason })) };
  }

  for (const spec of specs) {
    try {
      const resolved = resolveInstrument(spec.base, spec.quote, instruments);
      if (!resolved.ok) {
        console.warn(`  ⚠ ${spec.ticker}: ${resolved.reason}`);
        result.skipped.push({ ticker: spec.ticker, reason: resolved.reason });
        continue;
      }

      const raw = await fetchCandles(resolved.symbol);
      const candles = resolved.invert ? invertCandles(raw) : raw;

      const quote = buildCryptoQuote(spec, candles);
      if (!quote) {
        const reason = `no usable candles from ${resolved.symbol}`;
        console.warn(`  ⚠ ${spec.ticker}: ${reason}`);
        result.skipped.push({ ticker: spec.ticker, reason });
        continue;
      }

      result.quotes.push(quote);
      result.candles[spec.ticker] = candles;
      console.log(
        `  ✓ ${spec.ticker}: ${quote.price.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${spec.quote}` +
          ` (${resolved.symbol}${resolved.invert ? ", inverted" : ""}, ${candles.length} candles)`,
      );
    } catch (err) {
      const reason = (err as Error).message;
      console.error(`  ✗ ${spec.ticker}: ${reason}`);
      result.skipped.push({ ticker: spec.ticker, reason });
    }
  }

  return result;
}
