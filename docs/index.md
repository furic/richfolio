---
title: Home
layout: home
nav_order: 1
---

# Richfolio

A zero-maintenance portfolio monitoring system. Set your target allocations once, get daily briefings with allocation gaps, AI-powered buy signals, and relevant news — delivered via email and Telegram, automatically via GitHub Actions.

**Everything runs on free tiers. No server, no dashboard, no ongoing costs.**

---

## What You Get

Every morning, Richfolio fetches live market data, runs allocation analysis, generates AI buy recommendations, and delivers a polished report to your inbox and Telegram.

![Daily Brief](screenshots/morning-debrief.png){: style="max-width: 400px; display: block; margin: 16px auto;" }

| Component | Service | Cost |
|-----------|---------|------|
| Prices & Fundamentals | Yahoo Finance | Free |
| News | NewsAPI.org | Free (100 req/day) |
| AI Analysis | Google Gemini 2.5 Flash | Free (~20 req/day) |
| Email | Resend.com | Free (3,000/month) |
| Telegram | Telegram Bot API | Free |
| Scheduler | GitHub Actions | Free (cron) |

---

## Who Should Use This

Richfolio **does not pick stocks for you**. You should already have your own portfolio of stocks, ETFs, or crypto that you believe in.

What Richfolio does is **monitor your portfolio daily** and help you decide **when** to buy — tracking prices, technicals, news sentiment, and allocation gaps, then using AI to surface the best timing opportunities.

- **You bring the portfolio** — set your target allocations once in a simple JSON config
- **Richfolio brings the signals** — buy recommendations, limit order prices, and detailed analysis
- **You make the final call** — every purchase decision is yours; the tool only suggests

**No coding required.** Fork the repo, spend ~10 minutes registering free API accounts, paste your keys into GitHub Settings, and you're done. Everything runs automatically via GitHub Actions at $0/month.

---

## Documentation

| Page | Description |
|------|-------------|
| [Features](features) | What Richfolio does — all 10 capabilities explained |
| [Getting Started](getting-started) | Fork, configure, and deploy in 4 steps |
| [Configuration](configuration) | `CONFIG_JSON` field reference, ticker formats, tips |
| [API Keys](api-keys) | Step-by-step setup for Resend, NewsAPI, Gemini, Telegram |
| [Deployment](deployment) | GitHub Actions, secrets, schedule customization |
| [How It Works](how-it-works) | Architecture, data pipeline, analysis logic |
| [Local Development](local-development) | For advanced users — run locally for customization or manual triggers |
| [Troubleshooting](troubleshooting) | Common errors and fixes |
| [References](references) | Prior art and design influences |
