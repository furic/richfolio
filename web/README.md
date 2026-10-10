# Richfolio web

Invite-only site where users manage their portfolio. Static Vite + React SPA on
Cloudflare Pages, talking straight to Supabase; row-level security is the whole
authorization layer. Design: `specs/2026-10-09-web-foundation-design.md`. The
reasoning behind the decisions lives in the "Web app" section of the root `CLAUDE.md`.

## Local development

```bash
npm ci                               # repo root: web/ type-checks ../src
npm run db:start                     # local Supabase (Docker)
supabase db reset                    # migrations + seed (invites dev@example.com)
supabase functions serve             # needed for ticker checks and invites
cp web/.env.example web/.env.local   # paste the anon key from `supabase status`
cd web && npm ci && npm run dev      # http://localhost:5173
```

Web CI and Cloudflare Pages use Node 22 (vite 8 requires it); the root pipeline stays on Node 20.

Sign in as `dev@example.com`; the magic link lands in Mailpit at
http://127.0.0.1:54324. Locally "Confirm email" is on (`enable_confirmations = true`
in `supabase/config.toml`); invite acceptance depends on it, so the hosted project
needs the same dashboard setting. Make yourself admin in Studio (http://127.0.0.1:54323):

```sql
update profiles set is_admin = true where id = (select id from auth.users where email = 'dev@example.com');
```

Checks: `cd web && npm run typecheck && npm run format:check && npm test`, and
`npm run db:test` at the root for the pgTAP suite.

## Changing the database

1. Add `supabase/migrations/<timestamp>_<name>.sql`. Never edit in the dashboard.
2. Add or update a pgTAP test in `supabase/tests/database/`.
3. `supabase db reset && npm run db:test && npm run db:types`
4. Commit the migration, test and `supabase/types.ts` together (CI diffs the types).
5. Apply to production by hand: `npm run db:push`. Never apply migrations any other way.

Rules to remember:

- Every new SQL function must `revoke execute on function ... from public, anon`
  (Supabase grants both by default); pgTAP has anon regression tests that fail otherwise.
- `npm run db:types` passes an explicit `--db-url` for the local stack. The Supabase CLI
  auto-loads the repo-root `.env`, whose cloud `SUPABASE_DB_PASSWORD` makes `--local`
  fail with 28P01 and print the error JSON to stdout. The script writes through a
  `.tmp` file so a failure can't overwrite `types.ts`. CI has no `.env` and uses `--local`.
- Changing the settings shape means editing `supabase/settings.schema.json` **and**
  re-embedding it in a new migration that redefines `settings_schema()`;
  `test/settingsSchema.test.ts` fails until both match.
- Portfolio rows are written with `save_portfolio_row()` (target + the single opening
  transaction, atomically). A partial unique index allows one opening per (user, ticker).
- Show users `friendlyError()` (`web/src/lib/errors.ts`), never a raw Postgres or network message.

## Auth and invites

- Sign-in uses the implicit flow (`web/src/supabase.ts`): invite links from
  `auth.admin.inviteUserByEmail` are implicit-only, and magic links must work on a
  different device. A refused or expired sign-in comes back in the URL hash;
  `RequireAuth` forwards search and hash to `/login`, and the catch-all route
  forwards them to `/portfolio` (the invite link lands on the site root).
- The `before_user_created` hook gates sign-up. `invites.accepted_at` is stamped from
  `email_confirmed_at`, so "Confirm email" must be on. Re-inviting a pending invitee
  re-sends the email; only a confirmed account returns 409.

## Edge functions

Both functions set `verify_jwt = false` and authenticate in code (the gateway check
can't verify publishable keys). `ticker-lookup` requires a real signed-in session
(`auth.getUser`), because the anon key ships in the bundle. It validates the symbol's shape before fetching; a definitive
Yahoo 404 blocks, an upstream failure saves the ticker unverified. Yahoo answers from
Supabase's Sydney egress. `send-invite` is admin-only (403 otherwise). Both need `supabase functions serve` locally.

## Portfolio prices

An average price is stored in the ticker's quote currency (e.g. `GBp` for LSE),
falling back to your profile currency. The form captions and save notice show which.

## Deploying

- Site: Cloudflare Pages builds `web/` on every push to `main` (Node 22).
- Functions: `npm run fn:deploy`.
- Migrations: `npm run db:push` (manual, on purpose). The cloud project (Sydney,
  ap-southeast-2) is linked with `supabase link`; its ref is then in `supabase/.temp`.

## Moving from the GitHub version

Settings → "Moving from the GitHub version?" imports a `config.json` once
(targets, holdings, watchlist). It is a one-time tool and keeps the user's existing
delivery choices.
