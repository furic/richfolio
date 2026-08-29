# richfolio-scheduler

A Cloudflare Worker that fires richfolio's GitHub Actions workflows on time.

## Why

GitHub's `schedule:` event is not a scheduler you can rely on. Its docs state scheduled workflows
"may be delayed during periods of high load" and, at sufficient load, dropped entirely — so this is
documented behaviour and is never reported on githubstatus.com. GitHub staff acknowledged the
worsening drift in [community discussion #196910](https://github.com/orgs/community/discussions/196910)
(open since 2026-05-25): drift "has got worse", caused by load balancing under >30% growth in
scheduled job volume, with no committed fix date.

Measured on this repo, the `0 22 * * *` daily brief fired:

| Date       | Fired (UTC) | Drift      | Email landed (AEST) |
| ---------- | ----------- | ---------- | ------------------- |
| Aug 11–13  | 22:50–22:51 | +51m       | ~9:15am             |
| Aug 14–25  | 22:28–22:34 | +30m       | ~8:55am             |
| **Aug 26** | —           | **dropped** | —                  |
| Aug 27     | 03:02       | **+5h 02m** | 1:24pm             |
| Aug 28     | 06:03       | **+8h 03m** | 4:30pm             |
| Aug 29     | 03:36       | **+5h 36m** | 2:01pm             |

The analysis itself takes ~25 minutes and never varied. The delay was entirely GitHub's dispatch
queue. `crypto-monitor.yml` fared worse still — 2–3 of its 8 daily runs actually landed.

The `schedule:` triggers were **removed** from both workflows rather than kept as a fallback:
GitHub does eventually deliver a late cron, which would then run a second, duplicate brief — and
`daily`/`intraday` modes post publicly to X / Facebook / LinkedIn / Threads, so a duplicate means
duplicate public posts. `workflow_dispatch` remains on both workflows as the manual recovery path.

## Cost

Free. The [Workers Free plan](https://developers.cloudflare.com/workers/platform/limits/) allows
100,000 requests/day and **5 Cron Triggers per account** (not per Worker). This uses 4 triggers and
~13 invocations/day. The 10 ms free-plan CPU ceiling is not a constraint: Cloudflare does not count
time awaiting `fetch()` toward CPU time, and this Worker only builds a small JSON body and POSTs it.

## Schedule

| Cron (UTC)              | Dispatches | Local (AEST)                       |
| ----------------------- | ---------- | ---------------------------------- |
| `0 22 * * *`            | `daily`    | 8:00am                             |
| `30 22 * * 0`           | `weekly`   | Monday 8:30am                      |
| `15 3,7,11,14 * * 1-5`  | `intraday` | 1:15pm / 5:15pm / 9:15pm / 12:15am |
| `0 */3 * * *`           | `crypto`   | every 3 hours                      |

The four intraday runs were collapsed from four separate GitHub crons (3:15/7:00/10:45/14:30) into
one expression to stay inside the 5-trigger budget. Minute `:15` keeps them clear of the crypto
schedule's `:00` slots, as the original spacing did.

Each event type **is** the run mode: the workflows filter on it via `repository_dispatch.types` and
read `github.event.action` in their "Determine mode" step.

## Setup

### 1. Create the GitHub token

A [fine-grained PAT](https://github.com/settings/personal-access-tokens/new):

- **Repository access** → Only select repositories → `furic/richfolio`
- **Permissions** → Repository permissions → **Contents: Read and write** (this is what the
  `repository_dispatch` API requires)
- **Expiration** → up to 1 year

> ⚠️ Fine-grained PATs expire. When this one does, every scheduled run stops silently — the Worker
> will log `GitHub returned 401`, but nothing else will tell you. Same annual chore as
> `CLAUDE_CODE_OAUTH_TOKEN`; put a calendar reminder on it.

### 2. Deploy

```bash
cd scheduler
npm install
npx wrangler login
npx wrangler secret put GITHUB_TOKEN     # paste the PAT
npx wrangler deploy
```

This is a **cron-only Worker** — `workers_dev: false`, no HTTP entry point. An
internet-reachable URL that can fire a workflow which posts publicly is surface this has no use
for, and without that setting `wrangler deploy` refuses to publish until a workers.dev subdomain
is registered.

### 3. Verify

Locally, without deploying — `--test-scheduled` exposes a `/__scheduled` route that simulates a
cron firing. It uses your real token, so this does dispatch for real:

```bash
npm run dev
curl "http://localhost:8787/__scheduled?cron=0+22+*+*+*"
```

(Local dev reads secrets from `scheduler/.dev.vars`, not from the repo's `.env` — that file belongs
to richfolio's own Node process and the Worker runtime never sees it. `.dev.vars` is gitignored.)

A run should appear at
[Actions → Portfolio Monitor](https://github.com/furic/richfolio/actions/workflows/portfolio-monitor.yml)
within seconds, titled `Portfolio Monitor — daily`.

To check the token alone without triggering anything, POST a dispatch type no workflow claims — a
valid token returns 204 and nothing runs:

```bash
curl -i -X POST -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" -H "User-Agent: richfolio-scheduler" \
  https://api.github.com/repos/furic/richfolio/dispatches \
  -d '{"event_type":"permission-check"}'
```

To run a mode by hand, use **Actions → Run workflow** on GitHub — that is the manual path, and it
needs no extra credential.

### 4. Watch it

```bash
npx wrangler tail          # live invocation logs
```

Cron history is also under the Worker's **Settings → Trigger Events** in the Cloudflare dashboard.

## Changing the schedule

Cron expressions live in **two** places that must stay in sync:

- `wrangler.jsonc` → `triggers.crons`
- `src/index.js` → the `TRIGGERS` map (keys are matched verbatim against `event.cron`)

Adding a new event type also needs it added to the target workflow's `repository_dispatch.types`,
or the dispatch will succeed with a 204 and silently trigger nothing.

Cron Trigger changes take up to 15 minutes to propagate across Cloudflare's network after a deploy.

## Failure modes

| Symptom                                     | Cause                                                          |
| ------------------------------------------- | -------------------------------------------------------------- |
| `GitHub returned 401` / `403`               | PAT expired, revoked, or missing `Contents: read & write`        |
| `GitHub returned 404`                       | `GITHUB_REPO` wrong, or the PAT can't see the repo               |
| Dispatch returns 204 but no run appears     | Event type missing from the workflow's `repository_dispatch.types`, or the workflow change is not on `main` yet |
| Nothing at all in `wrangler tail`           | Cron Trigger not deployed — re-run `npx wrangler deploy`         |

If the Worker is down, nothing runs — there is no cron fallback by design. Recover by hand from the
Actions tab: **Run workflow** → pick the mode.
