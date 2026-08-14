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

// ── Confidence gate: vote-aware, not consensus-aware ─────────────────
// The triggers ask "did ANY provider vote STRONG BUY?" so the confidence gate
// must ask about that provider, not the mean across all of them. Averaging
// compresses toward the middle, so measuring a vote-level trigger against a
// consensus-level threshold silently rejects real signals.
//
// This is not hypothetical: across ten consecutive intraday runs
// (2026-08-12→14) the highest consensus confidence was 76 against a threshold
// of 80, so every non-downgrade trigger was discarded and no intraday alert
// fired for a week. The MU numbers below are copied from run 31771757443.
describe("compareWithBaseline — confidence gate measures the STRONG BUY voter", () => {
  const score = (id: string, short: string, action: string, confidence: number) => ({
    providerId: id,
    providerLabel: id,
    providerShortLabel: short,
    action,
    confidence,
    reason: "r",
    suggestedBuyValue: 0,
  });

  // BUY MU (66%) [G:BUY45 C:STRONGBUY82 M:BUY70] — real output, 2026-08-14
  const muNow = makeRec({
    ticker: "MU",
    action: "BUY",
    confidence: 66,
    providers: [
      score("gemini", "G", "BUY", 45),
      score("claude", "C", "STRONG BUY", 82),
      score("mistral", "M", "BUY", 70),
    ],
  });
  const muMorning = makeRec({
    ticker: "MU",
    action: "BUY",
    confidence: 60,
    providers: [
      score("gemini", "G", "BUY", 55),
      score("claude", "C", "BUY", 62),
      score("mistral", "M", "BUY", 63),
    ],
  });

  test("a fresh STRONG BUY vote at 82% alerts even though consensus is 66%", () => {
    const alerts = compareWithBaseline(
      [muNow],
      { MU: 102 }, // +2% vs 100 — clear of the frozen-data deadband
      makeBaseline(muMorning, 100),
      makeConfig(), // minConfidenceToAlert: 80
    );
    assert.equal(alerts.length, 1, "82 >= 80 on the voter, so this must alert");
    assert.equal(alerts[0].triggerType, "action_upgrade");
  });

  // The gate must still bite. A ticker where nobody is confident stays silent —
  // this is the noise v1.8 was written to suppress, and lowering the threshold
  // instead of fixing the units would have reintroduced it.
  test("no STRONG BUY voter and weak consensus stays silent", () => {
    const weak = makeRec({
      ticker: "MU",
      action: "STRONG BUY", // consensus says SB, but no single provider is confident
      confidence: 66,
      providers: [
        score("gemini", "G", "BUY", 60),
        score("claude", "C", "BUY", 66),
        score("mistral", "M", "BUY", 72),
      ],
    });
    const alerts = compareWithBaseline(
      [weak],
      { MU: 102 },
      makeBaseline(makeRec({ ticker: "MU", action: "BUY", confidence: 60 }), 100),
      makeConfig(),
    );
    assert.equal(alerts.length, 0, "no voter >= 80 and consensus 66 < 80");
  });

  test("a STRONG BUY voter below the threshold is still gated", () => {
    const timid = makeRec({
      ticker: "MU",
      action: "BUY",
      confidence: 66,
      providers: [
        score("gemini", "G", "BUY", 60),
        score("claude", "C", "STRONG BUY", 74), // voted SB, but only 74% sure
        score("mistral", "M", "BUY", 64),
      ],
    });
    const alerts = compareWithBaseline(
      [timid],
      { MU: 102 },
      makeBaseline(muMorning, 100),
      makeConfig(),
    );
    assert.equal(alerts.length, 0, "74 < 80 — the gate must still apply to the voter");
  });

  test("highest-confidence voter wins when several vote STRONG BUY", () => {
    const two = makeRec({
      ticker: "MU",
      action: "STRONG BUY",
      confidence: 70,
      providers: [
        score("gemini", "G", "BUY", 40),
        score("claude", "C", "STRONG BUY", 76),
        score("mistral", "M", "STRONG BUY", 88),
      ],
    });
    const alerts = compareWithBaseline(
      [two],
      { MU: 102 },
      makeBaseline(muMorning, 100),
      makeConfig(),
    );
    assert.equal(alerts.length, 1, "88 is the gating figure, not 76 and not the 70 mean");
  });

  // Single-provider runs have no providers[] to inspect, so the gate falls back
  // to the consensus — which in that mode *is* the one model's own confidence.
  test("falls back to consensus confidence in single-provider mode", () => {
    const morning = makeRec({ action: "BUY", confidence: 64 });
    assert.equal(
      compareWithBaseline(
        [makeRec({ action: "STRONG BUY", confidence: 87 })],
        { VOO: 650.0 },
        makeBaseline(morning, 670.63),
        makeConfig(),
      ).length,
      1,
      "87 >= 80",
    );
    assert.equal(
      compareWithBaseline(
        [makeRec({ action: "STRONG BUY", confidence: 72 })],
        { VOO: 650.0 },
        makeBaseline(morning, 670.63),
        makeConfig(),
      ).length,
      0,
      "72 < 80 — unchanged from before",
    );
  });

  // A downgrade has always bypassed the gate: losing a STRONG BUY matters
  // regardless of how confident anyone is about what replaced it.
  test("downgrades still bypass the gate entirely", () => {
    const alerts = compareWithBaseline(
      [makeRec({ ticker: "MU", action: "HOLD", confidence: 20 })],
      { MU: 102 },
      makeBaseline(muNow, 100), // morning had Claude's STRONG BUY vote
      makeConfig(),
    );
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].triggerType, "action_downgrade");
  });
});
