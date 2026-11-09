import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { summarizeVotes } from "../src/analysisUrl.js";
import type { ProviderScore } from "../src/providers/types.js";

const vote = (providerLabel: string, action: string, confidence: number) =>
  ({ providerLabel, action, confidence }) as ProviderScore;

describe("summarizeVotes", () => {
  // MRVL, 2026-11-08: the page headlined Gemini's STRONG BUY 80 and hid Claude's BUY 32.
  test("lists every provider's vote", () => {
    assert.equal(
      summarizeVotes([
        vote("Gemini", "STRONG BUY", 80),
        vote("Claude", "BUY", 32),
        vote("Mistral", "STRONG BUY", 92),
      ]),
      "Gemini STRONG BUY 80 · Claude BUY 32 · Mistral STRONG BUY 92",
    );
  });

  test("nothing to summarise with fewer than two votes", () => {
    assert.equal(summarizeVotes(undefined), undefined);
    assert.equal(summarizeVotes([vote("Claude", "BUY", 60)]), undefined);
  });
});
