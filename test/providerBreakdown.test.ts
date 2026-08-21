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
        provider({ providerShortLabel: "G", action: "STRONG BUY", confidence: 83 }),
        provider({ providerShortLabel: "C", action: "BUY", confidence: 80 }),
      ],
    });
    assert.equal(result, "G STRONG BUY 83% · C BUY 80%");
  });

  test("formats three providers with the exact separator", () => {
    const result = formatCompactScores({
      providers: [
        provider({ providerShortLabel: "G", action: "WAIT", confidence: 15 }),
        provider({ providerShortLabel: "C", action: "HOLD", confidence: 58 }),
        provider({ providerShortLabel: "M", action: "STRONG BUY", confidence: 85 }),
      ],
    });
    assert.equal(result, "G WAIT 15% · C HOLD 58% · M STRONG BUY 85%");
  });

  // The line this replaced read "C 43 · M 82", which cannot be interpreted: 43%
  // could be a lukewarm BUY or a confident WAIT, and those say opposite things.
  // Every entry must name its action.
  test("every entry carries an action, never a bare number", () => {
    // Real alert, 2026-08-21: ITA upgraded to STRONG BUY on C 43 / M 82.
    const result = formatCompactScores({
      providers: [
        provider({ providerShortLabel: "C", action: "BUY", confidence: 43 }),
        provider({ providerShortLabel: "M", action: "STRONG BUY", confidence: 82 }),
      ],
    })!;
    assert.equal(result, "C BUY 43% · M STRONG BUY 82%");
    for (const entry of result.split(" · ")) {
      assert.match(entry, /^[A-Z] (STRONG BUY|BUY|HOLD|WAIT) \d+%$/, `bare score: "${entry}"`);
    }
  });

  // Abbreviating STRONG BUY to "SB" would put it one glyph from "B" in small
  // grey text, and that is the most consequential misread on this surface.
  test("STRONG BUY is spelled out, not abbreviated", () => {
    const result = formatCompactScores({
      providers: [
        provider({ providerShortLabel: "C", action: "STRONG BUY", confidence: 81 }),
        provider({ providerShortLabel: "M", action: "BUY", confidence: 76 }),
      ],
    })!;
    assert.ok(result.includes("STRONG BUY"), "must not collapse to SB");
    assert.ok(!/\bSB\b/.test(result));
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
