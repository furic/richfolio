import { test } from "node:test";
import assert from "node:assert/strict";
import { runLimited } from "./runLimited";

test("runLimited never exceeds the limit and completes every item", async () => {
  let active = 0;
  let peak = 0;
  const done: number[] = [];
  await runLimited([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4, async (n) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
    done.push(n);
  });
  assert.equal(peak, 4);
  assert.equal(done.length, 10);
});

test("runLimited handles empty input and keeps going past a failing item", async () => {
  await runLimited([], 4, async () => {});
  const seen: number[] = [];
  await runLimited([1, 2, 3], 2, async (n) => {
    seen.push(n);
    if (n === 1) throw new Error("boom");
  });
  assert.deepEqual(seen.sort(), [1, 2, 3]);
});
