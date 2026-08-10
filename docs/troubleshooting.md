---
title: Troubleshooting
layout: default
nav_order: 8
---

# Troubleshooting

Common issues and how to fix them.

---

## "Can only send testing emails to your own email address"

**Cause:** Resend free tier restriction.

**Fix:** Set `RECIPIENT_EMAIL` to the same email you used to sign up for Resend, or verify a custom domain on Resend (Dashboard → Domains → Add Domain → add DNS records).

---

## "GEMINI_API_KEY quota: limit 0"

**Cause:** New Gemini API keys take a few minutes to activate. Some keys may not work at all until billing and the API are enabled.

**Fix:** Try these steps in order:

1. **Wait 5–10 minutes** — new keys sometimes just need time to activate
2. **Enable the Generative Language API** — go to [Google Cloud Console](https://console.cloud.google.com/apis/library) → search "Generative Language API" → click **Enable** for the project linked to your API key
3. **Add billing details** — go to [Google AI Studio](https://aistudio.google.com) → Settings → Billing and add your billing info. You can still select the **free tier** — adding billing just activates your key, you won't be charged unless you exceed the free limits

In the meantime, Richfolio automatically falls back to gap-based recommendations — the brief will still be delivered, just without AI analysis. If you've set Claude (`CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`) or `MISTRAL_API_KEY` as well, that provider continues alone while Gemini recovers — the run is marked degraded (`⚠ 1/2 AI` badge) so a lone provider's vote never reads as cross-checked.

---

## Claude silently missing from the brief

**Cause:** An expired or missing `CLAUDE_CODE_OAUTH_TOKEN` produces the exact same symptom as a missing `ANTHROPIC_API_KEY` — Claude just isn't there. In a solo-Claude setup the brief quietly falls back to gap-based recommendations; in multi-AI mode the remaining provider(s) continue and the run is marked degraded (`⚠ 1/2 AI` badge). Nothing errors loudly — check the GitHub Actions run log for an auth failure from the Claude provider.

**Fix:** The subscription token lasts about a year with no auto-refresh. Re-mint it locally with `claude setup-token` and update the `CLAUDE_CODE_OAUTH_TOKEN` secret. If you'd rather use pay-per-use billing instead, set `ANTHROPIC_API_KEY` and leave `CLAUDE_CODE_OAUTH_TOKEN` unset.

---

## "fetch failed — internal-error" for a ticker

**Cause:** Yahoo Finance occasionally has issues with specific tickers (especially less common ones like BIPC).

**Fix:** No action needed. The ticker is skipped and everything else continues normally. This is an intermittent Yahoo Finance issue.

---

## GitHub Actions shows empty secrets

**Cause:** Secrets were added at the wrong level.

**Fix:** Make sure you added secrets at the **repository** level: Settings → Secrets and variables → Actions → Repository secrets. Not at the environment level.

---

## No news returned

**Cause:** NewsAPI free tier only returns articles from the last 24 hours. Some tickers (especially ETFs and small-caps) rarely appear in news headlines.

**Fix:** This is normal behavior. The brief runs fine without news for those tickers. AI analysis will note "no recent news" in its recommendations.

---

## Telegram message not received

**Cause:** You haven't started a conversation with your bot yet.

**Fix:** Open Telegram, find your bot by username, and send it any message (e.g., "hi"). The Telegram Bot API requires the user to initiate contact before the bot can send messages. After that, re-run Richfolio.

---

## "Missing config.json" error

**Cause:** `config.json` doesn't exist in the project root.

**Fix:**
- **GitHub Actions:** Make sure the `CONFIG_JSON` variable exists with valid JSON content (Settings → Secrets and variables → Actions → **Variables** tab).
- **Locally:** Run `cp config.example.json config.json` and edit it with your portfolio data.

---

## Brief runs but email is empty or missing sections

**Cause:** One or more API keys are missing or invalid.

**Fix:** Check your `.env` file (local) or GitHub Secrets (Actions). The brief adapts to what's available:
- Without `NEWS_API_KEY` → no news section
- Without `GEMINI_API_KEY`, Claude (`CLAUDE_CODE_OAUTH_TOKEN`/`ANTHROPIC_API_KEY`) AND `MISTRAL_API_KEY` → gap-based recommendations instead of AI
- With just one of the AI keys → single-AI mode (today's behaviour)
- With two or more AI keys → multi-AI mode: scores averaged, per-AI breakdown shown beneath each rec, STRONG BUY capped by dissent distance (survives a dissenting BUY, caps at BUY on a HOLD/WAIT)
- Without `TELEGRAM_BOT_TOKEN` → email only (no Telegram)

All combinations are valid — only `RESEND_API_KEY` and `RECIPIENT_EMAIL` are required.
