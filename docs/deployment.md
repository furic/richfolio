---
title: Deployment
layout: default
nav_order: 6
---

# Deployment

Richfolio runs as a GitHub Actions cron job — no server needed. Fork the repo, add secrets, and it runs automatically every morning.

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
| `ANTHROPIC_API_KEY` | **Secrets** | Optional — AI provider (Anthropic Claude). Set with another provider for multi-AI mode |
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

The workflow runs automatically:

- **Daily** — every day at 10pm UTC (8am AEST)
- **Intraday** — weekdays at 10am, 12pm, 2pm, 4pm AEST (alerts only when signals strengthen)
- **Weekly** — every Sunday at 10pm UTC (Monday 8am AEST)

You can also trigger manually: repo → **Actions** → **Portfolio Monitor** → **Run workflow** → choose daily, intraday, or weekly mode.

<details>
<summary><strong>Changing the schedule or timezone</strong></summary>

<br>

The default schedule is set for AEST (UTC+10). To change it, edit `.github/workflows/portfolio-monitor.yml` in your fork.

The file contains three cron entries — one for each mode:

```yaml
schedule:
  - cron: "0 22 * * *"    # Daily at 10pm UTC (8am AEST)
  - cron: "0 0,2,4,6 * * 1-5"  # Intraday checks (weekdays)
  - cron: "0 22 * * 0"    # Weekly on Sunday 10pm UTC
```

GitHub Actions cron is **always in UTC**. To get your desired local time, convert to UTC first:

| Your Local Time | UTC Cron |
|-----------------|----------|
| 8am AEST (UTC+10) | `0 22 * * *` (previous day) |
| 8am EST (UTC-5) | `0 13 * * *` |
| 8am PST (UTC-8) | `0 16 * * *` |
| 8am GMT (UTC+0) | `0 8 * * *` |
| 8am IST (UTC+5:30) | `0 2 * * *` (closest match) |
| 9am JST (UTC+9) | `0 0 * * *` |
| 8am CET (UTC+1) | `0 7 * * *` |

**Tip:** Search "UTC time converter" to find the right cron value for your timezone. Only change the hour (`22` in `0 22 * * *`) — the rest controls minute, day, month, and weekday.

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

