import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { normaliseEmail, inviteErrorResponse } from "../supabase/functions/send-invite/logic.js";

describe("normaliseEmail", () => {
  test("trims and lower-cases a valid address", () => {
    assert.equal(normaliseEmail("  Friend@Example.COM "), "friend@example.com");
  });
  test("rejects junk", () => {
    for (const bad of ["", "nope", "a@b", "a b@c.com", 42, null, undefined]) {
      assert.equal(normaliseEmail(bad), null, String(bad));
    }
  });
});

describe("inviteErrorResponse", () => {
  test("an existing account maps to 409 with a plain message", () => {
    for (const msg of [
      "A user with this email address has already been registered",
      "User already registered",
      "Email address already exists",
    ]) {
      const r = inviteErrorResponse(msg);
      assert.equal(r.status, 409, msg);
      assert.match(r.message, /already has an account/);
    }
  });
  test("anything else is a 502 that keeps the cause", () => {
    const r = inviteErrorResponse("SMTP connection refused");
    assert.equal(r.status, 502);
    assert.match(r.message, /SMTP connection refused/);
  });
});
