# Design: Run Claude on the Pro subscription instead of API credits

**Date:** 2026-08-08
**Status:** Implemented (2026-08-08, v1.11.0)

**Implementation notes — five corrections to this design:**

1. **The `!` crash mechanism described in §5 was wrong.** A non-null assertion is erased
   at compile time and never throws at runtime. The real failure under subscription auth
   is constructing `new Anthropic({ apiKey: undefined })` and the SDK erroring on a
   missing key. The conclusion stands — the transport split was needed — but the stated
   mechanism was inaccurate.
2. **The subscription transport is markedly slower.** The Agent SDK spawns a Claude Code
   subprocess per stage, so a full run takes >10 minutes rather than 1–2. Immaterial for
   the Actions cron (6h job limit), but it makes `npm run refresh` a poor interactive
   loop — and it means the spec's proposed verification step is slow enough that it has
   to be run detached.
3. **The model must be pinned explicitly on the subscription path.** Left unset, the
   Agent SDK inherits an ambient Opus-tier model rather than defaulting to Sonnet as the
   API-key path does. Both paths now pass `CLAUDE_MODEL || DEFAULT_MODEL` unconditionally.
   Caught by the Task 0 spike; had it shipped, it would have drained the Pro allocation
   this change exists to conserve.
4. **`settingSources` must be pinned to `[]`.** The design's §3 treated stripping
   `ANTHROPIC_API_KEY` from the child env as sufficient to protect the headline safety
   property. It is not. Left unset, the Agent SDK loads *all* setting sources, and a
   `Settings.env` block in any `settings.json` is applied **after** our strip — silently
   re-injecting the API key and billing the API account. Separately, this repo's tracked
   `.claude/settings.json` and `CLAUDE.md` were being injected into all 12 stage prompts a
   day in CI: prompt contamination plus wasted allocation. Found by the final whole-branch
   review, not by any test.
5. **The Agent SDK enforces its own 32,000 output-token ceiling**, independent of the
   api-key path's `max_tokens`. A real 21-ticker daily Stage 2 exceeded it, Claude threw,
   and the brief degraded to two providers. Both subscription call sites now set
   `CLAUDE_CODE_MAX_OUTPUT_TOKENS` (64000, operator-overridable). Note the asymmetry this
   exposes: the api-key path completes identical work inside 16384 tokens, so the
   subscription transport emits substantially more output for the same input — the
   allocation cost is higher than the token math suggests. Found only by running a full
   daily brief; every smaller mode passed.

## Problem

The Anthropic API quota is exhausted and the user does not want to add credit. Richfolio
is not broken by this — Claude is one of three optional providers, and Gemini (250
req/day free) plus Mistral (free Experiment tier) keep every run working. But losing
Claude drops the multi-AI consensus from three votes to two, which weakens the STRONG BUY
unanimity rule that `computeConsensusAction` depends on.

The user holds a Claude Pro subscription. `claude setup-token` (Pro/Max only) mints a
long-lived `CLAUDE_CODE_OAUTH_TOKEN` that authenticates against the **subscription
allocation instead of API credits** — the documented mechanism behind claude-code-action
for Pro/Max users. Richfolio can use that as a transport for the existing Claude
provider, at no marginal cost, across all six AI-consuming runs per day (1 daily + 5
intraday; weekly uses no AI provider).

## Scope

**In scope (this spec):** Claude rejoins the Actions-scheduled consensus via subscription
auth. No change to scheduling, config, state, delivery, or the other two providers.

**Out of scope:** a second, independent Cowork-generated brief. That was evaluated
alongside this and deferred as its own sub-project — see *Rejected alternatives* below.

## Approaches considered

1. **Subscription-auth transport inside the existing Claude provider** (chosen). Smallest
   change; preserves all six irregular cron times, the state cache, and three-way
   consensus.
2. **Claude Cowork scheduled tasks running the whole pipeline.** Cowork cloud tasks have
   full outbound network on Pro, so Yahoo/Resend/Telegram are reachable, and recurring
   briefings are the use case Anthropic explicitly built for. But cadence is preset-only
   (daily-at-a-time, half-hourly granularity), so the five irregular intraday times
   become approximations; `config.json`, API keys and `state/` would have to live as
   files in the Claude account, creating a second source of truth that can drift from the
   `CONFIG_JSON` Actions variable. Deferred, not discarded — see below.
3. **Do nothing; run on Gemini+Mistral.** Zero work, but permanently two-vote consensus.

## Design

### 1. One provider, two transports

`ClaudeProvider` in `src/providers/claude.ts` keeps `id = "claude"` and gains a transport
switch rather than becoming a second registry entry:

```
available  = !!(CLAUDE_CODE_OAUTH_TOKEN || ANTHROPIC_API_KEY)
transport  = CLAUDE_CODE_OAUTH_TOKEN ? "subscription" : "api-key"
```

OAuth wins when both are present.

A fourth provider was rejected deliberately. `id`, `label` and `shortLabel` feed
`aiAggregation.ts`, both email renderers, Telegram, and `DetailedProviderId`. A separate
`claudeCode` provider would make Claude count twice in `aggregateMultiAI`, break the
unanimity rule that gates STRONG BUY, introduce a fourth `⚠ n/4 AI` degradation state,
and require a new detailed-provider id. Keeping one identity means `providers/index.ts`,
`aiOrchestrator.ts`, `guards.ts` and every renderer are untouched.

### 2. Structured output

The API-key transport guarantees schema-valid JSON via forced tool use
(`tool_choice: {type: "tool"}`). The subscription transport gets the same guarantee from
the Claude Agent SDK's `outputFormat`:

```ts
query({ prompt, options: {
  tools: [],                                        // pure inference — no Read/Write/Bash
  outputFormat: { type: "json_schema", schema: observationSchema },
}})
```

`observationSchema` and `decisionSchema` in `src/providers/schemas.ts` are already plain
JSON Schema — that file exists precisely so the output contract can't drift between
providers. Both transports pass the **same schema objects**, so adding a field cannot
leave one transport returning a different shape.

The two-stage Observe → Decide flow, the prompts from `prompts.ts`, and the
`MAX_OUTPUT_TOKENS` reasoning carry over unchanged. `tools: []` matters: the Agent SDK
ships a coding harness, and Richfolio wants inference only — no filesystem or shell
access in the run.

### 3. Credentials

`CLAUDE_CODE_OAUTH_TOKEN` as a GitHub Actions secret and a local `.env` entry. Two
constraints:

- **`ANTHROPIC_API_KEY` must be absent from the run's environment.** It takes precedence
  over OAuth in Claude Code's credential resolution, so leaving it set would silently
  bill API credits — the exact outcome this work exists to avoid. Remove it from the
  three job steps in `portfolio-monitor.yml` that set it (daily, intraday, refresh — the
  two weekly steps never did, since weekly runs no AI provider); the transport
  additionally scrubs it from the spawned process env as a second line of defence.
- **Token lifetime is roughly a year.** No auto-refresh exists for `setup-token`, so
  unlike `THREADS_ACCESS_TOKEN` (~60 days, refreshed by
  `.github/workflows/refresh-threads-token.yml`) this does not justify a refresh
  workflow. It is an annual manual chore.

*Status: already done — token minted and present in both `.env` and Actions secrets, with
`ANTHROPIC_API_KEY` already removed from `.env`.*

The Agent SDK bundles its own Claude Code executable, so the workflow needs one secret
line and no install step.

### 4. Failure handling — already built

A failed or malformed call throws, matching the existing `stop_reason === "max_tokens"`
guard. `runAIAnalysis` logs it and drops Claude; Gemini and Mistral carry the run;
`applyDegradedProviderPolicy` marks every rec with
`degradation: { configured: 3, answered: 2, missing: ["claude"] }`, caps STRONG BUY at
BUY, and renderers show `⚠ 2/3 AI`.

At six runs per day, exhausting the Pro allocation mid-week is expected rather than
exceptional. The existing degradation path is the designed response — no new handling.

### 5. Detailed analysis pages

`src/detailedAnalysis.ts:183` constructs `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })`
directly. Under subscription auth that key is absent, so the SDK is handed `undefined` and
errors on a missing credential — while `resolveDetailedProvider()` still reports `claude`
as available. A user on a subscription who pins `AI_DETAILED_PROVIDER=claude` therefore
gets a hard failure on every ticker. The same transport split applies here, branching
before the key is ever read.

## Testing

- **Spike first.** Before touching the workflow: `npm run refresh -- SMH` locally against
  the token, confirming the returned JSON is schema-valid. `outputFormat` under
  subscription auth is documented but unverified in this pipeline. If it turns out to be
  best-effort rather than enforced, the design holds but needs an explicit
  validate-and-throw layer before `runProvider` attaches metadata.
- **Unit test** transport selection as a pure function of the two env vars (present/
  absent/both), following the `resolveDetailedProvider()` precedent in
  `src/providers/detailedProvider.ts` — pure, config-free, CI-safe.
- No test can exercise the live subscription call in CI; that is covered by the spike and
  by the first scheduled run.
- CI gate before commit: `npm run format:check`, `npm run typecheck`, `npm test`.

## Rejected alternatives

**A second, independent Cowork brief.** Considered attractive: two uncorrelated briefs
show where Claude disagrees with the Gemini+Mistral consensus, which an averaged vote
hides by construction, and it leaves the working Actions setup untouched. Deferred to a
separate sub-project rather than rejected — it needs its own decisions about config
source-of-truth (the production config is the `CONFIG_JSON` Actions variable, not the
local `config.json`), secret storage in the Claude account, and `state/` persistence
across cloud runs. Building it before this one would double the work in flight.
