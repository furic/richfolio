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

// The guard fails open on a missing price (above), which is the right call for
// a data gap — but it meant watch-list tickers were never guarded at all. They
// are absent from report.items, and the price map used to be built from items
// alone, so morningPrice/currentPrice were both 0 and every AI scoring flip
// alerted. Observed on GOOG (a watch ticker) on 2026-08-04: weakened →
// strengthened → weakened inside 6½ hours, two of those runs with the US market
// shut and the daily candles therefore frozen. buildPriceMap() now covers
// watchingItems; these tests pin the behaviour once prices are present.
describe("compareWithBaseline — watch-list tickers are guarded too", () => {
  const goog = (action: string, confidence: number) =>
    makeRec({ ticker: "GOOG", tickerFullName: "Alphabet Inc.", action, confidence });

  test("suppresses the GOOG weakened→strengthened→weakened whipsaw", () => {
    // Each leg compares against the previous alert's state, because index.ts
    // re-saves the baseline after every alert. Price is frozen across all three.
    const legs: [string, number, string, number][] = [
      ["STRONG BUY", 84, "BUY", 78], // weakened
      ["BUY", 78, "STRONG BUY", 82], // strengthened
      ["STRONG BUY", 82, "BUY", 76], // weakened again
    ];
    for (const [wasAction, wasConf, nowAction, nowConf] of legs) {
      const alerts = compareWithBaseline(
        [goog(nowAction, nowConf)],
        { GOOG: 201.5 },
        makeBaseline(goog(wasAction, wasConf), 201.4), // +0.05% — frozen
        makeConfig(),
      );
      assert.equal(alerts.length, 0, `${wasAction}→${nowAction} on a frozen price must not alert`);
    }
  });

  test("still alerts on a watch ticker that moved materially", () => {
    const alerts = compareWithBaseline(
      [goog("STRONG BUY", 88)],
      { GOOG: 195.0 }, // -3.2% vs 201.4 — a real move
      makeBaseline(goog("BUY", 70), 201.4),
      makeConfig(),
    );
    assert.equal(alerts.length, 1, "a real move on a watch ticker is still a signal");
    assert.equal(alerts[0].triggerType, "action_upgrade");
  });
});

// The daily brief shows per-AI scores and the degradation safety badge, but
// IntradayAlert didn't carry providers/agreement/degradation at all — so the
// intraday renderers had no way to show them even if they wanted to. A capped
// STRONG BUY→BUY (applyDegradedProviderPolicy) rendered identically to a
// genuine BUY on intraday alerts. These fields must be carried straight
// through from the current recommendation the alert was raised against.
describe("compareWithBaseline — carries provider breakdown onto the alert", () => {
  test("providers/agreement/degradation pass through from the current rec", () => {
    const providers: NonNullable<AIBuyRecommendation["providers"]> = [
      {
        providerId: "gemini",
        providerLabel: "Gemini",
        providerShortLabel: "G",
        action: "STRONG BUY",
        confidence: 88,
        reason: "gemini reason",
        suggestedBuyValue: 1000,
      },
      {
        providerId: "claude",
        providerLabel: "Claude",
        providerShortLabel: "C",
        action: "BUY",
        confidence: 74,
        reason: "claude reason",
        suggestedBuyValue: 1000,
      },
    ];
    const degradation = { configured: 3, answered: 2, missing: ["mistral"] };
    const morning = makeRec({ action: "BUY", confidence: 64 });
    const current = makeRec({
      action: "STRONG BUY",
      confidence: 87,
      providers,
      agreement: "majority",
      degradation,
    });
    const alerts = compareWithBaseline(
      [current],
      { VOO: 650.0 }, // -3.1% vs $670.63 — a real overnight move, not frozen-data noise
      makeBaseline(morning, 670.63),
      makeConfig(),
    );
    assert.equal(alerts.length, 1);
    assert.deepEqual(alerts[0].providers, providers);
    assert.equal(alerts[0].agreement, "majority");
    assert.deepEqual(alerts[0].degradation, degradation);
  });

  test("providers/agreement/degradation are undefined in single-provider mode", () => {
    const morning = makeRec({ action: "BUY", confidence: 64 });
    const current = makeRec({ action: "STRONG BUY", confidence: 87 });
    const alerts = compareWithBaseline(
      [current],
      { VOO: 650.0 },
      makeBaseline(morning, 670.63),
      makeConfig(),
    );
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].providers, undefined);
    assert.equal(alerts[0].agreement, undefined);
    assert.equal(alerts[0].degradation, undefined);
  });
});
