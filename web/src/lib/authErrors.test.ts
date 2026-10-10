import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { authErrorFromUrl } from "./authErrors";

const INVITE = "Richfolio is invite-only — ask Richard for an invite.";

describe("authErrorFromUrl", () => {
  test("no error params → null", () => {
    assert.equal(authErrorFromUrl("https://x.dev/login"), null);
    assert.equal(authErrorFromUrl("https://x.dev/portfolio?code=abc"), null);
  });
  test("hook rejection in the query string (PKCE redirect)", () => {
    const href = `https://x.dev/login?error=access_denied&error_description=${encodeURIComponent(INVITE)}`;
    assert.equal(authErrorFromUrl(href), INVITE);
  });
  test("hook rejection in the hash", () => {
    const href = `https://x.dev/login#error=access_denied&error_description=${encodeURIComponent(INVITE)}`;
    assert.equal(authErrorFromUrl(href), INVITE);
  });
  test("expired magic link gets the plain message", () => {
    const href =
      "https://x.dev/login#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired";
    assert.equal(authErrorFromUrl(href), "That link expired — send a new one.");
  });
  test("arbitrary provider descriptions are not shown", () => {
    const href =
      "https://x.dev/login?error=server_error&error_description=Unable+to+exchange+external+code";
    assert.equal(authErrorFromUrl(href), "Sign-in failed — try again.");
  });
  test("bare error with no description gets a generic message", () => {
    assert.equal(
      authErrorFromUrl("https://x.dev/login?error=server_error"),
      "Sign-in failed — try again.",
    );
  });
});
