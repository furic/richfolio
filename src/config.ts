import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parsePortfolioConfig } from "./configSchema.js";

export type {
  AIConfig,
  IntradayAlertConfig,
  PortfolioConfig,
  SocialConfig,
} from "./configSchema.js";

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

// Validation and defaults live in the pure configSchema.ts so the web app's
// config.json importer enforces exactly the same rules. This file only does I/O.
const parsed = parsePortfolioConfig(JSON.parse(raw));
for (const warning of parsed.warnings) console.warn(warning);

export const targetPortfolio = parsed.targetPortfolio;
export const currentHoldings = parsed.currentHoldings;
export const watchingTickers: string[] = parsed.watchingTickers;
export const cryptoPairSpecs = parsed.cryptoPairSpecs;
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
export const totalPortfolioValue = parsed.totalPortfolioValue;
export const defaultCurrency = parsed.defaultCurrency;
export const intradayConfig = parsed.intradayAlerts;
export const cryptoAlertConfig = parsed.cryptoAlerts;
export const socialConfig = parsed.social;
export const aiConfig = parsed.ai;

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
