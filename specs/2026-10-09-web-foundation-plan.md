# Richfolio Web Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An invite-only website where signed-in users manage their Richfolio portfolio (targets, opening holdings, watchlist, alert settings) in Supabase, ready for the pipeline to read in sub-project #2.

**Architecture:** A static Vite + React SPA on Cloudflare Pages talks directly to Supabase. Postgres row-level security is the whole authorization layer. Two small Supabase Edge Functions do what the browser cannot: `ticker-lookup` (Yahoo / crypto.com, no CORS) and `send-invite` (needs the service-role key). Validation rules are shared rather than duplicated: the pipeline's config parser moves into a pure `src/configSchema.ts` that the web app imports, and one `supabase/settings.schema.json` is enforced by both the database and the UI.

**Tech Stack:** Supabase (Postgres 15+, Auth, Edge Functions on Deno, pgTAP, `pg_jsonschema`, `citext`), Vite, React, react-router-dom, `@supabase/supabase-js` v2, Ajv, Node `node:test` + `tsx`, GitHub Actions, Cloudflare Pages.

**Spec:** `specs/2026-10-09-web-foundation-design.md`

**Plan location:** `specs/`, beside the spec — **not** `docs/superpowers/plans/`, because `docs/` is the published Jekyll site and anything in it goes public.

## Global Constraints

- Work on `main` only; commit and push directly to `main`. No branches, no PRs.
- Before **every** commit: `npm run format:check && npm run typecheck && npm test` at the repo root. Tasks that touch `web/` also run `cd web && npm run typecheck && npm run format:check && npm test`.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Supported currencies, exactly: `USD, GBP, EUR, AUD, CAD, JPY, CHF, HKD, SGD, NZD`.
- Equity tickers are stored upper-case and must match `^[A-Z0-9][A-Z0-9.=^-]{0,14}$`. Crypto pairs are stored as `BASE/QUOTE` and must match `^[A-Z0-9]+/[A-Z0-9]+$`.
- The only crypto allowed as a holding/target is `BTC` and `ETH` (mirrors `tickerMap` in `src/config.ts`).
- The service-role key **never** appears in `web/`. Only Edge Functions read it, from their environment.
- Exact copy:
  - invite rejection: `Richfolio is invite-only — ask Richard for an invite.`
  - expired link: `That link expired — send a new one.`
  - disclaimer (footer of every page): `General advice only. Richfolio's signals do not take into account your objectives, financial situation or needs. Consider whether they are appropriate for you, and seek independent advice, before acting on them.`
- Database changes are SQL migrations in `supabase/migrations/`. Nothing is changed by hand in the dashboard except the auth provider/SMTP/hook settings listed in Task 16.
- After any task that adds a migration, regenerate `supabase/types.ts` with `npm run db:types` and commit it in the same task.
- `src/config.ts` keeps every export it has today (`targetPortfolio`, `currentHoldings`, `totalPortfolioValue`, `defaultCurrency`, `watchingTickers`, `cryptoPairSpecs`, `cryptoPairTickers`, `watchingSet`, `intradayConfig`, `cryptoAlertConfig`, `socialConfig`, `aiConfig`, `recipientEmail`, `toYahooTicker`, `fromYahooTicker`, `allUniqueTickers`, and the types `IntradayAlertConfig`, `PortfolioConfig`, `AIConfig`, `SocialConfig`). The pipeline's behaviour must not change.

## Review Focus

1. **A Google sign-in refused by the invite hook comes back as `?error_description=…` on the redirect URL, not as an API error.** The redirect lands on `/portfolio`, which redirects signed-out users to `/login`. If that redirect drops the query string, the user sees a blank login form and never learns why. `RequireAuth` must carry `search` and `hash` through. Pinned by `authErrors.test.ts` (both query and hash forms) and by the manual check in Task 16.
2. **Re-inviting someone who already has an account** must return a clear 409 message, not a 500. Pinned by `test/sendInvite.test.ts`.
3. **Ticker input with stray case or whitespace** (` voo `, `btc / cro`) must be normalised before both the lookup and the insert. Otherwise the database `check` rejects it with a raw constraint error. Pinned by `test/tickerLookup.test.ts`.
4. **A transient Yahoo failure must not downgrade a ticker that was already verified.** Pinned by the `statusWrite` test in `test/tickerLookup.test.ts`.
5. **Importing a real-world `config.json`** with lowercase tickers, 0-share holdings, 0% targets, unknown keys or `social` must produce notes, not a constraint error halfway through. It must also be atomic, so a failure leaves the old portfolio intact. Pinned by `web/src/lib/importConfig.test.ts` and the `import_portfolio` pgTAP test.

---

## File Map

```
src/configSchema.ts                         NEW  pure config.json parser + defaults (shared with web)
src/config.ts                               MOD  thin I/O wrapper around configSchema
test/configSchema.test.ts                   NEW
test/settingsSchema.test.ts                 NEW  migration ⇄ settings.schema.json drift guard
test/tickerLookup.test.ts                   NEW
test/sendInvite.test.ts                     NEW
package.json                                MOD  db:* / fn:deploy scripts

supabase/config.toml                        NEW  (supabase init) + auth/hook/functions settings
supabase/settings.schema.json               NEW  single source of the settings shape
supabase/migrations/20261010000001_foundation_schema.sql
supabase/migrations/20261010000002_rls.sql
supabase/migrations/20261010000003_auth.sql
supabase/migrations/20261010000004_import_portfolio.sql
supabase/tests/database/01_schema.test.sql
supabase/tests/database/02_rls.test.sql
supabase/tests/database/03_auth.test.sql
supabase/tests/database/04_import.test.sql
supabase/seed.sql
supabase/types.ts                           GENERATED
supabase/functions/_shared/http.ts          CORS + JSON response helper
supabase/functions/ticker-lookup/lookup.ts  pure lookup logic (also imported by web/)
supabase/functions/ticker-lookup/index.ts
supabase/functions/send-invite/logic.ts     pure helpers
supabase/functions/send-invite/index.ts

web/                                        Vite + React SPA
  package.json, tsconfig.json, vite.config.ts, index.html, .env.example, public/_redirects
  src/main.tsx            router
  src/supabase.ts         typed client
  src/auth.tsx            AuthProvider, RequireAuth, RequireAdmin
  src/db.ts               typed data access
  src/styles.css
  src/lib/authErrors.ts (+ .test.ts)
  src/lib/settings.ts (+ .test.ts)
  src/lib/targets.ts (+ .test.ts)
  src/lib/importConfig.ts (+ .test.ts)
  src/lib/tickers.ts      Edge Function client
  src/routes.ts           HOME_PATH
  src/components/Layout.tsx, ProfileFields.tsx, AlertFields.tsx, TickerBadge.tsx,
                 useTickerCheck.ts, useTickerStatuses.ts, ImportConfig.tsx
  src/pages/Login.tsx, Welcome.tsx, Portfolio.tsx, Watchlist.tsx, Settings.tsx, Admin.tsx, Privacy.tsx

.github/workflows/web.yml                   NEW
.github/workflows/db.yml                    NEW
.github/workflows/scheduler-watchdog.yml    MOD  Supabase keep-alive + alert
web/README.md, CLAUDE.md                    docs
```

---

### Task 1: Supabase CLI, project, and the Yahoo-egress spike

This task needs the operator (Richard) for account actions. The agent prepares the commands and runs everything that doesn't need a browser login.

**Files:**
- Create: `supabase/config.toml`, `supabase/.gitignore` (both from `supabase init`)
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces: npm scripts `db:start`, `db:stop`, `db:reset`, `db:test`, `db:types`, `db:push`, `fn:deploy`, used by every later task.

- [ ] **Step 1 (operator): install the CLI and create the project**

```bash
brew install supabase/tap/supabase
supabase --version          # note this exact version; Task 13 pins CI to it
supabase login
```

At supabase.com, create a project named `richfolio` in region **Sydney (ap-southeast-2)**, on the Free plan. Save the database password in a password manager, and note the project ref (the `xxxx` in `https://xxxx.supabase.co`).

- [ ] **Step 2: initialise and link**

```bash
cd /Users/r.fu/Projects/richfolio
supabase init               # answer "N" to the VS Code / IntelliJ Deno settings prompts
supabase link --project-ref <project-ref>
```

- [ ] **Step 3: add npm scripts** to the root `package.json` `"scripts"` block (keep the existing ones):

```json
"db:start": "supabase start",
"db:stop": "supabase stop",
"db:reset": "supabase db reset",
"db:test": "supabase test db",
"db:types": "supabase gen types typescript --local > supabase/types.ts",
"db:push": "supabase db push --linked",
"fn:deploy": "supabase functions deploy"
```

- [ ] **Step 4: verify the local stack starts**

Run: `npm run db:start`
Expected: the CLI prints `API URL: http://127.0.0.1:54321`, `DB URL`, `Studio URL`, `Mailpit URL`, and an `anon key`. Then run `npm run db:stop`.

- [ ] **Step 5: spike — does Yahoo answer Supabase's edge egress?**

```bash
supabase functions new yahoo-probe
```

Replace `supabase/functions/yahoo-probe/index.ts` with:

```ts
Deno.serve(async () => {
  const probe = async (url: string) => {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(5000),
      });
      return { url, status: res.status, body: (await res.text()).slice(0, 160) };
    } catch (err) {
      return { url, error: String(err) };
    }
  };
  const results = await Promise.all([
    probe("https://query1.finance.yahoo.com/v8/finance/chart/AZN.L?range=1d&interval=1d"),
    probe("https://query1.finance.yahoo.com/v8/finance/chart/NOPE123XYZ?range=1d&interval=1d"),
    probe("https://api.crypto.com/exchange/v1/public/get-instruments"),
  ]);
  return new Response(JSON.stringify(results, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
```

```bash
supabase functions deploy yahoo-probe --no-verify-jwt
curl -s https://<project-ref>.supabase.co/functions/v1/yahoo-probe
```

Expected (the design works as written): AZN.L → `200`, NOPE123XYZ → `404` with `"Not Found"`, crypto.com → `200`.
If Yahoo returns 401/403/429 or times out: **record it**. Nothing else in this plan changes. `ticker-lookup` already treats any non-200/404 as "save unverified", so equities will simply always show the amber "unverified" badge until #2's pipeline confirms them.

- [ ] **Step 6: tear the spike down**

```bash
supabase functions delete yahoo-probe
rm -rf supabase/functions/yahoo-probe
```

- [ ] **Step 7: commit**

```bash
git add supabase/config.toml supabase/.gitignore package.json
git commit -m "chore(web): scaffold Supabase project and db scripts

Spike: Yahoo chart endpoint from Supabase edge egress returned <RESULT>.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

Replace `<RESULT>` with the observed statuses, e.g. `AZN.L 200, unknown 404, crypto.com 200`.

---

### Task 2: Extract the pure config parser (`src/configSchema.ts`)

**Files:**
- Create: `src/configSchema.ts`
- Modify: `src/config.ts` (lines 1–233 become a thin wrapper; lines 234–281, from `// ── Environment-only settings` onward, stay unchanged)
- Test: `test/configSchema.test.ts`

**Interfaces:**
- Consumes: `parseCryptoPair`, `CryptoPairSpec` from `src/fetchCrypto.ts` (type-only imports there, so safe for the browser).
- Produces:
  - `SUPPORTED_CURRENCIES: readonly string[]`
  - `DEFAULT_ALERTS: IntradayAlertConfig`
  - `parsePortfolioConfig(json: unknown): ParsedConfig`
  - types `IntradayAlertConfig`, `PortfolioConfig`, `SocialConfig`, `AIConfig`, `ParsedConfig`

```ts
interface ParsedConfig {
  targetPortfolio: Record<string, number>;
  currentHoldings: Record<string, number>;
  totalPortfolioValue: number;
  defaultCurrency: string;
  watchingTickers: string[];
  cryptoPairSpecs: CryptoPairSpec[];
  intradayAlerts: IntradayAlertConfig;
  cryptoAlerts: IntradayAlertConfig;
  social: SocialConfig;
  ai: AIConfig;
  warnings: string[];
}
```

- [ ] **Step 1: write the failing test** `test/configSchema.test.ts`

```ts
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parsePortfolioConfig, DEFAULT_ALERTS } from "../src/configSchema.js";

const example = JSON.parse(readFileSync(resolve(process.cwd(), "config.example.json"), "utf-8"));
const minimal = { targetPortfolio: { VOO: 100 }, totalPortfolioValue: 1000, defaultCurrency: "USD" };

describe("parsePortfolioConfig", () => {
  test("parses config.example.json", () => {
    const c = parsePortfolioConfig(example);
    assert.equal(c.targetPortfolio.VOO, 20);
    assert.equal(c.currentHoldings.AAPL, 30);
    assert.equal(c.totalPortfolioValue, 50000);
    assert.equal(c.defaultCurrency, "USD");
    assert.deepEqual(c.watchingTickers, ["MSFT", "NVDA", "AMD"]);
    assert.deepEqual(
      c.cryptoPairSpecs.map((s) => s.ticker),
      ["BTC_CRO", "ETH_CRO"],
    );
    assert.deepEqual(c.warnings, []);
  });

  test("applies defaults", () => {
    const c = parsePortfolioConfig(minimal);
    assert.deepEqual(c.currentHoldings, {});
    assert.deepEqual(c.intradayAlerts, DEFAULT_ALERTS);
    assert.deepEqual(c.cryptoAlerts, DEFAULT_ALERTS);
    assert.equal(c.ai.strongBuyRequiresAllProviders, false);
    assert.equal(c.social.enabled, true);
    assert.equal(c.social.includeLinkInX, false);
  });

  test("merges partial alert overrides over defaults", () => {
    const c = parsePortfolioConfig({ ...minimal, intradayAlerts: { minConfidenceToAlert: 70 } });
    assert.equal(c.intradayAlerts.minConfidenceToAlert, 70);
    assert.equal(c.intradayAlerts.minPriceMovePctToAlert, DEFAULT_ALERTS.minPriceMovePctToAlert);
  });

  test("missing currency defaults to USD with a warning", () => {
    const { defaultCurrency: _drop, ...noCurrency } = minimal;
    const c = parsePortfolioConfig(noCurrency);
    assert.equal(c.defaultCurrency, "USD");
    assert.match(c.warnings.join("\n"), /defaultCurrency" missing/);
  });

  test("upper-cases currency", () => {
    assert.equal(parsePortfolioConfig({ ...minimal, defaultCurrency: "aud" }).defaultCurrency, "AUD");
  });

  test("filters blank and non-string watching entries", () => {
    const c = parsePortfolioConfig({ ...minimal, watching: ["MSFT", "", 3] });
    assert.deepEqual(c.watchingTickers, ["MSFT"]);
  });

  test("skips a malformed crypto pair with a warning", () => {
    const c = parsePortfolioConfig({ ...minimal, watchingCrypto: ["BTC/CRO", "BTCCRO"] });
    assert.deepEqual(
      c.cryptoPairSpecs.map((s) => s.ticker),
      ["BTC_CRO"],
    );
    assert.match(c.warnings.join("\n"), /ignoring invalid "watchingCrypto" entry "BTCCRO"/);
  });

  const bad: Array<[string, unknown, RegExp]> = [
    ["not an object", 42, /must be a JSON object/],
    ["missing targetPortfolio", { totalPortfolioValue: 1 }, /"targetPortfolio" must be an object/],
    ["non-number target", { ...minimal, targetPortfolio: { VOO: "20" } }, /targetPortfolio\.VOO/],
    ["non-number holding", { ...minimal, currentHoldings: { VOO: "x" } }, /currentHoldings\.VOO/],
    ["string portfolio value", { ...minimal, totalPortfolioValue: "1000" }, /must be a number/],
    ["deprecated USD field", { ...minimal, totalPortfolioValueUSD: 1 }, /deprecated/],
    ["unsupported currency", { ...minimal, defaultCurrency: "XYZ" }, /not supported/],
    ["watching not array", { ...minimal, watching: "MSFT" }, /"watching" must be an array/],
    ["watchingCrypto not array", { ...minimal, watchingCrypto: "BTC/CRO" }, /"watchingCrypto"/],
  ];
  for (const [name, input, message] of bad) {
    test(`throws: ${name}`, () => {
      assert.throws(() => parsePortfolioConfig(input), message);
    });
  }
});
```

- [ ] **Step 2: run it and confirm it fails**

Run: `node --import=tsx/esm --test test/configSchema.test.ts`
Expected: FAIL, `Cannot find module '../src/configSchema.js'`.

- [ ] **Step 3: create `src/configSchema.ts`**

Move the four interfaces (`IntradayAlertConfig`, `PortfolioConfig`, `AIConfig`, `SocialConfig`) **verbatim, with their doc comments**, from `src/config.ts` lines 21–122 into this file under `// ── Types`. Then add the following below them:

```ts
import { parseCryptoPair } from "./fetchCrypto.js";
import type { CryptoPairSpec } from "./fetchCrypto.js";

// Pure config.json validation and defaults: no file I/O, no dotenv, no
// process.env. Lives apart from config.ts so the web app's config.json
// importer applies exactly the rules the pipeline does, and so it can be
// unit-tested (config.ts throws at import time without a config.json, and CI
// has none). Same pure/wrapper split as allocation.ts/analyze.ts.

export const SUPPORTED_CURRENCIES: readonly string[] = [
  "USD", "GBP", "EUR", "AUD", "CAD", "JPY", "CHF", "HKD", "SGD", "NZD",
];

// (interfaces moved here from config.ts — see above)

export const DEFAULT_ALERTS: IntradayAlertConfig = {
  enabled: true,
  confidenceIncreaseThreshold: 10,
  minConfidenceToAlert: 80,
  actionUpgradesAlert: true,
  onlyAlertForActions: ["STRONG BUY", "BUY"],
  minPriceMovePctToAlert: 1.0,
};

export interface ParsedConfig {
  targetPortfolio: Record<string, number>;
  currentHoldings: Record<string, number>;
  totalPortfolioValue: number;
  defaultCurrency: string;
  watchingTickers: string[];
  cryptoPairSpecs: CryptoPairSpec[];
  intradayAlerts: IntradayAlertConfig;
  cryptoAlerts: IntradayAlertConfig;
  social: SocialConfig;
  ai: AIConfig;
  /** Non-fatal problems. config.ts prints them; the web importer shows them. */
  warnings: string[];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function numberMap(json: Record<string, unknown>, key: string, required: boolean) {
  const value = json[key];
  if (value === undefined && !required) return {};
  if (!isPlainObject(value)) {
    throw new Error(`config.json: "${key}" must be an object of ticker → number.`);
  }
  for (const [ticker, n] of Object.entries(value)) {
    if (typeof n !== "number" || !Number.isFinite(n)) {
      throw new Error(`config.json: "${key}.${ticker}" must be a number.`);
    }
  }
  return value as Record<string, number>;
}

export function parsePortfolioConfig(json: unknown): ParsedConfig {
  if (!isPlainObject(json)) throw new Error("config.json must be a JSON object.");
  const warnings: string[] = [];

  const targetPortfolio = numberMap(json, "targetPortfolio", true);
  const currentHoldings = numberMap(json, "currentHoldings", false);

  const rawWatching = json.watching;
  if (rawWatching !== undefined && !Array.isArray(rawWatching)) {
    throw new Error('config.json: "watching" must be an array of ticker symbols.');
  }
  const watchingTickers = Array.isArray(rawWatching)
    ? rawWatching.filter((t): t is string => typeof t === "string" && t.length > 0)
    : [];

  // Malformed pairs are warned about and skipped rather than thrown: one typo
  // should not take down a run that has other pairs to report on.
  const rawWatchingCrypto = json.watchingCrypto;
  if (rawWatchingCrypto !== undefined && !Array.isArray(rawWatchingCrypto)) {
    throw new Error('config.json: "watchingCrypto" must be an array of "BASE/QUOTE" strings.');
  }
  const cryptoPairSpecs = (Array.isArray(rawWatchingCrypto) ? rawWatchingCrypto : []).flatMap(
    (entry) => {
      const spec = parseCryptoPair(entry as string);
      if (!spec) {
        warnings.push(
          `config.json: ignoring invalid "watchingCrypto" entry ${JSON.stringify(entry)} — ` +
            `expected "BASE/QUOTE", e.g. "BTC/CRO".`,
        );
        return [];
      }
      return [spec];
    },
  );

  // Migration guard — old field name is no longer accepted
  if (json.totalPortfolioValueUSD !== undefined) {
    throw new Error(
      'config.json: "totalPortfolioValueUSD" is deprecated. ' +
        'Rename it to "totalPortfolioValue" and add "defaultCurrency" (e.g. "USD"). ' +
        "See config.example.json.",
    );
  }
  if (typeof json.totalPortfolioValue !== "number") {
    throw new Error('config.json: "totalPortfolioValue" must be a number.');
  }

  const rawCurrency = json.defaultCurrency;
  if (rawCurrency === undefined) {
    warnings.push('config.json: "defaultCurrency" missing — defaulting to "USD".');
  } else if (typeof rawCurrency !== "string") {
    throw new Error('config.json: "defaultCurrency" must be a string (e.g. "USD").');
  }
  const defaultCurrency = typeof rawCurrency === "string" ? rawCurrency.toUpperCase() : "USD";
  if (!SUPPORTED_CURRENCIES.includes(defaultCurrency)) {
    throw new Error(
      `config.json: "defaultCurrency": "${defaultCurrency}" is not supported. ` +
        `Supported: ${SUPPORTED_CURRENCIES.join(", ")}.`,
    );
  }

  return {
    targetPortfolio,
    currentHoldings,
    totalPortfolioValue: json.totalPortfolioValue,
    defaultCurrency,
    watchingTickers,
    cryptoPairSpecs,
    intradayAlerts: { ...DEFAULT_ALERTS, ...(json.intradayAlerts as object | undefined) },
    // Same knobs as intraday, tuned separately: cross-pairs trade 24/7.
    cryptoAlerts: { ...DEFAULT_ALERTS, ...(json.cryptoAlerts as object | undefined) },
    social: {
      enabled: true,
      includeLinkInX: false,
      hashtags: ["investing", "stocks", "stockmarket", "ETFs"],
      ...(json.social as object | undefined),
    },
    ai: { strongBuyRequiresAllProviders: false, ...(json.ai as object | undefined) },
    warnings,
  };
}
```

Note the two deliberate tightenings over today's `config.ts`, both of which used to crash later inside the pipeline instead:
- `targetPortfolio` and `currentHoldings` are now type-checked.
- `currentHoldings` defaults to `{}` when absent.

- [ ] **Step 4: rewrite `src/config.ts` lines 1–233** as:

```ts
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parsePortfolioConfig } from "./configSchema.js";

export type {
  AIConfig,
  IntradayAlertConfig,
  PortfolioConfig,
  SocialConfig,
} from "./configSchema.js";

// ── Load config.json ────────────────────────────────────────────────
const configPath = resolve(process.cwd(), "config.json");
let raw: string;
try {
  raw = readFileSync(configPath, "utf-8");
} catch {
  throw new Error(
    `Missing config.json — copy config.example.json to config.json and edit it:\n  cp config.example.json config.json`,
  );
}

// Validation and defaults live in the pure configSchema.ts so the web app's
// config.json importer enforces exactly the same rules. This file only does I/O.
const parsed = parsePortfolioConfig(JSON.parse(raw));
for (const warning of parsed.warnings) console.warn(warning);

export const targetPortfolio = parsed.targetPortfolio;
export const currentHoldings = parsed.currentHoldings;
export const watchingTickers: string[] = parsed.watchingTickers;
export const cryptoPairSpecs = parsed.cryptoPairSpecs;
export const cryptoPairTickers: string[] = cryptoPairSpecs.map((s) => s.ticker);
```

Then paste the existing comment block that starts `// Cross-pairs belong in \`watchingSet\` but NOT in \`watchingTickers\`` verbatim, followed by:

```ts
export const watchingSet = new Set<string>([...watchingTickers, ...cryptoPairTickers]);
export const totalPortfolioValue = parsed.totalPortfolioValue;
export const defaultCurrency = parsed.defaultCurrency;
export const intradayConfig = parsed.intradayAlerts;
export const cryptoAlertConfig = parsed.cryptoAlerts;
export const socialConfig = parsed.social;
export const aiConfig = parsed.ai;
```

Leave everything from `// ── Environment-only settings` to the end of the file unchanged.

- [ ] **Step 5: run the new test and the full suite**

Run: `node --import=tsx/esm --test test/configSchema.test.ts`
Expected: PASS (all tests).
Run: `npm run format && npm run format:check && npm run typecheck && npm test`
Expected: all pass. Typecheck passing proves every importer of `config.js` still resolves its names.

- [ ] **Step 6: prove the pipeline still loads the real config**

Run: `npx tsx -e 'import("./src/config.ts").then(c => console.log(c.defaultCurrency, Object.keys(c.targetPortfolio).length, c.watchingSet.size, c.intradayConfig.minConfidenceToAlert))'`
Expected: prints the currency, target count, watch-set size and 80 (or your override) from your local `config.json`, with no exception.

- [ ] **Step 7: commit**

```bash
git add src/configSchema.ts src/config.ts test/configSchema.test.ts
git commit -m "refactor(config): extract pure parsePortfolioConfig for reuse by the web app

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---
### Task 3: Foundation schema, settings schema, drift guard

**Files:**
- Create: `supabase/settings.schema.json`
- Create: `supabase/migrations/20261010000001_foundation_schema.sql`, `supabase/seed.sql`
- Test: `test/settingsSchema.test.ts`, `supabase/tests/database/01_schema.test.sql`
- Generate: `supabase/types.ts`

**Interfaces:**
- Produces tables `profiles`, `targets`, `watchlist`, `transactions`, `ticker_status`, `invites`; the view `holdings`; and the functions `settings_schema()`, `ping()`. Columns are exactly as in the SQL below. Later tasks use these names verbatim.

- [ ] **Step 1: create `supabase/settings.schema.json`**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "additionalProperties": false,
  "definitions": {
    "alerts": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "enabled": { "type": "boolean" },
        "confidenceIncreaseThreshold": { "type": "number", "minimum": 0, "maximum": 100 },
        "minConfidenceToAlert": { "type": "number", "minimum": 0, "maximum": 100 },
        "actionUpgradesAlert": { "type": "boolean" },
        "onlyAlertForActions": {
          "type": "array",
          "uniqueItems": true,
          "items": { "enum": ["STRONG BUY", "BUY", "HOLD", "WAIT"] }
        },
        "minPriceMovePctToAlert": { "type": "number", "minimum": 0, "maximum": 100 }
      }
    }
  },
  "properties": {
    "intradayAlerts": { "$ref": "#/definitions/alerts" },
    "cryptoAlerts": { "$ref": "#/definitions/alerts" },
    "ai": {
      "type": "object",
      "additionalProperties": false,
      "properties": { "strongBuyRequiresAllProviders": { "type": "boolean" } }
    },
    "delivery": {
      "type": "object",
      "additionalProperties": false,
      "properties": { "email": { "type": "boolean" }, "telegram": { "type": "boolean" } }
    }
  }
}
```

- [ ] **Step 2: write the failing drift test** `test/settingsSchema.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// The database enforces settings via a CHECK that embeds the schema text; the
// web app validates forms against supabase/settings.schema.json. If the two
// drift, the UI accepts what the database rejects (or the reverse), and the
// pipeline reads a shape nobody validated. This keeps them byte-for-byte equal
// as parsed JSON. A later migration that redefines settings_schema() wins.
test("settings_schema() in migrations matches supabase/settings.schema.json", () => {
  const dir = resolve(process.cwd(), "supabase/migrations");
  const defs = readdirSync(dir)
    .sort()
    .map((f) => readFileSync(resolve(dir, f), "utf-8"))
    .flatMap((sql) => [...sql.matchAll(/\$schema\$([\s\S]*?)\$schema\$/g)].map((m) => m[1]));
  assert.ok(defs.length > 0, "no $schema$ block found in any migration");
  const fromMigration = JSON.parse(defs[defs.length - 1]);
  const fromFile = JSON.parse(
    readFileSync(resolve(process.cwd(), "supabase/settings.schema.json"), "utf-8"),
  );
  assert.deepEqual(fromMigration, fromFile);
});
```

Run: `node --import=tsx/esm --test test/settingsSchema.test.ts`
Expected: FAIL with `ENOENT ... supabase/migrations` or `no $schema$ block found`.

- [ ] **Step 3: write the migration** `supabase/migrations/20261010000001_foundation_schema.sql`

Paste the contents of `supabase/settings.schema.json` between the `$schema$` markers exactly.

```sql
-- Richfolio web foundation: per-user portfolio data.
-- Spec: specs/2026-10-09-web-foundation-design.md

create extension if not exists citext with schema extensions;
create extension if not exists pg_jsonschema with schema extensions;

-- ── Settings schema ─────────────────────────────────────────────────
-- The JSON between the $schema$ markers MUST equal supabase/settings.schema.json;
-- test/settingsSchema.test.ts fails CI when they drift.
create function public.settings_schema() returns json
language sql immutable
as $fn$ select $schema$
{ ...paste supabase/settings.schema.json here... }
$schema$::json $fn$;

-- ── Profiles ────────────────────────────────────────────────────────
create table public.profiles (
  id                      uuid primary key references auth.users on delete cascade,
  display_name            text,
  default_currency        text not null default 'USD'
                            check (default_currency in
                              ('USD','GBP','EUR','AUD','CAD','JPY','CHF','HKD','SGD','NZD')),
  time_zone               text not null default 'UTC',
  planned_portfolio_value numeric(14,2) not null default 0
                            check (planned_portfolio_value >= 0),
  settings                jsonb not null default '{}'
                            check (extensions.jsonb_matches_schema(public.settings_schema(), settings)),
  is_admin                boolean not null default false,
  created_at              timestamptz not null default now()
);

-- ── Targets / watchlist ─────────────────────────────────────────────
create table public.targets (
  user_id    uuid not null references public.profiles on delete cascade,
  ticker     text not null check (ticker ~ '^[A-Z0-9][A-Z0-9.=^-]{0,14}$'),
  target_pct numeric(5,2) not null check (target_pct > 0 and target_pct <= 100),
  primary key (user_id, ticker)
);

create table public.watchlist (
  user_id uuid not null references public.profiles on delete cascade,
  symbol  text not null,
  kind    text not null check (kind in ('equity', 'crypto_pair')),
  primary key (user_id, symbol),
  check (
    (kind = 'equity' and symbol ~ '^[A-Z0-9][A-Z0-9.=^-]{0,14}$')
    or (kind = 'crypto_pair' and symbol ~ '^[A-Z0-9]+/[A-Z0-9]+$')
  )
);

-- ── Transactions (source of truth for holdings) ─────────────────────
create table public.transactions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles on delete cascade,
  ticker     text not null check (ticker ~ '^[A-Z0-9][A-Z0-9.=^-]{0,14}$'),
  type       text not null check (type in ('opening', 'buy', 'sell')),
  shares     numeric(20,8) not null check (shares > 0),
  price      numeric(20,8) check (price is null or price >= 0),
  currency   text check (currency is null or currency ~ '^[A-Za-z]{3}$'),
  fees       numeric(14,2) not null default 0 check (fees >= 0),
  traded_at  date,
  note       text,
  created_at timestamptz not null default now(),
  -- Only an opening balance may omit cost and date (positions bought before
  -- joining); a buy or sell must be fully specified.
  check (type = 'opening' or (price is not null and traded_at is not null and currency is not null))
);
create index transactions_user_ticker on public.transactions (user_id, ticker);

-- A position may never go below zero. Deferred to commit so that a single
-- transaction which deletes and re-inserts openings (import_portfolio) is
-- judged on its end state, not on the gap in the middle.
create function public.assert_position_non_negative(p_user uuid, p_ticker text) returns void
language plpgsql as $$
begin
  if (select coalesce(sum(case when type = 'sell' then -shares else shares end), 0)
        from public.transactions
       where user_id = p_user and ticker = p_ticker) < 0 then
    raise exception '% position would go below zero shares', p_ticker using errcode = 'check_violation';
  end if;
end $$;

create function public.transactions_position_guard() returns trigger
language plpgsql as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.assert_position_non_negative(new.user_id, new.ticker);
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.assert_position_non_negative(old.user_id, old.ticker);
  end if;
  return null;
end $$;

create constraint trigger transactions_position_guard
  after insert or update or delete on public.transactions
  deferrable initially deferred
  for each row execute function public.transactions_position_guard();

create view public.holdings with (security_invoker = true) as
  select user_id, ticker,
         sum(case when type = 'sell' then -shares else shares end) as shares
    from public.transactions
   group by user_id, ticker
  having sum(case when type = 'sell' then -shares else shares end) > 0;

-- ── Shared ticker metadata ──────────────────────────────────────────
-- One row per symbol anyone has added, shared across users (public market
-- data, no user information). Written by the ticker-lookup Edge Function with
-- the service role now, and by the pipeline in sub-project #2.
create table public.ticker_status (
  symbol               text primary key,
  kind                 text not null check (kind in ('equity', 'crypto_pair')),
  verified             boolean not null,
  name                 text,
  exchange             text,
  quote_currency       text,
  checked_at           timestamptz not null default now(),
  last_fetch_failed_at timestamptz
);

-- ── Invites ─────────────────────────────────────────────────────────
create table public.invites (
  email       extensions.citext primary key,
  invited_by  uuid references public.profiles on delete set null,
  invited_at  timestamptz not null default now(),
  accepted_at timestamptz
);

-- ── Keep-alive ──────────────────────────────────────────────────────
-- Called anonymously by scheduler-watchdog.yml every 6h: keeps the free-tier
-- project from pausing after 7 idle days, and its failure is the alert.
create function public.ping() returns text language sql stable as $$ select 'ok'::text $$;
```

- [ ] **Step 4: run the drift test**

Run: `node --import=tsx/esm --test test/settingsSchema.test.ts`
Expected: PASS.

- [ ] **Step 4b: create `supabase/seed.sql`** (local dev only; `supabase db reset` runs it after the migrations):

```sql
-- Local development only. Lets you sign in locally via the magic link that
-- Mailpit captures at http://127.0.0.1:54324.
insert into public.invites (email) values ('dev@example.com') on conflict do nothing;
```

- [ ] **Step 5: write the pgTAP test** `supabase/tests/database/01_schema.test.sql`

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'a@test.dev');
-- Until Task 5 adds the auth trigger, create the profile by hand; afterwards this is a no-op.
insert into public.profiles (id) values ('00000000-0000-0000-0000-00000000000a') on conflict do nothing;

-- targets
select lives_ok($$insert into public.targets values ('00000000-0000-0000-0000-00000000000a', 'VOO', 20)$$, 'valid target accepted');
select throws_ok($$insert into public.targets values ('00000000-0000-0000-0000-00000000000a', 'voo', 20)$$, '23514', null, 'lowercase ticker rejected');
select throws_ok($$insert into public.targets values ('00000000-0000-0000-0000-00000000000a', 'QQQ', 0)$$, '23514', null, 'zero target rejected');
select throws_ok($$insert into public.targets values ('00000000-0000-0000-0000-00000000000a', 'QQQ', 101)$$, '23514', null, 'target over 100 rejected');

-- transactions (the position guard is deferred; make it fire per statement here)
set constraints all immediate;
select lives_ok($$insert into public.transactions (user_id, ticker, type, shares) values ('00000000-0000-0000-0000-00000000000a', 'VOO', 'opening', 10)$$, 'opening without price/date accepted');
select throws_ok($$insert into public.transactions (user_id, ticker, type, shares) values ('00000000-0000-0000-0000-00000000000a', 'VOO', 'buy', 1)$$, '23514', null, 'buy without price/date rejected');
select throws_ok($$insert into public.transactions (user_id, ticker, type, shares, price, currency, traded_at) values ('00000000-0000-0000-0000-00000000000a', 'VOO', 'sell', 11, 500, 'USD', '2026-10-01')$$, '23514', null, 'sell beyond holdings rejected');
select lives_ok($$insert into public.transactions (user_id, ticker, type, shares, price, currency, traded_at) values ('00000000-0000-0000-0000-00000000000a', 'VOO', 'sell', 4, 500, 'USD', '2026-10-01')$$, 'sell within holdings accepted');
select is((select shares from public.holdings where user_id = '00000000-0000-0000-0000-00000000000a' and ticker = 'VOO'), 6::numeric, 'holdings = opening - sells');
select throws_ok($$delete from public.transactions where user_id = '00000000-0000-0000-0000-00000000000a' and type = 'opening'$$, '23514', null, 'deleting an opening a sell depends on is rejected');

-- watchlist
select lives_ok($$insert into public.watchlist values ('00000000-0000-0000-0000-00000000000a', 'MSFT', 'equity')$$, 'equity watch accepted');
select lives_ok($$insert into public.watchlist values ('00000000-0000-0000-0000-00000000000a', 'BTC/CRO', 'crypto_pair')$$, 'crypto pair accepted');
select throws_ok($$insert into public.watchlist values ('00000000-0000-0000-0000-00000000000a', 'BTCCRO', 'crypto_pair')$$, '23514', null, 'pair without slash rejected');

-- settings
select lives_ok($$update public.profiles set settings = '{"intradayAlerts":{"minConfidenceToAlert":70}}' where id = '00000000-0000-0000-0000-00000000000a'$$, 'valid partial settings accepted');
select throws_ok($$update public.profiles set settings = '{"intradayAlerts":{"minConfidenceToAlert":"high"}}' where id = '00000000-0000-0000-0000-00000000000a'$$, '23514', null, 'wrong-typed setting rejected');
select throws_ok($$update public.profiles set settings = '{"unknownKey":true}' where id = '00000000-0000-0000-0000-00000000000a'$$, '23514', null, 'unknown settings key rejected');

select * from finish();
rollback;
```

- [ ] **Step 6: run the database tests**

```bash
npm run db:start
supabase db reset          # applies migrations + seed.sql
npm run db:test
```

Expected: `01_schema.test.sql .. ok`, `All tests successful`.

- [ ] **Step 7: generate types, run all checks, commit**

```bash
npm run db:types
npm run format && npm run format:check && npm run typecheck && npm test
git add supabase/settings.schema.json supabase/migrations supabase/tests supabase/seed.sql supabase/types.ts test/settingsSchema.test.ts
git commit -m "feat(web): foundation schema — profiles, targets, watchlist, transactions, invites

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 4: Row-level security and grants

**Files:**
- Create: `supabase/migrations/20261010000002_rls.sql`
- Test: `supabase/tests/database/02_rls.test.sql`

**Interfaces:**
- Produces: `public.is_admin(): boolean`, callable by `authenticated` and used by the `send-invite` function (Task 7) and the admin page (Task 12).

- [ ] **Step 1: write the failing test** `supabase/tests/database/02_rls.test.sql`

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- Setup as the table owner (bypasses RLS).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.dev'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.dev');
insert into public.profiles (id) values
  ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b')
  on conflict do nothing;
insert into public.targets values
  ('00000000-0000-0000-0000-00000000000a', 'VOO', 20),
  ('00000000-0000-0000-0000-00000000000b', 'QQQ', 10);
insert into public.watchlist values ('00000000-0000-0000-0000-00000000000a', 'MSFT', 'equity');
insert into public.transactions (user_id, ticker, type, shares) values ('00000000-0000-0000-0000-00000000000a', 'VOO', 'opening', 10);
insert into public.invites (email) values ('someone@test.dev');
insert into public.ticker_status (symbol, kind, verified) values ('VOO', 'equity', true);

-- As user B
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select is_empty($$select 1 from public.targets where user_id = '00000000-0000-0000-0000-00000000000a'$$, 'B cannot read A targets');
select is_empty($$select 1 from public.watchlist where user_id = '00000000-0000-0000-0000-00000000000a'$$, 'B cannot read A watchlist');
select is_empty($$select 1 from public.transactions where user_id = '00000000-0000-0000-0000-00000000000a'$$, 'B cannot read A transactions');
select is_empty($$select 1 from public.holdings where user_id = '00000000-0000-0000-0000-00000000000a'$$, 'B cannot see A holdings via the view');
select is_empty($$select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000000a'$$, 'B cannot read A profile');
select results_eq($$select ticker from public.targets$$, $$values ('QQQ'::text)$$, 'B sees only own targets');
select throws_ok($$insert into public.targets values ('00000000-0000-0000-0000-00000000000a', 'SMH', 5)$$, '42501', null, 'B cannot insert rows for A');
select lives_ok($$update public.targets set target_pct = 99 where user_id = '00000000-0000-0000-0000-00000000000a'$$, 'B''s update of A''s rows runs but matches nothing');
select throws_ok($$update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-00000000000b'$$, '42501', null, 'cannot self-promote to admin');
select lives_ok($$update public.profiles set display_name = 'Bee' where id = '00000000-0000-0000-0000-00000000000b'$$, 'can edit own display name');
select is_empty($$select 1 from public.invites$$, 'non-admin cannot read invites');
select throws_ok($$insert into public.invites (email) values ('x@test.dev')$$, '42501', null, 'non-admin cannot invite');
select isnt_empty($$select 1 from public.ticker_status$$, 'signed-in users read ticker status');
select throws_ok($$insert into public.ticker_status (symbol, kind, verified) values ('ZZZ', 'equity', true)$$, '42501', null, 'clients cannot write ticker status');
reset role;

select is((select target_pct from public.targets where user_id = '00000000-0000-0000-0000-00000000000a' and ticker = 'VOO'), 20::numeric, 'B''s update did not touch A''s row');

-- As admin A
update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-00000000000a';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select isnt_empty($$select 1 from public.invites$$, 'admin reads invites');
select lives_ok($$insert into public.invites (email) values ('new@test.dev')$$, 'admin can invite');
reset role;

-- Signed out
set local role anon;
select throws_ok($$select 1 from public.targets$$, '42501', null, 'anon has no table access');
select is((select public.ping()), 'ok', 'anon can ping');
reset role;

select * from finish();
rollback;
```

Run: `supabase db reset && npm run db:test`
Expected: FAIL. B reads A's rows (RLS isn't enabled yet), and the `is_admin` update succeeds.

- [ ] **Step 2: write the migration** `supabase/migrations/20261010000002_rls.sql`

```sql
-- Row-level security is the whole authorization layer: the browser talks to
-- PostgREST directly with the user's JWT and there is no backend in between.

alter table public.profiles      enable row level security;
alter table public.targets       enable row level security;
alter table public.watchlist     enable row level security;
alter table public.transactions  enable row level security;
alter table public.ticker_status enable row level security;
alter table public.invites       enable row level security;

-- Nothing here is for signed-out visitors (ping() excepted).
revoke all on public.profiles, public.targets, public.watchlist, public.transactions,
              public.ticker_status, public.invites, public.holdings from anon;
grant execute on function public.ping() to anon;

-- profiles: created by the auth trigger, never by the client. is_admin must not
-- be self-assignable, so UPDATE is granted per column rather than per table.
revoke insert, update, delete on public.profiles from authenticated;
grant update (display_name, default_currency, time_zone, planned_portfolio_value, settings)
  on public.profiles to authenticated;
create policy "own profile: read" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "own profile: update" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- per-user tables
create policy "own rows" on public.targets for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.watchlist for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.transactions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- holdings is security_invoker, so the transactions policy above applies to it.

-- ticker_status: shared market metadata. Readable by any signed-in user;
-- written only with the service role, which bypasses RLS.
revoke insert, update, delete on public.ticker_status from authenticated;
create policy "read ticker status" on public.ticker_status
  for select to authenticated using (true);

-- invites: admins only. is_admin() is security definer so the check reads the
-- caller's profile regardless of policies, and cannot be pointed at anyone else.
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = (select auth.uid())),
    false)
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create policy "admins manage invites" on public.invites for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
```

- [ ] **Step 3: run the tests**

Run: `supabase db reset && npm run db:test`
Expected: `01_schema` and `02_rls` both ok.

- [ ] **Step 4: types, checks, commit**

```bash
npm run db:types
npm run format && npm run format:check && npm run typecheck && npm test
git add supabase/migrations/20261010000002_rls.sql supabase/tests/database/02_rls.test.sql supabase/types.ts
git commit -m "feat(web): row-level security — users see only their own rows, admins manage invites

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 5: Invite-only auth hook, profile trigger, local auth config

**Files:**
- Create: `supabase/migrations/20261010000003_auth.sql`
- Modify: `supabase/config.toml`
- Test: `supabase/tests/database/03_auth.test.sql`

**Interfaces:**
- Produces: `public.hook_require_invite(event jsonb) returns jsonb` (registered as the Before User Created hook), and the triggers `on_auth_user_created` / `on_auth_user_signed_in` on `auth.users`.

- [ ] **Step 1: write the failing test** `supabase/tests/database/03_auth.test.sql`

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into public.invites (email) values ('Friend@Test.dev');

select is(public.hook_require_invite('{"user":{"email":"friend@test.dev"}}'::jsonb), '{}'::jsonb,
  'invited email allowed (case-insensitive)');
select is(public.hook_require_invite('{"user":{"email":"stranger@test.dev"}}'::jsonb) -> 'error' ->> 'http_code', '403',
  'uninvited email rejected');
select is(public.hook_require_invite('{"user":{"email":"stranger@test.dev"}}'::jsonb) -> 'error' ->> 'message',
  'Richfolio is invite-only — ask Richard for an invite.', 'rejection carries the invite-only message');
select is(public.hook_require_invite('{"user":{"phone":"+61400000000"}}'::jsonb) -> 'error' ->> 'http_code', '403',
  'signup without an email rejected');

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000c', 'friend@test.dev');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-00000000000c'), 1,
  'profile row created on user creation');
select ok((select accepted_at from public.invites where email = 'friend@test.dev') is null,
  'invite not accepted until first sign-in');
update auth.users set last_sign_in_at = now() where id = '00000000-0000-0000-0000-00000000000c';
select ok((select accepted_at from public.invites where email = 'friend@test.dev') is not null,
  'first sign-in stamps accepted_at');

select ok(has_function_privilege('supabase_auth_admin', 'public.hook_require_invite(jsonb)', 'execute'),
  'auth server can run the hook');
select ok(not has_function_privilege('authenticated', 'public.hook_require_invite(jsonb)', 'execute'),
  'signed-in clients cannot call the hook');
select ok(not has_function_privilege('anon', 'public.hook_require_invite(jsonb)', 'execute'),
  'anonymous clients cannot call the hook');

select * from finish();
rollback;
```

Run: `supabase db reset && npm run db:test`
Expected: FAIL, `function public.hook_require_invite(jsonb) does not exist`.

- [ ] **Step 2: write the migration** `supabase/migrations/20261010000003_auth.sql`

```sql
-- Invite-only signup. Implemented as a Before User Created auth hook rather
-- than the "disable signups" switch, because that switch also blocks a
-- first-time Google sign-in by someone who WAS invited. The hook covers
-- magic link and Google identically.
--
-- security definer (owned by postgres, the table owner) so it can read
-- invites without a policy for supabase_auth_admin.
create function public.hook_require_invite(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.invites
     where email = (event -> 'user' ->> 'email')::extensions.citext
  ) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Richfolio is invite-only — ask Richard for an invite.'));
end $$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_require_invite(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_require_invite(jsonb) from public, anon, authenticated;

-- Profile row on user creation; invite marked accepted on first real sign-in.
-- (auth.admin.inviteUserByEmail creates the user at invite time, so creation
-- alone does not mean the person has accepted.)
create function public.handle_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  end if;
  if new.last_sign_in_at is not null and new.email is not null then
    update public.invites
       set accepted_at = coalesce(accepted_at, new.last_sign_in_at)
     where email = new.email::extensions.citext;
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_auth_user();
create trigger on_auth_user_signed_in
  after update of last_sign_in_at on auth.users
  for each row execute function public.handle_auth_user();
```

- [ ] **Step 3: configure local auth** in `supabase/config.toml`. Edit the keys that `supabase init` generated; add any section that is missing:

```toml
[auth]
site_url = "http://localhost:5173"
additional_redirect_urls = ["http://localhost:5173", "https://richfolio.richardfu.net"]
# Signups stay ON: invite-only gating is the before_user_created hook below.
# Turning signups off would also block invited friends' first Google sign-in.
enable_signup = true

[auth.email]
enable_signup = true

[auth.hook.before_user_created]
enabled = true
uri = "pg-functions://postgres/public/hook_require_invite"

# Google stays disabled locally (no client secret in the repo). Production is
# configured in the dashboard — see Task 16.
[auth.external.google]
enabled = false
```

- [ ] **Step 4: run the tests and smoke-test the hook through the real auth server**

```bash
supabase stop && supabase start   # config.toml changes need a restart
supabase db reset
npm run db:test
```

Expected: `01_schema`, `02_rls` and `03_auth` all ok.

Then, using the `anon key` printed by `supabase start`:

```bash
curl -s -X POST 'http://127.0.0.1:54321/auth/v1/otp' -H "apikey: <anon key>" -H 'Content-Type: application/json' -d '{"email":"stranger@example.com","create_user":true}'
curl -s -X POST 'http://127.0.0.1:54321/auth/v1/otp' -H "apikey: <anon key>" -H 'Content-Type: application/json' -d '{"email":"dev@example.com","create_user":true}'
```

Expected: the first call returns an error JSON whose message is `Richfolio is invite-only — ask Richard for an invite.`; the second returns `{}`, and a magic-link email for `dev@example.com` appears in Mailpit at http://127.0.0.1:54324. Write down the exact JSON shape of the first response (field names such as `msg` / `message` / `error_description`). Task 8's login page shows supabase-js's `error.message`, so confirm that this message is what surfaces.

- [ ] **Step 5: types, checks, commit**

```bash
npm run db:types
npm run format && npm run format:check && npm run typecheck && npm test
git add supabase/migrations/20261010000003_auth.sql supabase/tests/database/03_auth.test.sql supabase/config.toml supabase/types.ts
git commit -m "feat(web): invite-only signup via before_user_created hook, profile trigger

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---
### Task 6: `ticker-lookup` Edge Function

**Files:**
- Create: `supabase/functions/_shared/http.ts`
- Create: `supabase/functions/ticker-lookup/lookup.ts` (pure; also imported by `web/`)
- Create: `supabase/functions/ticker-lookup/index.ts`
- Modify: `supabase/config.toml` (function settings)
- Test: `test/tickerLookup.test.ts`

**Design note (deviation from the spec):** this uses Yahoo's **chart** endpoint (`/v8/finance/chart/{symbol}`), not the search endpoint. Tickers are typed exactly, so what's needed is an exact-symbol check. The chart response carries `currency`, `instrumentType`, `exchangeName` and `longName`, none of which the search endpoint returns. Unknown symbols get a definitive `404` + `"Not Found"`. Verified on 2026-10-09: AZN.L → `GBp / LSE / EQUITY`, BTC-USD → `CRYPTOCURRENCY / USD`.

The request is `POST {symbol, kind}`, because `supabase.functions.invoke` posts JSON.

**Interfaces:**
- Produces (from `lookup.ts`):
  - `type LookupKind = "equity" | "crypto_pair"`
  - `interface TickerInfo { symbol: string; kind: LookupKind; verified: boolean; name: string | null; exchange: string | null; quoteCurrency: string | null }`
  - `type LookupResult = { ok: true; info: TickerInfo } | { ok: false; reason: string }`
  - `normaliseTicker(raw: string, kind: LookupKind): string`
  - `isValidEquitySymbol(symbol: string): boolean`
  - `parsePair(symbol: string): { base: string; quote: string } | null`
  - `toYahooSymbol(ticker: string): string`
  - `unverifiedInfo(symbol: string, kind: LookupKind): TickerInfo`
  - `classifyYahooChart(symbol: string, status: number, body: unknown): LookupResult`
  - `findPairInstrument(symbol: string, instruments: CryptoInstrument[]): LookupResult`
  - `statusWrite(info: TickerInfo): { row: TickerStatusRow; ignoreDuplicates: boolean }`
- Produces the HTTP API `POST /functions/v1/ticker-lookup` with body `{symbol, kind}`, returning a `LookupResult` with status 200 (400 on a malformed request). It requires a user JWT.

- [ ] **Step 1: write the failing test** `test/tickerLookup.test.ts`

```ts
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  normaliseTicker,
  isValidEquitySymbol,
  parsePair,
  toYahooSymbol,
  classifyYahooChart,
  findPairInstrument,
  statusWrite,
  unverifiedInfo,
} from "../supabase/functions/ticker-lookup/lookup.js";

const chart = (meta: object) => ({ chart: { result: [{ meta }], error: null } });

describe("normaliseTicker", () => {
  test("upper-cases and strips whitespace from equities", () => {
    assert.equal(normaliseTicker("  voo ", "equity"), "VOO");
    assert.equal(normaliseTicker("azn .l", "equity"), "AZN.L");
  });
  test("normalises spaces around a pair slash", () => {
    assert.equal(normaliseTicker(" btc / cro ", "crypto_pair"), "BTC/CRO");
  });
});

describe("isValidEquitySymbol / parsePair", () => {
  test("accepts real symbol shapes, rejects junk", () => {
    for (const s of ["VOO", "AZN.L", "BRK-B", "^GSPC", "CL=F"]) assert.ok(isValidEquitySymbol(s), s);
    for (const s of ["", "voo", "VO O", ".L", "ABCDEFGHIJKLMNOP"]) assert.ok(!isValidEquitySymbol(s), s);
  });
  test("parsePair", () => {
    assert.deepEqual(parsePair("BTC/CRO"), { base: "BTC", quote: "CRO" });
    assert.equal(parsePair("BTCCRO"), null);
    assert.equal(parsePair("CRO/CRO"), null);
  });
});

describe("toYahooSymbol", () => {
  test("maps the supported crypto holdings, passes equities through", () => {
    assert.equal(toYahooSymbol("BTC"), "BTC-USD");
    assert.equal(toYahooSymbol("ETH"), "ETH-USD");
    assert.equal(toYahooSymbol("VOO"), "VOO");
  });
});

describe("classifyYahooChart", () => {
  test("verified equity carries name, exchange, currency", () => {
    const r = classifyYahooChart(
      "AZN.L",
      200,
      chart({ instrumentType: "EQUITY", longName: "AstraZeneca PLC", fullExchangeName: "LSE", currency: "GBp" }),
    );
    assert.deepEqual(r, {
      ok: true,
      info: { symbol: "AZN.L", kind: "equity", verified: true, name: "AstraZeneca PLC", exchange: "LSE", quoteCurrency: "GBp" },
    });
  });
  test("404 Not Found is a definitive no", () => {
    const r = classifyYahooChart("VOOO", 404, { chart: { result: null, error: { code: "Not Found" } } });
    assert.equal(r.ok, false);
    assert.match((r as { reason: string }).reason, /no ticker "VOOO"/);
  });
  test("throttled / blocked responses fall back to unverified, not rejection", () => {
    for (const status of [401, 403, 429, 500, 503]) {
      assert.deepEqual(classifyYahooChart("VOO", status, null), { ok: true, info: unverifiedInfo("VOO", "equity") });
    }
  });
  test("unsupported crypto holding rejected; BTC accepted", () => {
    const crypto = chart({ instrumentType: "CRYPTOCURRENCY", currency: "USD" });
    assert.equal(classifyYahooChart("SOL", 200, crypto).ok, false);
    assert.equal(classifyYahooChart("BTC-USD", 200, crypto).ok, false);
    assert.equal(classifyYahooChart("BTC", 200, crypto).ok, true);
  });
});

describe("findPairInstrument", () => {
  const instruments = [
    { symbol: "CRO_BTC", inst_type: "CCY_PAIR", tradable: true },
    { symbol: "ETH_CRO", inst_type: "CCY_PAIR", tradable: true },
    { symbol: "SOL_CRO", inst_type: "CCY_PAIR", tradable: false },
    { symbol: "BTCUSD-PERP", inst_type: "PERPETUAL_SWAP", tradable: true },
  ];
  test("either listing direction is accepted", () => {
    assert.equal(findPairInstrument("BTC/CRO", instruments).ok, true);
    assert.equal(findPairInstrument("ETH/CRO", instruments).ok, true);
  });
  test("untradable or missing markets are rejected", () => {
    assert.equal(findPairInstrument("SOL/CRO", instruments).ok, false);
    assert.equal(findPairInstrument("DOGE/CRO", instruments).ok, false);
  });
  test("malformed pair is rejected with a format hint", () => {
    const r = findPairInstrument("BTCCRO", instruments);
    assert.equal(r.ok, false);
    assert.match((r as { reason: string }).reason, /BASE\/QUOTE/);
  });
});

describe("statusWrite", () => {
  test("a verified result overwrites", () => {
    const info = { symbol: "VOO", kind: "equity" as const, verified: true, name: "Vanguard", exchange: "NYSEArca", quoteCurrency: "USD" };
    const w = statusWrite(info);
    assert.equal(w.ignoreDuplicates, false);
    assert.equal(w.row.quote_currency, "USD");
  });
  test("an unverified result never overwrites an existing row", () => {
    assert.equal(statusWrite(unverifiedInfo("VOO", "equity")).ignoreDuplicates, true);
  });
});
```

Run: `node --import=tsx/esm --test test/tickerLookup.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 2: create `supabase/functions/ticker-lookup/lookup.ts`**

```ts
// Pure ticker-lookup logic: no Deno APIs, no imports. Imported by the Edge
// Function (index.ts), by the web app (input normalisation, shared types), and
// by test/tickerLookup.test.ts under Node.

export type LookupKind = "equity" | "crypto_pair";

export interface TickerInfo {
  symbol: string;
  kind: LookupKind;
  verified: boolean;
  name: string | null;
  exchange: string | null;
  quoteCurrency: string | null;
}

export type LookupResult = { ok: true; info: TickerInfo } | { ok: false; reason: string };

export interface CryptoInstrument {
  symbol: string;
  inst_type: string;
  tradable: boolean;
}

// Mirrors tickerMap in src/config.ts: the only crypto the pipeline can price as
// a holding. Anything else would be stored and then silently never reported.
const CRYPTO_HOLDINGS: Record<string, string> = { BTC: "BTC-USD", ETH: "ETH-USD" };

// Same patterns as the CHECK constraints in the foundation migration.
const EQUITY_RE = /^[A-Z0-9][A-Z0-9.=^-]{0,14}$/;
const PAIR_RE = /^([A-Z0-9]+)\/([A-Z0-9]+)$/;

export function normaliseTicker(raw: string, kind: LookupKind): string {
  const upper = raw.trim().toUpperCase();
  return kind === "crypto_pair"
    ? upper
        .split("/")
        .map((p) => p.trim())
        .join("/")
    : upper.replace(/\s+/g, "");
}

export function isValidEquitySymbol(symbol: string): boolean {
  return EQUITY_RE.test(symbol);
}

export function parsePair(symbol: string): { base: string; quote: string } | null {
  const m = PAIR_RE.exec(symbol);
  if (!m || m[1] === m[2]) return null;
  return { base: m[1], quote: m[2] };
}

export function toYahooSymbol(ticker: string): string {
  return CRYPTO_HOLDINGS[ticker] ?? ticker;
}

export function unverifiedInfo(symbol: string, kind: LookupKind): TickerInfo {
  return { symbol, kind, verified: false, name: null, exchange: null, quoteCurrency: null };
}

interface ChartMeta {
  instrumentType?: string;
  longName?: string;
  shortName?: string;
  fullExchangeName?: string;
  exchangeName?: string;
  currency?: string;
}

interface ChartBody {
  chart?: { result?: Array<{ meta?: ChartMeta }> | null; error?: { code?: string } | null };
}

export function classifyYahooChart(symbol: string, status: number, body: unknown): LookupResult {
  const chart = (body as ChartBody | null)?.chart;
  // Yahoo answers an unknown symbol with HTTP 404 and chart.error.code
  // "Not Found". That is a definitive no. A 401/403/429/5xx says nothing about
  // the symbol (throttling, or cloud egress being refused), so it must fall
  // back to saving unverified rather than blocking the user.
  if (status === 404 || chart?.error?.code === "Not Found") {
    return {
      ok: false,
      reason: `Yahoo Finance has no ticker "${symbol}". Check the spelling and exchange suffix (e.g. AZN.L).`,
    };
  }
  const meta = chart?.result?.[0]?.meta;
  if (status !== 200 || !meta) return { ok: true, info: unverifiedInfo(symbol, "equity") };

  if (meta.instrumentType === "CRYPTOCURRENCY" && !(symbol in CRYPTO_HOLDINGS)) {
    return { ok: false, reason: "Only BTC and ETH are supported as crypto holdings for now." };
  }
  return {
    ok: true,
    info: {
      symbol,
      kind: "equity",
      verified: true,
      name: meta.longName ?? meta.shortName ?? null,
      exchange: meta.fullExchangeName ?? meta.exchangeName ?? null,
      quoteCurrency: meta.currency ?? null,
    },
  };
}

// Same spot-only, either-direction rule as resolveInstrument() in
// src/fetchCrypto.ts. Duplicated rather than imported because an Edge Function
// deploys only what lives under supabase/functions.
export function findPairInstrument(symbol: string, instruments: CryptoInstrument[]): LookupResult {
  const pair = parsePair(symbol);
  if (!pair) return { ok: false, reason: "Use BASE/QUOTE, e.g. BTC/CRO." };
  const { base, quote } = pair;
  const spot = new Map(
    instruments.filter((i) => i.inst_type === "CCY_PAIR" && i.tradable).map((i) => [i.symbol, i]),
  );
  if (!spot.has(`${base}_${quote}`) && !spot.has(`${quote}_${base}`)) {
    return { ok: false, reason: `crypto.com has no tradable ${base}/${quote} market in either direction.` };
  }
  return {
    ok: true,
    info: {
      symbol,
      kind: "crypto_pair",
      verified: true,
      name: `${base} priced in ${quote}`,
      exchange: "crypto.com",
      quoteCurrency: quote,
    },
  };
}

export interface TickerStatusRow {
  symbol: string;
  kind: LookupKind;
  verified: boolean;
  name: string | null;
  exchange: string | null;
  quote_currency: string | null;
  checked_at: string;
}

export function statusWrite(info: TickerInfo): { row: TickerStatusRow; ignoreDuplicates: boolean } {
  return {
    row: {
      symbol: info.symbol,
      kind: info.kind,
      verified: info.verified,
      name: info.name,
      exchange: info.exchange,
      quote_currency: info.quoteCurrency,
      checked_at: new Date().toISOString(),
    },
    // A failed check says nothing new about a symbol verified earlier, so it
    // may only insert a never-seen symbol, never overwrite an existing row.
    ignoreDuplicates: !info.verified,
  };
}
```

- [ ] **Step 3: run the tests**

Run: `node --import=tsx/esm --test test/tickerLookup.test.ts`
Expected: PASS.

- [ ] **Step 4: create `supabase/functions/_shared/http.ts`**

```ts
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 5: create `supabase/functions/ticker-lookup/index.ts`**

```ts
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/http.ts";
import {
  classifyYahooChart,
  findPairInstrument,
  normaliseTicker,
  parsePair,
  statusWrite,
  toYahooSymbol,
  unverifiedInfo,
  type LookupKind,
  type LookupResult,
} from "./lookup.ts";

const TIMEOUT_MS = 5000;
const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart/";
const CRYPTO_INSTRUMENTS = "https://api.crypto.com/exchange/v1/public/get-instruments";

async function lookupEquity(symbol: string): Promise<LookupResult> {
  const res = await fetch(
    `${YAHOO_CHART}${encodeURIComponent(toYahooSymbol(symbol))}?range=1d&interval=1d`,
    { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  return classifyYahooChart(symbol, res.status, await res.json().catch(() => null));
}

async function lookupPair(symbol: string): Promise<LookupResult> {
  if (!parsePair(symbol)) return findPairInstrument(symbol, []); // format error, no fetch
  const res = await fetch(CRYPTO_INSTRUMENTS, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) return { ok: true, info: unverifiedInfo(symbol, "crypto_pair") };
  const body = await res.json();
  return findPairInstrument(symbol, body?.result?.data ?? []);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { symbol: raw, kind } = (await req.json().catch(() => ({}))) as {
    symbol?: unknown;
    kind?: LookupKind;
  };
  if (typeof raw !== "string" || (kind !== "equity" && kind !== "crypto_pair")) {
    return json({ ok: false, reason: "symbol and kind are required." }, 400);
  }
  const symbol = normaliseTicker(raw, kind);

  let result: LookupResult;
  try {
    result = kind === "equity" ? await lookupEquity(symbol) : await lookupPair(symbol);
  } catch (err) {
    // Timeout or network failure: never block the user, save unverified.
    console.error(`lookup ${kind} ${symbol} failed:`, err);
    result = { ok: true, info: unverifiedInfo(symbol, kind) };
  }

  if (result.ok) {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { row, ignoreDuplicates } = statusWrite(result.info);
    const { error } = await admin
      .from("ticker_status")
      .upsert(row, { onConflict: "symbol", ignoreDuplicates });
    if (error) console.error("ticker_status upsert failed:", error);
  }
  return json(result);
});
```

- [ ] **Step 6: function settings** — append to `supabase/config.toml`:

```toml
[functions.ticker-lookup]
verify_jwt = true
```

- [ ] **Step 7: exercise it locally**

```bash
supabase functions serve ticker-lookup
```

In another shell, get a user token by signing in `dev@example.com`. Request a magic link (Task 5's curl), open it from Mailpit, and copy `access_token` from the redirect URL fragment. Then:

```bash
T=<access_token>
curl -s -X POST http://127.0.0.1:54321/functions/v1/ticker-lookup -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"symbol":" azn.l ","kind":"equity"}'
curl -s -X POST http://127.0.0.1:54321/functions/v1/ticker-lookup -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"symbol":"VOOOX1","kind":"equity"}'
curl -s -X POST http://127.0.0.1:54321/functions/v1/ticker-lookup -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"symbol":"btc/cro","kind":"crypto_pair"}'
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:54321/functions/v1/ticker-lookup -d '{}'
```

Expected:
- `{"ok":true,"info":{"symbol":"AZN.L",...,"verified":true,...,"quoteCurrency":"GBp"}}`
- `{"ok":false,"reason":"Yahoo Finance has no ticker \"VOOOX1\"..."}`
- `{"ok":true,...,"symbol":"BTC/CRO",...}`
- `401` (no JWT)

Then check `select * from ticker_status` in Studio (http://127.0.0.1:54323) shows AZN.L and BTC/CRO.

- [ ] **Step 8: checks and commit**

```bash
npm run format && npm run format:check && npm run typecheck && npm test
git add supabase/functions/_shared supabase/functions/ticker-lookup supabase/config.toml test/tickerLookup.test.ts
git commit -m "feat(web): ticker-lookup edge function — Yahoo chart + crypto.com validation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 7: `send-invite` Edge Function

**Files:**
- Create: `supabase/functions/send-invite/logic.ts`, `supabase/functions/send-invite/index.ts`
- Modify: `supabase/config.toml`
- Test: `test/sendInvite.test.ts`

**Interfaces:**
- Consumes: `public.is_admin()` (Task 4), `public.invites` (Task 3), and the hook (Task 5).
- Produces the HTTP API `POST /functions/v1/send-invite` with body `{email}`. It returns `{ok:true}` with status 200, or `{error: string}` with one of: 400 invalid email, 403 not admin, 409 already registered, 500 database error, 502 email send failure.

- [ ] **Step 1: write the failing test** `test/sendInvite.test.ts`

```ts
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
```

Run: `node --import=tsx/esm --test test/sendInvite.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 2: create `supabase/functions/send-invite/logic.ts`**

```ts
// Pure helpers for send-invite; tested under Node by test/sendInvite.test.ts.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normaliseEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : null;
}

export function inviteErrorResponse(message: string): { status: number; message: string } {
  // GoTrue's wording for an existing account has changed across versions, so
  // match the meaning loosely rather than one exact string.
  if (/already (been )?registered|already exists/i.test(message)) {
    return { status: 409, message: "That person already has an account — they can sign in directly." };
  }
  return { status: 502, message: `Invite email failed: ${message}` };
}
```

- [ ] **Step 3: run the tests**

Run: `node --import=tsx/esm --test test/sendInvite.test.ts`
Expected: PASS.

- [ ] **Step 4: create `supabase/functions/send-invite/index.ts`**

```ts
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/http.ts";
import { inviteErrorResponse, normaliseEmail } from "./logic.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  // Ask as the caller: is_admin() reads the caller's own profile via their JWT.
  const asCaller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: userData } = await asCaller.auth.getUser();
  const { data: isAdmin } = await asCaller.rpc("is_admin");
  if (!userData.user || isAdmin !== true) return json({ error: "Admins only." }, 403);

  const body = (await req.json().catch(() => ({}))) as { email?: unknown };
  const email = normaliseEmail(body.email);
  if (!email) return json({ error: "Enter a valid email address." }, 400);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // The invite row must exist BEFORE inviteUserByEmail: that call creates the
  // auth user, which runs the before_user_created hook, which rejects any email
  // not in invites.
  const { error: rowError } = await admin
    .from("invites")
    .upsert({ email, invited_by: userData.user.id }, { onConflict: "email" });
  if (rowError) return json({ error: rowError.message }, 500);

  const { error } = await admin.auth.admin.inviteUserByEmail(email);
  if (error) {
    const r = inviteErrorResponse(error.message);
    return json({ error: r.message }, r.status);
  }
  return json({ ok: true });
});
```

- [ ] **Step 5: function settings** — append to `supabase/config.toml`:

```toml
[functions.send-invite]
verify_jwt = true
```

- [ ] **Step 6: exercise it locally**

With `supabase functions serve`, and `dev@example.com` signed in (token `T` as in Task 6):

```bash
curl -s -X POST http://127.0.0.1:54321/functions/v1/send-invite -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"email":"friend@example.com"}'
```

Expected: `{"error":"Admins only."}` (403). Make dev an admin in Studio's SQL editor:

```sql
update public.profiles set is_admin = true
 where id = (select id from auth.users where email = 'dev@example.com');
```

Repeat the curl. Expected: `{"ok":true}`, and an invite email for friend@example.com appears in Mailpit. Repeat once more. Expected: `409` with `already has an account`.

- [ ] **Step 7: checks and commit**

```bash
npm run format && npm run format:check && npm run typecheck && npm test
git add supabase/functions/send-invite supabase/config.toml test/sendInvite.test.ts
git commit -m "feat(web): send-invite edge function for admin invites

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---
### Task 8: Web app — scaffold, sign-in, onboarding, settings

The first runnable slice of the site. A person can sign in (magic link locally; Google arrives with the production setup in Task 16), complete `/welcome`, and edit their settings.

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/index.html`, `web/.env.example`, `web/.gitignore`, `web/public/_redirects`
- Create: `web/src/vite-env.d.ts`, `web/src/main.tsx`, `web/src/routes.ts`, `web/src/supabase.ts`, `web/src/auth.tsx`, `web/src/db.ts`, `web/src/styles.css`
- Create: `web/src/lib/authErrors.ts`, `web/src/lib/authErrors.test.ts`, `web/src/lib/settings.ts`, `web/src/lib/settings.test.ts`
- Create: `web/src/components/Layout.tsx`, `web/src/components/ProfileFields.tsx`, `web/src/components/AlertFields.tsx`
- Create: `web/src/pages/Login.tsx`, `web/src/pages/Welcome.tsx`, `web/src/pages/Settings.tsx`, `web/src/pages/Privacy.tsx`

**Interfaces:**
- Consumes: `supabase/types.ts` (`Database`, `Json`); `SUPPORTED_CURRENCIES`, `DEFAULT_ALERTS`, `IntradayAlertConfig` from `src/configSchema.ts`; `supabase/settings.schema.json`.
- Produces:
  - `HOME_PATH: string` (`routes.ts`; `"/settings"` now, changed to `"/portfolio"` in Task 9)
  - `supabase` client (`supabase.ts`)
  - `useAuth(): { session, profile, loading, refreshProfile }`, `<RequireAuth/>`, `<RequireAdmin/>` (`auth.tsx`)
  - `unwrap`, `DbError`, `toJson`, `Profile`, `ProfilePatch`, `getProfile`, `updateProfile` (`db.ts`; later tasks append to this file)
  - `UserSettings`, `DEFAULT_SETTINGS`, `withDefaults`, `validateSettings` (`lib/settings.ts`)
  - `authErrorFromUrl(href): string | null` (`lib/authErrors.ts`)
  - `<Layout/>`, `<Footer/>`, `DISCLAIMER` (`components/Layout.tsx`)

- [ ] **Step 1: create the package**

`web/package.json`:

```json
{
  "name": "richfolio-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "node --import=tsx/esm --test src/lib/*.test.ts",
    "format": "prettier --write \"src/**/*.{ts,tsx}\"",
    "format:check": "prettier --check \"src/**/*.{ts,tsx}\""
  }
}
```

`build` is deliberately `vite build` without `tsc`. Type-checking reaches into `../src`, whose type imports need the root `node_modules`. Cloudflare Pages only installs `web/`, so type-checking runs in CI instead (Task 13).

```bash
cd web
npm install react react-dom react-router-dom @supabase/supabase-js ajv
npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom @types/node tsx prettier
```

`web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

`web/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // The app imports the pipeline's pure config parser (../src/configSchema.ts),
  // the shared settings schema and ticker-lookup logic (../supabase/). Vite's
  // dev server refuses files outside web/ unless allowed.
  server: { fs: { allow: [".."] } },
});
```

`web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="dark" />
    <title>Richfolio</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`web/public/_redirects` (Cloudflare Pages SPA fallback):

```
/* /index.html 200
```

`web/.env.example`:

```
# Local: values printed by `supabase start` (or `supabase status`).
# Production: set in Cloudflare Pages → Settings → Environment variables.
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=
```

`web/.gitignore`:

```
node_modules
dist
.env.local
```

`web/src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}
```

- [ ] **Step 2: write the failing pure-logic tests**

`web/src/lib/authErrors.test.ts`:

```ts
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
    const href = "https://x.dev/login#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired";
    assert.equal(authErrorFromUrl(href), "That link expired — send a new one.");
  });
  test("bare error with no description gets a generic message", () => {
    assert.equal(authErrorFromUrl("https://x.dev/login?error=server_error"), "Sign-in failed — try again.");
  });
});
```

`web/src/lib/settings.test.ts`:

```ts
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, validateSettings, withDefaults } from "./settings";

describe("validateSettings", () => {
  test("defaults are valid", () => {
    assert.deepEqual(validateSettings(DEFAULT_SETTINGS), []);
  });
  test("wrong type is reported with its path", () => {
    const errors = validateSettings({ intradayAlerts: { minConfidenceToAlert: "high" } });
    assert.ok(errors.some((e) => e.includes("/intradayAlerts/minConfidenceToAlert")), errors.join("; "));
  });
  test("unknown keys and actions are rejected", () => {
    assert.ok(validateSettings({ unknownKey: true }).length > 0);
    assert.ok(validateSettings({ cryptoAlerts: { onlyAlertForActions: ["SELL"] } }).length > 0);
  });
});

describe("withDefaults", () => {
  test("fills gaps from the pipeline defaults", () => {
    const s = withDefaults({ intradayAlerts: { minConfidenceToAlert: 70 } });
    assert.equal(s.intradayAlerts.minConfidenceToAlert, 70);
    assert.equal(s.intradayAlerts.minPriceMovePctToAlert, 1.0);
    assert.deepEqual(s.cryptoAlerts, DEFAULT_SETTINGS.cryptoAlerts);
    assert.equal(s.delivery.email, true);
  });
  test("null/empty becomes the defaults", () => {
    assert.deepEqual(withDefaults(null), DEFAULT_SETTINGS);
    assert.deepEqual(withDefaults({}), DEFAULT_SETTINGS);
  });
});
```

Run: `npm test` (in `web/`)
Expected: FAIL, modules not found.

- [ ] **Step 3: implement the pure modules**

`web/src/lib/authErrors.ts`:

```ts
const EXPIRED = "That link expired — send a new one.";
const GENERIC = "Sign-in failed — try again.";

/**
 * Supabase reports a failed magic link or OAuth sign-in (including our
 * invite-only hook refusing a Google account) as redirect URL parameters, in
 * the query string under PKCE and in the hash otherwise, not as an API error
 * the page can catch.
 */
export function authErrorFromUrl(href: string): string | null {
  const url = new URL(href);
  const query = url.searchParams;
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const get = (k: string) => query.get(k) ?? hash.get(k);

  if (!get("error") && !get("error_code") && !get("error_description")) return null;
  if (get("error_code") === "otp_expired") return EXPIRED;
  return get("error_description") ?? GENERIC;
}
```

`web/src/lib/settings.ts`:

```ts
import Ajv from "ajv";
import schema from "../../../supabase/settings.schema.json";
import { DEFAULT_ALERTS, type IntradayAlertConfig } from "../../../src/configSchema.js";

export interface UserSettings {
  intradayAlerts: IntradayAlertConfig;
  cryptoAlerts: IntradayAlertConfig;
  ai: { strongBuyRequiresAllProviders: boolean };
  delivery: { email: boolean; telegram: boolean };
}

export const DEFAULT_SETTINGS: UserSettings = {
  intradayAlerts: { ...DEFAULT_ALERTS },
  cryptoAlerts: { ...DEFAULT_ALERTS },
  ai: { strongBuyRequiresAllProviders: false },
  delivery: { email: true, telegram: false },
};

// Same schema file the database CHECK embeds, so a form that passes here is
// one the database accepts.
const validate = new Ajv({ allErrors: true }).compile(schema);

export function validateSettings(value: unknown): string[] {
  if (validate(value)) return [];
  return (validate.errors ?? []).map((e) => `${e.instancePath || "settings"} ${e.message ?? ""}`);
}

/** Stored settings are partial (every key optional); fill gaps with the pipeline's defaults. */
export function withDefaults(stored: unknown): UserSettings {
  const s = (stored ?? {}) as Partial<Record<keyof UserSettings, object>>;
  return {
    intradayAlerts: { ...DEFAULT_ALERTS, ...s.intradayAlerts },
    cryptoAlerts: { ...DEFAULT_ALERTS, ...s.cryptoAlerts },
    ai: { ...DEFAULT_SETTINGS.ai, ...s.ai },
    delivery: { ...DEFAULT_SETTINGS.delivery, ...s.delivery },
  };
}
```

Run: `npm test` (in `web/`)
Expected: PASS.

- [ ] **Step 4: client, routes, auth, data access**

`web/src/routes.ts`:

```ts
/** Where a signed-in user lands. Becomes "/portfolio" once that page exists (Task 9). */
export const HOME_PATH = "/settings";
```

`web/src/supabase.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../supabase/types";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  throw new Error("VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set (see web/.env.example).");
}

// The anon key is public by design: row-level security decides what any
// request can touch. The service-role key must never appear in web/.
export const supabase = createClient<Database>(url, anonKey, {
  auth: { flowType: "pkce" },
});
```

`web/src/db.ts`:

```ts
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Database, Json } from "../../supabase/types";

type Tables = Database["public"]["Tables"];
export type Profile = Tables["profiles"]["Row"];
export type ProfilePatch = Pick<
  Tables["profiles"]["Update"],
  "display_name" | "default_currency" | "time_zone" | "planned_portfolio_value" | "settings"
>;

export class DbError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

export function unwrap<T>(res: { data: T; error: PostgrestError | null }): T {
  if (res.error) {
    console.error("Supabase error", res.error.code, res.error.message);
    throw new DbError(res.error.message, res.error.code);
  }
  return res.data;
}

/** Typed settings objects are interfaces, which TS won't widen to Json on its own. */
export function toJson(value: object): Json {
  return value as unknown as Json;
}

export async function getProfile(id: string): Promise<Profile | null> {
  return unwrap(await supabase.from("profiles").select("*").eq("id", id).maybeSingle());
}

export async function updateProfile(id: string, patch: ProfilePatch): Promise<void> {
  unwrap(await supabase.from("profiles").update(patch).eq("id", id));
}
```

`web/src/auth.tsx`:

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { supabase } from "./supabase";
import { getProfile, type Profile } from "./db";
import { HOME_PATH } from "./routes";

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(s: Session | null) {
    setProfile(s ? await getProfile(s.user.id) : null);
  }

  useEffect(() => {
    void supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session).catch((err) => console.error("profile load failed", err));
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // Supabase warns that awaiting another supabase call inside this callback
      // can deadlock its auth lock, so the profile load is deferred a tick.
      setTimeout(() => void loadProfile(s).catch((err) => console.error(err)), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const refreshProfile = () => loadProfile(session);
  return (
    <AuthContext.Provider value={{ session, profile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function RequireAuth() {
  const { session, profile, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p className="muted centered">Loading…</p>;
  if (!session) {
    // Carry query and hash through: a refused Google sign-in arrives here as
    // ?error_description=…, and /login is what displays it.
    return <Navigate to={{ pathname: "/login", search: location.search, hash: location.hash }} replace />;
  }
  if (profile && !profile.display_name && location.pathname !== "/welcome") {
    return <Navigate to="/welcome" replace />;
  }
  return <Outlet />;
}

export function RequireAdmin() {
  const { profile } = useAuth();
  return profile?.is_admin ? <Outlet /> : <Navigate to={HOME_PATH} replace />;
}
```

- [ ] **Step 5: shared components**

`web/src/components/Layout.tsx`:

```tsx
import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth";
import { supabase } from "../supabase";

export const DISCLAIMER =
  "General advice only. Richfolio's signals do not take into account your objectives, " +
  "financial situation or needs. Consider whether they are appropriate for you, and seek " +
  "independent advice, before acting on them.";

export function Footer() {
  return (
    <footer className="footer">
      <p>{DISCLAIMER}</p>
      <Link to="/privacy">Privacy</Link>
    </footer>
  );
}

export function Layout() {
  const { profile } = useAuth();
  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">Richfolio</span>
        <nav>
          <NavLink to="/settings">Settings</NavLink>
          {profile?.is_admin && <NavLink to="/admin">Admin</NavLink>}
        </nav>
        <button className="link" onClick={() => void supabase.auth.signOut()}>
          Sign out
        </button>
      </header>
      <main>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
```

(Tasks 9 and 10 add `Portfolio` and `Watchlist` links before `Settings`.)

`web/src/components/ProfileFields.tsx`:

```tsx
import { useMemo, type ChangeEvent } from "react";
import { SUPPORTED_CURRENCIES } from "../../../src/configSchema.js";
import type { Profile, ProfilePatch } from "../db";

export interface ProfileValues {
  display_name: string;
  default_currency: string;
  time_zone: string;
  planned_portfolio_value: string;
}

export function profileValues(p: Profile | null, fallbackName = ""): ProfileValues {
  return {
    display_name: p?.display_name ?? fallbackName,
    default_currency: p?.default_currency ?? "USD",
    time_zone: p?.display_name ? p.time_zone : Intl.DateTimeFormat().resolvedOptions().timeZone,
    planned_portfolio_value: p && p.planned_portfolio_value > 0 ? String(p.planned_portfolio_value) : "",
  };
}

/** Returns the patch, or an error message for the first invalid field. */
export function toProfilePatch(v: ProfileValues): ProfilePatch | string {
  if (!v.display_name.trim()) return "Enter your name.";
  const zones = Intl.supportedValuesOf("timeZone");
  if (v.time_zone !== "UTC" && !zones.includes(v.time_zone)) return "Pick a time zone from the list.";
  const planned = v.planned_portfolio_value === "" ? 0 : Number(v.planned_portfolio_value);
  if (!Number.isFinite(planned) || planned < 0) return "Planned portfolio size must be 0 or more.";
  return {
    display_name: v.display_name.trim(),
    default_currency: v.default_currency,
    time_zone: v.time_zone,
    planned_portfolio_value: planned,
  };
}

export function ProfileFields({
  value,
  onChange,
}: {
  value: ProfileValues;
  onChange: (v: ProfileValues) => void;
}) {
  const zones = useMemo(() => Intl.supportedValuesOf("timeZone"), []);
  const set =
    (key: keyof ProfileValues) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange({ ...value, [key]: e.target.value });

  return (
    <>
      <label>
        Name
        <input required value={value.display_name} onChange={set("display_name")} />
      </label>
      <label>
        Currency
        <select value={value.default_currency} onChange={set("default_currency")}>
          {SUPPORTED_CURRENCIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label>
        Time zone
        <input list="time-zones" value={value.time_zone} onChange={set("time_zone")} />
        <datalist id="time-zones">
          {zones.map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
      </label>
      <label>
        Planned portfolio size ({value.default_currency})
        <input
          type="number"
          min="0"
          step="any"
          value={value.planned_portfolio_value}
          onChange={set("planned_portfolio_value")}
        />
        <small>
          What you intend to invest in total, including cash not yet deployed. Allocation gaps are
          measured against the larger of this and your current holdings' value.
        </small>
      </label>
    </>
  );
}
```

`web/src/components/AlertFields.tsx`:

```tsx
import type { ChangeEvent } from "react";
import type { IntradayAlertConfig } from "../../../src/configSchema.js";

const ACTIONS = ["STRONG BUY", "BUY", "HOLD", "WAIT"];

export function AlertFields({
  title,
  value,
  onChange,
}: {
  title: string;
  value: IntradayAlertConfig;
  onChange: (v: IntradayAlertConfig) => void;
}) {
  const num = (key: keyof IntradayAlertConfig) => (e: ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [key]: Number(e.target.value) });
  const toggleAction = (action: string, on: boolean) =>
    onChange({
      ...value,
      onlyAlertForActions: on
        ? [...value.onlyAlertForActions, action]
        : value.onlyAlertForActions.filter((a) => a !== action),
    });

  return (
    <fieldset>
      <legend>{title}</legend>
      <label className="check">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
        />
        Enabled
      </label>
      <label>
        Minimum confidence to alert (%)
        <input type="number" min="0" max="100" value={value.minConfidenceToAlert} onChange={num("minConfidenceToAlert")} />
      </label>
      <label>
        Confidence rise that triggers an alert (points)
        <input type="number" min="0" max="100" value={value.confidenceIncreaseThreshold} onChange={num("confidenceIncreaseThreshold")} />
      </label>
      <label>
        Minimum price move since the baseline (%)
        <input type="number" min="0" max="100" step="0.1" value={value.minPriceMovePctToAlert} onChange={num("minPriceMovePctToAlert")} />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={value.actionUpgradesAlert}
          onChange={(e) => onChange({ ...value, actionUpgradesAlert: e.target.checked })}
        />
        Alert when an action upgrades (e.g. BUY → STRONG BUY)
      </label>
      <div className="inline">
        Alert for:
        {ACTIONS.map((a) => (
          <label className="check" key={a}>
            <input
              type="checkbox"
              checked={value.onlyAlertForActions.includes(a)}
              onChange={(e) => toggleAction(a, e.target.checked)}
            />
            {a}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
```

- [ ] **Step 6: pages**

`web/src/pages/Login.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth";
import { supabase } from "../supabase";
import { authErrorFromUrl } from "../lib/authErrors";
import { Footer } from "../components/Layout";
import { HOME_PATH } from "../routes";

export function Login() {
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => authErrorFromUrl(window.location.href));

  if (!loading && session) return <Navigate to={HOME_PATH} replace />;
  const redirectTo = `${window.location.origin}${HOME_PATH}`;

  async function sendLink(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });
    setBusy(false);
    // An uninvited address is refused here by the before_user_created hook;
    // its message is the invite-only copy.
    if (error) setError(error.message);
    else setSent(true);
  }

  async function google() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) setError(error.message);
  }

  return (
    <div className="centered">
      <div className="card narrow">
        <h1>Richfolio</h1>
        <p className="muted">Daily portfolio briefs, by invitation.</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {sent ? (
          <p className="ok">Check your inbox for a sign-in link, and open it in this browser.</p>
        ) : (
          <form onSubmit={sendLink}>
            <label>
              Email
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <button disabled={busy}>{busy ? "Sending…" : "Send magic link"}</button>
          </form>
        )}
        <div className="divider">or</div>
        <button className="secondary" onClick={() => void google()}>
          Continue with Google
        </button>
      </div>
      <Footer />
    </div>
  );
}
```

`web/src/pages/Welcome.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { updateProfile } from "../db";
import { ProfileFields, profileValues, toProfilePatch } from "../components/ProfileFields";
import { HOME_PATH } from "../routes";

export function Welcome() {
  const { session, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const googleName = (session?.user.user_metadata?.full_name as string | undefined) ?? "";
  const [values, setValues] = useState(() => profileValues(profile, googleName));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    const patch = toProfilePatch(values);
    if (typeof patch === "string") return setError(patch);
    setBusy(true);
    try {
      await updateProfile(session.user.id, patch);
      await refreshProfile();
      navigate(HOME_PATH, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="centered">
      <form className="card narrow" onSubmit={save}>
        <h1>Welcome to Richfolio</h1>
        <p className="muted">A few basics, then you'll set up your portfolio.</p>
        {error && <p className="error">{error}</p>}
        <ProfileFields value={values} onChange={setValues} />
        <button disabled={busy}>{busy ? "Saving…" : "Continue"}</button>
      </form>
    </div>
  );
}
```

`web/src/pages/Settings.tsx`:

```tsx
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth";
import { toJson, updateProfile } from "../db";
import { DEFAULT_SETTINGS, validateSettings, withDefaults, type UserSettings } from "../lib/settings";
import {
  ProfileFields,
  profileValues,
  toProfilePatch,
  type ProfileValues,
} from "../components/ProfileFields";
import { AlertFields } from "../components/AlertFields";

export function Settings() {
  const { session, profile, refreshProfile } = useAuth();
  const [values, setValues] = useState<ProfileValues>(() => profileValues(profile));
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setValues(profileValues(profile));
    setSettings(withDefaults(profile.settings));
  }, [profile]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    setSaved(false);
    const patch = toProfilePatch(values);
    if (typeof patch === "string") return setError(patch);
    const problems = validateSettings(settings);
    if (problems.length) return setError(problems.join("; "));
    setBusy(true);
    setError(null);
    try {
      await updateProfile(session.user.id, { ...patch, settings: toJson(settings) });
      await refreshProfile();
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Settings</h1>
      <form className="card" onSubmit={save}>
        {error && <p className="error">{error}</p>}
        <ProfileFields value={values} onChange={setValues} />

        <fieldset>
          <legend>Delivery</legend>
          <label className="check">
            <input
              type="checkbox"
              checked={settings.delivery.email}
              onChange={(e) =>
                setSettings({ ...settings, delivery: { ...settings.delivery, email: e.target.checked } })
              }
            />
            Email briefs
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.delivery.telegram} disabled readOnly />
            Telegram <small>(linking arrives with the key-setup update)</small>
          </label>
        </fieldset>

        <details>
          <summary>Advanced</summary>
          <AlertFields
            title="Intraday alerts"
            value={settings.intradayAlerts}
            onChange={(v) => setSettings({ ...settings, intradayAlerts: v })}
          />
          <AlertFields
            title="Crypto pair alerts"
            value={settings.cryptoAlerts}
            onChange={(v) => setSettings({ ...settings, cryptoAlerts: v })}
          />
          <label className="check">
            <input
              type="checkbox"
              checked={settings.ai.strongBuyRequiresAllProviders}
              onChange={(e) =>
                setSettings({ ...settings, ai: { strongBuyRequiresAllProviders: e.target.checked } })
              }
            />
            STRONG BUY only when every AI provider agrees
          </label>
        </details>

        <button disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        {saved && <span className="ok"> Saved.</span>}
      </form>
    </>
  );
}
```

`web/src/pages/Privacy.tsx`:

```tsx
import { Link } from "react-router-dom";
import { Footer } from "../components/Layout";

export function Privacy() {
  return (
    <div className="centered">
      <article className="card">
        <h1>Privacy</h1>
        <p>Richfolio is a small invite-only service run by Richard Fu. This is what it keeps and why.</p>
        <h2>What is stored</h2>
        <ul>
          <li>Your email address and name, to sign you in and send your briefs.</li>
          <li>Your target allocation, holdings and transactions, watchlist and alert settings, to produce your briefs.</li>
        </ul>
        <h2>Where, and who can see it</h2>
        <p>
          Data lives in a Supabase database in Sydney. Other users cannot see any of it; the
          database enforces that on every request. As the operator, Richard has administrative
          access to the database.
        </p>
        <h2>What it is not used for</h2>
        <p>
          It is never sold or shared. It is not used to train any model. If that ever changes, it
          will be opt-in, off by default, and asked for explicitly.
        </p>
        <h2>Deleting your data</h2>
        <p>Ask Richard and your account and everything attached to it will be deleted.</p>
        <p>
          <Link to="/login">Back</Link>
        </p>
      </article>
      <Footer />
    </div>
  );
}
```

- [ ] **Step 7: router, entry point, styles**

`web/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { AuthProvider, RequireAdmin, RequireAuth } from "./auth";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Privacy } from "./pages/Privacy";
import { Welcome } from "./pages/Welcome";
import { Settings } from "./pages/Settings";
import { HOME_PATH } from "./routes";
import "./styles.css";

const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  { path: "/privacy", element: <Privacy /> },
  {
    element: <RequireAuth />,
    children: [
      { path: "/welcome", element: <Welcome /> },
      {
        element: <Layout />,
        children: [
          { path: "/settings", element: <Settings /> },
          { element: <RequireAdmin />, children: [] },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to={HOME_PATH} replace /> },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
);
```

(Task 12 fills the `RequireAdmin` children with `/admin`.)

`web/src/styles.css`:

```css
:root {
  --bg: #0f1115;
  --panel: #171a21;
  --border: #2a2f3a;
  --text: #e6e8ec;
  --muted: #8b93a3;
  --accent: #4f8cff;
  --good: #3fb37f;
  --warn: #e0a43a;
  --bad: #e5534b;
  --radius: 10px;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  color-scheme: dark;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); line-height: 1.5; }
a { color: var(--accent); }
h1 { font-size: 1.5rem; margin: 0 0 1rem; }
h2 { font-size: 1.1rem; margin: 0 0 0.75rem; }
.shell { max-width: 960px; margin: 0 auto; padding: 0 16px; }
.topbar { display: flex; align-items: center; gap: 1.5rem; padding: 1rem 0; border-bottom: 1px solid var(--border); margin-bottom: 1.5rem; flex-wrap: wrap; }
.topbar nav { display: flex; gap: 1rem; flex: 1; }
.topbar nav a { color: var(--muted); text-decoration: none; }
.topbar nav a.active { color: var(--text); }
.brand { font-weight: 700; }
.card { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.25rem; margin-bottom: 1.25rem; }
.narrow { width: 100%; max-width: 420px; }
.centered { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 16px; }
label { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.9rem; }
label.check { flex-direction: row; align-items: center; gap: 0.5rem; }
.inline { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; margin-bottom: 0.9rem; }
.inline label { margin: 0; }
input, select, textarea { background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem; font: inherit; }
button { background: var(--accent); color: #fff; border: 0; border-radius: 6px; padding: 0.55rem 1rem; font: inherit; cursor: pointer; }
button:disabled { opacity: 0.6; cursor: default; }
button.secondary { background: transparent; border: 1px solid var(--border); color: var(--text); width: 100%; }
button.link { background: none; color: var(--muted); padding: 0; }
button.danger { background: transparent; color: var(--bad); padding: 0.2rem 0.5rem; }
fieldset { border: 1px solid var(--border); border-radius: var(--radius); margin: 0 0 1rem; padding: 0.75rem 1rem; }
details { margin-bottom: 1rem; }
summary { cursor: pointer; margin-bottom: 0.75rem; }
small, .muted { color: var(--muted); }
.error { color: var(--bad); }
.ok { color: var(--good); }
.divider { text-align: center; color: var(--muted); margin: 1rem 0; }
table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
th, td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--border); }
.badge { font-size: 0.75rem; border-radius: 999px; padding: 0.05rem 0.5rem; margin-left: 0.4rem; border: 1px solid currentColor; }
.badge.good { color: var(--good); }
.badge.warn { color: var(--warn); }
.badge.bad { color: var(--bad); }
.badge.muted { color: var(--muted); }
.totalbar { height: 8px; background: var(--border); border-radius: 999px; overflow: hidden; margin: 0.25rem 0 0.5rem; }
.totalbar > div { height: 100%; background: var(--good); }
.totalbar.over > div { background: var(--warn); }
.row-form { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: flex-end; }
.row-form label { margin: 0; }
.footer { max-width: 960px; margin: 2rem auto; padding: 1rem 16px; border-top: 1px solid var(--border); color: var(--muted); font-size: 0.8rem; }
@media (max-width: 600px) { th:nth-child(n + 4), td:nth-child(n + 4) { display: none; } }
```

- [ ] **Step 8: type-check, format, test**

```bash
cd web
npm run format
npm run typecheck && npm run format:check && npm test
```

Expected: all pass. If `tsc` reports errors inside `../src/*.ts`, the root `node_modules` is missing; run `npm ci` at the repo root.

- [ ] **Step 9: run it against the local stack**

```bash
cd /Users/r.fu/Projects/richfolio && npm run db:start && supabase status
cp web/.env.example web/.env.local     # paste the anon key from `supabase status`
cd web && npm run dev
```

Check each of these in the browser at http://localhost:5173:
1. `/` redirects to `/login` and shows the disclaimer footer.
2. `stranger@example.com` → "Send magic link" → the error `Richfolio is invite-only — ask Richard for an invite.`
3. `dev@example.com` → "Check your inbox…". Open Mailpit (http://127.0.0.1:54324), click the link → `/welcome` → fill in the form → lands on `/settings` with the values filled in.
4. Change "Minimum confidence to alert" to 70, Save, reload: it's still 70. In Studio, `profiles.settings` shows `{"intradayAlerts":{...,"minConfidenceToAlert":70,...},...}`.
5. Sign out, then open `http://localhost:5173/settings?error=access_denied&error_description=Richfolio%20is%20invite-only%20%E2%80%94%20ask%20Richard%20for%20an%20invite.` → it lands on `/login` showing that message. This covers Review Focus #1.

- [ ] **Step 10: commit**

```bash
cd /Users/r.fu/Projects/richfolio
npm run format && npm run format:check && npm run typecheck && npm test
git add web
git commit -m "feat(web): Vite SPA with magic-link sign-in, onboarding and settings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---
### Task 9: Portfolio page — targets, opening balances, ticker checks

**Files:**
- Create: `web/src/lib/targets.ts`, `web/src/lib/targets.test.ts`, `web/src/lib/tickers.ts`
- Create: `web/src/components/useTickerCheck.ts`, `web/src/components/useTickerStatuses.ts`, `web/src/components/TickerBadge.tsx`
- Create: `web/src/pages/Portfolio.tsx`
- Modify: `web/src/db.ts` (append), `web/src/routes.ts`, `web/src/main.tsx`, `web/src/components/Layout.tsx`

**Interfaces:**
- Consumes: `lookup.ts` exports (Task 6), `unwrap` (Task 8).
- Produces:
  - `db.ts`: `Target`, `Transaction`, `TickerStatus`, `OpeningInput`, `listTargets`, `saveTarget`, `deleteTarget`, `listOpenings`, `addOpening`, `deleteTransaction`, `listTickerStatus`
  - `lookupTicker(symbol, kind): Promise<LookupResult>`
  - `useTickerCheck(kind) → { check(raw): Promise<TickerInfo | null>, checking, problem }`
  - `useTickerStatuses(entries: {symbol, kind}[]) → Map<string, TickerStatus>`
  - `<TickerBadge status/>`
  - `targetTotal`, `totalState`

- [ ] **Step 1: write the failing test** `web/src/lib/targets.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { targetTotal, totalState } from "./targets";

test("targetTotal sums to 2dp without float noise", () => {
  assert.equal(targetTotal([{ target_pct: 33.33 }, { target_pct: 33.33 }, { target_pct: 33.34 }]), 100);
  assert.equal(targetTotal([{ target_pct: 0.1 }, { target_pct: 0.2 }]), 0.3);
  assert.equal(targetTotal([]), 0);
});

test("totalState", () => {
  assert.equal(totalState(99.99), "under");
  assert.equal(totalState(100), "exact");
  assert.equal(totalState(100.01), "over");
});
```

Run: `cd web && npm test`
Expected: FAIL, `./targets` not found.

- [ ] **Step 2: implement** `web/src/lib/targets.ts`

```ts
export type TotalState = "under" | "exact" | "over";

/** Sum of target percentages, rounded to 2dp so 33.33+33.33+33.34 is exactly 100. */
export function targetTotal(targets: { target_pct: number }[]): number {
  return Math.round(targets.reduce((sum, t) => sum + t.target_pct, 0) * 100) / 100;
}

/** Over 100% is a warning, not an error: the database deliberately allows it mid-reallocation. */
export function totalState(total: number): TotalState {
  return total > 100 ? "over" : total === 100 ? "exact" : "under";
}
```

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: append to `web/src/db.ts`**

```ts
export type Target = Tables["targets"]["Row"];
export type Transaction = Tables["transactions"]["Row"];
export type TickerStatus = Tables["ticker_status"]["Row"];

export interface OpeningInput {
  ticker: string;
  shares: number;
  price: number | null;
  currency: string | null;
  traded_at: string | null;
}

export async function listTargets(): Promise<Target[]> {
  return unwrap(await supabase.from("targets").select("*").order("ticker"));
}

/** Insert, or update the percentage if the ticker already has a target. */
export async function saveTarget(userId: string, ticker: string, targetPct: number): Promise<void> {
  unwrap(await supabase.from("targets").upsert({ user_id: userId, ticker, target_pct: targetPct }));
}

export async function deleteTarget(userId: string, ticker: string): Promise<void> {
  unwrap(await supabase.from("targets").delete().eq("user_id", userId).eq("ticker", ticker));
}

export async function listOpenings(): Promise<Transaction[]> {
  return unwrap(
    await supabase.from("transactions").select("*").eq("type", "opening").order("ticker"),
  );
}

export async function addOpening(userId: string, o: OpeningInput): Promise<void> {
  unwrap(await supabase.from("transactions").insert({ user_id: userId, type: "opening", ...o }));
}

export async function deleteTransaction(id: string): Promise<void> {
  unwrap(await supabase.from("transactions").delete().eq("id", id));
}

export async function listTickerStatus(symbols: string[]): Promise<TickerStatus[]> {
  if (symbols.length === 0) return [];
  return unwrap(await supabase.from("ticker_status").select("*").in("symbol", symbols));
}
```

- [ ] **Step 4: ticker client, hooks, badge**

`web/src/lib/tickers.ts`:

```ts
import { supabase } from "../supabase";
import {
  unverifiedInfo,
  type LookupKind,
  type LookupResult,
} from "../../../supabase/functions/ticker-lookup/lookup";

export async function lookupTicker(symbol: string, kind: LookupKind): Promise<LookupResult> {
  const { data, error } = await supabase.functions.invoke<LookupResult>("ticker-lookup", {
    body: { symbol, kind },
  });
  // The function itself unreachable gets the same policy as an upstream
  // failure: save the ticker unverified rather than blocking the user.
  if (error || !data) {
    console.error("ticker-lookup failed", error);
    return { ok: true, info: unverifiedInfo(symbol, kind) };
  }
  return data;
}
```

`web/src/components/useTickerCheck.ts`:

```ts
import { useState } from "react";
import {
  isValidEquitySymbol,
  normaliseTicker,
  parsePair,
  type LookupKind,
  type TickerInfo,
} from "../../../supabase/functions/ticker-lookup/lookup";
import { lookupTicker } from "../lib/tickers";

/** Normalise → shape-check → look up. Returns the info to save, or null with `problem` set. */
export function useTickerCheck(kind: LookupKind) {
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function check(raw: string): Promise<TickerInfo | null> {
    const symbol = normaliseTicker(raw, kind);
    const wellFormed = kind === "equity" ? isValidEquitySymbol(symbol) : parsePair(symbol) !== null;
    if (!wellFormed) {
      setProblem(kind === "equity" ? `"${symbol}" isn't a valid ticker.` : "Use BASE/QUOTE, e.g. BTC/CRO.");
      return null;
    }
    setChecking(true);
    setProblem(null);
    try {
      const result = await lookupTicker(symbol, kind);
      if (!result.ok) {
        setProblem(result.reason);
        return null;
      }
      return result.info;
    } finally {
      setChecking(false);
    }
  }

  return { check, checking, problem };
}
```

`web/src/components/useTickerStatuses.ts`:

```ts
import { useEffect, useState } from "react";
import { listTickerStatus, type TickerStatus } from "../db";
import { lookupTicker } from "../lib/tickers";
import type { LookupKind } from "../../../supabase/functions/ticker-lookup/lookup";

/**
 * Badge data for a list of symbols. Symbols nobody has looked up yet (imported
 * from config.json, or added before the lookup existed) are checked in the
 * background so their badges fill in by themselves.
 */
export function useTickerStatuses(entries: { symbol: string; kind: LookupKind }[]) {
  const [statuses, setStatuses] = useState<Map<string, TickerStatus>>(new Map());
  const key = entries
    .map((e) => `${e.kind}:${e.symbol}`)
    .sort()
    .join(",");

  useEffect(() => {
    let cancelled = false;
    const symbols = entries.map((e) => e.symbol);
    (async () => {
      let rows = await listTickerStatus(symbols);
      const seen = new Set(rows.map((r) => r.symbol));
      const missing = entries.filter((e) => !seen.has(e.symbol));
      if (missing.length) {
        await Promise.all(missing.map((e) => lookupTicker(e.symbol, e.kind)));
        rows = await listTickerStatus(symbols);
      }
      if (!cancelled) setStatuses(new Map(rows.map((r) => [r.symbol, r])));
    })().catch((err) => console.error("ticker status load failed", err));
    return () => {
      cancelled = true;
    };
    // `key` captures the entries' content; the array itself is new every render.
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return statuses;
}
```

`web/src/components/TickerBadge.tsx`:

```tsx
import type { TickerStatus } from "../db";

export function TickerBadge({ status }: { status: TickerStatus | undefined }) {
  if (!status) {
    return <span className="badge muted" title="Not checked yet">unchecked</span>;
  }
  if (status.last_fetch_failed_at) {
    return (
      <span
        className="badge bad"
        title={`The daily run could not fetch this since ${new Date(status.last_fetch_failed_at).toLocaleDateString()}`}
      >
        fetch failed
      </span>
    );
  }
  if (!status.verified) {
    return (
      <span className="badge warn" title="The data source couldn't be reached to confirm this ticker. It will be checked again.">
        unverified
      </span>
    );
  }
  const detail = [status.name, status.exchange, status.quote_currency].filter(Boolean).join(" · ");
  return <span className="badge good" title={detail}>✓</span>;
}
```

- [ ] **Step 5: the page** `web/src/pages/Portfolio.tsx`

```tsx
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth";
import {
  addOpening,
  deleteTarget,
  deleteTransaction,
  listOpenings,
  listTargets,
  saveTarget,
  type Target,
  type Transaction,
} from "../db";
import { targetTotal, totalState } from "../lib/targets";
import { useTickerCheck } from "../components/useTickerCheck";
import { useTickerStatuses } from "../components/useTickerStatuses";
import { TickerBadge } from "../components/TickerBadge";

export function Portfolio() {
  const { session, profile } = useAuth();
  const userId = session!.user.id;
  const [targets, setTargets] = useState<Target[]>([]);
  const [openings, setOpenings] = useState<Transaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [t, o] = await Promise.all([listTargets(), listOpenings()]);
      setTargets(t);
      setOpenings(o);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);
  useEffect(() => void reload(), [reload]);

  const symbols = [...new Set([...targets.map((t) => t.ticker), ...openings.map((o) => o.ticker)])];
  const statuses = useTickerStatuses(symbols.map((symbol) => ({ symbol, kind: "equity" as const })));

  const total = targetTotal(targets);
  const state = totalState(total);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <h1>Portfolio</h1>
      {error && <p className="error">{error}</p>}

      <section className="card">
        <h2>Target allocation</h2>
        <table>
          <thead>
            <tr><th>Ticker</th><th>Target</th><th /></tr>
          </thead>
          <tbody>
            {targets.map((t) => (
              <tr key={t.ticker}>
                <td>{t.ticker}<TickerBadge status={statuses.get(t.ticker)} /></td>
                <td>{t.target_pct}%</td>
                <td>
                  <button className="danger" onClick={() => void run(() => deleteTarget(userId, t.ticker))}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className={`totalbar ${state}`}>
          <div style={{ width: `${Math.min(total, 100)}%` }} />
        </div>
        <p className={state === "over" ? "error" : "muted"}>
          Total {total}%
          {state === "over" && " — over 100%. Lower some targets so they add up to 100%."}
          {state === "under" && total > 0 && ` — ${Math.round((100 - total) * 100) / 100}% unallocated.`}
        </p>
        <AddTarget onSave={(ticker, pct) => run(() => saveTarget(userId, ticker, pct))} />
      </section>

      <section className="card">
        <h2>Opening balances</h2>
        <p className="muted">
          What you already hold. Price and date are optional: leave them blank if you don't know
          what you paid.
        </p>
        <table>
          <thead>
            <tr><th>Ticker</th><th>Shares</th><th>Price</th><th>Date</th><th /></tr>
          </thead>
          <tbody>
            {openings.map((o) => (
              <tr key={o.id}>
                <td>{o.ticker}<TickerBadge status={statuses.get(o.ticker)} /></td>
                <td>{o.shares}</td>
                <td>{o.price != null ? `${o.price} ${o.currency ?? ""}` : "—"}</td>
                <td>{o.traded_at ?? "—"}</td>
                <td>
                  <button className="danger" onClick={() => void run(() => deleteTransaction(o.id))}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <AddOpening
          defaultCurrency={profile?.default_currency ?? "USD"}
          onSave={(o) => run(() => addOpening(userId, o))}
        />
      </section>
    </>
  );
}

function AddTarget({ onSave }: { onSave: (ticker: string, pct: number) => Promise<void> }) {
  const { check, checking, problem } = useTickerCheck("equity");
  const [ticker, setTicker] = useState("");
  const [pct, setPct] = useState("");
  const [pctError, setPctError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = Number(pct);
    if (!(n > 0 && n <= 100)) return setPctError("Target must be more than 0 and at most 100.");
    setPctError(null);
    const info = await check(ticker);
    if (!info) return;
    await onSave(info.symbol, n);
    setTicker("");
    setPct("");
  }

  return (
    <form className="row-form" onSubmit={submit}>
      <label>Ticker<input required placeholder="VOO" value={ticker} onChange={(e) => setTicker(e.target.value)} /></label>
      <label>Target %<input required type="number" min="0.01" max="100" step="0.01" value={pct} onChange={(e) => setPct(e.target.value)} /></label>
      <button disabled={checking}>{checking ? "Checking…" : "Add / update"}</button>
      {(problem || pctError) && <p className="error">{problem ?? pctError}</p>}
    </form>
  );
}

function AddOpening({
  defaultCurrency,
  onSave,
}: {
  defaultCurrency: string;
  onSave: (o: {
    ticker: string;
    shares: number;
    price: number | null;
    currency: string | null;
    traded_at: string | null;
  }) => Promise<void>;
}) {
  const { check, checking, problem } = useTickerCheck("equity");
  const [ticker, setTicker] = useState("");
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = Number(shares);
    if (!(n > 0)) return setFieldError("Shares must be more than 0.");
    const p = price === "" ? null : Number(price);
    if (p !== null && !(p >= 0)) return setFieldError("Price can't be negative.");
    setFieldError(null);
    const info = await check(ticker);
    if (!info) return;
    await onSave({
      ticker: info.symbol,
      shares: n,
      price: p,
      // Price is in the ticker's own quote currency when Yahoo told us it; the
      // user's currency is only a fallback for unverified tickers.
      currency: p === null ? null : (info.quoteCurrency ?? defaultCurrency),
      traded_at: date || null,
    });
    setTicker("");
    setShares("");
    setPrice("");
    setDate("");
  }

  return (
    <form className="row-form" onSubmit={submit}>
      <label>Ticker<input required placeholder="AAPL" value={ticker} onChange={(e) => setTicker(e.target.value)} /></label>
      <label>Shares<input required type="number" min="0" step="any" value={shares} onChange={(e) => setShares(e.target.value)} /></label>
      <label>Price paid (optional)<input type="number" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
      <label>Date (optional)<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <button disabled={checking}>{checking ? "Checking…" : "Add"}</button>
      {(problem || fieldError) && <p className="error">{problem ?? fieldError}</p>}
    </form>
  );
}
```

- [ ] **Step 6: wire it in**

- `web/src/routes.ts`: change to `export const HOME_PATH = "/portfolio";` and update the comment to `/** Where a signed-in user lands. */`.
- `web/src/main.tsx`: add `import { Portfolio } from "./pages/Portfolio";` and the route `{ path: "/portfolio", element: <Portfolio /> },` as the first child of `<Layout />`.
- `web/src/components/Layout.tsx`: add `<NavLink to="/portfolio">Portfolio</NavLink>` as the first nav link.

- [ ] **Step 7: checks and manual verification**

```bash
cd web && npm run format && npm run typecheck && npm run format:check && npm test
supabase functions serve      # in another shell, from the repo root
npm run dev
```

Signed in as `dev@example.com`:
1. You land on `/portfolio`.
2. Add target ` voo `, 20 → the row shows `VOO` with a green ✓ (hover: name · exchange · USD).
3. Add `VOOOX1` → inline error `Yahoo Finance has no ticker "VOOOX1"…`, and nothing is added.
4. Add `SOL` → `Only BTC and ETH are supported…`. Add `BTC`, 5 → accepted.
5. Add targets until the total passes 100 → the bar turns amber and the message says to lower some. Saving still works.
6. Add an opening `AZN.L`, 10, price 110, no date → price shows `110 GBp`. Add `AAPL`, 30 with no price → `—`.
7. In Studio, insert a sell `insert into transactions (user_id,ticker,type,shares,price,currency,traded_at) values ('<dev id>','AAPL','sell',5,200,'USD','2026-10-01')`, then click Remove on the AAPL opening → error `AAPL position would go below zero shares`, and the row stays.
8. Stop `supabase functions serve` and add `MSFT`, 5 → it's still added, with the badge going amber "unverified" or showing "unchecked" (the function is unreachable, so the save goes through unverified).

- [ ] **Step 8: commit**

```bash
cd /Users/r.fu/Projects/richfolio
npm run format && npm run format:check && npm run typecheck && npm test
git add web
git commit -m "feat(web): portfolio page — targets and opening balances with ticker checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 10: Watchlist page

**Files:**
- Create: `web/src/pages/Watchlist.tsx`
- Modify: `web/src/db.ts` (append), `web/src/main.tsx`, `web/src/components/Layout.tsx`

**Interfaces:**
- Consumes: `useTickerCheck`, `useTickerStatuses`, `TickerBadge` (Task 9).
- Produces: `db.ts`: `WatchItem`, `listWatchlist`, `addWatch`, `deleteWatch`.

- [ ] **Step 1: append to `web/src/db.ts`**

```ts
export type WatchItem = Tables["watchlist"]["Row"];

export async function listWatchlist(): Promise<WatchItem[]> {
  return unwrap(await supabase.from("watchlist").select("*").order("symbol"));
}

export async function addWatch(
  userId: string,
  symbol: string,
  kind: WatchItem["kind"],
): Promise<void> {
  unwrap(
    await supabase
      .from("watchlist")
      .upsert({ user_id: userId, symbol, kind }, { onConflict: "user_id,symbol", ignoreDuplicates: true }),
  );
}

export async function deleteWatch(userId: string, symbol: string): Promise<void> {
  unwrap(await supabase.from("watchlist").delete().eq("user_id", userId).eq("symbol", symbol));
}
```

(`kind` is `text` with a check constraint, so the generated type is `string`. That's fine.)

- [ ] **Step 2: the page** `web/src/pages/Watchlist.tsx`

```tsx
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth";
import { addWatch, deleteWatch, listWatchlist, type WatchItem } from "../db";
import { useTickerCheck } from "../components/useTickerCheck";
import { useTickerStatuses } from "../components/useTickerStatuses";
import { TickerBadge } from "../components/TickerBadge";
import type { LookupKind } from "../../../supabase/functions/ticker-lookup/lookup";

export function Watchlist() {
  const { session } = useAuth();
  const userId = session!.user.id;
  const [items, setItems] = useState<WatchItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setItems(await listWatchlist());
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);
  useEffect(() => void reload(), [reload]);

  const statuses = useTickerStatuses(
    items.map((i) => ({ symbol: i.symbol, kind: i.kind as LookupKind })),
  );

  async function remove(symbol: string) {
    setError(null);
    try {
      await deleteWatch(userId, symbol);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const section = (kind: LookupKind, title: string, blurb: string, placeholder: string) => (
    <section className="card">
      <h2>{title}</h2>
      <p className="muted">{blurb}</p>
      <ul>
        {items
          .filter((i) => i.kind === kind)
          .map((i) => (
            <li key={i.symbol}>
              {i.symbol}
              <TickerBadge status={statuses.get(i.symbol)} />
              <button className="danger" onClick={() => void remove(i.symbol)}>Remove</button>
            </li>
          ))}
      </ul>
      <AddWatch
        kind={kind}
        placeholder={placeholder}
        onAdd={async (symbol) => {
          await addWatch(userId, symbol, kind);
          await reload();
        }}
      />
    </section>
  );

  return (
    <>
      <h1>Watchlist</h1>
      {error && <p className="error">{error}</p>}
      {section(
        "equity",
        "Stocks & ETFs",
        "Scored in every brief as research signals, without a target allocation.",
        "MSFT",
      )}
      {section(
        "crypto_pair",
        "Crypto pairs",
        "BASE/QUOTE: the coin you'd buy, priced in the coin you'd spend. BTC/CRO is low when BTC is cheap in CRO terms.",
        "BTC/CRO",
      )}
    </>
  );
}

function AddWatch({
  kind,
  placeholder,
  onAdd,
}: {
  kind: LookupKind;
  placeholder: string;
  onAdd: (symbol: string) => Promise<void>;
}) {
  const { check, checking, problem } = useTickerCheck(kind);
  const [raw, setRaw] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaveError(null);
    const info = await check(raw);
    if (!info) return;
    try {
      await onAdd(info.symbol);
      setRaw("");
    } catch (err) {
      setSaveError((err as Error).message);
    }
  }

  return (
    <form className="row-form" onSubmit={submit}>
      <label>
        Symbol
        <input required placeholder={placeholder} value={raw} onChange={(e) => setRaw(e.target.value)} />
      </label>
      <button disabled={checking}>{checking ? "Checking…" : "Add"}</button>
      {(problem || saveError) && <p className="error">{problem ?? saveError}</p>}
    </form>
  );
}
```

- [ ] **Step 3: wire it in**
- `web/src/main.tsx`: add `import { Watchlist } from "./pages/Watchlist";` and `{ path: "/watchlist", element: <Watchlist /> },` after the portfolio route.
- `web/src/components/Layout.tsx`: add `<NavLink to="/watchlist">Watchlist</NavLink>` after Portfolio.

- [ ] **Step 4: checks and manual verification**

```bash
cd web && npm run format && npm run typecheck && npm run format:check && npm test
```

With `supabase functions serve` and `npm run dev` running:
1. Add `msft` under Stocks → `MSFT ✓`. Add it again → no duplicate row.
2. Add `btc / cro` under Crypto pairs → `BTC/CRO ✓`.
3. Add `CRO/BTC` → accepted (the reverse listing exists).
4. Add `DOGE/XYZ` → `crypto.com has no tradable DOGE/XYZ market…`.
5. Add `BTCCRO` → `Use BASE/QUOTE, e.g. BTC/CRO.`, with no network call (check the browser devtools Network tab).

- [ ] **Step 5: commit**

```bash
cd /Users/r.fu/Projects/richfolio
npm run format && npm run format:check && npm run typecheck && npm test
git add web
git commit -m "feat(web): watchlist page for equities and crypto cross-pairs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---
### Task 11: Import `config.json`

**Files:**
- Create: `supabase/migrations/20261010000004_import_portfolio.sql`, `supabase/tests/database/04_import.test.sql`
- Create: `web/src/lib/importConfig.ts`, `web/src/lib/importConfig.test.ts`, `web/src/components/ImportConfig.tsx`
- Modify: `web/src/db.ts` (append), `web/src/pages/Settings.tsx`
- Generate: `supabase/types.ts`

**Interfaces:**
- Consumes: `parsePortfolioConfig` (Task 2), `normaliseTicker` / `isValidEquitySymbol` (Task 6), `DEFAULT_SETTINGS` / `validateSettings` / `UserSettings` (Task 8).
- Produces:
  - SQL `public.import_portfolio(payload jsonb) returns void`, which atomically replaces the caller's profile currency, planned value and settings, plus their targets, watchlist and opening entries
  - `ImportPayload`, `ImportPreview`, `buildImport(raw: unknown): ImportPreview` (throws `Error` on an invalid config)
  - `db.ts`: `importPortfolio(payload: ImportPayload): Promise<void>`
  - `<ImportConfig onImported/>`

- [ ] **Step 1: failing pgTAP test** `supabase/tests/database/04_import.test.sql`

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'a@test.dev');
insert into public.targets values ('00000000-0000-0000-0000-00000000000a', 'OLD', 50);
insert into public.transactions (user_id, ticker, type, shares) values ('00000000-0000-0000-0000-00000000000a', 'OLD', 'opening', 5);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select lives_ok($$select public.import_portfolio('{
  "profile": {"default_currency": "AUD", "planned_portfolio_value": 1000, "settings": {"delivery": {"email": true}}},
  "targets": [{"ticker": "VOO", "target_pct": 60}],
  "openings": [{"ticker": "VOO", "shares": 3}],
  "watchlist": [{"symbol": "BTC/CRO", "kind": "crypto_pair"}]
}'::jsonb)$$, 'import succeeds');
select results_eq($$select ticker from public.targets$$, $$values ('VOO'::text)$$, 'targets replaced');
select results_eq($$select ticker, shares from public.transactions where type = 'opening'$$,
  $$values ('VOO'::text, 3::numeric)$$, 'opening entries replaced');
select is((select default_currency from public.profiles), 'AUD', 'profile updated');
select throws_ok($$select public.import_portfolio('{
  "profile": {"default_currency": "AUD", "planned_portfolio_value": 1, "settings": {}},
  "targets": [{"ticker": "bad ticker", "target_pct": 10}],
  "openings": [], "watchlist": []
}'::jsonb)$$, '23514', null, 'an invalid row rejects the whole import');
select results_eq($$select ticker from public.targets$$, $$values ('VOO'::text)$$,
  'a failed import leaves the previous portfolio intact');
reset role;

select * from finish();
rollback;
```

Run: `supabase db reset && npm run db:test`
Expected: FAIL, `function public.import_portfolio(jsonb) does not exist`.

- [ ] **Step 2: the migration** `supabase/migrations/20261010000004_import_portfolio.sql`

```sql
-- Replace the caller's portfolio from an imported config.json in ONE
-- transaction. From the browser this would be ~7 separate requests, and a
-- failure halfway would leave targets deleted with nothing inserted.
-- security invoker: every statement runs under the caller's RLS policies and
-- column grants, so this can only ever touch the caller's own rows.
-- buy/sell transactions are never touched; the deferred position guard checks
-- the end state at commit, so an import that would strand a sell fails whole.
create function public.import_portfolio(payload jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  update public.profiles set
    default_currency        = payload -> 'profile' ->> 'default_currency',
    planned_portfolio_value = (payload -> 'profile' ->> 'planned_portfolio_value')::numeric,
    settings                = payload -> 'profile' -> 'settings'
  where id = uid;

  delete from public.targets where user_id = uid;
  insert into public.targets (user_id, ticker, target_pct)
    select uid, t ->> 'ticker', (t ->> 'target_pct')::numeric
      from jsonb_array_elements(payload -> 'targets') t;

  delete from public.watchlist where user_id = uid;
  insert into public.watchlist (user_id, symbol, kind)
    select uid, w ->> 'symbol', w ->> 'kind'
      from jsonb_array_elements(payload -> 'watchlist') w;

  delete from public.transactions where user_id = uid and type = 'opening';
  insert into public.transactions (user_id, ticker, type, shares)
    select uid, o ->> 'ticker', 'opening', (o ->> 'shares')::numeric
      from jsonb_array_elements(payload -> 'openings') o;
end $$;

revoke execute on function public.import_portfolio(jsonb) from public, anon;
grant execute on function public.import_portfolio(jsonb) to authenticated;
```

Run: `supabase db reset && npm run db:test`
Expected: all four test files ok. Then `npm run db:types`.

- [ ] **Step 3: failing unit test** `web/src/lib/importConfig.test.ts`

```ts
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildImport } from "./importConfig";

const example = JSON.parse(readFileSync(resolve(process.cwd(), "../config.example.json"), "utf-8"));
const minimal = { targetPortfolio: { VOO: 100 }, totalPortfolioValue: 1000, defaultCurrency: "USD" };

describe("buildImport", () => {
  test("maps config.example.json", () => {
    const { payload, notes } = buildImport(example);
    assert.equal(payload.targets.length, 13);
    assert.deepEqual(payload.targets.find((t) => t.ticker === "VOO"), { ticker: "VOO", target_pct: 20 });
    assert.deepEqual(payload.openings.find((o) => o.ticker === "AAPL"), { ticker: "AAPL", shares: 30 });
    assert.deepEqual(payload.watchlist, [
      { symbol: "MSFT", kind: "equity" },
      { symbol: "NVDA", kind: "equity" },
      { symbol: "AMD", kind: "equity" },
      { symbol: "BTC/CRO", kind: "crypto_pair" },
      { symbol: "ETH/CRO", kind: "crypto_pair" },
    ]);
    assert.equal(payload.profile.planned_portfolio_value, 50000);
    assert.equal(payload.profile.settings.intradayAlerts.minConfidenceToAlert, 80);
    assert.ok(notes.some((n) => n.includes('"social"')), notes.join("\n"));
  });

  test("normalises lowercase / padded tickers", () => {
    const { payload } = buildImport({ ...minimal, targetPortfolio: { " voo ": 100 }, watching: ["msft"] });
    assert.equal(payload.targets[0].ticker, "VOO");
    assert.equal(payload.watchlist[0].symbol, "MSFT");
  });

  test("skips 0-share holdings and out-of-range targets with notes, never fails", () => {
    const { payload, notes } = buildImport({
      ...minimal,
      targetPortfolio: { VOO: 100, QQQ: 0, SMH: 150 },
      currentHoldings: { AAPL: 0, MSFT: 2 },
    });
    assert.deepEqual(payload.targets.map((t) => t.ticker), ["VOO"]);
    assert.deepEqual(payload.openings, [{ ticker: "MSFT", shares: 2 }]);
    assert.ok(notes.some((n) => n.includes("QQQ")));
    assert.ok(notes.some((n) => n.includes("SMH")));
    assert.ok(notes.some((n) => n.includes("AAPL")));
  });

  test("skips malformed tickers with a note", () => {
    const { payload, notes } = buildImport({ ...minimal, targetPortfolio: { VOO: 50, "NOT A TICKER!": 50 } });
    assert.deepEqual(payload.targets.map((t) => t.ticker), ["VOO"]);
    assert.ok(notes.some((n) => n.includes("NOT A TICKER!")));
  });

  test("dedupes the watchlist", () => {
    const { payload } = buildImport({ ...minimal, watching: ["MSFT", "msft"] });
    assert.equal(payload.watchlist.length, 1);
  });

  test("notes unknown keys", () => {
    const { notes } = buildImport({ ...minimal, somethingNew: 1 });
    assert.ok(notes.some((n) => n.includes('"somethingNew"')));
  });

  test("drops unknown alert keys so the database schema accepts the settings", () => {
    const { payload } = buildImport({ ...minimal, intradayAlerts: { minConfidenceToAlert: 70, legacyKnob: true } });
    assert.equal(payload.profile.settings.intradayAlerts.minConfidenceToAlert, 70);
    assert.ok(!("legacyKnob" in payload.profile.settings.intradayAlerts));
  });

  test("throws on an invalid config, and on settings the schema rejects", () => {
    assert.throws(() => buildImport({ targetPortfolio: { VOO: 100 } }), /totalPortfolioValue/);
    assert.throws(
      () => buildImport({ ...minimal, cryptoAlerts: { onlyAlertForActions: ["SELL"] } }),
      /onlyAlertForActions/,
    );
  });
});
```

Run: `cd web && npm test`
Expected: FAIL, `./importConfig` not found.

- [ ] **Step 4: implement** `web/src/lib/importConfig.ts`

```ts
import {
  parsePortfolioConfig,
  type IntradayAlertConfig,
} from "../../../src/configSchema.js";
import {
  isValidEquitySymbol,
  normaliseTicker,
} from "../../../supabase/functions/ticker-lookup/lookup";
import { DEFAULT_SETTINGS, validateSettings, type UserSettings } from "./settings";

export interface ImportPayload {
  profile: { default_currency: string; planned_portfolio_value: number; settings: UserSettings };
  targets: { ticker: string; target_pct: number }[];
  openings: { ticker: string; shares: number }[];
  watchlist: { symbol: string; kind: "equity" | "crypto_pair" }[];
}

export interface ImportPreview {
  payload: ImportPayload;
  /** Everything skipped, changed or ignored, in words the user can act on. */
  notes: string[];
}

const KNOWN_KEYS = new Set([
  "targetPortfolio", "currentHoldings", "totalPortfolioValue", "defaultCurrency",
  "watching", "watchingCrypto", "intradayAlerts", "cryptoAlerts", "social", "ai",
]);

// Only the keys the settings schema allows: an old config with an extra knob
// would otherwise be rejected by the database's additionalProperties: false.
function pickAlerts(a: IntradayAlertConfig): IntradayAlertConfig {
  return {
    enabled: a.enabled,
    confidenceIncreaseThreshold: a.confidenceIncreaseThreshold,
    minConfidenceToAlert: a.minConfidenceToAlert,
    actionUpgradesAlert: a.actionUpgradesAlert,
    onlyAlertForActions: a.onlyAlertForActions,
    minPriceMovePctToAlert: a.minPriceMovePctToAlert,
  };
}

/** Throws on a config the pipeline itself would reject; everything else becomes a note. */
export function buildImport(raw: unknown): ImportPreview {
  const parsed = parsePortfolioConfig(raw); // same rules as src/config.ts
  const notes = [...parsed.warnings];
  const json = raw as Record<string, unknown>;

  for (const key of Object.keys(json)) {
    if (!KNOWN_KEYS.has(key)) notes.push(`Ignored unknown key "${key}".`);
  }
  if (json.social !== undefined) notes.push('Ignored "social": public posting is operator-only.');

  const targets: ImportPayload["targets"] = [];
  for (const [rawTicker, pct] of Object.entries(parsed.targetPortfolio)) {
    const ticker = normaliseTicker(rawTicker, "equity");
    if (!isValidEquitySymbol(ticker)) notes.push(`Skipped target "${rawTicker}": not a valid ticker.`);
    else if (!(pct > 0 && pct <= 100)) notes.push(`Skipped target ${ticker}: ${pct}% is outside 0–100.`);
    else targets.push({ ticker, target_pct: pct });
  }

  const openings: ImportPayload["openings"] = [];
  for (const [rawTicker, shares] of Object.entries(parsed.currentHoldings)) {
    const ticker = normaliseTicker(rawTicker, "equity");
    if (!isValidEquitySymbol(ticker)) notes.push(`Skipped holding "${rawTicker}": not a valid ticker.`);
    else if (!(shares > 0)) notes.push(`Skipped holding ${ticker}: ${shares} shares.`);
    else openings.push({ ticker, shares });
  }

  const seen = new Set<string>();
  const watchlist: ImportPayload["watchlist"] = [];
  for (const rawTicker of parsed.watchingTickers) {
    const symbol = normaliseTicker(rawTicker, "equity");
    if (!isValidEquitySymbol(symbol)) notes.push(`Skipped watch "${rawTicker}": not a valid ticker.`);
    else if (!seen.has(symbol)) {
      seen.add(symbol);
      watchlist.push({ symbol, kind: "equity" });
    }
  }
  for (const spec of parsed.cryptoPairSpecs) {
    const symbol = `${spec.base}/${spec.quote}`;
    if (!seen.has(symbol)) {
      seen.add(symbol);
      watchlist.push({ symbol, kind: "crypto_pair" });
    }
  }

  const settings: UserSettings = {
    intradayAlerts: pickAlerts(parsed.intradayAlerts),
    cryptoAlerts: pickAlerts(parsed.cryptoAlerts),
    ai: { strongBuyRequiresAllProviders: parsed.ai.strongBuyRequiresAllProviders ?? false },
    delivery: { ...DEFAULT_SETTINGS.delivery },
  };
  const problems = validateSettings(settings);
  if (problems.length) throw new Error(`Alert settings are invalid: ${problems.join("; ")}`);

  return {
    payload: {
      profile: {
        default_currency: parsed.defaultCurrency,
        planned_portfolio_value: parsed.totalPortfolioValue,
        settings,
      },
      targets,
      openings,
      watchlist,
    },
    notes,
  };
}
```

Note: tests run with `cwd = web/`, which is why `importConfig.test.ts` reads `../config.example.json`.

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: append to `web/src/db.ts`**

```ts
import type { ImportPayload } from "./lib/importConfig";

export async function importPortfolio(payload: ImportPayload): Promise<void> {
  unwrap(await supabase.rpc("import_portfolio", { payload: toJson(payload) }));
}
```

(Move the `import type` line up with the other imports at the top of the file.)

- [ ] **Step 6: the component** `web/src/components/ImportConfig.tsx`

```tsx
import { useState, type ChangeEvent } from "react";
import { buildImport, type ImportPreview } from "../lib/importConfig";
import { importPortfolio } from "../db";

export function ImportConfig({ onImported }: { onImported: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function loadFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setText(await file.text());
  }

  function makePreview() {
    setError(null);
    setDone(false);
    try {
      setPreview(buildImport(JSON.parse(text)));
    } catch (err) {
      setPreview(null);
      setError(err instanceof SyntaxError ? `Not valid JSON: ${err.message}` : (err as Error).message);
    }
  }

  async function confirm() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      await importPortfolio(preview.payload);
      await onImported();
      setPreview(null);
      setText("");
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const p = preview?.payload;
  return (
    <section className="card">
      <h2>Import config.json</h2>
      <p className="muted">
        Already running Richfolio on GitHub Actions? Paste your config.json to copy it here.
        This <strong>replaces</strong> your targets, watchlist, opening balances and alert settings.
        Buys and sells you've recorded are kept.
      </p>
      <input type="file" accept="application/json,.json" onChange={(e) => void loadFile(e)} />
      <textarea rows={8} style={{ width: "100%", marginTop: "0.5rem" }} value={text} onChange={(e) => setText(e.target.value)} placeholder='{"targetPortfolio": {...}, ...}' />
      <button type="button" className="secondary" onClick={makePreview} disabled={!text.trim()}>
        Preview
      </button>
      {error && <p className="error">{error}</p>}
      {done && <p className="ok">Imported.</p>}
      {p && preview && (
        <div>
          <p>
            {p.targets.length} targets · {p.openings.length} holdings ·{" "}
            {p.watchlist.length} watchlist entries · currency {p.profile.default_currency} ·
            planned size {p.profile.planned_portfolio_value}
          </p>
          {preview.notes.length > 0 && (
            <ul className="muted">
              {preview.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => void confirm()} disabled={busy}>
            {busy ? "Importing…" : "Replace my portfolio with this"}
          </button>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 7: add it to Settings.** In `web/src/pages/Settings.tsx`, import `{ ImportConfig } from "../components/ImportConfig"` and render `<ImportConfig onImported={refreshProfile} />` after the closing `</form>`, inside the fragment.

- [ ] **Step 8: checks and manual verification**

```bash
cd web && npm run format && npm run typecheck && npm run format:check && npm test
```

In the running app at `/settings`:
1. Upload your real local `config.json` → Preview shows sensible counts, plus a note that `"social"` was ignored.
2. Confirm → `/portfolio` shows the targets and openings. Badges move from "unchecked" to ✓ within seconds as the background checks complete. `/watchlist` shows the watching entries and pairs. `/settings` → Advanced shows your alert overrides.
3. Paste `{"targetPortfolio":{"VOO":100}}` → Preview errors with `"totalPortfolioValue" must be a number`, and nothing changes.

- [ ] **Step 9: commit**

```bash
cd /Users/r.fu/Projects/richfolio
npm run format && npm run format:check && npm run typecheck && npm test
git add supabase/migrations/20261010000004_import_portfolio.sql supabase/tests/database/04_import.test.sql supabase/types.ts web
git commit -m "feat(web): atomic config.json import with preview

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 12: Admin page — invites

**Files:**
- Create: `web/src/pages/Admin.tsx`
- Modify: `web/src/db.ts` (append), `web/src/main.tsx`

**Interfaces:**
- Consumes: the `send-invite` function (Task 7), `RequireAdmin` (Task 8), and the RLS on `invites` (Task 4).
- Produces: `db.ts`: `Invite`, `listInvites`, `sendInvite(email): Promise<void>` (throws `Error` carrying the function's message).

- [ ] **Step 1: append to `web/src/db.ts`**

```ts
import { FunctionsHttpError } from "@supabase/supabase-js";

export type Invite = Tables["invites"]["Row"];

export async function listInvites(): Promise<Invite[]> {
  return unwrap(await supabase.from("invites").select("*").order("invited_at", { ascending: false }));
}

export async function sendInvite(email: string): Promise<void> {
  const { error } = await supabase.functions.invoke("send-invite", { body: { email } });
  if (!error) return;
  // A non-2xx carries our own { error } message in the response body; prefer
  // it over supabase-js's generic "Edge Function returned a non-2xx status code".
  if (error instanceof FunctionsHttpError) {
    const body = (await error.context.json().catch(() => null)) as { error?: string } | null;
    if (body?.error) throw new Error(body.error);
  }
  throw new Error(error.message);
}
```

(Move the `FunctionsHttpError` import up with the other imports.)

- [ ] **Step 2: the page** `web/src/pages/Admin.tsx`

```tsx
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { listInvites, sendInvite, type Invite } from "../db";

export function Admin() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setInvites(await listInvites());
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);
  useEffect(() => void reload(), [reload]);

  async function invite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSentTo(null);
    try {
      await sendInvite(email.trim());
      setSentTo(email.trim());
      setEmail("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      await reload();
    }
  }

  return (
    <>
      <h1>Admin</h1>
      <section className="card">
        <h2>Invite someone</h2>
        <form className="row-form" onSubmit={invite}>
          <label>
            Email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button disabled={busy}>{busy ? "Sending…" : "Send invite"}</button>
        </form>
        {error && <p className="error">{error}</p>}
        {sentTo && <p className="ok">Invite sent to {sentTo}.</p>}
      </section>
      <section className="card">
        <h2>Invites</h2>
        <table>
          <thead>
            <tr><th>Email</th><th>Invited</th><th>Accepted</th></tr>
          </thead>
          <tbody>
            {invites.map((i) => (
              <tr key={i.email}>
                <td>{i.email}</td>
                <td>{new Date(i.invited_at).toLocaleDateString()}</td>
                <td>{i.accepted_at ? new Date(i.accepted_at).toLocaleDateString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
```

- [ ] **Step 3: wire it in.** In `web/src/main.tsx`, import `{ Admin } from "./pages/Admin"` and replace `{ element: <RequireAdmin />, children: [] }` with:

```tsx
{ element: <RequireAdmin />, children: [{ path: "/admin", element: <Admin /> }] },
```

- [ ] **Step 4: checks and manual verification**

```bash
cd web && npm run format && npm run typecheck && npm run format:check && npm test
```

With `supabase functions serve` running:
1. As non-admin `dev@example.com`: there is no Admin link, and `/admin` redirects to `/portfolio`.
2. Make dev an admin (SQL in Task 7, Step 6) and reload: the Admin link appears.
3. Invite `friend2@example.com` → "Invite sent". The row appears with Accepted `—`, and the email is in Mailpit.
4. Invite the same address again → `That person already has an account — they can sign in directly.`
5. Open the friend2 invite link from Mailpit in a private window → `/welcome`. Back in the admin window, reload: Accepted now has a date.

- [ ] **Step 5: commit**

```bash
cd /Users/r.fu/Projects/richfolio
npm run format && npm run format:check && npm run typecheck && npm test
git add web
git commit -m "feat(web): admin page to send and track invites

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 13: CI for the web app and the database

**Files:**
- Create: `.github/workflows/web.yml`, `.github/workflows/db.yml`

These are separate path-filtered workflows rather than extra jobs in `ci.yml` (a deviation from the spec). That keeps them from running on every pipeline-only commit, and leaves the existing `validate` job untouched.

- [ ] **Step 1: `.github/workflows/web.yml`**

```yaml
name: Web

on:
  push:
    branches: [main]
    paths: &web_paths
      - "web/**"
      - "src/configSchema.ts"
      - "src/fetchCrypto.ts"
      - "supabase/settings.schema.json"
      - "supabase/types.ts"
      - "supabase/functions/ticker-lookup/lookup.ts"
      - ".github/workflows/web.yml"
  pull_request:
    branches: [main]
    paths: *web_paths

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v6

      - uses: actions/setup-node@v6
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: |
            package-lock.json
            web/package-lock.json

      # web/ type-checks ../src/configSchema.ts, whose type imports reach the
      # pipeline's dependencies in the root node_modules.
      - run: npm ci

      - run: npm ci
        working-directory: web
      - run: npm run typecheck
        working-directory: web
      - run: npm run format:check
        working-directory: web
      - run: npm test
        working-directory: web
      - run: npm run build
        working-directory: web
```

GitHub Actions supports YAML anchors since 2025. If the workflow fails to parse with an "anchors are not supported" error, repeat the `paths` list under `pull_request` instead.

- [ ] **Step 2: `.github/workflows/db.yml`**

Replace `<VERSION>` with the version recorded in Task 1, Step 1. Pinning matters: `supabase gen types` output varies by CLI version, and the drift check below compares exact text.

```yaml
name: Database

on:
  push:
    branches: [main]
    paths: ["supabase/**", ".github/workflows/db.yml"]
  pull_request:
    branches: [main]
    paths: ["supabase/**", ".github/workflows/db.yml"]

jobs:
  test:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v6

      - uses: supabase/setup-cli@v1
        with:
          version: <VERSION>

      # Full local stack (Docker is available on ubuntu runners). RLS tests need
      # the real auth schema, and the hook config in config.toml.
      - run: supabase start

      - name: pgTAP (schema, RLS, auth hook, import)
        run: supabase test db

      # A migration committed without regenerating types leaves the web app
      # typed against a schema that no longer exists.
      - name: Generated types are current
        run: |
          supabase gen types typescript --local > /tmp/types.ts
          diff -u supabase/types.ts /tmp/types.ts
```

- [ ] **Step 3: push and watch both workflows go green**

```bash
git add .github/workflows/web.yml .github/workflows/db.yml
git commit -m "ci(web): build/test the web app and run pgTAP against a local Supabase

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
env -u GITHUB_TOKEN -u GH_TOKEN gh run list --limit 5
env -u GITHUB_TOKEN -u GH_TOKEN gh run watch <run id>     # for each of Web and Database
```

Expected: Web ✓, Database ✓, CI ✓. (`env -u GITHUB_TOKEN` because the repo's `.env` exports a `GITHUB_TOKEN` that shadows `gh`'s own login.)

`scheduler.test.ts` reads only the workflows it names, so the new files don't affect it.

---

### Task 14: Watchdog keeps Supabase awake, and alerts when it isn't

**Files:**
- Modify: `.github/workflows/scheduler-watchdog.yml`

The free tier pauses a project after 7 days without activity, and until #2 nothing writes daily. This adds an anonymous `ping()` call every 6 hours. The call is the activity, and its failure becomes an alert.

- [ ] **Step 1: add the check.** In the `check` step, add these entries to its `env:` block:

```yaml
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
```

Then insert this immediately after the `done` that closes the `for WF in …` loop:

```bash
          # Supabase (richfolio web). The call is itself the keep-alive: a
          # free-tier project pauses after 7 idle days, and until the pipeline
          # writes daily (sub-project #2) nothing else touches it. Skipped, not
          # alerted, until the secrets exist. Checked here in bash rather than
          # in an `if:` for the same reason as the alert steps below.
          if [ -n "$SUPABASE_URL" ] && [ -n "$SUPABASE_ANON_KEY" ]; then
            CODE=$(curl -s -o /tmp/ping.txt -w '%{http_code}' -X POST \
                     "$SUPABASE_URL/rest/v1/rpc/ping" \
                     -H "apikey: $SUPABASE_ANON_KEY" \
                     -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
                     -H 'Content-Type: application/json' -d '{}' || echo 000)
            echo "supabase ping: HTTP $CODE $(head -c 100 /tmp/ping.txt)"
            if [ "$CODE" != "200" ]; then
              PROBLEMS+="- supabase: ping returned HTTP ${CODE} — project may be paused."$'\n'
              PROBLEMS+="    Restore it: Supabase dashboard -> richfolio -> Restore project"$'\n'
            fi
          else
            echo "SUPABASE_URL / SUPABASE_ANON_KEY not set — skipping Supabase check."
          fi
```

- [ ] **Step 2: make the alert headline honest.** The Telegram and email texts assume the scheduler is the cause. In the Telegram step change the first line of `TEXT` from `🚨 Richfolio scheduler looks dead` to `🚨 Richfolio watchdog alert`. In the email step change `subject` to `"🚨 Richfolio watchdog alert — something stopped"`. Both bodies already list `${PROBLEMS}` first, so the Supabase line and its fix appear above the scheduler advice.

- [ ] **Step 3: test the alert path without secrets**

```bash
git add .github/workflows/scheduler-watchdog.yml
git commit -m "feat(ops): watchdog pings Supabase to keep the free project awake

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
env -u GITHUB_TOKEN -u GH_TOKEN gh workflow run scheduler-watchdog.yml
env -u GITHUB_TOKEN -u GH_TOKEN gh run watch $(env -u GITHUB_TOKEN -u GH_TOKEN gh run list --workflow scheduler-watchdog.yml -L 1 --json databaseId --jq '.[0].databaseId')
```

Expected: success, with the log line `SUPABASE_URL / SUPABASE_ANON_KEY not set — skipping Supabase check.`. The secrets are added in Task 16, which re-runs this check.

---

### Task 15: Documentation

**Files:**
- Create: `web/README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: `web/README.md`**

````markdown
# Richfolio web

Invite-only site where users manage their portfolio. Static Vite + React SPA on
Cloudflare Pages, talking straight to Supabase; row-level security is the whole
authorization layer. Design: `specs/2026-10-09-web-foundation-design.md`.

## Local development

```bash
npm ci                          # repo root — web/ type-checks ../src
npm run db:start                # local Supabase (Docker)
supabase db reset               # migrations + seed (invites dev@example.com)
supabase functions serve        # ticker-lookup, send-invite
cp web/.env.example web/.env.local   # paste the anon key from `supabase status`
cd web && npm ci && npm run dev # http://localhost:5173
```

Sign in as `dev@example.com`; the magic link lands in Mailpit at
http://127.0.0.1:54324. Make yourself admin in Studio (http://127.0.0.1:54323):

```sql
update profiles set is_admin = true where id = (select id from auth.users where email = 'dev@example.com');
```

## Changing the database

1. Add `supabase/migrations/<timestamp>_<name>.sql` — never edit in the dashboard.
2. Add or update a pgTAP test in `supabase/tests/database/`.
3. `supabase db reset && npm run db:test && npm run db:types`
4. Commit the migration, test and `supabase/types.ts` together (CI diffs the types).
5. Apply to production by hand: `npm run db:push`.

Changing the settings shape means editing `supabase/settings.schema.json` **and**
re-embedding it in a new migration that redefines `settings_schema()`;
`test/settingsSchema.test.ts` fails until both match.

## Deploying

- Site: Cloudflare Pages builds `web/` on every push to `main`.
- Functions: `npm run fn:deploy`.
- Migrations: `npm run db:push` (manual, on purpose).
````

- [ ] **Step 2: `CLAUDE.md`.** Add `web/` and `supabase/` to the Commands block:

```bash
npm run db:start / db:test / db:types / db:push   # Supabase local stack, pgTAP, generated types, prod migrations
npm run fn:deploy                                  # Deploy Edge Functions (ticker-lookup, send-invite)
cd web && npm run dev                              # Web app on :5173 (see web/README.md)
```

Then add this section before `## Key Gotchas`:

```markdown
## Web app (sub-project #1 of 5)

Invite-only site (`web/`, `supabase/`) where users manage their portfolio; design and roadmap in `specs/2026-10-09-web-foundation-design.md`. **The pipeline does not read it yet** — briefs still come from `CONFIG_JSON` until sub-project #2.

- **No backend — RLS is the authorization layer.** The SPA calls PostgREST directly with the user's JWT. The pgTAP tests in `supabase/tests/database/` are the security tests; a policy change without one is untested security. The service-role key exists only inside Edge Functions.
- **Invite-only is the `before_user_created` hook, not the "disable signups" switch.** That switch also blocks an invited friend's first Google sign-in. A refused Google sign-in comes back as `?error_description=` on the redirect, which is why `RequireAuth` forwards `search`/`hash` to `/login`.
- **`src/configSchema.ts` is shared with the web app.** `config.ts` is now a thin I/O wrapper around `parsePortfolioConfig()`, and the web importer calls the same function, so they cannot drift. Keep it pure — importing `config.js` or anything with I/O from it breaks the browser build.
- **One settings schema, two enforcers.** `supabase/settings.schema.json` drives Ajv in the browser; a migration embeds the same text in a `pg_jsonschema` CHECK. `test/settingsSchema.test.ts` fails when they differ.
- **`transactions` is the source of truth for holdings**; `holdings` is a view. The non-negative position guard is a *deferred* constraint trigger so `import_portfolio()` (delete + re-insert in one transaction) is judged on its end state; pgTAP tests use `set constraints all immediate` to see it fire per statement.
- **`ticker_status` is shared across users** and never downgraded: a failed lookup only inserts a never-seen symbol (`ignoreDuplicates`), so a Yahoo hiccup can't turn a verified ticker amber.
- **Migrations are applied manually** (`npm run db:push`) — single developer, review before prod beats auto-apply.
- **Free-tier pause**: Supabase pauses after 7 idle days. `scheduler-watchdog.yml` calls `rpc/ping` every 6h as the keep-alive and alerts if it fails.
```

- [ ] **Step 3: commit**

```bash
git add web/README.md CLAUDE.md
git commit -m "docs(web): local dev, migrations and deployment for the web app

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 16: Production setup and end-to-end verification (operator)

These steps need dashboards and DNS, so Richard does them. The agent supplies the values, runs the CLI commands, and checks each result.

- [ ] **Step 1: database and functions**

```bash
npm run db:push            # applies all four migrations to the linked project
npm run fn:deploy          # ticker-lookup, send-invite
```

Expected: `db push` lists the four migrations as applied, and both functions deploy.

- [ ] **Step 2: Resend sending domain.** In Resend → Domains, add `mail.richfolio.richardfu.net` and add the DNS records it lists (SPF TXT, DKIM CNAME/TXT, MX for the return path) wherever `richardfu.net`'s DNS is hosted. Wait for it to show **Verified**. Create an SMTP credential (Resend → SMTP: host `smtp.resend.com`, port `465`, user `resend`, password = an API key).

- [ ] **Step 3: Supabase auth settings** (Dashboard → Authentication):
  - **SMTP:** enable custom SMTP with the Resend values. Sender `login@mail.richfolio.richardfu.net`, name `Richfolio`.
  - **URL configuration:** Site URL `https://richfolio.richardfu.net`. Redirect URLs: `https://richfolio.richardfu.net/**` and `http://localhost:5173/**`.
  - **Hooks:** add a *Before User Created* hook of type Postgres, function `public.hook_require_invite`.
  - **Providers → Email:** enabled, with signups allowed (gating is the hook).

- [ ] **Step 4: Google sign-in**
  1. Google Cloud Console → new project `richfolio` → **OAuth consent screen**: External. App name Richfolio, your support email, scopes `email`, `profile`, `openid` only. Publish the app; with only these scopes, no verification review is needed.
  2. **Credentials → Create OAuth client ID → Web application.** Authorised redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
  3. Supabase → Authentication → Providers → **Google**: paste the client ID and secret, then enable.

- [ ] **Step 5: Cloudflare Pages**
  1. Workers & Pages → Create → Pages → connect `furic/richfolio`. Production branch `main`. **Root directory `web`**, build command `npm run build`, output `dist`.
  2. Environment variables (Production): `VITE_SUPABASE_URL=https://<project-ref>.supabase.co`, `VITE_SUPABASE_ANON_KEY=<anon/publishable key from Supabase → Project Settings → API>`, `NODE_VERSION=20`.
  3. Custom domains → add `richfolio.richardfu.net`. If `richardfu.net` isn't on Cloudflare DNS, add the CNAME it shows at your DNS host.
  4. Expected: the first deployment succeeds, and `https://richfolio.richardfu.net/login` loads. `https://richfolio.richardfu.net/settings` also loads, which proves the `_redirects` SPA fallback.

- [ ] **Step 6: become admin**

```sql
-- Supabase SQL editor
insert into public.invites (email) values ('<your email>');
```

Sign in on the site with that email, complete `/welcome`, then:

```sql
update public.profiles set is_admin = true
 where id = (select id from auth.users where email = '<your email>');
```

- [ ] **Step 7: watchdog secrets**

```bash
env -u GITHUB_TOKEN -u GH_TOKEN gh secret set SUPABASE_URL --body "https://<project-ref>.supabase.co"
env -u GITHUB_TOKEN -u GH_TOKEN gh secret set SUPABASE_ANON_KEY --body "<anon key>"
env -u GITHUB_TOKEN -u GH_TOKEN gh workflow run scheduler-watchdog.yml
```

Expected: the run logs `supabase ping: HTTP 200 "ok"` and sends no alert.

- [ ] **Step 8: end-to-end checks on production.** Tick each one:
  1. **Magic link:** sign out, then sign in by email. The email comes from `login@mail.richfolio.richardfu.net`, not Supabase's default sender.
  2. **Google (invited):** in a private window, choose "Continue with Google" with your invited Google account → `/portfolio`.
  3. **Google (not invited):** in a private window, sign in with a Google account that is **not** invited → you're back on `/login` showing `Richfolio is invite-only — ask Richard for an invite.` (Review Focus #1.) In Supabase → Authentication → Users, no user was created.
  4. **Magic link (not invited):** `stranger@…` → the same message, and no email is sent.
  5. **Ticker check:** add `AZN.L` → ✓ with `GBp`, or "unverified" if Task 1's spike showed Yahoo refuses Supabase egress. Either way the add succeeds.
  6. **Import:** your real `config.json` → the portfolio matches your `CONFIG_JSON`.
  7. **Invite a friend** from `/admin` → the email arrives from your domain. They sign in with Google on the same address and land on `/welcome`, and the invite shows as Accepted.
  8. **Isolation:** signed in as the friend, `/portfolio` is empty. None of your rows are visible.

- [ ] **Step 9: record completion.** In `specs/2026-10-09-web-foundation-design.md`, set `**Status:** Implemented (YYYY-MM-DD)` and add an "Implementation notes" list of the deviations:
  - Yahoo chart endpoint instead of search;
  - `ticker-lookup` takes POST;
  - separate `web.yml`/`db.yml` workflows;
  - inline messages instead of toasts;
  - the Task 1 spike result.

```bash
git add specs/2026-10-09-web-foundation-design.md
git commit -m "docs(spec): mark web foundation implemented

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```
