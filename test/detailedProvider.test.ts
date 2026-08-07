import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  resolveDetailedProvider,
  isDetailedProviderId,
  DETAILED_PROVIDER_IDS,
} from "../src/providers/detailedProvider.js";

describe("resolveDetailedProvider — no override", () => {
  test("picks the first available provider in preference order", () => {
    assert.equal(resolveDetailedProvider(["gemini", "mistral"]), "gemini");
    assert.equal(resolveDetailedProvider(["mistral", "gemini"]), "mistral");
  });

  test("works with a single configured provider", () => {
    assert.equal(resolveDetailedProvider(["mistral"]), "mistral");
    assert.equal(resolveDetailedProvider(["claude"]), "claude");
  });

  test("returns null when nothing is configured", () => {
    assert.equal(resolveDetailedProvider([]), null);
  });

  test("ignores providers with no detailed call path", () => {
    // A provider can exist in the main registry without being able to generate
    // this page — it must not be selected just for being first.
    assert.equal(resolveDetailedProvider(["someFutureProvider"]), null);
    assert.equal(resolveDetailedProvider(["someFutureProvider", "mistral"]), "mistral");
  });
});

describe("resolveDetailedProvider — override honoured", () => {
  test("uses the pinned provider when it is configured", () => {
    assert.equal(resolveDetailedProvider(["gemini", "mistral"], "mistral"), "mistral");
  });

  test("is case-insensitive", () => {
    assert.equal(resolveDetailedProvider(["gemini", "mistral"], "MISTRAL"), "mistral");
  });

  test("does not log when the override is applied", () => {
    const logs: string[] = [];
    resolveDetailedProvider(["mistral"], "mistral", (r) => logs.push(r));
    assert.deepEqual(logs, []);
  });
});

// An override that silently doesn't apply is the same class of bug as a guard
// that silently doesn't run: it must fall back AND say so.
describe("resolveDetailedProvider — override ignored", () => {
  test("falls back when the pinned provider has no API key", () => {
    const logs: string[] = [];
    const picked = resolveDetailedProvider(["gemini"], "claude", (r) => logs.push(r));
    assert.equal(picked, "gemini", "must not pin a provider that would fail every ticker");
    assert.equal(logs.length, 1);
    assert.match(logs[0], /not configured/);
    assert.match(logs[0], /claude/);
  });

  test("falls back on an unknown provider name", () => {
    const logs: string[] = [];
    const picked = resolveDetailedProvider(["gemini"], "gpt-5", (r) => logs.push(r));
    assert.equal(picked, "gemini");
    assert.equal(logs.length, 1);
    assert.match(logs[0], /not a provider that can generate/);
  });

  test("returns null when the override is unconfigured and nothing else works", () => {
    const logs: string[] = [];
    assert.equal(
      resolveDetailedProvider([], "claude", (r) => logs.push(r)),
      null,
    );
    assert.equal(logs.length, 1);
  });

  test("an empty override string is treated as unset, not as invalid", () => {
    const logs: string[] = [];
    assert.equal(
      resolveDetailedProvider(["gemini"], "", (r) => logs.push(r)),
      "gemini",
    );
    assert.deepEqual(logs, [], "unset must not warn");
  });
});

describe("isDetailedProviderId", () => {
  test("accepts every id in the table", () => {
    for (const id of DETAILED_PROVIDER_IDS) assert.ok(isDetailedProviderId(id));
  });

  test("rejects non-providers and non-strings", () => {
    for (const v of ["gpt-4", "", null, undefined, 42, {}]) {
      assert.ok(!isDetailedProviderId(v), `${JSON.stringify(v)} must be rejected`);
    }
  });
});
