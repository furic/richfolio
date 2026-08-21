// Pure per-AI breakdown logic shared by every surface that shows multi-provider
// recommendations (daily email/Telegram today; intraday + refresh via this
// module). Deliberately markup-free: the daily email (inline-styled HTML) and
// daily Telegram (Telegram HTML) are genuinely different formats, not
// duplication — what WAS duplicated is the branching logic below, so that's
// what gets extracted. Each surface wraps these primitives in its own styling.
//
// Must import no config: config.js reads a gitignored config.json at import
// time and throws when it's absent, and CI runs without one. Only `import
// type` from providers/types.js — erased at compile time, so it never pulls
// analyze.js/config.js into the runtime import graph.
import type { AIBuyRecommendation } from "./providers/types.js";

type Degradation = NonNullable<AIBuyRecommendation["degradation"]>;

// ── Multi-AI detection ────────────────────────────────────────────────
// Mirrors the isMultiAI() check duplicated today in email.ts and telegram.ts.
export function isMultiAI(rec: Pick<AIBuyRecommendation, "providers">): boolean {
  return !!rec.providers && rec.providers.length >= 2;
}

// ── Compact per-provider score line ────────────────────────────────────
// e.g. "G WAIT 15% · C HOLD 58% · M STRONG BUY 85%". Returns null when the rec
// isn't multi-AI (a single-provider rec has nothing to break down) so callers
// can render nothing rather than a degenerate one-entry line.
//
// The action is not optional. This line used to read "C 43 · M 82", which is
// unreadable: 43% of *what*? A provider at 43% could be a lukewarm BUY or a
// confident WAIT, and those are opposite messages. The confidence figure only
// carries meaning once you know which action it qualifies — and on the surfaces
// this renders (intraday alert, refresh) the per-provider action appears nowhere
// else, so omitting it loses the information entirely rather than merely
// abbreviating it.
//
// Spelled out rather than abbreviated on purpose. "SB" vs "B" is one glyph apart
// in 11px grey text, and confusing STRONG BUY for BUY is the single most
// consequential misread available here.
export function formatCompactScores(rec: Pick<AIBuyRecommendation, "providers">): string | null {
  if (!isMultiAI(rec)) return null;
  return rec
    .providers!.map((p) => `${p.providerShortLabel} ${p.action} ${p.confidence}%`)
    .join(" · ");
}

// ── Degradation badge label ─────────────────────────────────────────────
// e.g. "2/3 AI" from {answered: 2, configured: 3, missing: ["claude"]}. Null
// when the run wasn't degraded (or degradation is absent entirely) — this is
// the load-bearing safety signal: a capped STRONG BUY→BUY looks identical to
// a genuine BUY on any surface that omits it.
export function formatDegradationLabel(degradation: Degradation | undefined): string | null {
  if (!degradation) return null;
  return `${degradation.answered}/${degradation.configured} AI`;
}
