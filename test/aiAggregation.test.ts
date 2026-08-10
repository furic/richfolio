import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateMultiAI,
  applyDegradedProviderPolicy,
  hasStrongBuyVote,
  type ProviderDegradation,
  type ProviderRun,
} from "../src/aiAggregation.js";
import type { AIBuyRecommendation, AIProvider } from "../src/providers/types.js";

// ── Helpers ──────────────────────────────────────────────────────────

function makeRec(overrides?: Partial<AIBuyRecommendation>): AIBuyRecommendation {
  return {
    ticker: "MSFT",
    tickerFullName: "Microsoft Corporation",
    originalCurrency: "USD",
    action: "STRONG BUY",
    confidence: 91,
    reason: "Exceptional confluence of oversold signals at multi-year lows.",
    suggestedBuyValue: 0,
    ...overrides,
  } as AIBuyRecommendation;
}

const degraded = (overrides?: Partial<ProviderDegradation>): ProviderDegradation => ({
  configured: 2,
  answered: 1,
  missing: ["Google Gemini"],
  ...overrides,
});

// When a provider fails mid-run, the survivor's recs hit
// computeConsensusAction's `scores.length === 1` short-circuit, so no
// cross-provider check happens at all. That is how MSFT reached the 2026-06-23
// brief as a 91% STRONG BUY on Claude's vote alone, with Gemini quota-exhausted
// and nothing in the output saying so.
//
// The fix is the marking, which is unconditional. Capping the action on top of
// it is opt-in (`capStrongBuy`, default false): a provider that never answered
// is not a dissenter, so absence alone no longer demotes the survivor's call.
describe("applyDegradedProviderPolicy", () => {
  test("marks but does NOT cap by default — absence is not dissent", () => {
    const recs = [makeRec()];
    applyDegradedProviderPolicy(recs, degraded());
    assert.equal(recs[0].action, "STRONG BUY", "default must leave the survivor's action");
    assert.ok(recs[0].degradation, "but the run is still visibly degraded");
    assert.ok(!recs[0].reason.includes("capped at BUY"));
  });

  test("caps STRONG BUY at BUY in strict mode", () => {
    const recs = [makeRec()];
    applyDegradedProviderPolicy(recs, degraded(), true);
    assert.equal(recs[0].action, "BUY", "opt-in strict mode still demotes");
  });

  test("records the degradation on every rec so renderers can show it", () => {
    const recs = [makeRec(), makeRec({ ticker: "VOO", action: "BUY", confidence: 64 })];
    applyDegradedProviderPolicy(recs, degraded());
    for (const rec of recs) {
      assert.deepEqual(rec.degradation, { configured: 2, answered: 1, missing: ["Google Gemini"] });
    }
  });

  test("annotates the reason so the text matches the downgraded action", () => {
    const recs = [makeRec()];
    applyDegradedProviderPolicy(recs, degraded(), true);
    assert.match(recs[0].reason, /capped at BUY/);
    assert.match(recs[0].reason, /Google Gemini did not respond/);
    assert.match(recs[0].reason, /Exceptional confluence/, "original reasoning is preserved");
  });

  test("leaves non-STRONG-BUY actions alone apart from the marker", () => {
    const recs = [makeRec({ action: "BUY", confidence: 70 })];
    applyDegradedProviderPolicy(recs, degraded());
    assert.equal(recs[0].action, "BUY");
    assert.ok(!recs[0].reason.includes("capped at BUY"), "no cap annotation on an uncapped rec");
    assert.ok(recs[0].degradation, "still marked as a degraded run");
  });

  // The critical negative case: a deliberate one-key setup never promised
  // unanimity, so it is not degraded and must behave exactly as before.
  test("does NOT touch a deliberate single-provider setup", () => {
    const recs = [makeRec()];
    applyDegradedProviderPolicy(recs, { configured: 1, answered: 1, missing: [] });
    assert.equal(recs[0].action, "STRONG BUY", "one configured provider is not a degraded run");
    assert.equal(recs[0].degradation, undefined);
  });

  test("does NOT touch a healthy multi-provider run", () => {
    const recs = [makeRec()];
    applyDegradedProviderPolicy(recs, { configured: 2, answered: 2, missing: [] });
    assert.equal(recs[0].action, "STRONG BUY");
    assert.equal(recs[0].degradation, undefined);
  });

  test("handles 3 configured / 2 answered — aggregated but still degraded", () => {
    const recs = [makeRec()];
    applyDegradedProviderPolicy(recs, { configured: 3, answered: 2, missing: ["Claude"] }, true);
    assert.equal(recs[0].action, "BUY");
    assert.equal(recs[0].degradation?.answered, 2);
  });

  test("names every missing provider in the annotation", () => {
    const recs = [makeRec()];
    applyDegradedProviderPolicy(
      recs,
      { configured: 3, answered: 1, missing: ["Google Gemini", "Claude"] },
      true,
    );
    assert.match(recs[0].reason, /Google Gemini, Claude did not respond/);
  });
});

// ── Dissent-distance consensus ───────────────────────────────────────
// STRONG BUY no longer needs unanimity. It survives while every dissenter is
// one rung away (a dissenting BUY agrees about direction) and caps at BUY once
// one is further out (HOLD/WAIT is real disagreement). The aggregated action is
// a summary — providers[] carries every vote so the reader can overrule it.
const provider = (id: string, shortLabel: string): AIProvider =>
  ({ id, label: id, shortLabel, available: true }) as AIProvider;

function run(id: string, short: string, action: string, confidence: number): ProviderRun {
  return {
    provider: provider(id, short),
    recommendations: [makeRec({ action, confidence })],
  };
}

describe("aggregateMultiAI — dissent distance", () => {
  test("unanimous STRONG BUY stays STRONG BUY", () => {
    const [rec] = aggregateMultiAI([
      run("gemini", "G", "STRONG BUY", 80),
      run("claude", "C", "STRONG BUY", 80),
      run("mistral", "M", "STRONG BUY", 85),
    ]);
    assert.equal(rec.action, "STRONG BUY");
    assert.equal(rec.agreement, "unanimous");
    assert.equal(rec.confidence, 82, "confidence averages across providers");
  });

  test("SB + SB + BUY survives — a dissenting BUY is one rung away", () => {
    const [rec] = aggregateMultiAI([
      run("gemini", "G", "STRONG BUY", 85),
      run("claude", "C", "STRONG BUY", 82),
      run("mistral", "M", "BUY", 70),
    ]);
    assert.equal(rec.action, "STRONG BUY", "direction agreed, only degree differed");
    assert.equal(rec.agreement, "majority");
  });

  test("SB + SB + HOLD caps at BUY — that is real disagreement", () => {
    const [rec] = aggregateMultiAI([
      run("gemini", "G", "STRONG BUY", 85),
      run("claude", "C", "STRONG BUY", 82),
      run("mistral", "M", "HOLD", 40),
    ]);
    assert.equal(rec.action, "BUY");
  });

  test("SB + SB + WAIT caps at BUY too", () => {
    const [rec] = aggregateMultiAI([
      run("gemini", "G", "STRONG BUY", 85),
      run("claude", "C", "STRONG BUY", 82),
      run("mistral", "M", "WAIT", 30),
    ]);
    assert.equal(rec.action, "BUY");
  });

  // The whole point of relaxing the cap: the votes stay visible, so a capped
  // rec still shows the STRONG BUYs that disagreed with the cap — and still
  // earns its detailed-analysis page.
  test("a capped rec keeps every vote and still qualifies for detailed analysis", () => {
    const [rec] = aggregateMultiAI([
      run("gemini", "G", "STRONG BUY", 85),
      run("claude", "C", "STRONG BUY", 82),
      run("mistral", "M", "HOLD", 40),
    ]);
    assert.equal(rec.action, "BUY");
    assert.deepEqual(
      rec.providers?.map((p) => p.action),
      ["STRONG BUY", "STRONG BUY", "HOLD"],
    );
    assert.ok(hasStrongBuyVote(rec), "one provider voted STRONG BUY, so the page still generates");
  });

  test("strict mode restores the old hard cap on any dissent", () => {
    const runs = [
      run("gemini", "G", "STRONG BUY", 85),
      run("claude", "C", "STRONG BUY", 82),
      run("mistral", "M", "BUY", 70),
    ];
    assert.equal(aggregateMultiAI(runs, false)[0].action, "STRONG BUY");
    assert.equal(aggregateMultiAI(runs, true)[0].action, "BUY");
  });

  test("an unrecognised action counts as far dissent, never as agreement", () => {
    const [rec] = aggregateMultiAI([
      run("gemini", "G", "STRONG BUY", 85),
      run("claude", "C", "STRONG BUY", 82),
      run("mistral", "M", "SELL", 20),
    ]);
    assert.equal(rec.action, "BUY");
  });

  test("single-provider run passes straight through", () => {
    const recs = aggregateMultiAI([run("claude", "C", "STRONG BUY", 91)]);
    assert.equal(recs[0].action, "STRONG BUY");
    assert.equal(recs[0].providers, undefined, "no breakdown to show with one provider");
  });
});
