import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  resolveClaudeTransport,
  extractStructuredPayload,
} from "../src/providers/claudeTransport.js";

describe("resolveClaudeTransport", () => {
  test("prefers the subscription token when both are set", () => {
    // OAuth must win: ANTHROPIC_API_KEY outranks it inside Claude Code, so if we
    // let the key win here a user with both set would silently burn API credits.
    assert.equal(resolveClaudeTransport("oat-abc", "sk-ant-xyz"), "subscription");
  });

  test("uses the subscription token when it is the only credential", () => {
    assert.equal(resolveClaudeTransport("oat-abc", undefined), "subscription");
  });

  test("falls back to the API key when there is no subscription token", () => {
    assert.equal(resolveClaudeTransport(undefined, "sk-ant-xyz"), "api-key");
  });

  test("returns null when neither credential is present", () => {
    assert.equal(resolveClaudeTransport(undefined, undefined), null);
  });

  test("treats empty strings as absent", () => {
    // `export ANTHROPIC_API_KEY=` in a shell, or an empty Actions secret, yields
    // "" — configured-looking but useless. Both must read as unset.
    assert.equal(resolveClaudeTransport("", ""), null);
    assert.equal(resolveClaudeTransport("", "sk-ant-xyz"), "api-key");
    assert.equal(resolveClaudeTransport("oat-abc", ""), "subscription");
  });

  test("treats whitespace-only values as absent", () => {
    assert.equal(resolveClaudeTransport("   ", "  "), null);
  });
});

describe("extractStructuredPayload", () => {
  test("returns structured_output as-is when present", () => {
    const payload = { action: "BUY", confidence: 80 };
    assert.deepEqual(extractStructuredPayload({ structured_output: payload }), payload);
  });

  test("parses result when it is a JSON string", () => {
    const payload = { action: "HOLD", confidence: 40 };
    assert.deepEqual(extractStructuredPayload({ result: JSON.stringify(payload) }), payload);
  });

  test("prefers structured_output when both are present", () => {
    const structured = { action: "STRONG BUY", confidence: 90 };
    const result = JSON.stringify({ action: "HOLD", confidence: 10 });
    assert.deepEqual(
      extractStructuredPayload({ structured_output: structured, result }),
      structured,
    );
  });

  test("returns null when neither field is present", () => {
    assert.equal(extractStructuredPayload({ type: "result" }), null);
  });

  test("returns null when result is malformed JSON", () => {
    assert.equal(extractStructuredPayload({ result: "{not json" }), null);
  });

  test("returns null for non-object input", () => {
    assert.equal(extractStructuredPayload(null), null);
    assert.equal(extractStructuredPayload(undefined), null);
    assert.equal(extractStructuredPayload("a string"), null);
    assert.equal(extractStructuredPayload(42), null);
  });

  test("returns null when structured_output is present but null", () => {
    const payload = { action: "BUY" };
    assert.deepEqual(
      extractStructuredPayload({ structured_output: null, result: JSON.stringify(payload) }),
      payload,
    );
  });

  test("returns null when structured_output is not an object (e.g. a string)", () => {
    const payload = { action: "SELL" };
    assert.deepEqual(
      extractStructuredPayload({
        structured_output: "not-an-object",
        result: JSON.stringify(payload),
      }),
      payload,
    );
  });
});
