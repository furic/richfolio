import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { defaultModelRank, resolveProviderRank, DEFAULT_RANK } from "../src/providers/modelRank.js";

describe("defaultModelRank", () => {
  test("the models this repo runs", () => {
    assert.equal(defaultModelRank("claude-opus-5-5"), 10);
    assert.equal(defaultModelRank("gemini-2.5-flash"), 6);
    assert.equal(defaultModelRank("ministral-14b-latest"), 4);
  });

  test("tiers within each family", () => {
    assert.equal(defaultModelRank("claude-sonnet-4-6"), 8);
    assert.equal(defaultModelRank("claude-haiku-4-5"), 5);
    assert.equal(defaultModelRank("gemini-2.5-pro"), 8);
    assert.equal(defaultModelRank("gemini-3.6-flash"), 6);
    assert.equal(defaultModelRank("gemini-2.5-flash-lite"), 4, "flash-lite is not flash");
    assert.equal(defaultModelRank("mistral-large-latest"), 7);
    assert.equal(defaultModelRank("ministral-8b-latest"), 3);
    assert.equal(defaultModelRank("ministral-3b-latest"), 2);
  });

  test("case-insensitive; unknown models get the neutral default", () => {
    assert.equal(defaultModelRank("Claude-Opus-5-5"), 10);
    assert.equal(defaultModelRank("gpt-9"), DEFAULT_RANK);
  });
});

describe("resolveProviderRank", () => {
  test("model default when no override", () => {
    assert.equal(resolveProviderRank("claude", "claude-opus-5-5"), 10);
    assert.equal(resolveProviderRank("claude", "claude-opus-5-5", { mistral: 2 }), 10);
  });

  test("a config override by provider id wins", () => {
    assert.equal(resolveProviderRank("mistral", "ministral-14b-latest", { mistral: 2 }), 2);
  });

  test("clamped to 1–10, and non-numeric overrides ignored", () => {
    assert.equal(resolveProviderRank("claude", "x", { claude: 50 }), 10);
    assert.equal(resolveProviderRank("claude", "x", { claude: 0 }), 1);
    assert.equal(
      resolveProviderRank("claude", "claude-opus-5-5", { claude: "9" as unknown as number }),
      10,
    );
  });
});
