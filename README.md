<p align="center">
  <img src="docs/icon.png" alt="Richfolio" width="120">
</p>

# Richfolio

[![CI](https://github.com/furic/richfolio/actions/workflows/ci.yml/badge.svg)](https://github.com/furic/richfolio/actions/workflows/ci.yml)
[![Portfolio Monitor](https://github.com/furic/richfolio/actions/workflows/portfolio-monitor.yml/badge.svg)](https://github.com/furic/richfolio/actions/workflows/portfolio-monitor.yml)
[![Docs](https://github.com/furic/richfolio/actions/workflows/docs.yml/badge.svg)](https://furic.github.io/richfolio/)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Gemini](https://img.shields.io/badge/Google_Gemini-2.5_Flash-4285F4?logo=google&logoColor=white)](https://ai.google.dev/)
[![Claude](https://img.shields.io/badge/Anthropic_Claude-Sonnet_4.6-D97757?logo=anthropic&logoColor=white)](https://www.anthropic.com/claude)
[![npm](https://img.shields.io/npm/v/richfolio?logo=npm&logoColor=white)](https://www.npmjs.com/package/richfolio)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Cost](https://img.shields.io/badge/Cost-%240%2Fmonth-2ecc71)](https://furic.github.io/richfolio/features)
[![Facebook](https://img.shields.io/badge/Facebook-richfolioapp-1877F2?logo=facebook&logoColor=white)](https://www.facebook.com/richfolioapp/)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-richfolio-0A66C2?logo=linkedin&logoColor=white)](https://www.linkedin.com/company/richfolio)

A zero-maintenance portfolio monitoring system. Set your target allocations once, get daily briefings with allocation gaps, AI-powered buy signals, and relevant news — delivered via email and Telegram, automatically via GitHub Actions.

> 📣 Follow Richfolio's public signals on [Facebook](https://www.facebook.com/richfolioapp/) and [LinkedIn](https://www.linkedin.com/company/richfolio) — generic STRONG BUY / BUY signals, no holdings disclosed. *Not financial advice.*

<p align="center">
  <img src="docs/screenshots/morning-debrief.png" alt="Daily Brief" width="260">
  &nbsp;&nbsp;
  <img src="docs/screenshots/intraday-alert.png" alt="Intraday Alert" width="260">
  &nbsp;&nbsp;
  <img src="docs/screenshots/weekly-rebalance.png" alt="Weekly Rebalance" width="260">
</p>
<p align="center">
  <img src="docs/screenshots/strong-buy-analysis.png" alt="STRONG BUY Analysis Page" width="500">
</p>

## Who Should Use This

Richfolio **does not pick stocks for you**. You should already have your own research and investment thesis — your own portfolio of stocks, ETFs, or crypto that you believe in.

What Richfolio does is **monitor your portfolio daily** and help you decide **when** to buy. It tracks prices, technicals, news sentiment, and allocation gaps, then uses AI to surface the best timing opportunities across your holdings.

- **You bring the portfolio** — set your target allocations once in a simple JSON config
- **Richfolio brings the signals** — buy recommendations, limit order prices, and detailed analysis
- **You make the final call** — every purchase decision is yours; the tool only suggests

**No coding skill required.** Fork the repo, spend ~10 minutes registering free API accounts (Resend, NewsAPI, and either Gemini or Anthropic Claude — or both, for multi-AI mode), paste your keys into GitHub Settings, and you're done. Everything runs automatically via GitHub Actions at $0/month with Gemini.

## Features

- **Multi-AI Mode (Gemini + Claude + Mistral)** — set two or more of `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` and `MISTRAL_API_KEY` to run those providers concurrently on every analysis. Scores aggregate per ticker with a per-AI breakdown shown beneath each recommendation; STRONG BUY requires unanimous agreement (any dissent caps at BUY). If a provider fails mid-run the brief is marked degraded and STRONG BUY is capped, so a lone survivor never reads as cross-checked. Set only one key for identical single-AI behaviour. Pluggable architecture — adding another provider is ~50 lines via the `AIProvider` interface
- **Two-Stage AI Analysis** — Think/Plan framework: Stage 1 extracts structured observations (signals, risks, summaries), Stage 2 applies decision rules to produce ranked recommendations with confidence scores. Runs on Gemini 2.5 Flash, Claude Sonnet 4.6 or Mistral Large — or several in parallel. Inspired by [OpenAlice](https://github.com/TraderAlice/OpenAlice)'s cognitive architecture. STRONG BUY tickers get a **"More Details"** link to a dedicated analysis page with interactive chart, buy thesis, risk analysis, and full metrics
- **Earnings Calendar Guard** — automatically detects upcoming earnings dates and caps recommendations (≤3 days → HOLD, ≤7 days → no STRONG BUY) to avoid asymmetric risk
- **Post-AI Guard Pipeline** — 6 programmatic safety checks validate every AI recommendation before delivery: bond ETF caps, earnings proximity, STRONG BUY criteria enforcement, max 2 STRONG BUY limit, confidence sanity, and buy value sanity
- **Value Investing Framework** — AI rates individual stocks A–D based on ROE, debt/equity, FCF, earnings growth, and analyst targets (data from Yahoo Finance, zero extra API calls)
- **Bottom-Fishing Model** — AI detects oversold/accumulation zones for all tickers using RSI, volume contraction, 200MA position, and death cross signals
- **Technical Momentum Signals** — SMA50, SMA200, RSI(14), MACD (crossover + histogram), Bollinger Bands (%B + squeeze detection), ATR (volatility), Stochastic (%K/%D oversold/overbought), OBV (accumulation/distribution trend), golden/death cross, and momentum classification for each ticker
- **News Sentiment Scoring** — Gemini scores each headline's sentiment (bullish/bearish/neutral) and impact (high/medium/low), providing per-ticker overall sentiment to the AI analysis
- **Reasoning Persistence** — 7-day rolling history of AI conviction per ticker, showing the AI how its own recommendations evolved over time to identify trend momentum
- **Limit Order Prices** — AI-suggested limit order prices based on nearby support levels (moving averages, recent lows, round numbers)
- **Allocation Gap Analysis** — current vs target %, flagged by priority with suggested buy amounts
- **Watch List** — optional `watching` array tracks tickers as research signals without committing them to a target allocation; rendered in a separate section, bypasses allocation-based rules, doesn't compete with portfolio STRONG BUYs
- **Dynamic P/E Signals** — trailing P/E compared against historical averages fetched from Yahoo Finance (no manual benchmarks needed)
- **ETF Overlap Detection** — reduces buy priority for ETFs where you already hold overlapping stocks (e.g., holding AAPL reduces VOO's priority)
- **52-Week Range Signals** — highlights tickers near their 52-week low (opportunity) or high (caution)
- **News Digest** — top headlines per ticker from NewsAPI
- **Portfolio Health** — weighted beta, estimated annual dividend income
- **Intraday Alerts** — periodic checks that alert only when buy signals strengthen vs the morning brief (configurable thresholds)
- **Weekly Rebalancing Report** — focused drift analysis with BUY/TRIM/OK actions
- **Dual Delivery** — dark-themed HTML email via Resend + condensed Telegram message

## Quick Start

1. **Fork** this repo on GitHub
2. **Add config** — go to Settings → Secrets and variables → Actions:
   - **Variables** tab: `CONFIG_JSON` (portfolio config) + `RECIPIENT_EMAIL` (your email)
   - **Secrets** tab: `RESEND_API_KEY` — for email delivery
   - Optionally: `NEWS_API_KEY`, `GEMINI_API_KEY` and/or `ANTHROPIC_API_KEY` (set both for multi-AI mode — scores averaged with per-AI breakdown), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
3. **Run** — trigger manually from Actions → Portfolio Monitor → Run workflow, or wait for the daily cron (8am AEST)

That's it — no local setup required. See the [full setup guide](https://furic.github.io/richfolio/getting-started) for detailed instructions on each API key.

<details>
<summary>Local development</summary>

```bash
git clone https://github.com/furic/richfolio.git
cd richfolio
npm install
cp config.example.json config.json
cp .env.example .env
```

Edit `config.json` and `.env`, then:

```bash
npm run dev       # Daily brief (email + Telegram)
npm run intraday  # Intraday alert check (compares vs morning)
npm run weekly    # Weekly rebalancing report
npm run refresh -- SMH  # Re-analyze single ticker with after-hours price
npm test          # Unit tests (pure functions, no network)
npm run smoke     # Live API smoke tests (requires network + config.json)
```

</details>

## Stack

| Component | Service | Cost |
|-----------|---------|------|
| Runtime | Node.js + TypeScript (tsx) | Free |
| Prices & Fundamentals | Yahoo Finance (yahoo-finance2) | Free |
| News | NewsAPI.org | Free (100 req/day) |
| AI Analysis (default) | Google Gemini 2.5 Flash | Free (250 req/day) |
| AI Analysis (optional) | Anthropic Claude Sonnet 4.6 | Pay-as-you-go (≈ cents/day; cheaper with `CLAUDE_MODEL=claude-haiku-4-5-20251001`) |
| Email | Resend.com | Free (3,000/month) |
| Telegram | Telegram Bot API | Free |
| Scheduler | GitHub Actions | Free (cron) |

## Project Structure

```
richfolio/
├── src/
│   ├── config.ts          # Typed loader for CONFIG_JSON variable + secrets
│   ├── index.ts           # Entry point (daily/intraday/weekly mode)
│   ├── fetchPrices.ts     # Yahoo Finance: price, P/E, 52w, beta, dividends, ETF holdings, fundamentals, earnings calendar
│   ├── fetchTechnicals.ts # Yahoo Finance chart: SMA50, SMA200, RSI, MACD, Bollinger Bands, ATR, Stochastic, OBV, momentum
│   ├── fetchNews.ts       # NewsAPI: headlines per ticker + Gemini sentiment scoring
│   ├── analyze.ts         # Allocation gaps, P/E signals, overlap discounts
│   ├── providers/
│   │   ├── types.ts       # AIProvider interface + canonical AIBuyRecommendation
│   │   ├── prompts.ts     # SDK-agnostic prompt builders (Two-stage Think/Plan)
│   │   ├── gemini.ts      # Google Gemini provider (@google/genai)
│   │   ├── claude.ts      # Anthropic Claude provider (@anthropic-ai/sdk, tool-use)
│   │   └── index.ts       # Provider registry — buildActiveProviders()
│   ├── aiOrchestrator.ts  # Runs active providers concurrently, applies guards, sorts
│   ├── aiAggregation.ts   # Multi-AI consensus action, average confidence, unanimity rule
│   ├── aiAnalysis.ts      # Backward-compat shim over the orchestrator
│   ├── guards.ts          # Post-AI validation pipeline: 6 sequential safety checks
│   ├── detailedAnalysis.ts# Detailed buy thesis + risks for STRONG BUY (Gemini or Claude — configurable)
│   ├── analysisUrl.ts     # Compress analysis data into URL hash for GitHub Pages
│   ├── email.ts           # Daily HTML email template + Resend (multi-AI per-provider breakdown)
│   ├── intradayEmail.ts   # Intraday alert email template
│   ├── intradayCompare.ts # Compare current vs morning baseline
│   ├── state.ts           # Morning baseline persistence + per-provider reasoning history
│   ├── weeklyEmail.ts     # Weekly rebalancing email template
│   └── telegram.ts        # Telegram bot delivery (multi-AI per-provider breakdown)
├── docs/
│   ├── analysis/          # Static analysis page (decodes URL hash, renders with TradingView)
│   └── *.md               # GitHub Pages documentation site (en, zh-CN, zh-TW, ja, ko, es)
├── .github/workflows/
│   └── portfolio-monitor.yml  # Daily + intraday + weekly cron jobs
├── config.example.json    # Template portfolio config
├── .env.example           # Template environment variables
├── package.json
└── tsconfig.json
```

## How It Works

```
CONFIG_JSON variable + GitHub Secrets
  → fetchPrices (Yahoo Finance: prices, P/E, 52w range, beta, dividends, ETF holdings, fundamentals, earnings calendar)
  → fetchTechnicals (Yahoo Finance chart: SMA50, SMA200, RSI, MACD, Bollinger Bands, ATR, Stochastic, OBV, momentum)
  → fetchNews (NewsAPI: top headlines per ticker + Gemini sentiment scoring)
  → analyze (allocation gaps, P/E signals, overlap discounts, portfolio metrics)
  → aiOrchestrator (runs active providers concurrently — Gemini and/or Claude)
       ├─ Gemini provider — Stage 1 Observe → Stage 2 Decide → guards
       └─ Claude provider — Stage 1 Observe → Stage 2 Decide → guards
  → aiAggregation (consensus action, average confidence, unanimity check — multi-AI mode only)
  → email + telegram (deliver daily brief with value ratings, bottom signals, technicals, earnings badges, per-AI breakdown when multi-AI)
```

Weekly mode (`--weekly`) skips news and AI, producing a focused rebalancing report.

Intraday mode (`--intraday`) re-fetches prices, technicals, and AI (skipping news), compares against the morning baseline, and alerts only for STRONG BUY-related changes: upgrades to STRONG BUY, downgrades from STRONG BUY, or confidence shifts ≥10 while at STRONG BUY.

Refresh mode (`--refresh TICKER`) re-analyzes a single ticker using the latest available price (including after-hours/pre-market from Yahoo Finance). Outputs updated analysis to terminal and sends email + Telegram with a new analysis URL. Useful when you see an alert after market close and want an updated limit order based on after-hours price movement.

## Updating Your Portfolio

Update the `CONFIG_JSON` variable in GitHub Settings (Settings → Secrets and variables → Actions → Variables tab). The next run will reflect the changes.

## References

See [docs/references.md](docs/references.md) for repos and resources referenced during design and build.

## License

ISC
