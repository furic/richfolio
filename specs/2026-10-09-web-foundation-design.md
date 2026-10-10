# Design: Richfolio web — Foundation (sub-project #1 of 5)

**Date:** 2026-10-09
**Status:** Draft — awaiting review

## Problem

Richfolio is configured by editing a `CONFIG_JSON` Actions variable and a dozen repo
secrets. That works for one operator and for nobody else: a friend who wants a brief has
to fork the repo, create five accounts, paste JSON into GitHub, and — because Resend's
free tier only delivers to the key owner — still can't receive email from a shared
setup.

The goal is a standalone website where invited friends sign in, set their portfolio, and
receive the same daily brief, while the operator (Richard) becomes user #1 on the same
code path instead of maintaining a parallel one.

## Decisions already made

| Question | Decision | Why |
|---|---|---|
| Audience (v1) | **Operator + invited friends**, ~5–20 people | Keeps compliance light (disclaimer + privacy note), allows GitHub Actions to stay the compute, no abuse/billing machinery |
| Platform | **Supabase** (Auth, Postgres, RLS) + **Cloudflare Pages** (static site) + **GitHub Actions** (compute) | Supabase gives email + Google auth and per-row authorization for free; Pages hosts a static SPA free; Actions minutes are free and unlimited on this public repo. Runs take 4–31 min, which no free serverless platform can host in one invocation |
| Rejected: all-Cloudflare (D1 + self-hosted auth) | — | Auth code to own, weaker relational queries for performance tracking, no benefit at friends scale |
| Rejected: compute on Cloudflare Workflows | — | yahoo-finance2's cookie/crumb handshake is unreliable from Cloudflare egress and the Claude Agent SDK cannot run in a Worker; a rewrite of a working pipeline for no user-visible gain |
| Operator's existing setup | **Operator becomes user #1**; `CONFIG_JSON` retired in #2 | One code path, one state store |
| Holdings model | **Transactions are the source of truth**; share counts derived | Single truth, real cost basis, clean dataset for scoring signals |
| Who supplies keys | **Users bring AI keys only** (Gemini free, optionally Mistral/Anthropic). Platform owns email (Resend), one shared Telegram bot, one NewsAPI key | Onboarding is one guided key; Gemini's ~20/day free quota is per key so it must be per user |
| Domain | Subdomain of `richardfu.net` — site `richfolio.richardfu.net`, mail from `mail.richfolio.richardfu.net` | Free; a separate sending subdomain keeps the blog's mail reputation apart |
| Portfolio UX | **One row per symbol** (target %, shares, avg price together), no config.json required | The site exists so people with no coding skills can set up; two tables mirroring the data model were harder to grasp |
| Frontend | **Vite + React + TypeScript SPA** | Static on Pages, talks to Supabase directly; RLS is the whole authorization layer, so there is no backend |

### Constraints carried into every sub-project

- **Claude subscription token is operator-only.** Serving other users from one Pro/Max
  subscription is outside its consumer terms. Hosted users use API keys.
- **Social posting is operator-only.** It never becomes a per-user feature.
- **Every brief carries a general-advice disclaimer** (ASIC general advice warning
  wording), and the site has a short privacy note covering what is stored and why.
- **Any future use of user transactions for model training is explicit opt-in**, off by
  default, and is not part of this roadmap's v1.

## Roadmap

Each sub-project gets its own spec → plan → implementation cycle.

| # | Sub-project | Delivers |
|---|---|---|
| **1** | **Foundation** *(this spec)* | Supabase schema, auth (email + Google), invite allowlist, Pages site with portfolio / watchlist / settings |
| 2 | Multi-tenant pipeline | Replace import-time `config.ts` with per-user config loaded from the DB; shared per-ticker stage (prices, technicals, news, Stage 1 Observe) + per-user Decide/deliver; baseline and reasoning history move into the DB; migrate the operator as user #1 and retire `CONFIG_JSON`; **start the signal log** (every rec with action, confidence and price) |
| 3 | Onboarding + key vault | Guided step-by-step key wizard; browser-side libsodium sealed-box encryption with the private key held only by the Actions runner; shared-bot Telegram linking via `/start` deep link |
| 4 | Transactions + performance | Buy/sell entry UI, cost basis, realised/unrealised P/L, comparison against VOO/S&P 500, daily price snapshots |
| 5 | Signal scorecard | Forward returns of past STRONG BUY / BUY at 30/90/180 days — the measurable precursor to any "train our LLM" ambition |

#2 is deliberately next: `config.ts` reads `config.json` at import time and most modules
import its values directly, so moving to per-user config is the hardest refactor in the
roadmap and should be proven with the operator as the only user before friends depend on
it. The signal log lands in #2 rather than #5 because its value is time-accumulated.

## Goals (this sub-project)

1. An invited person can sign in with an email magic link or Google; anyone else is
   refused with a clear message.
2. A signed-in user can set currency, time zone, planned portfolio value, target
   allocations, opening-balance holdings, an equity watchlist, crypto cross-pairs, and
   the alert / delivery settings that exist in `config.json` today.
3. A user can import an existing `config.json` with a preview before saving.
4. Tickers are checked against Yahoo (equities) and crypto.com (pairs) when added.
5. No user can read or modify another user's data, and no user can grant themselves
   admin — enforced in the database and covered by tests.
6. The operator can invite people from an admin page.

## Non-goals

- The pipeline does **not** read from the database yet (#2). Briefs keep coming from
  `CONFIG_JSON` until then.
- No API-key storage or onboarding wizard (#3).
- No buy/sell entry, P/L, or performance charts (#4). Only opening-balance entries.
- No billing, quotas, or public signup.
- No automated OAuth end-to-end tests.

## Architecture

### Repo layout

```
web/                  Vite + React + TS SPA  →  Cloudflare Pages
  src/
  package.json        own deps; imports pure modules from ../src where useful
supabase/
  config.toml         Supabase CLI project config
  migrations/*.sql    every schema change, reviewed like code
  functions/
    ticker-lookup/    Edge Function (Deno)
  tests/*.sql         pgTAP RLS tests
  seed.sql            local dev data
  types.ts            generated by `supabase gen types typescript`
src/configSchema.ts   NEW — pure parsePortfolioConfig() extracted from config.ts
```

No migration is ever applied by hand-editing in the Supabase dashboard.

### Hosting

- **Cloudflare Pages** project connected to the repo, root `web/`, build `npm run build`,
  output `web/dist`, custom domain `richfolio.richardfu.net`. SPA fallback via
  `web/public/_redirects` (`/* /index.html 200`).
- **Resend** sending domain `mail.richfolio.richardfu.net` (SPF, DKIM, return-path
  records). Supabase Auth is configured with **custom SMTP via Resend** — the built-in
  Supabase mailer is rate-limited to a few emails per hour and is not for production.

### Auth

- Supabase Auth, providers: **email (magic link, OTP)** and **Google**.
- Google: an OAuth client in Google Cloud with only `email` + `profile` scopes (no
  sensitive scopes, so no Google verification review). Redirect URI is the Supabase
  callback; site URL and allowed redirect list include `richfolio.richardfu.net` and
  `localhost:5173`.
- Browser client: `@supabase/supabase-js` with the **PKCE** flow.

### Invite-only gating

A Supabase **Before User Created** auth hook, implemented as a Postgres function, rejects
creation of any user whose email is not in `invites`. This is used instead of the
"disable signups" switch because that switch also blocks first-time Google sign-ins for
people who *were* invited. The hook covers both providers identically.

On successful creation, a trigger on `auth.users` inserts the `profiles` row and stamps
`invites.accepted_at`.

Admin page invite = insert into `invites` + `auth.admin.inviteUserByEmail()`. Because the
admin API needs the service-role key, which must never reach the browser, this one
action goes through a tiny Edge Function `send-invite` that verifies the caller's
`is_admin` before acting.

## Data model

```sql
-- citext for case-insensitive emails; pg_jsonschema for settings validation
create extension if not exists citext;
create extension if not exists pg_jsonschema;

create table profiles (
  id                      uuid primary key references auth.users on delete cascade,
  display_name            text,
  default_currency        text not null default 'USD'
                            check (default_currency in
                              ('USD','GBP','EUR','AUD','CAD','JPY','CHF','HKD','SGD','NZD')),
  time_zone               text not null default 'UTC',          -- IANA name
  planned_portfolio_value numeric(14,2) not null default 0 check (planned_portfolio_value >= 0),
  settings                jsonb not null default '{}'
                            -- schema text embedded from supabase/settings.schema.json
                            check (jsonb_matches_schema('{…}'::json, settings)),
  is_admin                boolean not null default false,
  created_at              timestamptz not null default now()
);

create table targets (
  user_id    uuid not null references profiles on delete cascade,
  ticker     text not null check (ticker = upper(ticker) and length(ticker) between 1 and 15),
  target_pct numeric(5,2) not null check (target_pct > 0 and target_pct <= 100),
  primary key (user_id, ticker)
);

create table watchlist (
  user_id uuid not null references profiles on delete cascade,
  symbol  text not null,                                  -- 'MSFT' or 'BTC/CRO'
  kind    text not null check (kind in ('equity','crypto_pair')),
  primary key (user_id, symbol)
);

create table transactions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles on delete cascade,
  ticker     text not null,
  type       text not null check (type in ('opening','buy','sell')),
  shares     numeric(20,8) not null check (shares > 0),
  price      numeric(20,8) check (price is null or price >= 0),   -- per share
  currency   text,                                                -- of `price`
  fees       numeric(14,2) not null default 0,
  traded_at  date,
  note       text,
  created_at timestamptz not null default now(),
  -- buy/sell must be fully specified; only an opening balance may omit cost and date
  check (type = 'opening' or (price is not null and traded_at is not null and currency is not null))
);

create view holdings with (security_invoker = true) as
  select user_id, ticker,
         sum(case when type = 'sell' then -shares else shares end) as shares
  from transactions
  group by user_id, ticker
  having sum(case when type = 'sell' then -shares else shares end) > 0;

-- Shared, not per user: one row per symbol anyone has added. Written only by
-- ticker-lookup (service role) now, and by the pipeline in #2.
create table ticker_status (
  symbol          text primary key,                      -- 'AZN.L' or 'BTC/CRO'
  kind            text not null check (kind in ('equity','crypto_pair')),
  verified        boolean not null,
  name            text,
  exchange        text,
  quote_currency  text,
  checked_at      timestamptz not null default now(),
  last_fetch_failed_at timestamptz                        -- set by the pipeline in #2
);

create table invites (
  email       citext primary key,
  invited_by  uuid references profiles,
  invited_at  timestamptz not null default now(),
  accepted_at timestamptz
);
```

### `settings` jsonb

Mirrors the per-user parts of today's `config.json`; every key optional, defaults
applied by `parsePortfolioConfig()` exactly as `config.ts` does now:

```json
{
  "intradayAlerts": { "enabled": true, "confidenceIncreaseThreshold": 10,
                      "minConfidenceToAlert": 80, "actionUpgradesAlert": true,
                      "onlyAlertForActions": ["STRONG BUY","BUY"],
                      "minPriceMovePctToAlert": 1.0 },
  "cryptoAlerts":   { "...same shape..." },
  "ai":             { "strongBuyRequiresAllProviders": false },
  "delivery":       { "email": true, "telegram": false }
}
```

The JSON Schema lives once in `supabase/settings.schema.json`; the migration embeds it in
the check constraint and the web app validates forms against the same file (ajv), so a
DB rejection indicates a bug rather than user error.

`social` is **not** stored here: it is operator-only and moves to a repo-level Actions
variable in #2.

### Row-level security

| Table | Policy |
|---|---|
| `profiles` | select/update own row (`id = auth.uid()`). Column-level `grant update` excludes `is_admin` and `id`. Insert only by the creation trigger. |
| `targets`, `watchlist`, `transactions` | all operations on own rows (`user_id = auth.uid()`), `with check` the same |
| `holdings` | `security_invoker`, so `transactions` RLS applies |
| `ticker_status` | select for any authenticated user (public market metadata, no user data); no client writes |
| `invites` | select/insert/delete only when `(select is_admin from profiles where id = auth.uid())` |

### Integrity triggers

- **Non-negative position:** an insert/update/delete on `transactions` that would leave
  any `(user_id, ticker)` with a negative running total is rejected.
- **Target total:** *not* enforced in the database. The UI warns above 100%. A hard
  constraint would block reallocating (lowering one target before raising another), and
  `config.json` has never enforced it either.

## Screens

| Route | Content |
|---|---|
| `/login` | Email field ("Send magic link") and "Continue with Google". Hook rejection → "Richfolio is invite-only — ask Richard for an invite." Expired link → "That link expired — send a new one." |
| `/welcome` | First sign-in only (no `display_name` yet): name, currency, time zone (prefilled from `Intl.DateTimeFormat().resolvedOptions().timeZone`), planned portfolio value. Then → `/portfolio`. |
| `/portfolio` | **One row per holding** *(user decision 2026-10-10)*: Symbol (+ status badge) · Name · Target % · Shares held · Avg price (optional), edited inline; an "Add a holding" form below; running-total bar of targets, amber above 100%. A row is a `targets` row plus at most one `opening` transaction, written atomically by `save_portfolio_row()`. |
| `/watchlist` | Equity watchlist and crypto cross-pairs (`BASE/QUOTE`). |
| `/settings` | Currency, time zone, planned value, delivery toggles; **Advanced** (collapsed): intraday + crypto alert thresholds and the STRONG BUY strictness flag, prefilled with defaults. **Import config.json**. |
| `/admin` | Admin only: invite by email, list of invites with accepted status. |

Footer on every page: general-advice disclaimer and a link to the privacy note.

### Import `config.json`

A one-time migration tool, not how portfolios are set up: it sits collapsed at the bottom of Settings under "Moving from the GitHub version?" *(user decision 2026-10-10)*. Everyone else sets up their portfolio on the Portfolio page, with no JSON involved.

Paste or upload. `parsePortfolioConfig()` (below) validates it and returns typed data; the
UI shows a preview diff — targets, holdings (as opening entries), watching,
watchingCrypto, settings — and writes only on confirm. `social`, `totalPortfolioValueUSD`
and unknown keys are reported as ignored. Import replaces targets / watchlist / opening
entries; it never touches `buy`/`sell` transactions.

### `src/configSchema.ts`

`config.ts`'s validation rules (currency whitelist, `watching` must be an array, crypto
pair parsing, deprecated `totalPortfolioValueUSD`, alert defaults) are extracted into a
pure `parsePortfolioConfig(json: unknown): ParsedConfig` with no I/O and no `dotenv`.
`config.ts` becomes a thin wrapper — read file, call the parser, re-export — so its
existing exports and behaviour are unchanged. The web app imports the parser via a
relative path, so the importer and the pipeline cannot drift. Same pure/wrapper split as
`allocation.ts`/`analyze.ts`, and the first step #2 needs. `parseCryptoPair` is already
safe to import from the browser (its module has type-only imports).

## Ticker validation — `ticker-lookup` Edge Function

The browser cannot call Yahoo (no CORS). `supabase/functions/ticker-lookup`:

- **Requires a valid user JWT** (`verify_jwt = true`), so it is not an open proxy.
- `GET ?q=AZN.L&kind=equity` → Yahoo search (`query1.finance.yahoo.com/v1/finance/search`)
  → `{ symbol, name, type: EQUITY|ETF|CRYPTOCURRENCY, exchange, currency }`. The UI shows
  "AZN.L · AstraZeneca · LSE · GBp" for confirmation.
- `GET ?q=BTC/CRO&kind=crypto_pair` → crypto.com `public/get-instruments`, accepting
  either listing direction, mirroring `resolveInstrument()`.
- Crypto equities: the pipeline maps only `BTC` and `ETH` to Yahoo symbols today
  (`toYahooTicker`). The lookup rejects other `CRYPTOCURRENCY` results with "only BTC and
  ETH are supported as holdings for now" rather than storing a ticker the pipeline would
  silently fail on.
- Every lookup upserts `ticker_status`, so a symbol is checked once for all users and the
  UI renders badges by joining against it.
- **Fallback:** on Yahoo error or a 5s timeout, the ticker is still saved and
  `ticker_status.verified = false`, rendered as an "unverified" badge, instead of
  blocking. In #2 the pipeline sets `last_fetch_failed_at` on symbols it could not fetch
  and the badge turns red.

**Risk spike — first plan task:** deploy a throwaway function and confirm Yahoo's search
endpoint answers from Supabase's edge egress. If it does not, the fallback path becomes
the primary path and the UI copy changes accordingly; no other part of this design
depends on the result.

## Error handling

- Forms validate against the shared JSON Schema / parser before writing.
- Auth: hook rejection and expired-link errors map to the plain messages above; any other
  Supabase error renders as a toast with its code.
- `ticker-lookup` failure → unverified save, never a blocked add.
- RLS denials are not expected in normal use; they surface as a generic error toast and
  `console.error` with the PostgREST code.

## Testing

- **Database (pgTAP, `supabase test db`)** — RLS is the only security boundary, so it is
  tested, not assumed:
  - user A cannot select, update or delete user B's rows in any table, nor see them via
    `holdings`;
  - a user cannot set their own `is_admin`;
  - a non-admin cannot read or write `invites`;
  - the Before User Created hook rejects a non-invited email and accepts an invited one
    case-insensitively;
  - a sell that would make a position negative is rejected; an opening entry without
    price/date is accepted, a buy without them is rejected;
  - malformed `settings` is rejected by the jsonb schema check.
- **Unit (`node:test`, existing `npm test`)** — `parsePortfolioConfig` against
  `config.example.json` and each error case `config.ts` handles today; config.json →
  rows import mapping; target-total computation.
- **Manual** — magic link and Google sign-in on the deployed site, including a
  non-invited Google account being refused.

### CI

`ci.yml` gains two path-filtered jobs alongside the untouched `validate` job:

- `web` (on `web/**`, `src/configSchema.ts`): `npm ci`, typecheck, Prettier check,
  `vite build`.
- `db` (on `supabase/**`): `supabase/setup-cli`, `supabase start`, `supabase test db`.
  Ubuntu runners have Docker.

## Deployment

- **Site:** Cloudflare Pages auto-builds `main`. Env: `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY` (public by design; RLS protects data).
- **Database:** migrations applied manually with `npm run db:push`
  (`supabase db push --linked`). Single developer, manual review before production beats
  auto-apply for v1.
- **Edge Functions:** `npm run fn:deploy` (`supabase functions deploy`). Secret:
  service-role key is available to functions by default; nothing else needed.
- **Free-tier pause:** Supabase pauses free projects after 7 days of inactivity, and until
  #2 nothing writes daily. `scheduler-watchdog.yml` (every 6h) gains a step that reads
  one row through the REST API with the anon key — this keeps the project active and
  alerts through the watchdog's existing Telegram/Resend path if the read fails, which #2
  will depend on anyway. Credentials checked in bash, not the step's `if:`, per the
  existing gotcha in that workflow.

## Operator setup checklist (~30 min, one-time)

1. Create the Supabase project (region near Sydney); `supabase link`.
2. Enable `citext` and `pg_jsonschema`; `npm run db:push`.
3. Google Cloud: OAuth consent screen (external, `email`/`profile`), OAuth client, paste
   ID/secret into Supabase Auth → Google.
4. Resend: add `mail.richfolio.richardfu.net`, add its DNS records, verify; Supabase Auth
   → SMTP settings → Resend SMTP credentials, sender `login@mail.richfolio.richardfu.net`.
5. Supabase Auth → Hooks: enable Before User Created → `public.hook_require_invite`.
6. Cloudflare Pages: connect repo, root `web/`, env vars; custom domain
   `richfolio.richardfu.net` (CNAME on wherever `richardfu.net` DNS is hosted).
7. Supabase Auth URL config: site URL + redirect allowlist.
8. Seed: insert the operator's email into `invites`, sign in, then
   `update profiles set is_admin = true where id = …` from the SQL editor.
9. Add `SUPABASE_URL` / `SUPABASE_ANON_KEY` Actions secrets for the watchdog step.

## Risks

| Risk | Mitigation |
|---|---|
| Yahoo refuses Supabase edge egress | Spike first; unverified fallback means the site works regardless |
| Supabase free project pauses | Watchdog ping every 6h; daily writes from #2 onward |
| Before User Created hook misconfigured → anyone can sign up | pgTAP test of the hook function; manual non-invited Google test in the checklist |
| `settings` schema and pipeline defaults drift | One schema file used by DB and web; one parser used by web and pipeline |
| Supabase or Pages free-tier terms change | All schema and functions in git; the SPA is static and portable to any host |
