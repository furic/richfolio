# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Richfolio is a zero-maintenance portfolio monitoring system that sends daily email + Telegram digests with allocation gaps, AI-powered buy signals, ETF overlap detection, and relevant news. It runs as a GitHub Actions cron job — no server, no dashboard.

## Tech Stack

- **Runtime**: Node.js + TypeScript (strict mode, ESNext, ESM)
- **Execution**: `tsx` (TypeScript execute, no build step)
- **Data**: `yahoo-finance2` v3 (instance-based API) for prices, fundamentals, earnings history, earnings calendar, ETF holdings, chart data (technicals)
- **News**: NewsAPI.org free tier (100 req/day)
- **AI**: Google Gemini 2.5 Flash via `@google/genai` (250 req/day free)
- **Email**: Resend.com free tier (3,000 emails/month)
- **Telegram**: Native `fetch` to Telegram Bot API (no npm package)
- **Scheduler**: GitHub Actions cron (`0 22 * * *` = 8am AEST)

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Run daily brief locally
npm run intraday     # Run intraday alert check (compares vs morning)
npm run weekly       # Run weekly rebalancing report
npm run refresh -- SMH  # Re-analyze single ticker with after-hours price
npm run start        # Production daily entry point
npm run typecheck    # Type-check without emitting
npm test             # Unit tests (pure functions, no network, CI-safe)
npm run smoke        # Live API smoke tests (hits Yahoo Finance — run manually)
```

## Architecture

Single-pipeline flow, no API server. Four modes: daily (default), intraday (`--intraday`), weekly (`--weekly`), and refresh (`--refresh TICKER`).

```
src/index.ts (entry point — parses --weekly/--intraday/--refresh flags, wires modules)
  → src/config.ts          # Loads config.json + .env, exports typed portfolio data + intradayConfig
  → src/fetchPrices.ts     # Yahoo Finance: price, P/E, avgPE, 52w, beta, dividends, ETF top holdings, fundamentals, earnings calendar, after-hours prices, macro indicators (VIX, 10Y yield, S&P 500, oil, DXY)
  → src/fetchTechnicals.ts # Yahoo Finance chart: SMA50, SMA200, RSI(14), MACD, Bollinger Bands, ATR, Stochastic, OBV, momentum, support levels, volume change
  → src/fetchNews.ts       # NewsAPI: top 3 headlines per ticker (daily only) + Gemini relevance + sentiment filter
  → src/allocation.ts      # Pure allocation maths (config injected): items / untrackedItems / watchingItems split, gaps, ETF overlap, beta, dividends
  → src/analyze.ts         # Thin wrapper: injects config.json values into buildAllocationReport()
  → src/aiAnalysis.ts      # Gemini AI: two-stage Think/Plan analysis + buy recs + confidence + limit prices + value ratings + bottom signals
  → src/guards.ts          # Post-AI validation pipeline: bond ETF cap, earnings guard, STRONG BUY criteria, confidence/value sanity
  → src/state.ts           # Save/load morning baseline for intraday comparison + 7-day reasoning history
  → src/intradayCompare.ts # Compare current AI recs vs morning baseline, alert on STRONG BUY changes
  → src/email.ts           # Daily dark-themed HTML email + Resend
  → src/intradayEmail.ts   # Intraday + refresh alert emails + Resend
  → src/weeklyEmail.ts     # Weekly rebalancing HTML email + Resend
  → src/telegram.ts        # Telegram delivery (daily + intraday + weekly + refresh message builders)
  → src/fetchFx.ts         # Fetches FX rates from Yahoo Finance (GBPUSD=X convention), one batch per run
  → src/util.ts            # Pure helpers: formatMoney, applyFxRate, SUB_UNIT_FIX, escapeHtmlAttr/Text
```

## Config Architecture

Private portfolio data is separated from code:

- `config.json` — **gitignored**, your personal portfolio (allocations, holdings)
- `config.example.json` — **committed**, template for new users
- `.env` — **gitignored**, API keys + recipient email
- `src/config.ts` — typed loader that reads both and exports everything

In GitHub Actions, `config.json` is written from the `CONFIG_JSON` Actions variable at runtime.

## GitHub Actions Secrets

- `RESEND_API_KEY` — from resend.com
- `NEWS_API_KEY` — from newsapi.org (optional)
- `GEMINI_API_KEY` — from aistudio.google.com (optional AI provider — Google Gemini)
- `CLAUDE_CODE_OAUTH_TOKEN` — from `claude setup-token` run locally (optional AI provider — Anthropic Claude via a Pro/Max **subscription**, no per-token cost; valid ~1 year, no auto-refresh). Takes precedence over `ANTHROPIC_API_KEY` when both are set
- `ANTHROPIC_API_KEY` — from console.anthropic.com (alternative Claude transport — pay-per-use, no free tier). Leave unset when using the subscription token: it outranks OAuth inside Claude Code and would silently bill API credits
- `MISTRAL_API_KEY` — from console.mistral.ai (optional AI provider — Mistral; free Experiment tier, ~1B tokens/month)
- `TELEGRAM_BOT_TOKEN` — from @BotFather (optional)
- `TELEGRAM_CHAT_ID` — from @userinfobot (optional)
- `X_API_KEY` / `X_API_SECRET` / `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET` — X/Twitter OAuth 1.0a (optional; X has no free tier since Feb 2026 — pay-per-use)
- `FACEBOOK_PAGE_ID` / `FACEBOOK_PAGE_TOKEN` — Facebook Page posting (optional; needs `pages_manage_posts` via Meta app review)
- `THREADS_USER_ID` / `THREADS_ACCESS_TOKEN` — Threads posting (optional; needs `threads_content_publish`; token expires ~60 days)
- `THREADS_TOKEN_PAT` — optional PAT (fine-grained, repo **Secrets: Read and write**) used only by `.github/workflows/refresh-threads-token.yml` to auto-refresh `THREADS_ACCESS_TOKEN` monthly. Without it, refresh the Threads token manually before the ~60-day expiry
- `LINKEDIN_ACCESS_TOKEN` / `LINKEDIN_ORG_URN` — LinkedIn Page posting (optional; needs `w_organization_social` + "Share on LinkedIn" approval)

When 2+ of `GEMINI_API_KEY` / Claude (`CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`) / `MISTRAL_API_KEY` are set, multi-AI mode auto-engages: providers run concurrently, scores average per ticker, per-AI breakdown shown in email/Telegram, STRONG BUY requires unanimous agreement. See `src/aiOrchestrator.ts` and `src/aiAggregation.ts`.

**Degraded multi-AI runs**: if 2+ providers are configured but one fails mid-run (quota, network), the survivor's recs hit `computeConsensusAction`'s `scores.length === 1` short-circuit and skip the unanimity rule entirely — unanimity among one model is trivially satisfied. Previously this rendered identically to a verified consensus (bare confidence, no agreement badge), so a lone provider's STRONG BUY reached the brief looking cross-checked. `applyDegradedProviderPolicy` (in `aiAggregation.ts`) now marks every rec with `degradation: { configured, answered, missing }` and caps STRONG BUY at BUY, annotating the reason. Renderers show a `⚠ 1/2 AI` badge (email) / tag (Telegram). Set `ai.strongBuyRequiresAllProviders: false` in `config.json` to keep the survivor's action — the badge still shows either way. **Does not fire when only one provider is configured**: that setup never promised unanimity, so it isn't degraded.

## GitHub Actions Variables

- `CONFIG_JSON` — full contents of config.json (uses Actions Variables instead of Secrets for easy viewing/editing)
- `RECIPIENT_EMAIL` — email address for briefs (variable, not secret — easy to view/edit)
- `CLAUDE_MODEL` / `MISTRAL_MODEL` — optional model overrides per provider (Mistral default: `mistral-large-latest`; `mistral-medium-latest` for more free-tier headroom)
- `AI_DETAILED_PROVIDER` — optional, force `gemini`, `claude` or `mistral` for the STRONG BUY detailed analysis page (default: first available in that order). An override naming an **unconfigured** provider (or an unknown name) is logged and ignored rather than applied — pinning a provider with no API key would fail every ticker. Resolution lives in the pure, unit-tested `resolveDetailedProvider()` (`src/providers/detailedProvider.ts`); `detailedAnalysis.ts` just supplies the available ids and the env var
- `TIME_ZONE` — optional IANA timezone for date/time formatting in emails and Telegram (e.g. `Australia/Sydney`). Default: `UTC`. The workflow maps this to Node's POSIX-standard `TZ` env var via `TZ: ${{ vars.TIME_ZONE || 'UTC' }}` at workflow scope, so every `new Date()` / `toLocaleDateString` call renders in the configured zone with zero code changes. For local dev, set `TZ=...` directly in `.env` (also POSIX).

## Key Gotchas

- **Held-only tickers** (`report.untrackedItems`): a ticker in `currentHoldings` with **no** `targetPortfolio` entry and **not** in `watching`. Its gap is always negative against an implied 0% target, which used to render as permanent "N% overweight" noise in the daily brief and a standing TRIM/SELL in the weekly report + Telegram — none of it actionable, since Richfolio is buy-only and has no sell logic. `buildAllocationReport` now routes them to `untrackedItems` instead of `items`, so they vanish from the AI prompt (zero tokens), the daily recs, and the daily allocation table automatically — every one of those iterates `report.items`. The weekly email/Telegram list them **neutrally** ("Not in target portfolio", value + current %, no action verb). Portfolio beta and dividend totals deliberately iterate `[...items, ...untrackedItems]` because held-only positions are real exposure; `totalCurrentValue` sums `currentHoldings` directly and ETF overlap reads `currentHoldings`, so both were already correct. `npm run refresh -- TICKER` on a held-only ticker prints a message telling you to add it to `watching`. Spec: `specs/2026-06-29-held-only-tickers-design.md`
- **`analyze.ts` vs `allocation.ts`**: the allocation maths lives in `allocation.ts`, which imports **no config** and takes an `AllocationInputs` object. `config.ts` reads `config.json` at import time and **throws** when it's absent, and CI runs without a `config.json` — so anything importing `config.js` (directly or transitively) can't be unit-tested. `analyze.ts` is the thin wrapper injecting the real config. Same split as `socialContent.ts` (pure) / `social.ts` (credentialled), and why `buildPriceMap` lives in `util.ts`.
- **Watch list**: optional `watching: string[]` in `config.json` tracks tickers as research signals without committing them to a target allocation. They're included in `allUniqueTickers()` (so the fetch pipeline reaches them), excluded from `report.items` (no allocation pollution), surfaced as `report.watchingItems`, tagged with `isWatching: true` on the rec by the orchestrator, and routed through WATCH LIST CRITERIA in the prompts. Allocation-based guards (`guardOverweightHold`, `guardStrongBuyCriteria` gap ≥ 2% check, `guardMaxStrongBuy` cap) skip watch tickers; confidence/signal-presence checks still bind. Renderers branch on `rec.isWatching` to put them in a separate "Watch List" section. `suggestedBuyValue` is forced to 0 by `guardBuyValueSanity`.
- **Social posting**: `src/social.ts` posts generic STRONG BUY / BUY signals publicly to X / Facebook Page / Threads / LinkedIn Page, **daily + intraday only** (never weekly/refresh), wired in `index.ts` after the Telegram sends. Posts are deliberately generic — `buildSignalLines()` is the single privacy chokepoint: it projects recs onto an allowlist (`ticker`, `tickerFullName`, `action`, `confidence`, `valueRating`, `reason`, `analysisUrl`) and **never** reads `suggestedBuyValue`/gaps/holdings. Portfolio and watch-list recs are merged uniformly (no portfolio-vs-watchlist labels) so ownership never leaks. Each platform gates on its own env credentials (graceful skip if unset) and posts inside its own try/catch so one failure never blocks the others or the already-sent email/Telegram. `config.json` `social.enabled` is a master kill-switch; `social.includeLinkInX` defaults false (a link raises X's pay-per-use cost). X uses OAuth 1.0a (signed with Node `crypto`, no npm dep); FB/LinkedIn use bearer/page tokens via native `fetch`. X has had no free tier since Feb 2026 (pay-per-use ~$0.015/post) — built but dormant until keys are added
- **Claude has two transports, one identity**: `CLAUDE_CODE_OAUTH_TOKEN` (Pro/Max subscription, via `@anthropic-ai/claude-agent-sdk`) or `ANTHROPIC_API_KEY` (pay-per-use, via `@anthropic-ai/sdk`). `resolveClaudeTransport()` in `src/providers/claudeTransport.ts` picks one — subscription wins when both are set, and the subscription path strips `ANTHROPIC_API_KEY` from the subprocess env because Claude Code would otherwise prefer it and bill credits. Deliberately **not** a fourth provider: `id` stays `"claude"`, so multi-AI aggregation, the STRONG BUY unanimity rule, the degradation badge and `AI_DETAILED_PROVIDER` are all untouched. Structured output comes from forced tool use on the API-key path and `outputFormat: {type: "json_schema"}` on the subscription path, both fed the same schemas from `providers/schemas.ts`. The token lasts ~1 year with no auto-refresh — unlike `THREADS_ACCESS_TOKEN`, there's no refresh workflow, so re-run `claude setup-token` annually. The subscription transport is markedly slower than the API-key one — the Agent SDK spawns a Claude Code subprocess per stage, so a full run takes >10 minutes rather than 1-2. That's immaterial for the Actions cron (6h job limit) but makes `npm run refresh` a slow interactive loop.
- **yahoo-finance2 v3**: Must use `new YahooFinance()` (instance-based), not default import
- **Crypto tickers**: BTC → `BTC-USD`, ETH → `ETH-USD` via `toYahooTicker()` in config.ts
- **ETFs have no P/E**: Returns null — handled gracefully throughout, show "N/A"
- **ETF top holdings**: Yahoo returns only top 10 holdings per ETF — overlap detection uses these
- **Dynamic avgPE**: Computed from `earningsHistory` quarterly EPS — no manual config needed
- **NewsAPI matching**: Uses `TICKER_NAMES` map in fetchNews.ts to match company names in headlines. Three-layer filtering: (1) specific financial phrases in search terms to avoid generic matches, (2) regex pre-filter drops non-English articles (CJK/Korean/Arabic), (3) Gemini relevance + sentiment filter removes shopping/lifestyle/coincidental matches and scores each article's sentiment (bullish/bearish/neutral) and impact (high/medium/low) in one cheap batch call. Gemini filter is optional — graceful fallback if key is missing
- **Resend free tier**: Sends from `onboarding@resend.dev`, can only send to account owner email unless domain verified
- **Telegram char limit**: 4,096 chars per message — news section is truncated if needed
- **GitHub Actions timezone**: Cron is always UTC. 10pm UTC = 8am AEST
- **Gemini quota**: New API keys may take minutes to activate. Graceful fallback to gap-based recommendations. Transient 503/429 errors auto-retry up to 2 times with 5s/10s backoff
- **Technical data**: Fetched via `yahooFinance.chart()` with 365-day lookback. Tickers with <50 data points are skipped. SMA200 is null if <200 data points. MACD needs 35+ data points; Bollinger Bands need 20+. ATR needs 15+ data points. Stochastic needs 16+ (14 + 3 smoothing). OBV needs 11+ data points
- **Technicals display**: Only shown for STRONG BUY tickers in email/Telegram to avoid info overload. AI receives technicals for all tickers
- **MACD**: EMA(12) − EMA(26), signal line = EMA(9) of MACD, histogram = MACD − signal. Bullish/bearish crossover detected from last 2 days. Best for trending markets
- **Bollinger Bands**: SMA(20) ± 2σ. %B = position within bands (0=lower, 1=upper). Bandwidth = (upper−lower)/middle. Squeeze = bandwidth in bottom 20% of 120-day range (signals imminent breakout). Best for range-bound markets
- **Indicator conflict resolution**: AI prompt includes explicit hierarchy — MACD trusted in trending markets, Bollinger in range-bound. Both agreeing boosts confidence (+5pts); disagreements reduce it (-10-15pts). Squeeze + MACD crossover = strong signal (+5-10pts, not sufficient alone for STRONG BUY)
- **Limit order prices**: Suggested by AI based on nearest support (50MA, 30d low, round numbers). Shown for STRONG BUY in daily, intraday, and Telegram
- **Value investing framework**: AI rates stocks A-D based on ROE, debt/equity, FCF, earnings growth, analyst target. Data from Yahoo `financialData` module (same API call). ETFs and crypto get no rating
- **STRONG BUY criteria**: Strict gate — requires ALL of: ≥2% allocation gap, ≥80% base confidence (before boosts), 2+ entry signals including at least 1 price-level signal (low P/E, near 52w low, below 200MA) plus momentum (RSI<35, bullish MACD, lower Bollinger, Stochastic %K<20), no major red flags. Max 2 STRONG BUYs at any time. Intraday alerts enforce `minConfidenceToAlert` (default 80). Post-AI guard pipeline in `guards.ts` programmatically enforces these criteria as a safety net
- **Intraday frozen-data guard**: Technical indicators are computed from Yahoo *daily* candles that only update at the US close, and every intraday cron (10am/12pm/2pm/4pm AEST = US overnight) fires while the US market is shut — so the indicators are identical between runs. An action/confidence flip with no material price move is therefore AI scoring noise (a provider's confidence drifting across the 80% line), not a real signal, and previously produced whipsaw alerts (e.g. BUY→STRONG BUY at 4:32pm, STRONG BUY→BUY at 6:05pm on byte-identical RSI/MACD). `compareWithBaseline` suppresses any alert whose ticker moved < `minPriceMovePctToAlert` (default 1.0%) vs the morning baseline price. Fails open when either price is missing or the threshold is 0 (legacy behaviour). See `test/intradayCompare.test.ts`
- **Macro indicators**: Fetched from Yahoo Finance alongside portfolio tickers (VIX `^VIX`, 10Y Treasury `^TNX`, S&P 500 `^GSPC`, Oil `CL=F`, USD `DX-Y.NYB`). Fed to Gemini as MACRO ENVIRONMENT context in both `aiAnalysis.ts` and `detailedAnalysis.ts`. No extra API key needed — same `yahoo-finance2` instance. Graceful fallback if any ticker fails
- **Bond ETF framework**: Two hardcoded sets in `aiAnalysis.ts`. `SHORT_DURATION_BOND_ETFS` (BSV, SHY, BIL, etc.): hard-capped at BUY, never STRONG BUY — cash equivalents with ~2% annual price range. Confidence scales by gap size: gap≥5% → 70-75%, gap 3-5% → 60-70%, gap 1-3% → 45-55%, gap<1% → HOLD. `LONG_DURATION_BOND_ETFS` (TLT, BND, AGG, LQD, etc.): rate-sensitive, STRONG BUY IS valid when near 52w low + large gap + rates appear at cycle peak. For all bond ETFs: RSI/MACD/momentum are NOT buy signals — "oversold RSI" = rates rose
- **Bottom-fishing model**: AI checks RSI<30, volume contraction, price below 200MA, death cross for all tickers (stocks, ETFs, crypto). 2+ indicators triggers a bottom signal but it's a supporting factor only — does not auto-upgrade to STRONG BUY. Volume change computed from existing chart data
- **Fundamentals data**: `financialData` module added to existing `quoteSummary` call — zero extra API overhead. Returns null for ETFs and crypto
- **After-hours prices**: Yahoo `price` module returns `postMarketPrice` and `preMarketPrice`. `getLatestPrice()` (in `util.ts`) prefers after-hours → pre-market → regular; `applyLatestPrice()` swaps that price into `quote.price` **and** rescales the price-derived fields — trailing/forward P/E (× latest/close) and 52-week position — so they don't lag the price actually used. Applied in daily, intraday, and refresh modes (weekly keeps the regular close); it's a no-op when no extended-hours quote exists (null overnight/weekends). Fetched via `applyFxRate` so all three prices share one currency. Matters most on large after-hours gaps (earnings)
- **Technicals use the fresh price for trend position**: `fetchTechnicals` runs after `applyLatestPrice`, so `quote.price` is already the after-hours value. `resolveTrendPrice()` (in `util.ts`) feeds it into `priceVsSma50`/`priceVsSma200` and the momentum trend label so MA-distance matches the price used for allocation/P/E — but falls back to the chart's last daily close when the spot/close ratio is outside ±50% (guards sub-unit currencies like LSE pence, quoted ÷100 in `quote.price` but not in raw chart closes, and erroneous thin prints). Oscillators (RSI/MACD/Bollinger/Stochastic), ATR%, 90d-percentile and the 1d change stay on completed daily closes — they're defined on the close series and can't be derived from a single spot price
- **Refresh mode**: Re-analyzes a single ticker with after-hours price. Sends email + Telegram with new analysis URL. Triggered via `npm run refresh -- TICKER` or GitHub Actions workflow_dispatch
- **Two-stage AI analysis**: Inspired by OpenAlice's Think/Plan cognitive framework. Stage 1 (Observe) extracts structured observations per ticker — price-level signals, momentum signals, risk flags, summaries. Stage 2 (Decide) takes those observations and applies decision rules to produce recommendations. This separation improves STRONG BUY criteria consistency by keeping data parsing separate from decision-making. Uses 2 Gemini calls per run (still well within 250/day free tier)
- **Earnings calendar**: `calendarEvents` module added to existing `quoteSummary` call — zero extra API overhead. Returns next earnings date and days until earnings. Programmatic hard cap: earnings ≤3 days → force HOLD, ≤7 days → cap at BUY (never STRONG BUY). Shown as colored badges in email and `[earnings Xd]` tags in Telegram for tickers with earnings within 14 days
- **Guard validation pipeline**: `guards.ts` runs 6 sequential checks after AI returns: (1) bond ETF cap, (2) earnings proximity, (3) STRONG BUY criteria enforcement (gap≥2%, confidence≥80%, price-level signal present), (4) max 2 STRONG BUY, (5) confidence sanity (cap at 95), (6) buy value sanity (cap at gap amount). Guards log when triggered for debugging. Inspired by OpenAlice's guard pipeline concept with context isolation
- **ATR (Average True Range)**: 14-period ATR with Wilder's smoothing. Reported as absolute value and % of price. ATR% > 3% = high volatility (widen limit orders), ATR% < 1% = low volatility (tighter limits). Computed from existing OHLCV chart data
- **Stochastic Oscillator**: %K(14) with %D(3) smoothing. %K < 20 = oversold (added to momentum signals for STRONG BUY criteria), %K > 80 = overbought. Computed from existing chart data
- **OBV (On-Balance Volume)**: Cumulative on-balance volume with 10-day linear regression slope to determine trend direction (rising = accumulation, falling = distribution, flat = neutral). Only the trend matters — absolute OBV is meaningless across tickers. Computed from existing chart data
- **News sentiment scoring**: Gemini relevance filter upgraded from binary keep/drop to per-article sentiment (bullish/bearish/neutral) + impact (high/medium/low) + per-ticker overallSentiment. Same Gemini call, richer schema — no extra API cost. AI prompt shows sentiment tags on each headline and overall sentiment per ticker
- **Reasoning persistence**: `state/reasoning-history.json` stores 7 days of rolling AI reasoning snapshots (action, confidence, price per ticker per day). The decision prompt receives a "HISTORICAL CONTEXT" section showing conviction trends (e.g., `AAPL: BUY 72% → BUY 68% → HOLD 55% — weakening`). Inspired by OpenAlice's brain/memory persistence concept. In GitHub Actions, use `actions/cache` with `state/` directory to persist across runs
- **Yahoo Finance validation**: `validation: { logErrors: false }` suppresses schema validation throws for tickers with incomplete data (e.g., BIPC missing `earningsHistory` fields). Data is still returned — only strict schema enforcement is relaxed
