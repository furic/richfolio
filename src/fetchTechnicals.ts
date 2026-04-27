import YahooFinance from "yahoo-finance2";
import { toYahooTicker, fromYahooTicker } from "./config.js";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
});

// ── Types ───────────────────────────────────────────────────────────
export interface TechnicalData {
  ticker: string;
  sma50: number;
  sma200: number | null;
  rsi14: number;
  priceVsSma50: number; // % above/below 50MA
  priceVsSma200: number | null;
  goldenCross: boolean; // 50MA > 200MA
  deathCross: boolean; // 50MA < 200MA
  momentumSignal: "bullish" | "bearish" | "neutral";
  recentLow7d: number;
  recentLow30d: number;
  volumeChange7d: number | null;
  // MACD (EMA12 - EMA26, signal = EMA9 of MACD)
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null; // macd - signal (positive = bullish momentum)
  macdCrossover: "bullish" | "bearish" | null; // recent crossover direction
  // Bollinger Bands (SMA20 ± 2σ)
  bollUpper: number | null;
  bollMiddle: number | null; // SMA20
  bollLower: number | null;
  bollPercentB: number | null; // 0 = at lower band, 1 = at upper band
  bollBandwidth: number | null; // (upper-lower)/middle — volatility measure
  bollSqueeze: boolean; // bandwidth in bottom 20% of 120-day range
  // ATR (Average True Range, 14-period) — volatility measure
  atr14: number | null;
  atrPercent: number | null; // ATR as % of current price
  // Stochastic Oscillator (%K 14, %D 3)
  stochK: number | null; // 0-100, <20 oversold, >80 overbought
  stochD: number | null; // 3-period SMA of %K
  // OBV (On-Balance Volume) trend
  obvTrend: "rising" | "falling" | "flat" | null;
}

// ── Computation helpers ─────────────────────────────────────────────
function computeSMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((sum, p) => sum + p, 0) / period;
}

function computeRSI(prices: number[], period: number = 14): number | null {
  if (prices.length < period + 1) return null;

  const recent = prices.slice(-(period + 1));
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i < recent.length; i++) {
    const change = recent[i] - recent[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }

  avgGain /= period;
  avgLoss /= period;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 10) / 10;
}

function computeEMA(prices: number[], period: number): number[] {
  if (prices.length < period) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [];
  // Seed with SMA of first `period` values
  let sum = 0;
  for (let i = 0; i < period; i++) sum += prices[i];
  ema.push(sum / period);
  for (let i = period; i < prices.length; i++) {
    ema.push(prices[i] * k + ema[ema.length - 1] * (1 - k));
  }
  return ema;
}

function computeMACD(closes: number[]): {
  macd: number;
  signal: number;
  histogram: number;
  crossover: "bullish" | "bearish" | null;
} | null {
  if (closes.length < 35) return null; // need 26 + 9 minimum
  const ema12 = computeEMA(closes, 12);
  const ema26 = computeEMA(closes, 26);
  // Align: ema12 starts at index 12, ema26 at index 26 → offset = 14
  const offset = 26 - 12; // 14
  const macdLine: number[] = [];
  for (let i = 0; i < ema26.length; i++) {
    macdLine.push(ema12[i + offset] - ema26[i]);
  }
  if (macdLine.length < 9) return null;
  const signalLine = computeEMA(macdLine, 9);
  if (signalLine.length < 2) return null;

  const sigOffset = macdLine.length - signalLine.length;
  const currMACD = macdLine[macdLine.length - 1];
  const currSignal = signalLine[signalLine.length - 1];
  const prevMACD = macdLine[macdLine.length - 2];
  const prevSignal = signalLine[signalLine.length - 2];

  let crossover: "bullish" | "bearish" | null = null;
  if (prevMACD <= prevSignal && currMACD > currSignal) crossover = "bullish";
  else if (prevMACD >= prevSignal && currMACD < currSignal) crossover = "bearish";

  return {
    macd: Math.round(currMACD * 1000) / 1000,
    signal: Math.round(currSignal * 1000) / 1000,
    histogram: Math.round((currMACD - currSignal) * 1000) / 1000,
    crossover,
  };
}

function computeBollinger(closes: number[]): {
  upper: number;
  middle: number;
  lower: number;
  percentB: number;
  bandwidth: number;
  squeeze: boolean;
} | null {
  if (closes.length < 20) return null;
  const period = 20;
  const slice = closes.slice(-period);
  const middle = slice.reduce((s, p) => s + p, 0) / period;
  const variance = slice.reduce((s, p) => s + (p - middle) ** 2, 0) / period;
  const stdDev = Math.sqrt(variance);
  const upper = middle + 2 * stdDev;
  const lower = middle - 2 * stdDev;
  const currentPrice = closes[closes.length - 1];
  const bandwidth = middle > 0 ? (upper - lower) / middle : 0;
  const percentB = upper !== lower ? (currentPrice - lower) / (upper - lower) : 0.5;

  // Squeeze detection: is current bandwidth in the bottom 20% of 120-day range?
  let squeeze = false;
  const lookback = Math.min(closes.length, 120);
  if (lookback >= 40) {
    const bandwidths: number[] = [];
    for (let i = period; i <= lookback; i++) {
      const s = closes.slice(closes.length - lookback + i - period, closes.length - lookback + i);
      const m = s.reduce((sum, p) => sum + p, 0) / period;
      const v = s.reduce((sum, p) => sum + (p - m) ** 2, 0) / period;
      const sd = Math.sqrt(v);
      if (m > 0) bandwidths.push((m + 2 * sd - (m - 2 * sd)) / m);
    }
    if (bandwidths.length > 0) {
      const sorted = [...bandwidths].sort((a, b) => a - b);
      const threshold = sorted[Math.floor(sorted.length * 0.2)];
      squeeze = bandwidth <= threshold;
    }
  }

  return {
    upper: Math.round(upper * 100) / 100,
    middle: Math.round(middle * 100) / 100,
    lower: Math.round(lower * 100) / 100,
    percentB: Math.round(percentB * 100) / 100,
    bandwidth: Math.round(bandwidth * 1000) / 1000,
    squeeze,
  };
}

function computeATR(
  quotes: { high: number | null; low: number | null; close: number | null }[],
  period: number = 14,
): { atr: number; atrPercent: number } | null {
  // Filter valid OHLC data
  const valid = quotes.filter(
    (q): q is { high: number; low: number; close: number } =>
      q.high != null && q.low != null && q.close != null,
  );
  if (valid.length < period + 1) return null;

  const trs: number[] = [];
  for (let i = 1; i < valid.length; i++) {
    const tr = Math.max(
      valid[i].high - valid[i].low,
      Math.abs(valid[i].high - valid[i - 1].close),
      Math.abs(valid[i].low - valid[i - 1].close),
    );
    trs.push(tr);
  }

  // Wilder's smoothing
  let atr = trs.slice(0, period).reduce((s, t) => s + t, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }

  const currentPrice = valid[valid.length - 1].close;
  return {
    atr: Math.round(atr * 100) / 100,
    atrPercent: currentPrice > 0 ? Math.round((atr / currentPrice) * 1000) / 10 : 0,
  };
}

function computeStochastic(
  quotes: { high: number | null; low: number | null; close: number | null }[],
  kPeriod: number = 14,
  dPeriod: number = 3,
): { k: number; d: number } | null {
  const valid = quotes.filter(
    (q): q is { high: number; low: number; close: number } =>
      q.high != null && q.low != null && q.close != null,
  );
  if (valid.length < kPeriod + dPeriod - 1) return null;

  // Compute %K for last dPeriod values to get %D
  const kValues: number[] = [];
  for (let i = kPeriod - 1; i < valid.length; i++) {
    const window = valid.slice(i - kPeriod + 1, i + 1);
    const lowestLow = Math.min(...window.map((q) => q.low));
    const highestHigh = Math.max(...window.map((q) => q.high));
    const range = highestHigh - lowestLow;
    kValues.push(range > 0 ? ((valid[i].close - lowestLow) / range) * 100 : 50);
  }

  const currentK = kValues[kValues.length - 1];
  const dSlice = kValues.slice(-dPeriod);
  const currentD = dSlice.reduce((s, v) => s + v, 0) / dSlice.length;

  return {
    k: Math.round(currentK * 10) / 10,
    d: Math.round(currentD * 10) / 10,
  };
}

function computeOBVTrend(
  quotes: { close: number | null; volume: number | null }[],
  trendPeriod: number = 10,
): "rising" | "falling" | "flat" | null {
  const valid = quotes.filter(
    (q): q is { close: number; volume: number } =>
      q.close != null && q.volume != null && q.volume > 0,
  );
  if (valid.length < trendPeriod + 1) return null;

  // Compute OBV series
  const obv: number[] = [0];
  for (let i = 1; i < valid.length; i++) {
    if (valid[i].close > valid[i - 1].close) {
      obv.push(obv[obv.length - 1] + valid[i].volume);
    } else if (valid[i].close < valid[i - 1].close) {
      obv.push(obv[obv.length - 1] - valid[i].volume);
    } else {
      obv.push(obv[obv.length - 1]);
    }
  }

  // Linear regression slope of last trendPeriod OBV values
  const recent = obv.slice(-trendPeriod);
  const n = recent.length;
  const xMean = (n - 1) / 2;
  const yMean = recent.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (recent[i] - yMean);
    den += (i - xMean) ** 2;
  }
  const slope = den > 0 ? num / den : 0;

  // Normalize slope relative to average volume to determine significance
  const avgVol = valid.slice(-trendPeriod).reduce((s, q) => s + q.volume, 0) / trendPeriod;
  const normalizedSlope = avgVol > 0 ? slope / avgVol : 0;

  if (normalizedSlope > 0.1) return "rising";
  if (normalizedSlope < -0.1) return "falling";
  return "flat";
}

// ── Fetch technicals for a single ticker ────────────────────────────
async function fetchOne(ticker: string): Promise<TechnicalData | null> {
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

    const quotes = result.quotes;
    if (!quotes || quotes.length < 50) {
      console.warn(
        `  ⚠ ${ticker}: insufficient chart data (${quotes?.length ?? 0} days), skipping technicals`,
      );
      return null;
    }

    const closes = quotes.map((q) => q.close).filter((c): c is number => c != null);

    if (closes.length < 50) {
      console.warn(`  ⚠ ${ticker}: insufficient closing prices, skipping technicals`);
      return null;
    }

    const currentPrice = closes[closes.length - 1];
    const sma50 = computeSMA(closes, 50)!;
    const sma200 = computeSMA(closes, 200);
    const rsi14 = computeRSI(closes) ?? 50;

    const priceVsSma50 = ((currentPrice - sma50) / sma50) * 100;
    const priceVsSma200 = sma200 != null ? ((currentPrice - sma200) / sma200) * 100 : null;

    const goldenCross = sma200 != null && sma50 > sma200;
    const deathCross = sma200 != null && sma50 < sma200;

    // Determine momentum signal
    let momentumSignal: "bullish" | "bearish" | "neutral" = "neutral";
    if (currentPrice > sma50 && (sma200 == null || sma50 > sma200) && rsi14 > 40) {
      momentumSignal = "bullish";
    } else if (currentPrice < sma50 && sma200 != null && sma50 < sma200 && rsi14 < 60) {
      momentumSignal = "bearish";
    }

    // Recent lows for support levels
    const last7 = closes.slice(-7);
    const last30 = closes.slice(-30);
    const recentLow7d = Math.min(...last7);
    const recentLow30d = Math.min(...last30);

    // Volume change: avg 7d vs prior 30d (for bottom-fishing model)
    const volumes = quotes.map((q) => q.volume).filter((v): v is number => v != null && v > 0);

    let volumeChange7d: number | null = null;
    if (volumes.length >= 37) {
      const recentVol = volumes.slice(-7);
      const priorVol = volumes.slice(-37, -7);
      const avgRecent = recentVol.reduce((s, v) => s + v, 0) / recentVol.length;
      const avgPrior = priorVol.reduce((s, v) => s + v, 0) / priorVol.length;
      if (avgPrior > 0) {
        volumeChange7d = Math.round(((avgRecent - avgPrior) / avgPrior) * 1000) / 10;
      }
    }

    // MACD
    const macdResult = computeMACD(closes);

    // Bollinger Bands
    const bollResult = computeBollinger(closes);

    // ATR
    const atrResult = computeATR(quotes);

    // Stochastic
    const stochResult = computeStochastic(quotes);

    // OBV trend
    const obvTrend = computeOBVTrend(quotes);

    return {
      ticker,
      sma50: Math.round(sma50 * 100) / 100,
      sma200: sma200 != null ? Math.round(sma200 * 100) / 100 : null,
      rsi14,
      priceVsSma50: Math.round(priceVsSma50 * 10) / 10,
      priceVsSma200: priceVsSma200 != null ? Math.round(priceVsSma200 * 10) / 10 : null,
      goldenCross,
      deathCross,
      momentumSignal,
      recentLow7d: Math.round(recentLow7d * 100) / 100,
      recentLow30d: Math.round(recentLow30d * 100) / 100,
      volumeChange7d,
      macd: macdResult?.macd ?? null,
      macdSignal: macdResult?.signal ?? null,
      macdHistogram: macdResult?.histogram ?? null,
      macdCrossover: macdResult?.crossover ?? null,
      bollUpper: bollResult?.upper ?? null,
      bollMiddle: bollResult?.middle ?? null,
      bollLower: bollResult?.lower ?? null,
      bollPercentB: bollResult?.percentB ?? null,
      bollBandwidth: bollResult?.bandwidth ?? null,
      bollSqueeze: bollResult?.squeeze ?? false,
      atr14: atrResult?.atr ?? null,
      atrPercent: atrResult?.atrPercent ?? null,
      stochK: stochResult?.k ?? null,
      stochD: stochResult?.d ?? null,
      obvTrend,
    };
  } catch (err) {
    console.error(`  ✗ ${ticker}: chart fetch failed —`, (err as Error).message);
    return null;
  }
}

// ── Fetch technicals for all tickers ────────────────────────────────
export async function fetchTechnicals(tickers: string[]): Promise<Record<string, TechnicalData>> {
  console.log(`Fetching technicals for ${tickers.length} tickers...`);

  const results: Record<string, TechnicalData> = {};

  for (const ticker of tickers) {
    const data = await fetchOne(ticker);
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
          (data.volumeChange7d != null
            ? ` vol${data.volumeChange7d > 0 ? "+" : ""}${data.volumeChange7d}%`
            : ""),
      );
    }
  }

  console.log(`Technicals fetched for ${Object.keys(results).length}/${tickers.length} tickers\n`);
  return results;
}
