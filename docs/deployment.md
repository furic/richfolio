---
title: Deployment
layout: default
nav_order: 6
---

# Deployment

Richfolio runs on GitHub Actions, scheduled by a tiny Cloudflare Worker — no server needed. Fork the repo, add secrets, set up the scheduler, and it runs automatically every morning.

---

## Fork the Repo

If you haven't already, [fork richfolio](https://github.com/furic/richfolio/fork) to your own GitHub account. GitHub Actions workflows only run on your own repositories — forking gives you automated scheduling for daily briefs, intraday alerts, and weekly reports.

---

## Enable Workflows

GitHub disables Actions on newly forked repos by default. Go to your fork → **Actions** tab → click **"I understand my workflows, go ahead and enable them"**.

---

## Add Secrets & Variables

In your forked repo: **Settings** → **Secrets and variables** → **Actions**. This is the deployment-side checklist of what goes where — for how to obtain each API key, see [API Keys](api-keys).

| Item | Tab | Notes |
|---|---|---|
| `RESEND_API_KEY` | **Secrets** | Required |
| `NEWS_API_KEY` | **Secrets** | Optional |
| `GEMINI_API_KEY` | **Secrets** | Optional — AI provider (Google Gemini) |
| `GEMINI_API_KEY_CRYPTO` | **Secrets** | Optional — second Gemini key for the crypto workflow, so its 8×/day cadence gets its own daily quota |
| `CLAUDE_CODE_OAUTH_TOKEN` | **Secrets** | Optional — AI provider (Anthropic Claude via Pro/Max subscription, no per-token cost). Takes precedence over `ANTHROPIC_API_KEY` if both are set — use only one |
| `ANTHROPIC_API_KEY` | **Secrets** | Optional — AI provider (Anthropic Claude, pay-per-use). Set with another provider for multi-AI mode |
| `MISTRAL_API_KEY` | **Secrets** | Optional — AI provider (Mistral, free Experiment tier). Set with another provider for multi-AI mode |
| `TELEGRAM_BOT_TOKEN` | **Secrets** | Optional |
| `TELEGRAM_CHAT_ID` | **Secrets** | Optional |
| `RECIPIENT_EMAIL` | **Variables** | Required — visible for easy editing |
| `CONFIG_JSON` | **Variables** | Required — your portfolio JSON ([format](configuration)) |
| `CLAUDE_MODEL` | **Variables** | Optional — override Claude model (default: `claude-sonnet-4-6`) |
| `MISTRAL_MODEL` | **Variables** | Optional — override Mistral model (default: `mistral-large-latest`) |
| `AI_DETAILED_PROVIDER` | **Variables** | Optional — force `gemini`, `claude` or `mistral` for STRONG BUY analysis page |
| `TIME_ZONE` | **Variables** | Optional — IANA timezone for date/time formatting in emails (e.g. `Australia/Sydney`, `America/New_York`, `Europe/London`). Default: `UTC`. Workflow maps it to Node's native `TZ` env var |

{: .important}
> **Why `CONFIG_JSON` is a variable, not a secret:** Variables stay readable in the GitHub UI, so you can edit your holdings directly without re-pasting the whole JSON every time. The trade-off is that anyone with read access to the repo can see your allocations — fine for a private fork, something to consider if you ever go public.

---

## Schedule

The workflows run automatically once the scheduler is set up:

- **Daily** — 22:00 UTC (8am AEST)
- **Intraday** — weekdays at 03:15 / 07:15 / 11:15 / 14:15 UTC (1:15pm / 5:15pm / 9:15pm / 12:15am AEST) — alerts only when signals strengthen
- **Weekly** — Sunday 22:30 UTC (Monday 8:30am AEST)

If you use `watchingCrypto`, a second workflow runs alongside:

- **Crypto** — every 3 hours (8×/day), alerting only when a cross-pair signal changes materially against that day's anchor

It's kept separate from Portfolio Monitor on purpose: they'd otherwise share the `state/` cache, and crypto runs would overwrite the equity morning baseline.

You can trigger any mode manually at any time: repo → **Actions** → **Portfolio Monitor** (or **Crypto Monitor**) → **Run workflow** → choose a mode. Crypto Monitor also offers a `smoke` mode that contract-checks the crypto.com API without sending anything.

### Setting up the scheduler

**Neither workflow has a `schedule:` trigger.** They're fired by `repository_dispatch` from a Cloudflare Worker in [`scheduler/`](https://github.com/furic/richfolio/tree/main/scheduler), because GitHub's own scheduler is no longer punctual enough to be useful.

GitHub's docs state scheduled workflows "may be delayed during periods of high load" and, at sufficient load, are dropped — documented behaviour, so it never appears on githubstatus.com. GitHub staff acknowledged the worsening drift in [community discussion #196910](https://github.com/orgs/community/discussions/196910) with no committed fix. Measured on this repo in August 2026, the 22:00 UTC daily brief drifted from **+30min** to **+5h–8h**, and was dropped entirely on one day. The job itself took ~25 minutes throughout — the delay was purely GitHub's dispatch queue.

Setup is free and takes about five minutes — see [`scheduler/README.md`](https://github.com/furic/richfolio/blob/main/scheduler/README.md). You need a Cloudflare account (free plan is enough: 100,000 requests/day, 5 Cron Triggers) and a fine-grained GitHub PAT with **Contents: read & write**.

<details>
<summary><strong>Alternative: go back to GitHub cron (zero setup, unreliable timing)</strong></summary>

<br>

If you'd rather not set up Cloudflare and can tolerate a brief that may arrive hours late — or not at all on a given day — add a `schedule:` block back to `.github/workflows/portfolio-monitor.yml` in your fork:

```yaml
on:
  schedule:
    - cron: "0 22 * * *"           # Daily — 8am AEST
    - cron: "15 3,7,11,14 * * 1-5" # Intraday — weekdays
  repository_dispatch:
    types: [daily, intraday, weekly]
  workflow_dispatch:
    # ... leave the existing inputs untouched
```

Then update the "Determine mode" step to map schedules to modes again, since it currently reads only `github.event.action`:

```yaml
case "$EVENT_NAME" in
  repository_dispatch) MODE="$DISPATCH_TYPE" ;;
  workflow_dispatch)   MODE="$INPUT_MODE" ;;
  schedule)            [ "$CRON" = "0 22 * * *" ] && MODE="daily" || MODE="intraday" ;;
esac
```

with `CRON: ${{ github.event.schedule }}` added to that step's `env:`.

Note that in **GitHub** cron, `1-5` means Mon–Fri. Cloudflare uses the opposite convention (`1` = Sunday), which is why the Worker's config spells the days out. Don't copy day-of-week numbers between the two.

> ⚠️ **Never run both at once.** GitHub does eventually deliver the late cron, so you would get a second, duplicate brief hours after the Worker's — and if you've configured social posting, duplicate public posts too. Pick one.

There's no scheduled weekly in this setup: the old approach asked the runner for the weekday (`date -u +%u`) and sent only on Sunday, which drift silently broke — a Sunday 22:00 cron delivered Monday 03:00 UTC computes day=1 and skips it with nothing in the logs. Run it by hand from **Actions → Run workflow → weekly**, or use the Worker.

</details>

<details>
<summary><strong>Changing the schedule or timezone</strong></summary>

<br>

The default schedule targets AEST (UTC+10). To change it, edit `triggers.crons` in `scheduler/wrangler.jsonc` **and** the matching key in the `TRIGGERS` map in `scheduler/src/index.js` — a test fails the build if the two drift apart — then redeploy with `npx wrangler deploy`.

Cron Triggers are **always in UTC**. To get your desired local time, convert first:

| Your Local Time | UTC Cron |
|-----------------|----------|
| 8am AEST (UTC+10) | `0 22 * * *` (previous day) |
| 8am EST (UTC-5) | `0 13 * * *` |
| 8am PST (UTC-8) | `0 16 * * *` |
| 8am GMT (UTC+0) | `0 8 * * *` |
| 8am IST (UTC+5:30) | `0 2 * * *` (closest match) |
| 9am JST (UTC+9) | `0 0 * * *` |
| 8am CET (UTC+1) | `0 7 * * *` |

Only change the hour (`22` in `0 22 * * *`) — the rest controls minute, day, month, and weekday.

**Day-of-week is spelled, never numbered.** Cloudflare follows Quartz, where `1` = **Sunday** and `7` = Saturday — the opposite of Unix cron's `1` = Monday. A numeric `1-5` therefore means Sun–Thu, and Cloudflare accepts it silently: it deploys clean, runs on Sunday, and skips Friday. Use `MON-FRI` and `SUN`.

Set the `TIME_ZONE` Actions Variable (e.g. `Australia/Sydney`) to control how dates render in the emails themselves — that's independent of when the runs fire.

</details>

---

## Updating Your Portfolio

When your holdings change, update the `CONFIG_JSON` variable on GitHub (Settings → Secrets and variables → Actions → Variables tab). The next scheduled run will use the updated data.

---

## Pulling Upstream Updates

To get new features from the original repo:

```bash
git remote add upstream https://github.com/furic/richfolio.git
git fetch upstream
git merge upstream/main
git push origin main
```

Or use GitHub's **Sync fork** button on your fork's main page.

