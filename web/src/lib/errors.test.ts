import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { friendlyError } from "./errors";
import { isValidTimeZone } from "./timeZone";

const INVITE = "Richfolio is invite-only — ask Richard for an invite.";

describe("friendlyError", () => {
  test("network failures", () => {
    const msg = "Can't reach Richfolio right now. Check your connection and try again.";
    assert.equal(friendlyError(new TypeError("Failed to fetch")), msg);
    assert.equal(friendlyError(new Error("NetworkError when attempting to fetch resource.")), msg);
    assert.equal(friendlyError(new Error("TypeError: Failed to fetch")), msg);
  });
  test("rate limiting", () => {
    const msg = "Too many attempts. Wait a minute and try again.";
    assert.equal(friendlyError(Object.assign(new Error("x"), { status: 429 })), msg);
    assert.equal(friendlyError(new Error("email rate limit exceeded")), msg);
  });
  test("check violation", () => {
    const err = Object.assign(new Error("new row violates check constraint"), { code: "23514" });
    assert.equal(friendlyError(err), "One of those values isn't allowed. Check it and try again.");
  });
  test("invite-only message passes through", () => {
    assert.equal(friendlyError(new Error(INVITE)), INVITE);
  });
  test("everything else is generic", () => {
    const orig = console.error;
    console.error = () => {};
    try {
      assert.equal(
        friendlyError(new Error("duplicate key value")),
        "Something went wrong. Try again.",
      );
      assert.equal(friendlyError("boom"), "Something went wrong. Try again.");
    } finally {
      console.error = orig;
    }
  });
});

describe("isValidTimeZone", () => {
  test("accepts real zones and aliases", () => {
    for (const z of ["Australia/Sydney", "UTC", "Etc/UTC"])
      assert.equal(isValidTimeZone(z), true, z);
  });
  test("rejects unknown zones", () => {
    assert.equal(isValidTimeZone("Mars/Base"), false);
    assert.equal(isValidTimeZone(""), false);
  });
});
