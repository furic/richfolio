# Design: Show per-AI scores and the degradation badge in intraday + refresh

**Date:** 2026-08-08
**Status:** Designed — not yet implemented

**Origin:** Found while verifying the Claude subscription-auth branch
(`specs/2026-08-08-claude-subscription-auth-design.md`). A refresh email for SMH showed a
single `HOLD 41%` with no indication of which models produced it.

## Problem

All four run modes that invoke AI share one pipeline: daily, intraday, and refresh all
call `runAIAnalysis`, so they run every configured provider, aggregate identically, and
apply the same guards. The *analysis* is not degraded in intraday or refresh.

The **rendering** diverges. Counting references to `providers` / `agreement` /
`degradation`:

| Renderer | Used by | Per-AI info |
|---|---|---|
| `src/email.ts` | daily | 15 refs — full breakdown |
| `src/telegram.ts` (lines 95–210) | daily builder only | full breakdown |
| `src/intradayEmail.ts` | **intraday + refresh** | **none** |
| `src/telegram.ts` `sendIntradayTelegram` / `sendRefreshTelegram` | intraday + refresh | **none** |

Two consequences, of different severity:

1. **Missing per-AI scores** (cosmetic). You can't see that a 41% HOLD was, say, Claude at
   35% and Mistral at 47%. The daily brief shows this; intraday and refresh don't.

2. **Missing `⚠ n/n AI` degradation badge** (safety-relevant). When a provider fails
   mid-run, `applyDegradedProviderPolicy` caps STRONG BUY at BUY specifically so a lone
   model's verdict doesn't reach the reader looking cross-checked, and renders a badge
   saying so. **The cap still applies correctly** in intraday and refresh — it lives in
   the aggregation layer, not the renderer — so the recommendation itself is sound. But
   the badge is invisible, so a capped BUY and a genuine BUY are indistinguishable.

The second matters most exactly where it's missing: intraday alerts fire on STRONG BUY
*changes*, and degraded runs are not rare — Gemini's free tier enforces 20 requests/day
for `gemini-2.5-flash` (not the 250/day the docs claim), against a baseline of 12
stage-calls/day plus the news filter.

## Scope

**In scope:** per-provider scores and the degradation badge in the intraday/refresh email
(`intradayEmail.ts`) and the intraday/refresh Telegram builders.

**Out of scope:** any change to analysis, aggregation, guards, or the daily renderers'
output. This is presentation only.

## Design

### 1. Extract a pure renderer, don't triplicate

The daily surfaces already build this markup; copying it into the intraday surfaces would
make three near-identical copies of the same branching (`isMulti`, `agreementTag`,
`degradedTag`, the per-provider map).

`intradayEmail.ts` imports `config.js`, which reads a gitignored `config.json` at import
time and **throws** when absent — and CI runs without one. So the renderers themselves
can't be unit-tested, exactly as with `claude.ts` and `detailedAnalysis.ts`.

Both problems have one answer, and the codebase already uses this split
(`socialContent.ts` pure / `social.ts` credentialled; `allocation.ts` pure /
`analyze.ts` config-injecting): put the breakdown formatting in a new **pure** module —
say `src/providerBreakdown.ts` — that imports no config and takes an
`AIBuyRecommendation`, returning the pieces each surface needs:

- an HTML fragment for the email surfaces
- a plain/HTML-escaped line for Telegram
- the degradation badge separately, so a surface can show the badge without the full
  breakdown

Then `test/providerBreakdown.test.ts` can pin the behaviour that actually matters:
single-provider (no breakdown, no badge), multi-provider unanimous, split, and degraded
(`{configured: 3, answered: 2, missing: ["claude"]}` → `⚠ 2/3 AI`).

### 2. Migrate the daily surfaces too — but prove no output change

Leaving the daily renderers on their own copy defeats the point. Migrate them to the
shared module, but treat any change to daily output as a regression: capture the current
rendered HTML for a representative rec set before the change and diff it after. The daily
brief works today; this refactor must be invisible to it.

### 3. Respect Telegram's ceiling

Telegram caps a message at 4,096 characters and the daily brief already truncates news to
fit. Intraday alerts are short, but a degraded multi-provider run adds a tag plus a
per-provider line per ticker. The badge is the load-bearing part — if a message would
overflow, drop the per-provider detail and keep the badge.

## Open question for implementation

How much detail belongs in an intraday alert? The daily brief is a full read; an intraday
alert is a terse "this changed" ping. Options: full parity with daily, or the badge plus a
compact `C 38 · M 47` style score line. The user has asked for scores to be present; the
compact form is the recommended default, with full parity as a fallback if the compact
form reads badly in practice.

## Testing

- `test/providerBreakdown.test.ts` — pure unit tests, no `config.js` in the import graph
  (the constraint that makes this module necessary in the first place).
- Daily-output regression diff, per §2.
- Live check on a genuinely degraded run: the easiest way to force one is to run while
  Gemini's daily quota is exhausted, which currently happens readily.
- Gate: `npm run format:check && npm run typecheck && npm test`.
