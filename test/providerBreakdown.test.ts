import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isMultiAI,
  formatCompactScores,
  formatDegradationLabel,
} from "../src/providerBreakdown.js";
import type { ProviderScore } from "../src/providers/types.js";

// ── Helpers ──────────────────────────────────────────────────────────
function provider(overrides: Partial<ProviderScore>): ProviderScore {
  return {
    providerId: "gemini",
    providerLabel: "Gemini",
    providerShortLabel: "G",
    action: "BUY",
    confidence: 70,
    reason: "test",
    suggestedBuyValue: 0,
    ...overrides,
  };
}

// ── isMultiAI ────────────────────────────────────────────────────────
describe("isMultiAI", () => {
  test("false when providers is undefined (single-provider mode)", () => {
    assert.equal(isMultiAI({ providers: undefined }), false);
  });

  test("false with exactly one provider", () => {
    assert.equal(isMultiAI({ providers: [provider({})] }), false);
  });

  test("true with two providers", () => {
    assert.equal(
      isMultiAI({
        providers: [provider({ providerShortLabel: "G" }), provider({ providerShortLabel: "C" })],
      }),
      true,
    );
  });

  test("true with three providers", () => {
    assert.equal(
      isMultiAI({
        providers: [
          provider({ providerShortLabel: "G" }),
          provider({ providerShortLabel: "C" }),
          provider({ providerShortLabel: "M" }),
        ],
      }),
      true,
    );
  });
});

// ── formatCompactScores ────────────────────────────────────────────────
describe("formatCompactScores", () => {
  test("null when not multi-AI (providers undefined)", () => {
    assert.equal(formatCompactScores({ providers: undefined }), null);
  });

  test("null with a single provider", () => {
    assert.equal(formatCompactScores({ providers: [provider({ confidence: 83 })] }), null);
  });

  test("formats two providers with the exact separator", () => {
    const result = formatCompactScores({
      providers: [
        provider({ providerShortLabel: "G", confidence: 83 }),
        provider({ providerShortLabel: "C", confidence: 80 }),
      ],
    });
    assert.equal(result, "G 83 · C 80");
  });

  test("formats three providers with the exact separator", () => {
    const result = formatCompactScores({
      providers: [
        provider({ providerShortLabel: "G", confidence: 83 }),
        provider({ providerShortLabel: "C", confidence: 80 }),
        provider({ providerShortLabel: "M", confidence: 83 }),
      ],
    });
    assert.equal(result, "G 83 · C 80 · M 83");
  });
});

// ── formatDegradationLabel ───────────────────────────────────────────
describe("formatDegradationLabel", () => {
  test("null when degradation is undefined", () => {
    assert.equal(formatDegradationLabel(undefined), null);
  });

  test("formats the degraded shape from the spec", () => {
    assert.equal(
      formatDegradationLabel({ configured: 3, answered: 2, missing: ["claude"] }),
      "2/3 AI",
    );
  });

  test("formats a 1/2 degraded run", () => {
    assert.equal(
      formatDegradationLabel({ configured: 2, answered: 1, missing: ["mistral"] }),
      "1/2 AI",
    );
  });
});
