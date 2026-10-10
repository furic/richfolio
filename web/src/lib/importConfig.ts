import { parsePortfolioConfig, type IntradayAlertConfig } from "../../../src/configSchema.js";
import {
  isValidEquitySymbol,
  normaliseTicker,
} from "../../../supabase/functions/ticker-lookup/lookup";
import { DEFAULT_SETTINGS, validateSettings, type UserSettings } from "./settings";

export interface ImportPayload {
  profile: { default_currency: string; planned_portfolio_value: number; settings: UserSettings };
  targets: { ticker: string; target_pct: number }[];
  openings: { ticker: string; shares: number }[];
  watchlist: { symbol: string; kind: "equity" | "crypto_pair" }[];
}

export interface ImportPreview {
  payload: ImportPayload;
  /** Everything skipped, changed or ignored, in words the user can act on. */
  notes: string[];
}

const KNOWN_KEYS = new Set([
  "targetPortfolio",
  "currentHoldings",
  "totalPortfolioValue",
  "defaultCurrency",
  "watching",
  "watchingCrypto",
  "intradayAlerts",
  "cryptoAlerts",
  "social",
  "ai",
]);

// Only the keys the settings schema allows: an old config with an extra knob
// would otherwise be rejected by the database's additionalProperties: false.
function pickAlerts(a: IntradayAlertConfig): IntradayAlertConfig {
  return {
    enabled: a.enabled,
    confidenceIncreaseThreshold: a.confidenceIncreaseThreshold,
    minConfidenceToAlert: a.minConfidenceToAlert,
    actionUpgradesAlert: a.actionUpgradesAlert,
    onlyAlertForActions: a.onlyAlertForActions,
    minPriceMovePctToAlert: a.minPriceMovePctToAlert,
  };
}

/** Throws on a config the pipeline itself would reject; everything else becomes a note. */
export function buildImport(
  raw: unknown,
  currentDelivery: UserSettings["delivery"] = DEFAULT_SETTINGS.delivery,
): ImportPreview {
  const parsed = parsePortfolioConfig(raw); // same rules as src/config.ts
  const notes = [...parsed.warnings];
  const json = raw as Record<string, unknown>;

  for (const key of Object.keys(json)) {
    if (!KNOWN_KEYS.has(key)) notes.push(`Ignored unknown key "${key}".`);
  }
  if (json.social !== undefined) notes.push('Ignored "social": public posting is operator-only.');

  const targets: ImportPayload["targets"] = [];
  for (const [rawTicker, pct] of Object.entries(parsed.targetPortfolio)) {
    const ticker = normaliseTicker(rawTicker, "equity");
    if (!isValidEquitySymbol(ticker))
      notes.push(`Skipped target "${rawTicker}": not a valid ticker.`);
    else if (!(pct > 0 && pct <= 100))
      notes.push(`Skipped target ${ticker}: ${pct}% is outside 0–100.`);
    else if (targets.some((t) => t.ticker === ticker))
      notes.push(`Skipped duplicate target "${rawTicker}": ${ticker} is already listed.`);
    else targets.push({ ticker, target_pct: pct });
  }

  const openings: ImportPayload["openings"] = [];
  for (const [rawTicker, shares] of Object.entries(parsed.currentHoldings)) {
    const ticker = normaliseTicker(rawTicker, "equity");
    if (!isValidEquitySymbol(ticker))
      notes.push(`Skipped holding "${rawTicker}": not a valid ticker.`);
    else if (!(shares > 0)) notes.push(`Skipped holding ${ticker}: ${shares} shares.`);
    else openings.push({ ticker, shares });
  }

  const seen = new Set<string>();
  const watchlist: ImportPayload["watchlist"] = [];
  for (const rawTicker of parsed.watchingTickers) {
    const symbol = normaliseTicker(rawTicker, "equity");
    if (!isValidEquitySymbol(symbol))
      notes.push(`Skipped watch "${rawTicker}": not a valid ticker.`);
    else if (!seen.has(symbol)) {
      seen.add(symbol);
      watchlist.push({ symbol, kind: "equity" });
    }
  }
  for (const spec of parsed.cryptoPairSpecs) {
    const symbol = `${spec.base}/${spec.quote}`;
    if (!seen.has(symbol)) {
      seen.add(symbol);
      watchlist.push({ symbol, kind: "crypto_pair" });
    }
  }

  const settings: UserSettings = {
    intradayAlerts: pickAlerts(parsed.intradayAlerts),
    cryptoAlerts: pickAlerts(parsed.cryptoAlerts),
    ai: { strongBuyRequiresAllProviders: parsed.ai.strongBuyRequiresAllProviders ?? false },
    delivery: { ...currentDelivery }, // config.json has no delivery section
  };
  const problems = validateSettings(settings);
  if (problems.length) throw new Error(`Alert settings are invalid: ${problems.join("; ")}`);

  return {
    payload: {
      profile: {
        default_currency: parsed.defaultCurrency,
        planned_portfolio_value: parsed.totalPortfolioValue,
        settings,
      },
      targets,
      openings,
      watchlist,
    },
    notes,
  };
}
