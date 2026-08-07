# Claude Subscription Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the existing Claude provider authenticate against the user's Claude Pro subscription (`CLAUDE_CODE_OAUTH_TOKEN`) instead of API credits, so Claude rejoins the three-way consensus at zero marginal cost.

**Architecture:** `ClaudeProvider` keeps `id = "claude"` and gains a second *transport*. A new pure module resolves which transport to use from two env vars; `claude.ts` and `detailedAnalysis.ts` each branch on it. The API-key path uses `@anthropic-ai/sdk` forced tool use (unchanged); the subscription path uses `@anthropic-ai/claude-agent-sdk`'s `query()` with `outputFormat: {type: "json_schema"}`. Both feed the **same** schema objects from `schemas.ts`, so the output contract cannot drift.

**Tech Stack:** Node 22, TypeScript (strict, ESM), `tsx`, `node:test`, `@anthropic-ai/sdk` (existing), `@anthropic-ai/claude-agent-sdk@^0.3.224` (new).

**Spec:** `specs/2026-08-08-claude-subscription-auth-design.md`

## Global Constraints

- **Never add a fourth provider.** `id`/`label`/`shortLabel` stay `"claude"`/`"Claude"`/`"C"`. `ALL_PROVIDERS` in `src/providers/index.ts` is not modified. A second registry entry would double-count Claude in `aggregateMultiAI` and break the STRONG BUY unanimity rule.
- **`ANTHROPIC_API_KEY` must never reach a subscription-transport subprocess.** It outranks OAuth in Claude Code's credential resolution and would silently bill API credits.
- **Both transports pass the same schema objects** (`observationSchema`, `decisionSchema` from `src/providers/schemas.ts`; `detailedSchema` in `detailedAnalysis.ts`). Never fork a schema per transport.
- **Empty-string env vars count as absent.** `ANTHROPIC_API_KEY=""` must not be treated as configured.
- **Tests must not import `config.js`** (directly or transitively) — it reads `config.json` at import time and throws, and CI runs without one. New unit tests target pure modules only.
- **CI gate before every commit:** `npm run format:check && npm run typecheck && npm test`.
- Existing behaviour with only `ANTHROPIC_API_KEY` set must be byte-for-byte unchanged.

---

### Task 0: Spike — verify subscription auth and pin the response shape

Not a TDD task. This is a **gate**: it resolves the one unverified assumption in the spec (that `outputFormat` enforces the schema under subscription auth) and pins the exact `query()` message shape that Task 2 codes against. Do not start Task 1 until this passes.

**Files:**
- Create (temporary — deleted in Step 5, never committed): `smoke/spike-subscription.ts`

`smoke/` is this repo's home for live-API scripts that CI never runs (`npm run smoke` is manual), which makes it the right place for a throwaway that hits a real endpoint — and it gives the script normal relative imports into `src/`.

- [ ] **Step 1: Install the Agent SDK**

```bash
npm install @anthropic-ai/claude-agent-sdk@^0.3.224
```

- [ ] **Step 2: Write the spike script**

Create `smoke/spike-subscription.ts`. It reuses the real `observationSchema` so the spike tests the actual contract, not a toy one.

```ts
import "dotenv/config";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { observationSchema } from "../src/providers/schemas.js";

// Guard: prove we are on the subscription, not the API key.
if (process.env.ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY is set — it would outrank OAuth. Unset it and retry.");
}
if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) {
  throw new Error("CLAUDE_CODE_OAUTH_TOKEN is not set.");
}

const prompt = `Return observations for exactly two tickers: SMH and BND.
SMH: price 245.10, RSI 28, below 200MA, P/E 31 vs avg 35.
BND: price 72.40, RSI 52, flat. BND is a long-duration bond ETF.`;

for await (const message of query({
  prompt,
  options: {
    tools: [],
    outputFormat: { type: "json_schema", schema: observationSchema },
    ...(process.env.CLAUDE_MODEL ? { model: process.env.CLAUDE_MODEL } : {}),
  },
})) {
  console.log("=== MESSAGE TYPE:", message.type);
  console.log(JSON.stringify(message, null, 2).slice(0, 4000));
}
```

- [ ] **Step 3: Run it**

```bash
npx tsx smoke/spike-subscription.ts
```

- [ ] **Step 4: Record three findings before proceeding**

Write these into the plan file under this task as a note, because Task 2 depends on all three:

1. **Which message `type`** carries the final payload (expected: `"result"`).
2. **Which field** holds the parsed object — a dedicated structured field, or a text field needing `JSON.parse`.
3. **Whether the payload is schema-valid**: exactly the `{observations: [...]}` shape with all eight required per-ticker keys, and one entry per ticker.

**Decision gate:**
- Schema enforced → continue to Task 1 as written.
- Payload returned but shape drifts (missing keys, prose wrapper) → continue, and in Task 2 Step 3 keep the `assertShape` helper as the *primary* guarantee rather than a backstop. The design anticipates this; it does not change the task structure.
- Auth fails outright → **stop and report.** The whole approach is invalid; do not attempt workarounds.

- [ ] **Step 5: Delete the spike and commit the dependency only**

```bash
rm smoke/spike-subscription.ts
git add package.json package-lock.json
git commit -m "chore: add @anthropic-ai/claude-agent-sdk for subscription auth transport"
```

Confirm `git status --short` shows no stray `smoke/spike-subscription.ts`.

---

### Task 1: Pure transport resolution

**Files:**
- Create: `src/providers/claudeTransport.ts`
- Test: `test/claudeTransport.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type ClaudeTransport = "subscription" | "api-key"` and `resolveClaudeTransport(oauthToken: string | undefined, apiKey: string | undefined): ClaudeTransport | null`. Tasks 2 and 3 both import these.

This mirrors `resolveDetailedProvider()` in `src/providers/detailedProvider.ts`: pure, takes raw env values rather than reading them, so it is unit-testable without a `config.json`.

- [ ] **Step 1: Write the failing test**

Create `test/claudeTransport.test.ts`:

```ts
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { resolveClaudeTransport } from "../src/providers/claudeTransport.js";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/providers/claudeTransport.js'`

- [ ] **Step 3: Write the implementation**

Create `src/providers/claudeTransport.ts`:

```ts
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
```

- [ ] **Step 4: Run tests and formatting**

```bash
npm run format && npm run format:check && npm run typecheck && npm test
```
Expected: all pass, including the six new `resolveClaudeTransport` tests.

- [ ] **Step 5: Commit**

```bash
git add src/providers/claudeTransport.ts test/claudeTransport.test.ts
git commit -m "feat(providers): add pure Claude transport resolution"
```

---

### Task 2: Subscription transport in the Claude provider

**Files:**
- Modify: `src/providers/claude.ts`

**Interfaces:**
- Consumes: `resolveClaudeTransport`, `ClaudeTransport` (Task 1); `observationSchema`, `decisionSchema` (`src/providers/schemas.ts`); `buildObservationPrompt`, `buildDecisionPrompt`, `TickerObservation` (`src/providers/prompts.ts`) — all already imported by this file.
- Produces: no new exports. `claudeProvider` keeps its `AIProvider` shape, so `aiOrchestrator.ts`, `aiAggregation.ts`, `guards.ts` and every renderer are untouched.

- [ ] **Step 1: Add imports and the subscription stage runner**

At the top of `src/providers/claude.ts`, alongside the existing imports:

```ts
import { query } from "@anthropic-ai/claude-agent-sdk";
import { resolveClaudeTransport } from "./claudeTransport.js";
```

Then add, above the `ClaudeProvider` class:

```ts
// ── Subscription transport ─────────────────────────────────────────
// Runs one structured stage through the Claude Agent SDK against the user's
// Pro/Max allocation. `tools: []` matters: the Agent SDK ships Claude Code's
// coding harness, and this workload is pure inference — no filesystem, no
// shell, no web access in the run.

function assertShape<T>(value: unknown, key: string, stage: string): T {
  if (!value || typeof value !== "object" || !(key in value)) {
    throw new Error(
      `Claude ${stage} (subscription) returned no "${key}" — got ` +
        `${JSON.stringify(value)?.slice(0, 200)}`,
    );
  }
  return value as T;
}

async function runSubscriptionStage<T>(
  prompt: string,
  schema: object,
  stage: string,
  rootKey: string,
): Promise<T> {
  // Strip ANTHROPIC_API_KEY from the child env. It outranks OAuth inside Claude
  // Code, so leaving it set would silently bill API credits — the exact outcome
  // this transport exists to avoid.
  const { ANTHROPIC_API_KEY: _dropped, ...env } = process.env;

  let payload: unknown;

  for await (const message of query({
    prompt,
    options: {
      tools: [],
      outputFormat: { type: "json_schema", schema },
      env,
      ...(process.env.CLAUDE_MODEL ? { model: process.env.CLAUDE_MODEL } : {}),
    },
  })) {
    if (message.type !== "result") continue;

    // Reconcile with the Task 0 spike: prefer whichever structured field the
    // SDK populates, and fall back to parsing the result text.
    const m = message as Record<string, unknown>;
    const structured = m.structured_output ?? m.structuredOutput ?? m.output;
    if (structured && typeof structured === "object") {
      payload = structured;
    } else if (typeof m.result === "string") {
      payload = JSON.parse(m.result);
    }
  }

  if (payload === undefined) {
    throw new Error(`Claude ${stage} (subscription) produced no result message`);
  }
  return assertShape<T>(payload, rootKey, stage);
}
```

- [ ] **Step 2: Make `available` transport-aware**

Replace the existing getter:

```ts
  get available(): boolean {
    return (
      resolveClaudeTransport(
        process.env.CLAUDE_CODE_OAUTH_TOKEN,
        process.env.ANTHROPIC_API_KEY,
      ) !== null
    );
  }
```

- [ ] **Step 3: Branch each stage on the transport**

In `analyze()`, replace the `const apiKey = ...; if (!apiKey) return [];` opening with:

```ts
    const transport = resolveClaudeTransport(
      process.env.CLAUDE_CODE_OAUTH_TOKEN,
      process.env.ANTHROPIC_API_KEY,
    );
    if (!transport) return [];
```

Keep `const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })` but construct it **only** on the `api-key` path (move it inside the branch below, so the subscription path never builds a client with an undefined key).

Change the Stage 1 log line to name the transport, then branch:

```ts
    console.log(`Running Claude analysis (Stage 1: Observe, ${model}, ${transport})...`);

    const obsPrompt = buildObservationPrompt(report, priceData, news, technicals, macroContext);

    let observations: TickerObservation[];
    if (transport === "subscription") {
      const obsInput = await runSubscriptionStage<{ observations: TickerObservation[] }>(
        obsPrompt,
        observationSchema,
        "Stage 1",
        "observations",
      );
      observations = obsInput.observations ?? [];
    } else {
      // ...existing client.messages.create(...) block, the max_tokens
      // stop_reason guard, and extractToolInput(...) — unchanged...
      observations = obsInput.observations ?? [];
    }
```

Apply the identical pattern to Stage 2, with `decisionSchema`, `"Stage 2"`, `"recommendations"`, and `AIBuyRecommendation[]`. Leave the `console.log` observation summary loop between the stages exactly where it is — it runs for both transports.

**Do not change:** `MAX_OUTPUT_TOKENS`, `DEFAULT_MODEL`, `extractToolInput`, the `stop_reason === "max_tokens"` guards, or either prompt builder call.

- [ ] **Step 4: Verify the API-key path still compiles and passes**

```bash
npm run format && npm run format:check && npm run typecheck && npm test
```
Expected: all pass. No existing test exercises `claude.ts` (it imports `config.js`), so this is a compile-and-regression check.

- [ ] **Step 5: Run it live against the subscription**

```bash
npm run refresh -- SMH
```

Expected: log line reads `Stage 1: Observe, <model>, subscription`; the run completes; an email and Telegram message arrive. Confirm in the output that Claude contributed recommendations rather than being dropped.

If Claude is dropped, read the thrown error — it names the stage and prints the first 200 chars of what came back. Reconcile `runSubscriptionStage`'s field extraction with the Task 0 findings.

- [ ] **Step 6: Commit**

```bash
git add src/providers/claude.ts
git commit -m "feat(ai): Claude provider can authenticate via Pro subscription"
```

---

### Task 3: Subscription transport for the detailed analysis page

**Files:**
- Modify: `src/detailedAnalysis.ts` (the `callClaude` function, ~line 182)

**Interfaces:**
- Consumes: `resolveClaudeTransport` (Task 1), `detailedSchema` (already in this file).
- Produces: no new exports.

Without this, `callClaude`'s `process.env.ANTHROPIC_API_KEY!` non-null assertion crashes at runtime under subscription auth, while `resolveDetailedProvider()` still happily reports `claude` as available.

- [ ] **Step 1: Add imports**

```ts
import { query } from "@anthropic-ai/claude-agent-sdk";
import { resolveClaudeTransport } from "./providers/claudeTransport.js";
```

- [ ] **Step 2: Rewrite `callClaude` to branch on transport**

Replace the whole function:

```ts
async function callClaude(prompt: string): Promise<{ buyThesis?: string; risks?: string[] }> {
  const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
  const transport = resolveClaudeTransport(
    process.env.CLAUDE_CODE_OAUTH_TOKEN,
    process.env.ANTHROPIC_API_KEY,
  );

  if (transport === "subscription") {
    // Same schema as the tool-use path below — one contract, two transports.
    const { ANTHROPIC_API_KEY: _dropped, ...env } = process.env;
    for await (const message of query({
      prompt,
      options: { tools: [], outputFormat: { type: "json_schema", schema: detailedSchema }, env, model },
    })) {
      if (message.type !== "result") continue;
      const m = message as Record<string, unknown>;
      const structured = m.structured_output ?? m.structuredOutput ?? m.output;
      if (structured && typeof structured === "object") {
        return structured as { buyThesis?: string; risks?: string[] };
      }
      if (typeof m.result === "string") {
        return JSON.parse(m.result) as { buyThesis?: string; risks?: string[] };
      }
    }
    return {};
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    tools: [
      {
        name: "submit_detailed_analysis",
        description: "Submit the structured detailed buy thesis + risks.",
        input_schema: detailedSchema,
      },
    ],
    tool_choice: { type: "tool", name: "submit_detailed_analysis" },
    messages: [{ role: "user", content: prompt }],
  });
  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "submit_detailed_analysis") {
      return block.input as { buyThesis?: string; risks?: string[] };
    }
  }
  return {};
}
```

Returning `{}` on no-result preserves the existing contract — callers already treat an empty object as "no detailed page for this ticker".

- [ ] **Step 3: Verify**

```bash
npm run format && npm run format:check && npm run typecheck && npm test
```
Expected: all pass.

- [ ] **Step 4: Run live with Claude pinned as the detailed provider**

```bash
AI_DETAILED_PROVIDER=claude npm run refresh -- SMH
```

Expected: if SMH is a STRONG BUY, the emailed analysis URL renders a buy thesis and risks. If SMH isn't STRONG BUY, no page is generated — pick a ticker that is, or accept coverage from the first scheduled run.

- [ ] **Step 5: Commit**

```bash
git add src/detailedAnalysis.ts
git commit -m "feat(ai): detailed analysis page supports Claude subscription auth"
```

---

### Task 4: Wire the workflow and update documentation

**Files:**
- Modify: `.github/workflows/portfolio-monitor.yml` (3 steps: `npm run start`, `npm run intraday`, `npm run refresh`)
- Modify: `CLAUDE.md` (GitHub Actions Secrets section)
- Modify: `docs/api-keys.md`

- [ ] **Step 1: Swap the credential in all three AI-running steps**

In each of the three steps that currently set `ANTHROPIC_API_KEY`, delete that line and add:

```yaml
          CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
```

Leave the two weekly steps alone — they set no AI credentials because weekly runs no AI provider. Do not add an install step: the Agent SDK bundles its own Claude Code executable.

- [ ] **Step 2: Verify the edit hit exactly three places**

```bash
grep -c "CLAUDE_CODE_OAUTH_TOKEN" .github/workflows/portfolio-monitor.yml   # expect 3
grep -c "ANTHROPIC_API_KEY" .github/workflows/portfolio-monitor.yml         # expect 0
```

- [ ] **Step 3: Update `CLAUDE.md`**

In the GitHub Actions Secrets list, replace the `ANTHROPIC_API_KEY` bullet with:

```markdown
- `CLAUDE_CODE_OAUTH_TOKEN` — from `claude setup-token` run locally (optional AI provider — Anthropic Claude via a Pro/Max **subscription**, no per-token cost; valid ~1 year, no auto-refresh). Takes precedence over `ANTHROPIC_API_KEY` when both are set
- `ANTHROPIC_API_KEY` — from console.anthropic.com (alternative Claude transport — pay-per-use, no free tier). Leave unset when using the subscription token: it outranks OAuth inside Claude Code and would silently bill API credits
```

Then add to **Key Gotchas**:

```markdown
- **Claude has two transports, one identity**: `CLAUDE_CODE_OAUTH_TOKEN` (Pro/Max subscription, via `@anthropic-ai/claude-agent-sdk`) or `ANTHROPIC_API_KEY` (pay-per-use, via `@anthropic-ai/sdk`). `resolveClaudeTransport()` in `src/providers/claudeTransport.ts` picks one — subscription wins when both are set, and the subscription path strips `ANTHROPIC_API_KEY` from the subprocess env because Claude Code would otherwise prefer it and bill credits. Deliberately **not** a fourth provider: `id` stays `"claude"`, so multi-AI aggregation, the STRONG BUY unanimity rule, the degradation badge and `AI_DETAILED_PROVIDER` are all untouched. Structured output comes from forced tool use on the API-key path and `outputFormat: {type: "json_schema"}` on the subscription path, both fed the same schemas from `providers/schemas.ts`. The token lasts ~1 year with no auto-refresh — unlike `THREADS_ACCESS_TOKEN`, there's no refresh workflow, so re-run `claude setup-token` annually
```

- [ ] **Step 4: Update `docs/api-keys.md` — four separate edits**

**(a)** Replace the body of the `## Anthropic Claude — Optional` section (lines ~84–94, keeping the heading and its `{: .text-yellow-200}` attribute line) with:

```markdown
Powers the AI buy recommendations with Claude (Sonnet 4.6 by default). There are two
ways to authenticate, and Richfolio picks whichever you configure.

### Option 1 — Claude Pro/Max subscription (no per-token cost)

If you already pay for Claude Pro or Max, Richfolio can run on your existing
subscription allocation instead of buying API credits.

1. Install Claude Code and sign in with the account holding your subscription
2. Run `claude setup-token` locally and copy the token it prints
3. Add as a GitHub Secret — name: `CLAUDE_CODE_OAUTH_TOKEN`, value: the token

**Leave `ANTHROPIC_API_KEY` unset when you use this.** Inside Claude Code an API key
outranks the subscription token, so setting both would quietly bill your API account —
exactly what this option exists to avoid. Richfolio prefers the subscription token and
strips the API key from the subprocess, but the cleanest setup is to have only one.

**Validity:** roughly one year, with no auto-refresh. Unlike the Threads token there is
no refresh workflow — re-run `claude setup-token` annually. When it expires Claude drops
out of the run and your brief is marked `⚠ n/n AI` rather than failing.

### Option 2 — API key (pay-per-use)

1. Go to [console.anthropic.com](https://console.anthropic.com) and sign up
2. Navigate to **API Keys** → **Create Key**, give it a name, copy the key
3. Add as a GitHub Secret — name: `ANTHROPIC_API_KEY`, value: the key you just copied

**Pricing:** Anthropic does not have a permanent free tier like Gemini, but new accounts receive a small starter credit and Sonnet usage for Richfolio's workload is typically cents per day. To minimise cost, set `CLAUDE_MODEL=claude-haiku-4-5-20251001` (the Haiku tier is significantly cheaper while still handling this workload well).
```

**(b)** In `## Multi-AI mode` (line ~114), change the opening sentence so the Claude credential can be either transport:

```markdown
If two or more of `GEMINI_API_KEY`, Claude (`CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`) and `MISTRAL_API_KEY` are set, Richfolio runs those providers concurrently on every analysis and aggregates the results:
```

**(c)** In the `AI_DETAILED_PROVIDER` table (line ~130), change the Claude row's note:

```markdown
| `AI_DETAILED_PROVIDER` | `claude` | Force Claude for detailed analysis (must have `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` set) |
```

**(d)** In the `## Summary` table, insert a row directly above the `ANTHROPIC_API_KEY` row and reword that row:

```markdown
| `CLAUDE_CODE_OAUTH_TOKEN` | No | AI provider (Anthropic Claude via Pro/Max subscription) |
| `ANTHROPIC_API_KEY` | No | AI provider (Anthropic Claude via pay-per-use API key) |
```

- [ ] **Step 5: Verify and commit**

```bash
npm run format:check && npm run typecheck && npm test
git add .github/workflows/portfolio-monitor.yml CLAUDE.md docs/api-keys.md
git commit -m "feat(ci): run Claude on the Pro subscription instead of API credits"
```

- [ ] **Step 6: Confirm in production**

Trigger the workflow manually (`workflow_dispatch`, mode `daily`) and check the run log for `Stage 1: Observe, <model>, subscription`. In the resulting email, confirm the per-AI breakdown shows three providers and **no** `⚠ 2/3 AI` badge.

If the badge appears, Claude was dropped — read the step log for the thrown stage error before changing any code.

---

## Notes for the implementer

- **i18n is deliberately out of scope for Task 4.** `docs/{ja,ko,es,zh-CN,zh-TW}/` mirror the English docs, and this repo's convention (per commit `c6ce2b0`) is to bring them to parity in a dedicated follow-up commit. Flag it as remaining work; do not attempt it inside this plan.
- **The version bump and release are not in this plan.** Per the project's release ritual that is a separate, deliberate step after the change is proven in production.
- **If Task 0 fails at the auth step, stop.** Do not fall back to `ANTHROPIC_API_KEY`, do not add credit, and do not try alternative auth paths. Report the failure — the design's premise would be wrong and needs re-deciding, not patching.
