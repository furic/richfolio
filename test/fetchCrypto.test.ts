import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  parseCryptoPair,
  resolveInstrument,
  toCandles,
  mergeCandles,
  invertCandles,
  deriveFiftyTwoWeek,
  buildCryptoQuote,
  coinName,
} from "../src/fetchCrypto.js";
import type { CryptoInstrument, TimedCandle } from "../src/fetchCrypto.js";
import { computeTechnicals } from "../src/technicals.js";

// ── Helpers ──────────────────────────────────────────────────────────
function inst(symbol: string, overrides: Partial<CryptoInstrument> = {}): CryptoInstrument {
  const [base_ccy, quote_ccy] = symbol.split("_");
  return {
    symbol,
    inst_type: "CCY_PAIR",
    base_ccy: base_ccy ?? symbol,
    quote_ccy: quote_ccy ?? "",
    tradable: true,
    ...overrides,
  };
}

// The live market shape, as verified against crypto.com: CRO is the *base* of
// CRO_BTC but the *quote* of ETH_CRO.
const MARKETS: CryptoInstrument[] = [
  inst("CRO_BTC"),
  inst("ETH_CRO"),
  inst("CRO_USD"),
  inst("BTC_USDT"),
  { ...inst("BTCUSD-PERP"), inst_type: "PERPETUAL_SWAP" },
];

function candle(t: number, o: Partial<TimedCandle> = {}): TimedCandle {
  return { t, close: 100, high: 101, low: 99, volume: 1000, ...o };
}

const DAY = 86_400_000;

// ── parseCryptoPair ──────────────────────────────────────────────────
describe("parseCryptoPair", () => {
  test('reads "BASE/QUOTE" as "price of BASE denominated in QUOTE"', () => {
    assert.deepEqual(parseCryptoPair("BTC/CRO"), {
      ticker: "BTC_CRO",
      base: "BTC",
      quote: "CRO",
    });
  });

  test("normalises the internal ticker to an underscore, not a slash", () => {
    // The id becomes a map key, a baseline JSON key and a URL query param — a
    // slash would need escaping in the last of those.
    assert.equal(parseCryptoPair("ETH/CRO")!.ticker, "ETH_CRO");
    assert.ok(!parseCryptoPair("ETH/CRO")!.ticker.includes("/"));
  });

  test("upper-cases and trims", () => {
    assert.deepEqual(parseCryptoPair("  btc / cro  "), {
      ticker: "BTC_CRO",
      base: "BTC",
      quote: "CRO",
    });
  });

  test("accepts any pair, not just the ones shipped today", () => {
    // The extensibility guarantee: adding a pair must be config-only.
    assert.equal(parseCryptoPair("SOL/CRO")!.ticker, "SOL_CRO");
    assert.equal(parseCryptoPair("BTC/USDT")!.ticker, "BTC_USDT");
    assert.equal(parseCryptoPair("ETH/BTC")!.ticker, "ETH_BTC");
  });

  test("preserves direction — BTC/CRO and CRO/BTC are different instruments", () => {
    assert.equal(parseCryptoPair("BTC/CRO")!.ticker, "BTC_CRO");
    assert.equal(parseCryptoPair("CRO/BTC")!.ticker, "CRO_BTC");
  });

  test("rejects malformed entries instead of forwarding junk to the exchange", () => {
    for (const bad of [
      "",
      "   ",
      "BTC",
      "BTC/",
      "/CRO",
      "BTC/CRO/ETH",
      "BTC-CRO",
      "BTC CRO",
      "BTC/CR O",
      "BT$/CRO",
      "BTC/CRO!",
    ]) {
      assert.equal(parseCryptoPair(bad), null, `should reject ${JSON.stringify(bad)}`);
    }
  });

  test("rejects a pair against itself", () => {
    assert.equal(parseCryptoPair("CRO/CRO"), null);
  });

  test("rejects non-string input without throwing", () => {
    assert.equal(parseCryptoPair(null as unknown as string), null);
    assert.equal(parseCryptoPair(42 as unknown as string), null);
  });
});

// ── resolveInstrument ────────────────────────────────────────────────
describe("resolveInstrument", () => {
  test("uses a native market directly, with no inversion", () => {
    const r = resolveInstrument("ETH", "CRO", MARKETS);
    assert.equal(r.ok, true);
    assert.deepEqual(r, { ok: true, symbol: "ETH_CRO", invert: false });
  });

  test("falls back to the reverse market and marks it inverted", () => {
    // Asking for BTC priced in CRO; the exchange only lists CRO priced in BTC.
    const r = resolveInstrument("BTC", "CRO", MARKETS);
    assert.equal(r.ok, true);
    assert.deepEqual(r, { ok: true, symbol: "CRO_BTC", invert: true });
  });

  test("prefers the direct market when both directions exist", () => {
    const both = [...MARKETS, inst("BTC_CRO")];
    assert.deepEqual(resolveInstrument("BTC", "CRO", both), {
      ok: true,
      symbol: "BTC_CRO",
      invert: false,
    });
  });

  test("never matches a perpetual", () => {
    // BTCUSD-PERP is listed but is not a spot market; asking for BTC/USD must fail.
    const r = resolveInstrument("BTCUSD", "PERP", MARKETS);
    assert.equal(r.ok, false);
  });

  test("ignores a non-spot instrument even on an exact symbol match", () => {
    const perpOnly = [{ ...inst("FOO_BAR"), inst_type: "PERPETUAL_SWAP" }];
    const r = resolveInstrument("FOO", "BAR", perpOnly);
    assert.equal(r.ok, false);
  });

  test("reports both symbols tried when the market does not exist", () => {
    const r = resolveInstrument("NOPE", "CRO", MARKETS);
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.match(r.reason, /NOPE_CRO/);
    assert.match(r.reason, /CRO_NOPE/);
  });

  test("rejects a market that exists but is untradable, and says so", () => {
    const halted = [{ ...inst("XYZ_CRO"), tradable: false }];
    const r = resolveInstrument("XYZ", "CRO", halted);
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.match(r.reason, /not tradable/);
    assert.match(r.reason, /XYZ_CRO/);
  });

  test("handles an empty instrument list without throwing", () => {
    assert.equal(resolveInstrument("BTC", "CRO", []).ok, false);
  });

  test("resolves an arbitrary new pair with no code change", () => {
    // The extensibility guarantee: config supplies base/quote, the exchange's own
    // metadata settles direction.
    assert.deepEqual(resolveInstrument("BTC", "USDT", MARKETS), {
      ok: true,
      symbol: "BTC_USDT",
      invert: false,
    });
    assert.deepEqual(resolveInstrument("USD", "CRO", MARKETS), {
      ok: true,
      symbol: "CRO_USD",
      invert: true,
    });
  });
});

// ── toCandles ────────────────────────────────────────────────────────
describe("toCandles", () => {
  test("parses crypto.com's string-valued fields into numbers", () => {
    const out = toCandles([
      { o: "26907", h: "27404", l: "26700", c: "27125", v: "25.5722", t: 1760832000000 },
    ]);
    assert.equal(out.length, 1);
    assert.deepEqual(out[0], {
      t: 1760832000000,
      close: 27125,
      high: 27404,
      low: 26700,
      volume: 25.5722,
    });
  });

  test("parses very small values without losing precision", () => {
    const out = toCandles([
      { o: "0.0000013467", h: "0.0000013675", l: "0.0000013226", c: "0.0000007717", v: "1", t: 1 },
    ]);
    assert.equal(out[0].close, 7.717e-7);
  });

  test("sorts oldest-first regardless of input order", () => {
    const out = toCandles([
      { c: "3", t: 300, h: "3", l: "3", v: "1" },
      { c: "1", t: 100, h: "1", l: "1", v: "1" },
      { c: "2", t: 200, h: "2", l: "2", v: "1" },
    ]);
    assert.deepEqual(
      out.map((c) => c.t),
      [100, 200, 300],
    );
  });

  test("drops rows with an unusable close or timestamp", () => {
    const out = toCandles([
      { c: "abc", t: 100, h: "1", l: "1", v: "1" },
      { c: "1", t: "nope", h: "1", l: "1", v: "1" },
      { c: "5", t: 200, h: "6", l: "4", v: "1" },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].close, 5);
  });

  test("nulls unparseable high/low/volume rather than emitting NaN", () => {
    const out = toCandles([{ c: "5", t: 1, h: "", l: undefined, v: "x" }]);
    assert.equal(out[0].high, null);
    assert.equal(out[0].low, null);
    assert.equal(out[0].volume, null);
    assert.equal(out[0].close, 5);
  });

  test("treats a blank or missing price as absent, NOT as zero", () => {
    // Number("") and Number(null) are both 0, so a naive parse turns a blank
    // high into a price of zero — which corrupts ATR/Stochastic and becomes
    // Infinity once inverted.
    for (const blank of ["", "   ", null, undefined]) {
      const out = toCandles([{ c: "5", t: 1, h: blank, l: blank, v: blank }]);
      assert.equal(out[0].high, null, `high from ${JSON.stringify(blank)}`);
      assert.equal(out[0].low, null, `low from ${JSON.stringify(blank)}`);
      assert.equal(out[0].volume, null, `volume from ${JSON.stringify(blank)}`);
    }
  });

  test("rejects a non-positive high/low as not a real price", () => {
    const out = toCandles([{ c: "5", t: 1, h: "0", l: "-3", v: "1" }]);
    assert.equal(out[0].high, null);
    assert.equal(out[0].low, null);
  });

  test("drops rows whose close is zero or negative", () => {
    const out = toCandles([
      { c: "0", t: 1, h: "1", l: "1", v: "1" },
      { c: "-5", t: 2, h: "1", l: "1", v: "1" },
      { c: "5", t: 3, h: "6", l: "4", v: "1" },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].t, 3);
  });

  test("keeps a legitimate zero volume", () => {
    // A day with no trades is real data, unlike a zero price.
    assert.equal(toCandles([{ c: "5", t: 1, h: "6", l: "4", v: "0" }])[0].volume, 0);
  });

  test("returns empty for an empty response", () => {
    assert.deepEqual(toCandles([]), []);
  });
});

// ── mergeCandles ─────────────────────────────────────────────────────
describe("mergeCandles", () => {
  test("merges pages and dedupes on open time", () => {
    // Paged windows share a boundary candle; it must not appear twice.
    const a = [candle(1 * DAY), candle(2 * DAY)];
    const b = [candle(2 * DAY), candle(3 * DAY)];
    const out = mergeCandles(a, b);
    assert.equal(out.length, 3);
    assert.deepEqual(
      out.map((c) => c.t / DAY),
      [1, 2, 3],
    );
  });

  test("returns a single ascending series from out-of-order pages", () => {
    const out = mergeCandles([candle(5 * DAY)], [candle(1 * DAY)], [candle(3 * DAY)]);
    assert.deepEqual(
      out.map((c) => c.t / DAY),
      [1, 3, 5],
    );
  });

  test("handles no pages and empty pages", () => {
    assert.deepEqual(mergeCandles(), []);
    assert.deepEqual(mergeCandles([], []), []);
  });
});

// ── invertCandles ────────────────────────────────────────────────────
describe("invertCandles", () => {
  test("takes the reciprocal of the close", () => {
    const out = invertCandles([candle(DAY, { close: 4, high: 8, low: 2, volume: 10 })]);
    assert.equal(out[0].close, 0.25);
  });

  test("SWAPS high and low — 1/x reverses ordering", () => {
    // The cheapest price of X in Y is the dearest price of Y in X. Getting this
    // backwards silently corrupts ATR, Stochastic and the Bollinger bands.
    const out = invertCandles([candle(DAY, { close: 4, high: 8, low: 2 })]);
    assert.equal(out[0].high, 1 / 2, "new high must come from the old LOW");
    assert.equal(out[0].low, 1 / 8, "new low must come from the old HIGH");
    assert.ok(out[0].high! > out[0].low!, "high must still exceed low after inverting");
  });

  test("keeps high >= close >= low after inverting", () => {
    const out = invertCandles([candle(DAY, { close: 5, high: 9, low: 3 })]);
    assert.ok(out[0].high! >= out[0].close!);
    assert.ok(out[0].close! >= out[0].low!);
  });

  test("rebases volume into the new base unit (quantity x price)", () => {
    // crypto.com reports volume in the base coin. After inverting, the base coin
    // has changed, so the figure has to be restated.
    const out = invertCandles([candle(DAY, { close: 4, volume: 10 })]);
    assert.equal(out[0].volume, 40);
  });

  test("preserves the open time", () => {
    const out = invertCandles([candle(1234)]);
    assert.equal(out[0].t, 1234);
  });

  test("is an involution: inverting twice returns the original", () => {
    const original = [
      candle(DAY, { close: 4, high: 8, low: 2, volume: 10 }),
      candle(2 * DAY, { close: 5, high: 6, low: 3, volume: 20 }),
    ];
    const round = invertCandles(invertCandles(original));
    assert.equal(round.length, original.length);
    round.forEach((c, i) => {
      assert.ok(Math.abs(c.close! - original[i].close!) < 1e-12);
      assert.ok(Math.abs(c.high! - original[i].high!) < 1e-12);
      assert.ok(Math.abs(c.low! - original[i].low!) < 1e-12);
      assert.ok(Math.abs(c.volume! - original[i].volume!) < 1e-9);
    });
  });

  test("nulls non-positive or missing high/low instead of emitting Infinity", () => {
    const out = invertCandles([candle(DAY, { close: 4, high: 0, low: null })]);
    assert.equal(out[0].high, null); // from low: null
    assert.equal(out[0].low, null); // from high: 0 → would have been Infinity
    assert.ok(Number.isFinite(out[0].close!));
  });

  test("drops candles whose close cannot be inverted", () => {
    const out = invertCandles([
      candle(DAY, { close: 0 }),
      candle(2 * DAY, { close: -5 }),
      candle(3 * DAY, { close: 4 }),
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].t, 3 * DAY);
  });

  test("nulls volume when it cannot be rebased", () => {
    assert.equal(invertCandles([candle(DAY, { close: 4, volume: null })])[0].volume, null);
    assert.equal(invertCandles([candle(DAY, { close: 4, volume: 0 })])[0].volume, null);
  });

  test("turns a rising series into a falling one", () => {
    // The whole point: CRO strengthening against BTC means BTC is getting
    // cheaper in CRO terms, which must read as a falling series.
    const rising = Array.from({ length: 60 }, (_, i) =>
      candle(i * DAY, { close: 100 + i, high: 101 + i, low: 99 + i }),
    );
    const inverted = invertCandles(rising);
    assert.ok(inverted[0].close! > inverted[inverted.length - 1].close!);

    const t = computeTechnicals("X_Y", inverted)!;
    assert.ok(t.priceVsSma50 < 0, "inverted series must sit below its 50MA");
    assert.equal(t.momentumSignal, "neutral");
  });
});

// ── deriveFiftyTwoWeek ───────────────────────────────────────────────
describe("deriveFiftyTwoWeek", () => {
  test("takes the extremes of the high/low series, not the closes", () => {
    const candles = [
      candle(DAY, { close: 100, high: 150, low: 90 }),
      candle(2 * DAY, { close: 110, high: 120, low: 50 }),
    ];
    const r = deriveFiftyTwoWeek(candles);
    assert.equal(r.high, 150);
    assert.equal(r.low, 50);
  });

  test("reports position in the range as a 0-1 fraction at 3dp", () => {
    const candles = [
      candle(DAY, { close: 100, high: 200, low: 100 }),
      candle(2 * DAY, { close: 125, high: 125, low: 125 }),
    ];
    // last close 125 within [100, 200] → 0.25
    assert.equal(deriveFiftyTwoWeek(candles).percent, 0.25);
  });

  test("reports 0 at the low of the range and 1 at the high", () => {
    const atLow = [
      candle(DAY, { close: 200, high: 200, low: 200 }),
      candle(2 * DAY, { close: 100, high: 100, low: 100 }),
    ];
    assert.equal(deriveFiftyTwoWeek(atLow).percent, 0);
    const atHigh = [
      candle(DAY, { close: 100, high: 100, low: 100 }),
      candle(2 * DAY, { close: 200, high: 200, low: 200 }),
    ];
    assert.equal(deriveFiftyTwoWeek(atHigh).percent, 1);
  });

  test("uses 365 calendar-day candles, not 252 trading days", () => {
    // Crypto trades every day, so a 252-candle window would be ~8 months
    // masquerading as a year. The spike at 300 days back must be inside range.
    const candles = Array.from({ length: 400 }, (_, i) =>
      candle(i * DAY, { close: 100, high: 100, low: 100 }),
    );
    candles[400 - 300] = candle(100 * DAY, { close: 100, high: 999, low: 100 });
    assert.equal(deriveFiftyTwoWeek(candles).high, 999);
  });

  test("excludes candles older than the 365-day window", () => {
    const candles = Array.from({ length: 400 }, (_, i) =>
      candle(i * DAY, { close: 100, high: 100, low: 100 }),
    );
    candles[0] = candle(0, { close: 100, high: 5000, low: 1 }); // 400 days back
    const r = deriveFiftyTwoWeek(candles);
    assert.equal(r.high, 100);
    assert.equal(r.low, 100);
  });

  test("falls back to the close when a candle has no high/low", () => {
    const candles = [
      candle(DAY, { close: 100, high: null, low: null }),
      candle(2 * DAY, { close: 300, high: null, low: null }),
    ];
    const r = deriveFiftyTwoWeek(candles);
    assert.equal(r.high, 300);
    assert.equal(r.low, 100);
  });

  test("returns nulls for an empty series", () => {
    assert.deepEqual(deriveFiftyTwoWeek([]), { high: null, low: null, percent: null });
  });

  test("nulls percent on a zero-width range rather than dividing by zero", () => {
    const flat = [candle(DAY, { close: 100, high: 100, low: 100 })];
    assert.equal(deriveFiftyTwoWeek(flat).percent, null);
  });
});

// ── buildCryptoQuote ─────────────────────────────────────────────────
describe("buildCryptoQuote", () => {
  const spec = { ticker: "BTC_CRO", base: "BTC", quote: "CRO" };

  test("prices the pair at the latest close, in the quote coin", () => {
    const q = buildCryptoQuote(spec, [candle(DAY, { close: 1_295_840 })])!;
    assert.equal(q.ticker, "BTC_CRO");
    assert.equal(q.price, 1_295_840);
    assert.equal(q.currency, "CRO");
    assert.equal(q.originalCurrency, "CRO");
  });

  test("labels the pair using coin names", () => {
    const q = buildCryptoQuote(spec, [candle(DAY)])!;
    assert.equal(q.name, "Bitcoin priced in Cronos");
    assert.equal(q.longName, "Bitcoin priced in Cronos");
  });

  test("tags the asset kind so prompt rules stop guessing from the ticker", () => {
    assert.equal(buildCryptoQuote(spec, [candle(DAY)])!.assetKind, "crypto-cross");
  });

  test("leaves every equity-only field null", () => {
    const q = buildCryptoQuote(spec, [candle(DAY)])!;
    for (const field of [
      "trailingPE",
      "forwardPE",
      "avgPE",
      "marketCap",
      "dividendYield",
      "distributionYield",
      "beta",
      "holdings",
      "returnOnEquity",
      "debtToEquity",
      "freeCashflow",
      "operatingCashflow",
      "profitMargins",
      "revenueGrowth",
      "earningsGrowth",
      "targetMeanPrice",
      "recommendationKey",
      "postMarketPrice",
      "preMarketPrice",
      "earningsDate",
      "daysToEarnings",
    ] as const) {
      assert.equal(q[field], null, `${field} must be null for a cross-pair`);
    }
  });

  test("carries the derived 52-week range", () => {
    const candles = [
      candle(DAY, { close: 100, high: 200, low: 100 }),
      candle(2 * DAY, { close: 125, high: 125, low: 125 }),
    ];
    const q = buildCryptoQuote(spec, candles)!;
    assert.equal(q.fiftyTwoWeekHigh, 200);
    assert.equal(q.fiftyTwoWeekLow, 100);
    assert.equal(q.fiftyTwoWeekPercent, 0.25);
  });

  test("returns null when there is no usable last candle", () => {
    assert.equal(buildCryptoQuote(spec, []), null);
    assert.equal(buildCryptoQuote(spec, [candle(DAY, { close: 0 })]), null);
  });

  test("uses the ticker as a label for an unknown coin", () => {
    const q = buildCryptoQuote({ ticker: "ZZZ_CRO", base: "ZZZ", quote: "CRO" }, [candle(DAY)])!;
    assert.equal(q.name, "ZZZ priced in Cronos");
  });
});

// ── coinName ─────────────────────────────────────────────────────────
describe("coinName", () => {
  test("maps known symbols and passes unknown ones through", () => {
    assert.equal(coinName("BTC"), "Bitcoin");
    assert.equal(coinName("CRO"), "Cronos");
    assert.equal(coinName("WOOF"), "WOOF");
  });
});

// ── End-to-end transform: native vs inverted ─────────────────────────
describe("cross-pair pipeline", () => {
  test("an inverted pair produces the same indicators as the equivalent native series", () => {
    // Build CRO_BTC, invert to BTC_CRO, and check the result matches a series
    // constructed directly at BTC_CRO prices. Guards the whole transform chain.
    const croBtc = Array.from({ length: 120 }, (_, i) => {
      const close = 7.7e-7 * (1 + i * 0.001);
      return candle(i * DAY, { close, high: close * 1.01, low: close * 0.99, volume: 1000 });
    });
    const btcCro = invertCandles(croBtc);
    const direct = croBtc.map((c) =>
      candle(c.t, {
        close: 1 / c.close!,
        high: 1 / c.low!,
        low: 1 / c.high!,
        volume: c.volume! * c.close!,
      }),
    );

    const a = computeTechnicals("BTC_CRO", btcCro)!;
    const b = computeTechnicals("BTC_CRO", direct)!;
    assert.equal(a.rsi14, b.rsi14);
    assert.equal(a.stochK, b.stochK);
    assert.equal(a.atrPercent, b.atrPercent);
    assert.equal(a.bollPercentB, b.bollPercentB);
    assert.equal(a.obvTrend, b.obvTrend);
    assert.equal(a.pricePercentile90d, b.pricePercentile90d);
  });

  test("an inverted pair still yields a full indicator set at cross-pair magnitudes", () => {
    const croBtc = Array.from({ length: 260 }, (_, i) => {
      // Sine plus an alternating wobble: without the wobble the last 15 closes
      // can be monotonic, which pins RSI at exactly 0 or 100.
      const close = 7.7e-7 * (1 + Math.sin(i / 20) * 0.15 + (i % 2 === 0 ? 0.01 : -0.01));
      return candle(i * DAY, { close, high: close * 1.02, low: close * 0.98, volume: 5000 });
    });
    const t = computeTechnicals("BTC_CRO", invertCandles(croBtc))!;
    assert.ok(t.sma50 > 1_000_000, "BTC_CRO should be ~1.3M CRO");
    assert.ok(t.sma200 != null);
    assert.ok(t.rsi14 > 0 && t.rsi14 < 100);
    assert.ok(t.macd != null);
    assert.ok(t.bollPercentB != null);
    assert.ok(t.atrPercent != null);
    assert.ok(t.stochK != null);
    assert.ok(t.obvTrend != null);
    assert.ok(t.pricePercentile90d != null);
  });
});
