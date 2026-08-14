import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  computeSMA,
  computeRSI,
  computeEMA,
  computeMACD,
  computeBollinger,
  computeATR,
  computeStochastic,
  computeOBVTrend,
  computeTechnicals,
} from "../src/technicals.js";
import type { Candle } from "../src/technicals.js";

// ── Helpers ──────────────────────────────────────────────────────────
// Build a candle series from a close series. High/low bracket the close by
// `spread` so ATR/Stochastic have something to chew on; volume is constant
// unless overridden.
function makeCandles(
  closes: number[],
  opts: { spread?: number; volume?: number | null } = {},
): Candle[] {
  const { spread = 1, volume = 1000 } = opts;
  return closes.map((c) => ({
    high: c + spread,
    low: c - spread,
    close: c,
    volume,
  }));
}

function ramp(from: number, to: number, n: number): number[] {
  const step = (to - from) / (n - 1);
  return Array.from({ length: n }, (_, i) => from + step * i);
}

// ── computeSMA ───────────────────────────────────────────────────────
describe("computeSMA", () => {
  test("averages the trailing window", () => {
    // mean of 6,7,8,9,10
    assert.equal(computeSMA([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5), 8);
  });

  test("returns null when there is less data than the period", () => {
    assert.equal(computeSMA([1, 2, 3], 5), null);
  });

  test("uses exactly `period` values, not the whole series", () => {
    assert.equal(computeSMA([1000, 1, 1, 1], 3), 1);
  });
});

// ── computeRSI ───────────────────────────────────────────────────────
describe("computeRSI", () => {
  test("returns 100 when there are no losses at all", () => {
    assert.equal(computeRSI(ramp(100, 130, 15)), 100);
  });

  test("returns 50 when gains and losses are balanced", () => {
    // 15 points alternating +1/-1 → 7 gains of 1, 7 losses of 1 → RS = 1
    const prices = Array.from({ length: 15 }, (_, i) => (i % 2 === 0 ? 100 : 101));
    assert.equal(computeRSI(prices), 50);
  });

  test("returns null below period + 1 data points", () => {
    assert.equal(computeRSI(ramp(1, 10, 14)), null);
    assert.notEqual(computeRSI(ramp(1, 10, 15)), null);
  });

  test("is oversold on a sustained decline", () => {
    const rsi = computeRSI(ramp(130, 100, 15));
    assert.equal(rsi, 0);
  });
});

// ── computeEMA ───────────────────────────────────────────────────────
describe("computeEMA", () => {
  test("returns empty when shorter than the period", () => {
    assert.deepEqual(computeEMA([1, 2, 3], 5), []);
  });

  test("seeds with the SMA of the first `period` values", () => {
    const ema = computeEMA([2, 4, 6, 8], 4);
    assert.equal(ema.length, 1);
    assert.equal(ema[0], 5); // (2+4+6+8)/4
  });

  test("emits one value per input beyond the seed window", () => {
    assert.equal(computeEMA(ramp(1, 20, 20), 5).length, 16); // 1 seed + 15
  });

  test("tracks a constant series exactly", () => {
    const ema = computeEMA(new Array(10).fill(7), 3);
    assert.ok(ema.every((v) => Math.abs(v - 7) < 1e-9));
  });
});

// ── computeMACD ──────────────────────────────────────────────────────
describe("computeMACD", () => {
  test("returns null below 35 closes", () => {
    assert.equal(computeMACD(ramp(100, 140, 34)), null);
    assert.notEqual(computeMACD(ramp(100, 140, 35)), null);
  });

  test("histogram equals macd minus signal", () => {
    const r = computeMACD(ramp(100, 200, 60))!;
    assert.ok(Math.abs(r.histogram - (r.macd - r.signal)) < 0.002);
  });

  test("is positive in an uptrend and negative in a downtrend", () => {
    assert.ok(computeMACD(ramp(100, 200, 60))!.macd > 0);
    assert.ok(computeMACD(ramp(200, 100, 60))!.macd < 0);
  });

  test("converges to its signal line on a perfectly linear trend", () => {
    // Worth pinning: on a straight-line series MACD settles to a constant, and
    // EMA9 of a constant is that same constant — so macd === signal and the
    // histogram is 0. It means a linear ramp is useless for testing crossovers
    // (fp noise alone can flip the comparison), which is why the crossover
    // tests below build from a flat baseline instead.
    const r = computeMACD(ramp(100, 200, 60))!;
    assert.equal(Math.abs(r.histogram), 0); // may be -0, which strict-equals only itself
    assert.equal(r.macd, r.signal);
  });

  test("leads its signal line when the trend accelerates", () => {
    const accelerating = Array.from({ length: 60 }, (_, i) => 100 + i * i * 0.05);
    const r = computeMACD(accelerating)!;
    assert.ok(r.macd > r.signal, `expected macd ${r.macd} > signal ${r.signal}`);
    assert.ok(r.histogram > 0);
  });

  test("lags its signal line when the trend decelerates", () => {
    const decelerating = Array.from({ length: 60 }, (_, i) => 100 - i * i * 0.05);
    const r = computeMACD(decelerating)!;
    assert.ok(r.macd < r.signal);
    assert.ok(r.histogram < 0);
  });

  test("detects a bullish crossover when momentum turns up from flat", () => {
    // Flat baseline puts both macd and signal at exactly 0; a single up bar
    // lifts macd faster than its own EMA, which is the crossover.
    const r = computeMACD([...new Array(50).fill(100), 115])!;
    assert.equal(r.crossover, "bullish");
    assert.ok(r.macd > r.signal);
  });

  test("detects a bearish crossover when momentum turns down from flat", () => {
    const r = computeMACD([...new Array(50).fill(100), 85])!;
    assert.equal(r.crossover, "bearish");
    assert.ok(r.macd < r.signal);
  });

  test("is flat on a constant series", () => {
    const r = computeMACD(new Array(60).fill(50))!;
    assert.equal(r.macd, 0);
    assert.equal(r.signal, 0);
    assert.equal(r.histogram, 0);
  });
});

// ── computeBollinger ─────────────────────────────────────────────────
describe("computeBollinger", () => {
  test("returns null below 20 closes", () => {
    assert.equal(computeBollinger(ramp(1, 20, 19)), null);
    assert.notEqual(computeBollinger(ramp(1, 20, 20)), null);
  });

  test("collapses to the mean with zero variance, and %B defaults to 0.5", () => {
    const r = computeBollinger(new Array(20).fill(42))!;
    assert.equal(r.middle, 42);
    assert.equal(r.upper, 42);
    assert.equal(r.lower, 42);
    assert.equal(r.bandwidth, 0);
    assert.equal(r.percentB, 0.5); // upper === lower → guarded midpoint
  });

  test("brackets the mean symmetrically at ±2σ", () => {
    const r = computeBollinger([...new Array(19).fill(10), 20])!;
    assert.ok(r.upper > r.middle);
    assert.ok(r.lower < r.middle);
    assert.ok(Math.abs(r.upper - r.middle - (r.middle - r.lower)) < 0.02);
  });

  test("%B is near 1 at the top of the band, near 0 at the bottom", () => {
    const up = computeBollinger([...ramp(100, 118, 19), 130])!;
    assert.ok(up.percentB > 0.9, `expected high %B, got ${up.percentB}`);
    const down = computeBollinger([...ramp(130, 112, 19), 100])!;
    assert.ok(down.percentB < 0.1, `expected low %B, got ${down.percentB}`);
  });

  test("flags a squeeze when recent volatility is the lowest of the lookback", () => {
    // Volatile for 100 bars, then dead flat for the last 20.
    const noisy = Array.from({ length: 100 }, (_, i) => 100 + (i % 2 === 0 ? 12 : -12));
    const r = computeBollinger([...noisy, ...new Array(20).fill(100)])!;
    assert.equal(r.squeeze, true);
  });

  test("does not flag a squeeze when current volatility is the highest", () => {
    const calm = new Array(100).fill(100);
    const wild = Array.from({ length: 20 }, (_, i) => 100 + (i % 2 === 0 ? 30 : -30));
    const r = computeBollinger([...calm, ...wild])!;
    assert.equal(r.squeeze, false);
  });
});

// ── computeATR ───────────────────────────────────────────────────────
describe("computeATR", () => {
  test("returns null below period + 1 valid rows", () => {
    assert.equal(computeATR(makeCandles(new Array(14).fill(9)), 14), null);
    assert.notEqual(computeATR(makeCandles(new Array(15).fill(9)), 14), null);
  });

  test("computes a known constant-range series exactly", () => {
    // high 10 / low 8 / close 9 every bar → true range is 2 every bar
    const candles = new Array(20).fill(null).map(() => ({
      high: 10,
      low: 8,
      close: 9,
      volume: 100,
    }));
    const r = computeATR(candles, 14)!;
    assert.equal(r.atr, 2);
    assert.equal(r.atrPercent, 22.2); // 2/9 → 22.22 → rounded to 1dp
  });

  test("skips rows with missing OHLC rather than treating them as zero", () => {
    const good = new Array(20).fill(null).map(() => ({
      high: 10,
      low: 8,
      close: 9,
      volume: 100,
    }));
    const withHoles = [...good, { high: null, low: null, close: null, volume: null }];
    assert.deepEqual(computeATR(withHoles, 14), computeATR(good, 14));
  });

  test("reports a wider ATR for a wider range", () => {
    const narrow = computeATR(makeCandles(new Array(20).fill(100), { spread: 1 }), 14)!;
    const wide = computeATR(makeCandles(new Array(20).fill(100), { spread: 5 }), 14)!;
    assert.ok(wide.atr > narrow.atr);
  });
});

// ── computeStochastic ────────────────────────────────────────────────
describe("computeStochastic", () => {
  test("returns null below kPeriod + dPeriod - 1 rows", () => {
    assert.equal(computeStochastic(makeCandles(new Array(15).fill(10))), null);
    assert.notEqual(computeStochastic(makeCandles(new Array(16).fill(10))), null);
  });

  test("reads 100 when the close sits at the top of the range", () => {
    // close == high every bar → %K = 100
    const candles = new Array(20).fill(null).map(() => ({
      high: 10,
      low: 0,
      close: 10,
      volume: 1,
    }));
    const r = computeStochastic(candles)!;
    assert.equal(r.k, 100);
    assert.equal(r.d, 100);
  });

  test("reads 0 when the close sits at the bottom of the range", () => {
    const candles = new Array(20).fill(null).map(() => ({
      high: 10,
      low: 0,
      close: 0,
      volume: 1,
    }));
    assert.equal(computeStochastic(candles)!.k, 0);
  });

  test("falls back to 50 on a zero-width range", () => {
    const candles = new Array(20).fill(null).map(() => ({
      high: 5,
      low: 5,
      close: 5,
      volume: 1,
    }));
    const r = computeStochastic(candles)!;
    assert.equal(r.k, 50);
    assert.equal(r.d, 50);
  });

  test("is oversold after a decline into the low of the window", () => {
    const r = computeStochastic(makeCandles(ramp(130, 100, 20)))!;
    assert.ok(r.k < 20, `expected oversold %K, got ${r.k}`);
  });
});

// ── computeOBVTrend ──────────────────────────────────────────────────
describe("computeOBVTrend", () => {
  test("returns null below trendPeriod + 1 valid rows", () => {
    assert.equal(computeOBVTrend(makeCandles(ramp(1, 10, 10))), null);
    assert.notEqual(computeOBVTrend(makeCandles(ramp(1, 11, 11))), null);
  });

  test("reads rising when closes advance on steady volume (accumulation)", () => {
    assert.equal(computeOBVTrend(makeCandles(ramp(100, 120, 20))), "rising");
  });

  test("reads falling when closes decline on steady volume (distribution)", () => {
    assert.equal(computeOBVTrend(makeCandles(ramp(120, 100, 20))), "falling");
  });

  test("reads flat when closes do not move", () => {
    assert.equal(computeOBVTrend(makeCandles(new Array(20).fill(100))), "flat");
  });

  test("ignores rows with no volume", () => {
    assert.equal(computeOBVTrend(makeCandles(ramp(100, 120, 20), { volume: 0 })), null);
    assert.equal(computeOBVTrend(makeCandles(ramp(100, 120, 20), { volume: null })), null);
  });

  test("is invariant to positive rescaling of the close series", () => {
    // This is why fetchTechnicals can hand OBV already-FX-scaled candles:
    // OBV depends only on the sign of close-to-close changes.
    const raw = makeCandles(ramp(100, 120, 20));
    const scaled = makeCandles(ramp(100, 120, 20).map((c) => c * 1.37));
    assert.equal(computeOBVTrend(raw), computeOBVTrend(scaled));
  });
});

// ── computeTechnicals (integration) ──────────────────────────────────
describe("computeTechnicals", () => {
  test("returns null with fewer than 50 candles", () => {
    assert.equal(computeTechnicals("TEST", makeCandles(ramp(100, 120, 49))), null);
  });

  test("returns null for null/undefined candles rather than throwing", () => {
    assert.equal(computeTechnicals("TEST", null), null);
    assert.equal(computeTechnicals("TEST", undefined), null);
  });

  test("returns null when closes are present but mostly null", () => {
    const candles = makeCandles(ramp(100, 120, 60)).map((c, i) =>
      i < 55 ? { ...c, close: null } : c,
    );
    assert.equal(computeTechnicals("TEST", candles), null);
  });

  test("populates SMA50 but leaves SMA200 null below 200 candles", () => {
    const r = computeTechnicals("TEST", makeCandles(ramp(100, 150, 60)))!;
    assert.ok(r.sma50 > 0);
    assert.equal(r.sma200, null);
    assert.equal(r.priceVsSma200, null);
    // Both crosses require SMA200 — neither may be asserted without it.
    assert.equal(r.goldenCross, false);
    assert.equal(r.deathCross, false);
  });

  test("populates SMA200 and a golden cross on a long uptrend", () => {
    const r = computeTechnicals("TEST", makeCandles(ramp(50, 200, 260)))!;
    assert.ok(r.sma200 != null);
    assert.equal(r.goldenCross, true);
    assert.equal(r.deathCross, false);
    assert.equal(r.momentumSignal, "bullish");
    assert.ok(r.priceVsSma50! > 0);
  });

  test("populates a death cross and bearish momentum on a long downtrend", () => {
    const r = computeTechnicals("TEST", makeCandles(ramp(200, 50, 260)))!;
    assert.equal(r.deathCross, true);
    assert.equal(r.goldenCross, false);
    assert.equal(r.momentumSignal, "bearish");
    assert.ok(r.priceVsSma50 < 0);
  });

  test("carries the ticker through unchanged", () => {
    // Cross-pair ids must survive: they are used as map keys downstream.
    const r = computeTechnicals("BTC_CRO", makeCandles(ramp(100, 150, 60)))!;
    assert.equal(r.ticker, "BTC_CRO");
  });

  test("measures trend position against the spot price when it is plausible", () => {
    const candles = makeCandles(new Array(60).fill(100));
    const flat = computeTechnicals("TEST", candles)!;
    const withSpot = computeTechnicals("TEST", candles, 110)!;
    assert.equal(flat.priceVsSma50, 0);
    assert.equal(withSpot.priceVsSma50, 10); // 110 vs SMA50 of 100
  });

  test("ignores an implausible spot price (units mismatch guard)", () => {
    const candles = makeCandles(new Array(60).fill(100));
    // 100x out — a sub-unit currency mix-up or a bad thin print, not a move.
    const r = computeTechnicals("TEST", candles, 10_000)!;
    assert.equal(r.priceVsSma50, 0);
  });

  test("leaves oscillators on completed closes, unaffected by the spot price", () => {
    const candles = makeCandles(ramp(100, 150, 60));
    const a = computeTechnicals("TEST", candles)!;
    const b = computeTechnicals("TEST", candles, 149)!;
    assert.equal(a.rsi14, b.rsi14);
    assert.equal(a.macd, b.macd);
    assert.equal(a.bollPercentB, b.bollPercentB);
    assert.equal(a.stochK, b.stochK);
    assert.equal(a.atr14, b.atr14);
  });

  test("nulls every volume-derived field when the feed carries no volume", () => {
    // Matters for inverted cross-pairs and any feed without per-candle volume.
    const r = computeTechnicals("TEST", makeCandles(ramp(100, 150, 120), { volume: null }))!;
    assert.equal(r.volumeChange7d, null);
    assert.equal(r.volumeLatest1d, null);
    assert.equal(r.obvTrend, null);
    // Price-derived fields still land.
    assert.ok(r.sma50 > 0);
    assert.ok(r.pricePercentile90d != null);
  });

  test("computes the 90-day percentile only once 90 candles exist", () => {
    assert.equal(
      computeTechnicals("TEST", makeCandles(ramp(100, 150, 89)))!.pricePercentile90d,
      null,
    );
    assert.ok(
      computeTechnicals("TEST", makeCandles(ramp(100, 150, 90)))!.pricePercentile90d != null,
    );
  });

  test("reports 100 at the top of the 90-day range and 0 at the bottom", () => {
    const up = computeTechnicals("TEST", makeCandles(ramp(100, 200, 120)))!;
    assert.equal(up.pricePercentile90d, 100);
    const down = computeTechnicals("TEST", makeCandles(ramp(200, 100, 120)))!;
    assert.equal(down.pricePercentile90d, 0);
  });

  test("reports the single-day change from the last two closes", () => {
    const r = computeTechnicals("TEST", [
      ...makeCandles(new Array(59).fill(100)),
      ...makeCandles([110]),
    ])!;
    assert.equal(r.priceChange1d, 10);
  });

  test("tracks recent lows over the 7- and 30-day windows", () => {
    // Dip 25 bars back: inside the 30d window, outside the 7d one.
    const closes = new Array(60).fill(100);
    closes[60 - 25] = 70;
    const r = computeTechnicals("TEST", makeCandles(closes))!;
    assert.equal(r.recentLow30d, 70);
    assert.equal(r.recentLow7d, 100);
  });

  test("is invariant to unit scaling for unitless indicators", () => {
    // A cross-pair priced ~1.3M in CRO must produce the same RSI/%B/Stoch/ATR%
    // as the same shape priced ~100 in USD — only absolute levels differ. Note
    // the whole candle must be rescaled, high/low included: scaling closes while
    // leaving the high/low spread fixed is a different shape, not a rescale.
    const shape = ramp(100, 150, 120);
    const k = 13_000;
    const small = computeTechnicals("SMALL", makeCandles(shape, { spread: 1 }))!;
    const large = computeTechnicals(
      "LARGE",
      makeCandles(
        shape.map((c) => c * k),
        { spread: k },
      ),
    )!;
    assert.equal(small.rsi14, large.rsi14);
    assert.equal(small.bollPercentB, large.bollPercentB);
    assert.equal(small.stochK, large.stochK);
    assert.equal(small.stochD, large.stochD);
    assert.equal(small.atrPercent, large.atrPercent);
    assert.equal(small.priceVsSma50, large.priceVsSma50);
    assert.equal(small.pricePercentile90d, large.pricePercentile90d);
    assert.equal(small.momentumSignal, large.momentumSignal);
    assert.equal(small.obvTrend, large.obvTrend);
    assert.ok(large.sma50 > small.sma50); // absolute levels do scale
    assert.ok(large.atr14! > small.atr14!);
  });
});
