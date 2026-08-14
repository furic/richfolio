import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseCryptoPair } from "./fetchCrypto.js";
import type { CryptoPairSpec } from "./fetchCrypto.js";

// ── Types ───────────────────────────────────────────────────────────
const SUPPORTED_CURRENCIES = new Set([
  "USD",
  "GBP",
  "EUR",
  "AUD",
  "CAD",
  "JPY",
  "CHF",
  "HKD",
  "SGD",
  "NZD",
]);

export interface IntradayAlertConfig {
  enabled: boolean;
  confidenceIncreaseThreshold: number;
  minConfidenceToAlert: number;
  actionUpgradesAlert: boolean;
  onlyAlertForActions: string[];
  /**
   * Frozen-data guard. Intraday technical indicators come from daily chart
   * candles that only update at the US close, and every intraday run fires
   * while the US market is shut — so the indicators are identical between runs.
   * An action/confidence flip with no material price move is therefore AI
   * scoring noise, not a real signal. Suppress any alert whose ticker moved
   * less than this % (absolute) versus the morning baseline price. Set to 0 to
   * disable and alert on every change (legacy behaviour).
   */
  minPriceMovePctToAlert: number;
}

export interface PortfolioConfig {
  targetPortfolio: Record<string, number>;
  currentHoldings: Record<string, number>;
  totalPortfolioValue: number;
  defaultCurrency?: string;
  intradayAlerts?: Partial<IntradayAlertConfig>;
  /**
   * Tickers tracked but NOT in your target portfolio. They get fetched, scored,
   * and surfaced in a "Watch List" section, but are excluded from allocation
   * math, gap-based STRONG BUY criteria, and the max-2 STRONG BUY cap. Use this
   * for tickers you're researching without committing to a target weight.
   */
  watching?: string[];
  /**
   * Crypto cross-pairs to watch, as `"BASE/QUOTE"` — "the price of BASE
   * denominated in QUOTE", i.e. the thing you're buying over the thing you're
   * spending. `"BTC/CRO"` means "what one BTC costs in CRO", the number you want
   * low before converting CRO into BTC.
   *
   * Priced from crypto.com's keyless public API rather than Yahoo, which does not
   * carry these markets. Direction is resolved from the exchange's own instrument
   * metadata, so either listing direction works and adding a pair is a
   * config-only change.
   *
   * Watch-only by construction: no target weight, no allocation gap, no suggested
   * buy size.
   */
  watchingCrypto?: string[];
  /** Alert thresholds for the high-cadence `--crypto` mode. */
  cryptoAlerts?: Partial<IntradayAlertConfig>;
  /**
   * Public social posting (X / Facebook Page / LinkedIn Page). Posts are
   * generic — STRONG BUY / BUY signals only, no holdings or allocation data.
   * Each platform additionally gates on its own env credentials, so leaving
   * keys unset skips that platform regardless of this toggle.
   */
  social?: SocialConfig;
  /** AI provider behaviour. */
  ai?: AIConfig;
}

export interface AIConfig {
  /**
   * Opt in to strict unanimity for STRONG BUY. Default **false**.
   *
   * Off (default), two rules apply. A multi-provider STRONG BUY survives while
   * every dissenter is within one rung (a dissenting BUY), and caps at BUY as
   * soon as one is further out (HOLD/WAIT) — see computeConsensusAction. And on
   * a degraded run (2+ configured, not all answered) the survivor's STRONG BUY
   * stands, since a provider that never answered isn't a dissenter.
   *
   * On, both revert to the original hard cap: any dissent, or any missing
   * provider, demotes STRONG BUY to BUY.
   *
   * Either way the reader is told what happened — the per-provider breakdown, the
   * agreement badge and the `⚠ n/m AI` degradation badge all render regardless.
   * Only the capping is optional.
   *
   * Has no effect when only one provider is configured: that setup never
   * promised agreement, so it is not degraded.
   */
  strongBuyRequiresAllProviders?: boolean;
}

export interface SocialConfig {
  /** Master kill-switch. When false, no platform is posted to. Default: true. */
  enabled?: boolean;
  /**
   * Include the analysis link in X posts. Off by default because a link
   * raises X's pay-per-use cost (~$0.20 vs ~$0.015 per post).
   */
  includeLinkInX?: boolean;
  /**
   * Generic hashtags appended (with the ticker hashtags) on Facebook / Threads
   * / LinkedIn posts to boost discoverability. The leading "#" is optional.
   * Not added on X (cashtags are native there and the 280-char budget is tight).
   */
  hashtags?: string[];
}

// ── Load config.json ────────────────────────────────────────────────
const configPath = resolve(process.cwd(), "config.json");
let raw: string;
try {
  raw = readFileSync(configPath, "utf-8");
} catch {
  throw new Error(
    `Missing config.json — copy config.example.json to config.json and edit it:\n  cp config.example.json config.json`,
  );
}

const json = JSON.parse(raw) as PortfolioConfig;

export const targetPortfolio = json.targetPortfolio;
export const currentHoldings = json.currentHoldings;
// Validate `watching` is an array of strings if present. Empty/missing is fine.
const rawWatching = (json as unknown as Record<string, unknown>).watching;
if (rawWatching !== undefined && !Array.isArray(rawWatching)) {
  throw new Error('config.json: "watching" must be an array of ticker symbols.');
}
export const watchingTickers: string[] = Array.isArray(rawWatching)
  ? rawWatching.filter((t): t is string => typeof t === "string" && t.length > 0)
  : [];

// ── Crypto cross-pairs ──────────────────────────────────────────────
// Parsed from `"BASE/QUOTE"` into `{ ticker: "BASE_QUOTE", base, quote }`.
// Malformed entries are warned about and skipped rather than throwing: one typo
// should not take down a run that has other pairs to report on.
const rawWatchingCrypto = (json as unknown as Record<string, unknown>).watchingCrypto;
if (rawWatchingCrypto !== undefined && !Array.isArray(rawWatchingCrypto)) {
  throw new Error('config.json: "watchingCrypto" must be an array of "BASE/QUOTE" strings.');
}
export const cryptoPairSpecs: CryptoPairSpec[] = (
  Array.isArray(rawWatchingCrypto) ? rawWatchingCrypto : []
).flatMap((entry) => {
  const spec = parseCryptoPair(entry as string);
  if (!spec) {
    console.warn(
      `config.json: ignoring invalid "watchingCrypto" entry ${JSON.stringify(entry)} — ` +
        `expected "BASE/QUOTE", e.g. "BTC/CRO".`,
    );
    return [];
  }
  return [spec];
});
export const cryptoPairTickers: string[] = cryptoPairSpecs.map((s) => s.ticker);

// Cross-pairs belong in `watchingSet` but NOT in `watchingTickers`, and the
// distinction is load-bearing:
//   • `watchingSet` is what tags a recommendation `isWatching` in
//     aiOrchestrator, which is what makes the guard pipeline skip the allocation
//     gap check and the renderers route it to the Watch List. Without it, every
//     cross-pair STRONG BUY would be downgraded to BUY by the `gap < 2%` rule and
//     would render in the Portfolio section with a suggested dollar size.
//   • `watchingTickers` feeds `allUniqueTickers()` → `fetchPrices` → Yahoo, which
//     has no such market. Cross-pairs are priced by `fetchCrypto` instead, so
//     they must stay out of it.
export const watchingSet = new Set<string>([...watchingTickers, ...cryptoPairTickers]);
// Migration guard — old field name is no longer accepted
if ((json as unknown as Record<string, unknown>).totalPortfolioValueUSD !== undefined) {
  throw new Error(
    'config.json: "totalPortfolioValueUSD" is deprecated. ' +
      'Rename it to "totalPortfolioValue" and add "defaultCurrency" (e.g. "USD"). ' +
      "See config.example.json.",
  );
}

if (typeof json.totalPortfolioValue !== "number") {
  throw new Error('config.json: "totalPortfolioValue" must be a number.');
}

const rawCurrency = (json as unknown as Record<string, unknown>).defaultCurrency;
if (rawCurrency === undefined) {
  console.warn('config.json: "defaultCurrency" missing — defaulting to "USD".');
} else if (typeof rawCurrency !== "string") {
  throw new Error('config.json: "defaultCurrency" must be a string (e.g. "USD").');
}
const currency = typeof rawCurrency === "string" ? rawCurrency.toUpperCase() : "USD";
if (!SUPPORTED_CURRENCIES.has(currency)) {
  throw new Error(
    `config.json: "defaultCurrency": "${currency}" is not supported. ` +
      `Supported: ${Array.from(SUPPORTED_CURRENCIES).join(", ")}.`,
  );
}

export const totalPortfolioValue = json.totalPortfolioValue;
export const defaultCurrency = currency;

// ── Intraday alert config with defaults ─────────────────────────────
const DEFAULT_INTRADAY: IntradayAlertConfig = {
  enabled: true,
  confidenceIncreaseThreshold: 10,
  minConfidenceToAlert: 80,
  actionUpgradesAlert: true,
  onlyAlertForActions: ["STRONG BUY", "BUY"],
  minPriceMovePctToAlert: 1.0,
};

export const intradayConfig: IntradayAlertConfig = {
  ...DEFAULT_INTRADAY,
  ...json.intradayAlerts,
};

// ── Crypto alert config with defaults ───────────────────────────────
// Same knobs as the intraday alerts, tuned separately because the instruments
// behave differently: cross-pairs trade 24/7, so unlike the equity intraday runs
// a price move between runs is always real. The daily candles are still frozen
// between runs, though, so `minPriceMovePctToAlert` remains the guard that keeps
// a high cadence informative rather than noisy.
export const cryptoAlertConfig: IntradayAlertConfig = {
  ...DEFAULT_INTRADAY,
  ...json.cryptoAlerts,
};

// ── Social posting config with defaults ─────────────────────────────
export const socialConfig: SocialConfig = {
  enabled: true,
  includeLinkInX: false,
  hashtags: ["investing", "stocks", "stockmarket", "ETFs"],
  ...json.social,
};

// ── AI provider config with defaults ────────────────────────────────
export const aiConfig: AIConfig = {
  strongBuyRequiresAllProviders: false,
  ...json.ai,
};

// ── Environment-only settings ───────────────────────────────────────
export const recipientEmail = process.env.RECIPIENT_EMAIL || "you@example.com";

// ── Ticker mapping ──────────────────────────────────────────────────
// Yahoo Finance requires specific ticker formats for crypto
const tickerMap: Record<string, string> = {
  BTC: "BTC-USD",
  ETH: "ETH-USD",
};

/** Convert a config ticker to its Yahoo Finance symbol */
export function toYahooTicker(ticker: string): string {
  return tickerMap[ticker] || ticker;
}

/** Convert a Yahoo Finance symbol back to the config ticker */
export function fromYahooTicker(yahooTicker: string): string {
  for (const [key, value] of Object.entries(tickerMap)) {
    if (value === yahooTicker) return key;
  }
  return yahooTicker;
}

/** Get all unique tickers from target, current holdings, AND watching list. */
export function allUniqueTickers(): string[] {
  return [
    ...new Set([
      ...Object.keys(targetPortfolio),
      ...Object.keys(currentHoldings),
      ...watchingTickers,
    ]),
  ];
}
