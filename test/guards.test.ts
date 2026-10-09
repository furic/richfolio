import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  validateRecommendations,
  priceLevelSignals,
  bottomSignalIndicators,
} from "../src/guards.js";
import type { AIBuyRecommendation } from "../src/aiAnalysis.js";
import type { QuoteData } from "../src/fetchPrices.js";
import type { TechnicalData } from "../src/technicals.js";
import type { AllocationReport } from "../src/analyze.js";

// ── Helpers ──────────────────────────────────────────────────────────

function makeRec(overrides?: Partial<AIBuyRecommendation>): AIBuyRecommendation {
  return {
    ticker: "GOOG",
    action: "STRONG BUY",
    confidence: 88,
    reason: "Meets all STRONG BUY criteria: P/E 17.5 is a near-50% discount to history.",
    suggestedBuyValue: 0,
    ...overrides,
  } as AIBuyRecommendation;
}

function makeQuote(overrides?: Partial<QuoteData>): QuoteData {
  return {
    ticker: "GOOG",
    price: 347,
    fiftyTwoWeekPercent: 0.66,
    daysToEarnings: null,
    ...overrides,
  } as QuoteData;
}

function makeTech(overrides?: Partial<TechnicalData>): TechnicalData {
  return {
    ticker: "GOOG",
    sma200: 338.02,
    priceVsSma200: 2.7,
    rsi14: 55,
    macdCrossover: null,
    bollPercentB: 0.6,
    stochK: 50,
    obvTrend: "flat",
    ...overrides,
  } as TechnicalData;
}

function makeReport(gapPct = 4): AllocationReport {
  return {
    items: [{ ticker: "GOOG", gapPct, suggestedBuyValue: 2000 }],
    untrackedItems: [],
    watchingItems: [],
  } as unknown as AllocationReport;
}

function run(
  rec: AIBuyRecommendation,
  quote: QuoteData = makeQuote(),
  tech: TechnicalData | undefined = makeTech(),
  report: AllocationReport = makeReport(),
): AIBuyRecommendation {
  validateRecommendations(
    [rec],
    { [rec.ticker]: quote },
    tech ? { [rec.ticker]: tech } : {},
    report,
  );
  return rec;
}

// ── priceLevelSignals ────────────────────────────────────────────────

describe("priceLevelSignals", () => {
  test("none for GOOG on 2026-10-07: 66% of range, above the 200MA", () => {
    assert.deepEqual(priceLevelSignals(makeQuote(), makeTech()), []);
  });

  test("52w position under 30%", () => {
    assert.deepEqual(priceLevelSignals(makeQuote({ fiftyTwoWeekPercent: 0.29 }), makeTech()), [
      "52w position < 30%",
    ]);
  });

  test("price below the 200MA", () => {
    assert.deepEqual(priceLevelSignals(makeQuote(), makeTech({ priceVsSma200: -1.2 })), [
      "price below 200MA",
    ]);
  });

  test("missing data counts as absent, not as present", () => {
    assert.deepEqual(
      priceLevelSignals(makeQuote({ fiftyTwoWeekPercent: null }), makeTech({ sma200: null })),
      [],
    );
    assert.deepEqual(priceLevelSignals(makeQuote(), undefined), []);
  });
});

// ── STRONG BUY criteria guard ────────────────────────────────────────

describe("STRONG BUY guard — price-level requirement", () => {
  // The case that motivated it: the only "price-level" signal was GAAP vs adjusted EPS.
  test("GOOG with momentum but no price-level signal is capped at BUY", () => {
    const rec = run(makeRec(), makeQuote(), makeTech({ macdCrossover: "bullish", rsi14: 33 }));
    assert.equal(rec.action, "BUY");
    assert.match(rec.reason, /^\[Guard: no price-level signal \(52w 66%, \+2\.7% vs 200MA\)\]/);
    assert.doesNotMatch(rec.reason, /meets all STRONG BUY criteria/i);
  });

  test("price-level + momentum keeps STRONG BUY", () => {
    const rec = run(makeRec(), makeQuote({ fiftyTwoWeekPercent: 0.2 }), makeTech({ rsi14: 31 }));
    assert.equal(rec.action, "STRONG BUY");
  });

  test("two price-level signals alone satisfy the 2-signal count", () => {
    const rec = run(
      makeRec(),
      makeQuote({ fiftyTwoWeekPercent: 0.15 }),
      makeTech({ priceVsSma200: -4 }),
    );
    assert.equal(rec.action, "STRONG BUY");
  });

  test("a lone price-level signal with no confirmation is capped at BUY", () => {
    const rec = run(makeRec(), makeQuote({ fiftyTwoWeekPercent: 0.2 }), makeTech());
    assert.equal(rec.action, "BUY");
    assert.match(rec.reason, /only 1 entry signal \(52w position < 30%\)/);
  });

  test("watch-list STRONG BUYs are held to the price-level rule too", () => {
    const rec = run(makeRec({ isWatching: true }), makeQuote(), makeTech({ rsi14: 30 }));
    assert.equal(rec.action, "BUY");
  });

  test("watch-list tickers still skip the allocation-gap check", () => {
    const rec = run(
      makeRec({ isWatching: true }),
      makeQuote({ fiftyTwoWeekPercent: 0.1 }),
      makeTech({ rsi14: 30 }),
      makeReport(0.5),
    );
    assert.equal(rec.action, "STRONG BUY");
  });

  test("BUY recs are left alone", () => {
    const rec = run(makeRec({ action: "BUY" }));
    assert.equal(rec.action, "BUY");
    assert.doesNotMatch(rec.reason, /Guard/);
  });
});

// ── Bottom signal + limit sanity ─────────────────────────────────────

describe("bottom signal is computed from the technicals", () => {
  // ITA refresh, 2026-10-09: a model counted RSI 30.2 as "RSI<30" to reach the ETF threshold of 3.
  test("ITA: RSI 30.2, below 200MA, death cross, volume up → only 2 of 3 → no signal", () => {
    const rec = run(
      makeRec({ action: "BUY", bottomSignal: "Oversold (RSI<30, death cross, price below 200MA)" }),
      makeQuote({ ticker: "GOOG" }),
      makeTech({ rsi14: 30.2, priceVsSma200: -11, deathCross: true, volumeChange7d: 14 }),
    );
    assert.equal(rec.bottomSignal, "");
    assert.deepEqual(
      bottomSignalIndicators(
        makeTech({ rsi14: 30.2, priceVsSma200: -11, deathCross: true, volumeChange7d: 14 }),
      ),
      ["-11% below 200MA", "death cross"],
    );
  });

  test("3 indicators qualify a stock or ETF, with the measured values", () => {
    const rec = run(
      makeRec({ action: "BUY", bottomSignal: "" }),
      makeQuote(),
      makeTech({ rsi14: 25.9, priceVsSma200: -11, deathCross: true }),
    );
    assert.equal(rec.bottomSignal, "RSI 25.9 < 30 + -11% below 200MA + death cross");
  });

  test("crypto needs only 2", () => {
    const tech = makeTech({ rsi14: 28, priceVsSma200: -5 });
    assert.equal(
      run(makeRec({ action: "BUY" }), makeQuote({ quoteType: "CRYPTOCURRENCY" }), tech)
        .bottomSignal,
      "RSI 28.0 < 30 + -5% below 200MA",
    );
    assert.equal(
      run(makeRec({ action: "BUY" }), makeQuote({ assetKind: "crypto-cross" }), tech).bottomSignal,
      "RSI 28.0 < 30 + -5% below 200MA",
    );
    assert.equal(run(makeRec({ action: "BUY" }), makeQuote(), tech).bottomSignal, "");
  });
});

describe("limit below the 52-week low is flagged, not moved", () => {
  test("ITA: $195 under a $195.71 low gets a warning appended", () => {
    const rec = run(
      makeRec({
        action: "BUY",
        suggestedLimitPrice: 195,
        limitPriceReason: "52w low + 5% buffer",
      }),
      makeQuote({ fiftyTwoWeekLow: 195.71, currency: "USD" }),
    );
    assert.equal(rec.suggestedLimitPrice, 195);
    assert.match(rec.limitPriceReason!, /^52w low \+ 5% buffer ⚠ Below the 52-week low/);
  });

  test("a limit at or above the low is left alone", () => {
    const rec = run(
      makeRec({ action: "BUY", suggestedLimitPrice: 197, limitPriceReason: "retest" }),
      makeQuote({ fiftyTwoWeekLow: 195.71, currency: "USD" }),
    );
    assert.equal(rec.limitPriceReason, "retest");
  });
});
