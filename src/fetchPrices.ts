import YahooFinance from "yahoo-finance2";
import { toYahooTicker, fromYahooTicker } from "./config.js";
import { fetchFxRates } from "./fetchFx.js";
import { SUB_UNIT_FIX, applyFxRate } from "./util.js";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
  validation: { logErrors: false }, // Don't throw on schema validation errors (e.g. BIPC missing earningsHistory fields)
});

// ── Types ───────────────────────────────────────────────────────────
export interface HoldingInfo {
  symbol: string;
  holdingPercent: number;
}

export interface QuoteData {
  ticker: string;
  name: string | null;
  longName: string | null;
  currency: string; // post-conversion currency (= defaultCurrency once Task 5 lands)
  originalCurrency: string; // raw Yahoo currency (audit / logging)
  price: number;
  trailingPE: number | null;
  forwardPE: number | null;
  avgPE: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  fiftyTwoWeekPercent: number | null;
  marketCap: number | null;
  dividendYield: number | null;
  beta: number | null;
  holdings: HoldingInfo[] | null;
  // Fundamental data (from financialData module)
  returnOnEquity: number | null;
  debtToEquity: number | null;
  freeCashflow: number | null;
  operatingCashflow: number | null;
  profitMargins: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  targetMeanPrice: number | null;
  recommendationKey: string | null;
  // After-hours / pre-market prices (from Yahoo price module)
  postMarketPrice: number | null;
  preMarketPrice: number | null;
  // Earnings calendar (from calendarEvents module)
  earningsDate: Date | null;
  daysToEarnings: number | null;
}

export interface FetchResult {
  quotes: QuoteData[];
  skipped: Array<{ ticker: string; reason: string }>;
  fxRates: Record<string, number>;
}

// ── Latest price helper (prefers after-hours when available) ────────
export function getLatestPrice(quote: QuoteData): { price: number; source: string } {
  if (quote.postMarketPrice != null && quote.postMarketPrice > 0) {
    return { price: quote.postMarketPrice, source: "after-hours" };
  }
  if (quote.preMarketPrice != null && quote.preMarketPrice > 0) {
    return { price: quote.preMarketPrice, source: "pre-market" };
  }
  return { price: quote.price, source: "regular" };
}

// ── Fetch a single ticker ───────────────────────────────────────────
async function fetchOne(yahooTicker: string): Promise<QuoteData | null> {
  const configTicker = fromYahooTicker(yahooTicker);

  try {
    const result = await yahooFinance.quoteSummary(yahooTicker, {
      modules: [
        "price",
        "summaryDetail",
        "defaultKeyStatistics",
        "earningsHistory",
        "topHoldings",
        "financialData",
        "calendarEvents",
      ],
    });

    const price = result.price?.regularMarketPrice ?? null;

    if (price == null) {
      console.warn(`  ⚠ ${configTicker}: no price data, skipping`);
      return null;
    }

    const high = result.summaryDetail?.fiftyTwoWeekHigh ?? null;
    const low = result.summaryDetail?.fiftyTwoWeekLow ?? null;
    const range = high != null && low != null && high !== low ? (price - low) / (high - low) : null;

    // Compute avg P/E from earnings history (quarterly EPS)
    let avgPE: number | null = null;
    const history = result.earningsHistory?.history;
    if (history && history.length >= 2) {
      const epsValues = history
        .map((q) => q.epsActual)
        .filter((eps): eps is number => eps != null && eps > 0);
      if (epsValues.length >= 2) {
        const avgQuarterlyEPS = epsValues.reduce((sum, eps) => sum + eps, 0) / epsValues.length;
        const annualizedEPS = avgQuarterlyEPS * 4;
        if (annualizedEPS > 0) {
          avgPE = Math.round((price / annualizedEPS) * 10) / 10;
        }
      }
    }

    // Extract fundamental data (null for ETFs and crypto)
    const fin = result.financialData;

    // Extract ETF top holdings (null for individual stocks)
    const rawHoldings = result.topHoldings?.holdings;
    const holdings: HoldingInfo[] | null =
      rawHoldings && rawHoldings.length > 0
        ? rawHoldings
            .filter((h) => h.symbol && h.holdingPercent != null)
            .map((h) => ({ symbol: h.symbol, holdingPercent: h.holdingPercent }))
        : null;

    const rawCurrency = result.price?.currency ?? "USD";
    const subUnit = SUB_UNIT_FIX[rawCurrency];
    const originalCurrency = subUnit ? subUnit.realCurrency : rawCurrency;
    const priceDivisor = subUnit ? subUnit.divisor : 1;

    return {
      ticker: configTicker,
      name: result.price?.shortName ?? result.price?.longName ?? null,
      longName: result.price?.longName ?? result.price?.shortName ?? null,
      currency: originalCurrency,
      originalCurrency,
      price: price / priceDivisor,
      trailingPE: result.summaryDetail?.trailingPE ?? null,
      forwardPE: result.summaryDetail?.forwardPE ?? null,
      avgPE,
      fiftyTwoWeekHigh: high != null ? high / priceDivisor : null,
      fiftyTwoWeekLow: low != null ? low / priceDivisor : null,
      fiftyTwoWeekPercent: range != null ? Math.round(range * 1000) / 1000 : null,
      marketCap: (() => {
        const mc = result.summaryDetail?.marketCap ?? result.price?.marketCap ?? null;
        return mc != null ? mc / priceDivisor : null;
      })(),
      dividendYield: result.summaryDetail?.dividendYield ?? null,
      beta: result.defaultKeyStatistics?.beta ?? null,
      holdings,
      returnOnEquity: fin?.returnOnEquity ?? null,
      debtToEquity: fin?.debtToEquity ?? null,
      freeCashflow: fin?.freeCashflow != null ? fin.freeCashflow / priceDivisor : null,
      operatingCashflow:
        fin?.operatingCashflow != null ? fin.operatingCashflow / priceDivisor : null,
      profitMargins: fin?.profitMargins ?? null,
      revenueGrowth: fin?.revenueGrowth ?? null,
      earningsGrowth: fin?.earningsGrowth ?? null,
      targetMeanPrice: fin?.targetMeanPrice != null ? fin.targetMeanPrice / priceDivisor : null,
      recommendationKey: fin?.recommendationKey ?? null,
      postMarketPrice:
        result.price?.postMarketPrice != null ? result.price.postMarketPrice / priceDivisor : null,
      preMarketPrice:
        result.price?.preMarketPrice != null ? result.price.preMarketPrice / priceDivisor : null,
      earningsDate: (() => {
        const dates = result.calendarEvents?.earnings?.earningsDate;
        if (dates && dates.length > 0) return new Date(dates[0]);
        return null;
      })(),
      daysToEarnings: (() => {
        const dates = result.calendarEvents?.earnings?.earningsDate;
        if (dates && dates.length > 0) {
          const diff = new Date(dates[0]).getTime() - Date.now();
          return diff > 0 ? Math.ceil(diff / (1000 * 60 * 60 * 24)) : null;
        }
        return null;
      })(),
    };
  } catch (err) {
    console.error(`  ✗ ${configTicker}: fetch failed —`, (err as Error).message);
    return null;
  }
}

// ── Macro indicators ───────────────────────────────────────────────
export interface MacroIndicators {
  vix: number | null; // ^VIX — fear index
  treasury10y: number | null; // ^TNX — 10-year yield (%)
  sp500Price: number | null; // ^GSPC — S&P 500 level
  sp500YtdPct: number | null; // S&P 500 YTD return (%)
  sp50052wPct: number | null; // S&P 500 52-week position (0-1)
  oilPrice: number | null; // CL=F — WTI crude
  dxy: number | null; // DX-Y.NYB — USD index
}

const MACRO_TICKERS: Record<string, string> = {
  "^VIX": "vix",
  "^TNX": "treasury10y",
  "^GSPC": "sp500",
  "CL=F": "oil",
  "DX-Y.NYB": "dxy",
};

export async function fetchMacroIndicators(): Promise<MacroIndicators> {
  console.log("Fetching macro indicators...");
  const indicators: MacroIndicators = {
    vix: null,
    treasury10y: null,
    sp500Price: null,
    sp500YtdPct: null,
    sp50052wPct: null,
    oilPrice: null,
    dxy: null,
  };

  for (const [ticker, key] of Object.entries(MACRO_TICKERS)) {
    try {
      const result = await yahooFinance.quoteSummary(ticker, {
        modules: ["price", "summaryDetail"],
      });
      const price = result.price?.regularMarketPrice ?? null;
      if (price == null) continue;

      switch (key) {
        case "vix":
          indicators.vix = Math.round(price * 100) / 100;
          console.log(`  ✓ VIX: ${indicators.vix}`);
          break;
        case "treasury10y":
          indicators.treasury10y = Math.round(price * 100) / 100;
          console.log(`  ✓ 10Y yield: ${indicators.treasury10y}%`);
          break;
        case "sp500": {
          indicators.sp500Price = Math.round(price * 100) / 100;
          const high = result.summaryDetail?.fiftyTwoWeekHigh ?? null;
          const low = result.summaryDetail?.fiftyTwoWeekLow ?? null;
          if (high != null && low != null && high !== low) {
            indicators.sp50052wPct = Math.round(((price - low) / (high - low)) * 1000) / 1000;
          }
          // YTD approximation: use 52-week data (not exact but useful context)
          if (high != null) {
            indicators.sp500YtdPct = Math.round(((price - high) / high) * 1000) / 10;
          }
          console.log(
            `  ✓ S&P 500: ${indicators.sp500Price}${indicators.sp50052wPct != null ? ` (52w: ${Math.round(indicators.sp50052wPct * 100)}%)` : ""}`,
          );
          break;
        }
        case "oil":
          indicators.oilPrice = Math.round(price * 100) / 100;
          console.log(`  ✓ Oil (WTI): $${indicators.oilPrice}`);
          break;
        case "dxy":
          indicators.dxy = Math.round(price * 100) / 100;
          console.log(`  ✓ USD (DXY): ${indicators.dxy}`);
          break;
      }
    } catch (err) {
      console.warn(`  ⚠ ${ticker}: macro fetch failed — ${(err as Error).message}`);
    }
  }

  console.log("Macro indicators fetched\n");
  return indicators;
}

export function formatMacroContext(m: MacroIndicators): string {
  const lines: string[] = ["MACRO ENVIRONMENT:"];

  if (m.vix != null) {
    const level =
      m.vix >= 30
        ? "high fear"
        : m.vix >= 20
          ? "elevated"
          : m.vix >= 15
            ? "moderate"
            : "low/complacent";
    lines.push(`- VIX: ${m.vix} (${level} — >30 = crisis-level fear, <15 = complacent)`);
  }
  if (m.treasury10y != null) {
    const level =
      m.treasury10y >= 5
        ? "very high — significant headwind for equities"
        : m.treasury10y >= 4
          ? "elevated — pressures equity valuations"
          : m.treasury10y >= 3
            ? "moderate"
            : "low — supportive for equities";
    lines.push(`- 10-Year Treasury yield: ${m.treasury10y}% (${level})`);
  }
  if (m.sp500Price != null) {
    let sp500Line = `- S&P 500: ${m.sp500Price.toLocaleString()}`;
    if (m.sp500YtdPct != null)
      sp500Line += ` (${m.sp500YtdPct > 0 ? "+" : ""}${m.sp500YtdPct}% from 52w high)`;
    if (m.sp50052wPct != null) {
      const pct = Math.round(m.sp50052wPct * 100);
      sp500Line += ` | 52w position: ${pct}%`;
    }
    lines.push(sp500Line);
  }
  if (m.oilPrice != null) {
    const level =
      m.oilPrice >= 100
        ? "very high — inflation risk"
        : m.oilPrice >= 80
          ? "elevated"
          : m.oilPrice >= 60
            ? "moderate"
            : "low — deflationary signal";
    lines.push(`- Oil (WTI): $${m.oilPrice} (${level})`);
  }
  if (m.dxy != null) {
    const level =
      m.dxy >= 108
        ? "very strong — headwind for multinationals"
        : m.dxy >= 103
          ? "strong"
          : m.dxy >= 97
            ? "neutral"
            : "weak — tailwind for multinationals";
    lines.push(`- USD Index (DXY): ${m.dxy} (${level})`);
  }

  if (lines.length === 1) return ""; // No data fetched
  lines.push("");
  lines.push(
    "Use this macro context to inform risk assessment and confidence levels. Elevated VIX + high yields + strong USD = defensive posture. Low VIX + low yields = risk-on environment.",
  );
  return lines.join("\n");
}

// ── Fetch all tickers ───────────────────────────────────────────────
export async function fetchPrices(
  tickers: string[],
  defaultCurrency: string,
): Promise<FetchResult> {
  console.log(`Fetching prices for ${tickers.length} tickers...`);

  // Pass 1: fetch raw quotes (post-sub-unit-fix, pre-FX)
  const rawQuotes: QuoteData[] = [];
  for (const ticker of tickers) {
    const yahooTicker = toYahooTicker(ticker);
    const data = await fetchOne(yahooTicker);
    if (data) {
      rawQuotes.push(data);
      console.log(
        `  ✓ ${data.ticker}: ${data.price.toFixed(2)} ${data.originalCurrency}` +
          (data.trailingPE != null ? ` P/E=${data.trailingPE.toFixed(1)}` : "") +
          (data.avgPE != null ? ` avgPE=${data.avgPE.toFixed(1)}` : "") +
          (data.fiftyTwoWeekPercent != null
            ? ` 52w=${(data.fiftyTwoWeekPercent * 100).toFixed(0)}%`
            : "") +
          (data.dividendYield != null ? ` div=${(data.dividendYield * 100).toFixed(2)}%` : "") +
          (data.beta != null ? ` β=${data.beta.toFixed(2)}` : "") +
          (data.returnOnEquity != null ? ` ROE=${(data.returnOnEquity * 100).toFixed(0)}%` : "") +
          (data.holdings != null ? ` [${data.holdings.length} holdings]` : ""),
      );
    }
  }

  // Pass 2: collect unique source currencies, fetch FX rates in one batch
  const uniqueCurrencies = Array.from(new Set(rawQuotes.map((q) => q.originalCurrency)));
  console.log(`Fetching FX rates: ${uniqueCurrencies.join(", ")} → ${defaultCurrency}`);
  const fxRates = await fetchFxRates(uniqueCurrencies, defaultCurrency);

  // Pass 3: apply FX conversion, build skip list
  const quotes: QuoteData[] = [];
  const skipped: Array<{ ticker: string; reason: string }> = [];

  for (const q of rawQuotes) {
    const rate = fxRates[q.originalCurrency];
    if (rate === undefined) {
      console.warn(`  ⚠ ${q.ticker}: skipping — no FX rate for ${q.originalCurrency}`);
      skipped.push({
        ticker: q.ticker,
        reason: `no FX rate ${q.originalCurrency}→${defaultCurrency}`,
      });
      continue;
    }
    quotes.push(applyFxRate(q, rate, defaultCurrency));
  }

  console.log(`Fetched ${quotes.length}/${tickers.length} tickers (${skipped.length} skipped)\n`);
  return { quotes, skipped, fxRates };
}
