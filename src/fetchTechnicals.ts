import YahooFinance from "yahoo-finance2";
import { toYahooTicker } from "./config.js";
import type { QuoteData } from "./fetchPrices.js";
import { computeTechnicals } from "./technicals.js";
import type { Candle, TechnicalData } from "./technicals.js";

// The indicator maths lives in `./technicals.js` — pure, source-independent and
// unit-tested. This module is only the Yahoo transport: fetch daily candles,
// normalise them into `Candle[]` in a single currency, delegate.
export type { Candle, TechnicalData } from "./technicals.js";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
});

// ── Fetch technicals for a single ticker ────────────────────────────
async function fetchOne(
  ticker: string,
  fxRate: number = 1,
  spotPrice?: number,
): Promise<TechnicalData | null> {
  const yahooTicker = toYahooTicker(ticker);

  try {
    const now = new Date();
    const period1 = new Date(now);
    period1.setDate(period1.getDate() - 365); // ~250 trading days

    const result = await yahooFinance.chart(yahooTicker, {
      period1,
      period2: now,
      interval: "1d",
    });

    // Scale into the report currency here, so `computeTechnicals` only ever
    // sees a series that is already in one unit.
    const candles: Candle[] | undefined = result.quotes?.map((q) => ({
      high: q.high != null ? q.high * fxRate : null,
      low: q.low != null ? q.low * fxRate : null,
      close: q.close != null ? q.close * fxRate : null,
      volume: q.volume ?? null,
    }));

    return computeTechnicals(ticker, candles, spotPrice);
  } catch (err) {
    console.error(`  ✗ ${ticker}: chart fetch failed —`, (err as Error).message);
    return null;
  }
}

// ── Fetch technicals for all tickers ────────────────────────────────
export async function fetchTechnicals(
  tickers: string[],
  priceData: Record<string, QuoteData> = {},
  fxRates: Record<string, number> = {},
): Promise<Record<string, TechnicalData>> {
  console.log(`Fetching technicals for ${tickers.length} tickers...`);

  const results: Record<string, TechnicalData> = {};

  for (const ticker of tickers) {
    const original = priceData[ticker]?.originalCurrency ?? "";
    const rate = original && fxRates[original] ? fxRates[original] : 1;
    // priceData[ticker].price already holds the after-hours/pre-market price
    // (applyLatestPrice runs before fetchTechnicals in every mode that calls it).
    const data = await fetchOne(ticker, rate, priceData[ticker]?.price);
    if (data) {
      results[ticker] = data;
      console.log(
        `  ✓ ${ticker}: 50MA=$${data.sma50}` +
          (data.sma200 != null ? ` 200MA=$${data.sma200}` : "") +
          ` RSI=${data.rsi14}` +
          ` ${data.momentumSignal}` +
          (data.goldenCross ? " ✨golden" : "") +
          (data.deathCross ? " ☠️death" : "") +
          (data.macdCrossover ? ` MACD:${data.macdCrossover}` : "") +
          (data.macdHistogram != null
            ? ` hist${data.macdHistogram > 0 ? "+" : ""}${data.macdHistogram}`
            : "") +
          (data.bollPercentB != null ? ` %B=${data.bollPercentB}` : "") +
          (data.bollSqueeze ? " 🔸squeeze" : "") +
          (data.atrPercent != null ? ` ATR${data.atrPercent}%` : "") +
          (data.stochK != null ? ` Stoch${data.stochK}` : "") +
          (data.obvTrend != null ? ` OBV:${data.obvTrend}` : "") +
          (data.pricePercentile90d != null ? ` p90d=${data.pricePercentile90d}%` : "") +
          (data.volumeChange7d != null
            ? ` vol${data.volumeChange7d > 0 ? "+" : ""}${data.volumeChange7d}%`
            : "") +
          (data.volumeLatest1d != null ? ` vol1d=${data.volumeLatest1d}x` : "") +
          (data.priceChange1d != null
            ? ` Δ1d${data.priceChange1d > 0 ? "+" : ""}${data.priceChange1d}%`
            : ""),
      );
    }
  }

  console.log(`Technicals fetched for ${Object.keys(results).length}/${tickers.length} tickers\n`);
  return results;
}
