import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { compareWithBaseline } from "../src/intradayCompare.js";
import type { AIBuyRecommendation } from "../src/aiAnalysis.js";
import type { MorningBaseline } from "../src/state.js";
import type { IntradayAlertConfig } from "../src/config.js";

// ── Helpers ──────────────────────────────────────────────────────────

function makeRec(overrides?: Partial<AIBuyRecommendation>): AIBuyRecommendation {
  return {
    ticker: "VOO",
    tickerFullName: "Vanguard S&P 500 ETF",
    originalCurrency: "USD",
    action: "BUY",
    confidence: 64,
    reason: "test",
    suggestedBuyValue: 1000,
    ...overrides,
  };
}

function makeBaseline(rec: AIBuyRecommendation, price: number): MorningBaseline {
  return {
    timestamp: "2026-07-30T00:00:00Z",
    date: "2026-07-30",
    recommendations: [rec],
    prices: { [rec.ticker]: price },
  };
}

function makeConfig(overrides?: Partial<IntradayAlertConfig>): IntradayAlertConfig {
  return {
    enabled: true,
    confidenceIncreaseThreshold: 10,
    minConfidenceToAlert: 80,
    actionUpgradesAlert: true,
    onlyAlertForActions: ["STRONG BUY", "BUY"],
    minPriceMovePctToAlert: 1.0,
    ...overrides,
  };
}

// ── Frozen-data guard ────────────────────────────────────────────────
// Intraday technicals come from daily candles that only update at the US
// close. All intraday runs fire while the US market is shut, so the indicators
// are frozen between runs — an action/confidence flip with no material price
// move is AI scoring noise, not a real signal, and must not alert.
describe("compareWithBaseline — frozen-data (price deadband) guard", () => {
  test("suppresses BUY→STRONG BUY upgrade when price barely moved (the whipsaw bug)", () => {
    // Reproduces today's 4:32pm false upgrade: morning BUY 64% @ $670.63,
    // current STRONG BUY 87% @ $673.20 (+0.38%) — identical technicals.
    const morning = makeRec({ action: "BUY", confidence: 64 });
    const current = makeRec({ action: "STRONG BUY", confidence: 87 });
    const alerts = compareWithBaseline(
      [current],
      { VOO: 673.2 },
      makeBaseline(morning, 670.63),
      makeConfig(),
    );
    assert.equal(alerts.length, 0, "sub-1% price move should not alert");
  });

  test("suppresses STRONG BUY→BUY downgrade when price barely moved", () => {
    // Reproduces the 6:05pm false downgrade half of the whipsaw.
    const morning = makeRec({ action: "STRONG BUY", confidence: 87 });
    const current = makeRec({ action: "BUY", confidence: 76 });
    const alerts = compareWithBaseline(
      [current],
      { VOO: 672.0 },
      makeBaseline(morning, 670.0),
      makeConfig(),
    );
    assert.equal(alerts.length, 0, "downgrade on frozen price is noise");
  });

  test("ALLOWS upgrade when price moved materially (real signal)", () => {
    const morning = makeRec({ action: "BUY", confidence: 64 });
    const current = makeRec({ action: "STRONG BUY", confidence: 87 });
    const alerts = compareWithBaseline(
      [current],
      { VOO: 650.0 }, // -3.1% vs $670.63 — a real overnight move
      makeBaseline(morning, 670.63),
      makeConfig(),
    );
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].triggerType, "action_upgrade");
  });

  test("fails open (alerts) when baseline price is missing", () => {
    const morning = makeRec({ action: "BUY", confidence: 64 });
    const current = makeRec({ action: "STRONG BUY", confidence: 87 });
    const alerts = compareWithBaseline(
      [current],
      { VOO: 673.2 },
      makeBaseline(morning, 0), // no morning price → can't prove noise
      makeConfig(),
    );
    assert.equal(alerts.length, 1, "missing price data should not silence a genuine upgrade");
  });
});
