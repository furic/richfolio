import { test } from "node:test";
import assert from "node:assert/strict";
import { targetTotal, totalState } from "./targets";

test("targetTotal sums to 2dp without float noise", () => {
  assert.equal(
    targetTotal([{ target_pct: 33.33 }, { target_pct: 33.33 }, { target_pct: 33.34 }]),
    100,
  );
  assert.equal(targetTotal([{ target_pct: 0.1 }, { target_pct: 0.2 }]), 0.3);
  assert.equal(targetTotal([]), 0);
});

test("totalState", () => {
  assert.equal(totalState(99.99), "under");
  assert.equal(totalState(100), "exact");
  assert.equal(totalState(100.01), "over");
});
