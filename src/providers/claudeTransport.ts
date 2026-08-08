// ── Claude credential transport selection ──────────────────────────
// Claude is ONE provider with TWO ways to authenticate. This stays a separate
// pure module (like detailedProvider.ts) so it can be unit-tested: claude.ts
// and detailedAnalysis.ts both import config.js transitively and therefore
// can't be imported without a config.json.

/**
 * "subscription" — Claude Agent SDK against the user's Pro/Max allocation via
 *   CLAUDE_CODE_OAUTH_TOKEN. No per-token cost.
 * "api-key" — @anthropic-ai/sdk against ANTHROPIC_API_KEY. Pay-per-use.
 */
export type ClaudeTransport = "subscription" | "api-key";

function present(value: string | undefined): boolean {
  return !!value && value.trim().length > 0;
}

/**
 * Resolve how to reach Claude, or null when it isn't configured at all
 * (the provider then reports `available === false` and the orchestrator
 * skips it, exactly as it does today with no ANTHROPIC_API_KEY).
 *
 * The subscription token wins when both are set. That ordering is deliberate
 * and the opposite of Claude Code's own resolution, where ANTHROPIC_API_KEY
 * outranks OAuth: a user who has set both has opted into the subscription, and
 * silently billing their API account instead is the failure this whole change
 * exists to prevent. Callers using the subscription transport must also strip
 * ANTHROPIC_API_KEY from the subprocess env — see claude.ts.
 */
export function resolveClaudeTransport(
  oauthToken: string | undefined,
  apiKey: string | undefined,
): ClaudeTransport | null {
  if (present(oauthToken)) return "subscription";
  if (present(apiKey)) return "api-key";
  return null;
}

// ── Structured payload extraction (Agent SDK result messages) ──────
// Live spike against the real Agent SDK found the final message carries the
// payload in BOTH places at once: `structured_output` (already parsed) and
// `result` (the same data serialised as a JSON string). Pure and shared by
// Tasks 2/3 so the two call sites (subscription transport in claude.ts,
// detailedAnalysis.ts) can't drift.

/**
 * Pull the structured payload out of an Agent SDK message, or null if it
 * isn't there. Deliberately does not inspect `message.type` — callers filter
 * for `type === "result"` themselves; this stays single-purpose.
 *
 * Never throws. A malformed `result` string is swallowed and reported as
 * null rather than as a parse error: callers raise their own error naming the
 * pipeline stage (e.g. "Claude subscription call returned no payload"),
 * which is far more actionable than a bare JSON.parse SyntaxError bubbling
 * up out of a helper the caller can't see into.
 */
export function extractStructuredPayload(message: unknown): unknown | null {
  if (typeof message !== "object" || message === null) return null;

  const { structured_output, result } = message as Record<string, unknown>;

  if (typeof structured_output === "object" && structured_output !== null) {
    return structured_output;
  }

  if (typeof result === "string") {
    try {
      return JSON.parse(result);
    } catch {
      return null;
    }
  }

  return null;
}
