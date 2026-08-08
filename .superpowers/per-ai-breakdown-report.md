# Per-AI breakdown in intraday + refresh — implementation report

Spec: `specs/2026-08-08-per-ai-breakdown-in-intraday-refresh-design.md`, superseded by the
three design revisions given in the task (extract logic not markup; plumb data onto
`IntradayAlert`; compact form only).

## Files changed

- **`src/providerBreakdown.ts`** (new, pure) — `isMultiAI`, `formatCompactScores`,
  `formatDegradationLabel`. Imports only `import type { AIBuyRecommendation } from
  "./providers/types.js"` (type-only, erased at compile time) so it stays out of the
  `config.js`-throws-without-config.json import graph and is unit-testable.
- **`test/providerBreakdown.test.ts`** (new) — 11 tests: single/two/three-provider
  `isMultiAI`, null-vs-formatted `formatCompactScores` including the exact `"G 83 · C 80"` /
  `"G 83 · C 80 · M 83"` separator, and `formatDegradationLabel` including the spec's
  `{configured:3, answered:2, missing:["claude"]}` → `"2/3 AI"` case plus a 1/2 case.
- **`src/intradayCompare.ts`** — added optional `providers` / `agreement` / `degradation`
  fields to `IntradayAlert`, populated in `compareWithBaseline`'s `alerts.push({...})` from
  the current `rec` being compared (the analysis itself was never degraded on this surface —
  only the rendering was blind to it).
- **`test/intradayCompare.test.ts`** — 2 new tests: fields pass through unchanged from the
  current rec (multi-provider case with a degraded run), and are `undefined` in
  single-provider mode.
- **`src/intradayEmail.ts`** — added `agreementBadgeHtml`, `degradedBadgeHtml`,
  `compactScoresHtml` (copied styling idiom from `email.ts`'s `agreementBadge`/
  `degradedBadge`, using this file's own `S` palette). Wired into the alert block in
  `buildIntradayEmailHtml` (badges next to the action badge, compact score line above the
  price-delta row) and into `sendRefreshEmail`'s content block (badges next to the action
  badge, compact score line under confidence).
- **`src/telegram.ts`** — imported the three pure helpers. In `buildIntradayMessage`, added
  `agreementTag`/`degradedTag` to each alert's header line (mirroring the daily builder's
  `agreementTag`/`degradedTag` at lines ~110–115) and a compact-scores line beneath the
  morning→current line. In `sendRefreshTelegram`, same treatment on the action line plus a
  compact-scores line.

## Judgment calls

- **Truncation ordering, not a special case.** Telegram's existing `clampToLimit` drops
  whole trailing lines. I put the degradation/agreement tags on each alert's *first* line
  and the compact scores on a *later* line, so if a message ever needs truncating, the
  scores line is dropped before the badge — satisfying "keep the badge, drop the scores"
  without adding new truncation logic. `sendRefreshTelegram` doesn't call `clampToLimit` at
  all (pre-existing; single-ticker messages are far under 4096 chars, so left unchanged).
- **Did not migrate the daily renderers** onto the new module (spec's §2). The task's
  revision only asked for extraction + intraday/refresh wiring, and daily already works;
  touching it would need the daily-output regression diff the original spec called for,
  which was out of scope here.
- **`Pick<AIBuyRecommendation, "providers">`** parameter type on `isMultiAI`/
  `formatCompactScores` (rather than the full type) so both `AIBuyRecommendation` and
  `IntradayAlert` satisfy it structurally without a cast.

## Verification

`npm run format:check && npm run typecheck && npm test` — all green. 171 tests total
(13 new: 11 in `providerBreakdown.test.ts`, 2 in `intradayCompare.test.ts`), 0 failures.
No live AI API calls were made.
