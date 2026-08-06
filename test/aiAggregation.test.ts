import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { applyDegradedProviderPolicy, type ProviderDegradation } from "../src/aiAggregation.js";
import type { AIBuyRecommendation } from "../src/providers/types.js";

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

// A STRONG BUY is supposed to clear the unanimity rule — every configured
// provider voting STRONG BUY independently. When a provider fails mid-run, the
// survivor's recs hit computeConsensusAction's `scores.length === 1`
// short-circuit and skip that check entirely, while rendering identically to a
// verified consensus. That is how MSFT reached the 2026-06-23 brief as a 91%
// STRONG BUY on Claude's vote alone, with Gemini quota-exhausted and nothing in
// the output saying so.
describe("applyDegradedProviderPolicy", () => {
  test("caps STRONG BUY at BUY when a configured provider did not answer", () => {
    const recs = [makeRec()];
    applyDegradedProviderPolicy(recs, degraded());
    assert.equal(recs[0].action, "BUY", "unverified agreement must not stay STRONG BUY");
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
    applyDegradedProviderPolicy(recs, degraded());
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

  test("marks but does not cap when capStrongBuy is false", () => {
    const recs = [makeRec()];
    applyDegradedProviderPolicy(recs, degraded(), false);
    assert.equal(recs[0].action, "STRONG BUY", "opt-out keeps the survivor's action");
    assert.ok(recs[0].degradation, "but the run is still visibly degraded");
    assert.ok(!recs[0].reason.includes("capped at BUY"));
  });

  test("handles 3 configured / 2 answered — aggregated but still degraded", () => {
    const recs = [makeRec()];
    applyDegradedProviderPolicy(recs, { configured: 3, answered: 2, missing: ["Claude"] });
    assert.equal(recs[0].action, "BUY");
    assert.equal(recs[0].degradation?.answered, 2);
  });

  test("names every missing provider in the annotation", () => {
    const recs = [makeRec()];
    applyDegradedProviderPolicy(recs, {
      configured: 3,
      answered: 1,
      missing: ["Google Gemini", "Claude"],
    });
    assert.match(recs[0].reason, /Google Gemini, Claude did not respond/);
  });
});
