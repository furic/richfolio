---
title: Configuration
layout: default
nav_order: 4
---

# Configuration

Richfolio uses a single JSON configuration for all portfolio data — your portfolio stays private.

---

## Setup

Go to your fork's Settings → Secrets and variables → Actions → **Variables** tab → create a variable called `CONFIG_JSON` with the JSON content below.

## Example

```json
{
  "targetPortfolio": {
    "VOO": 20,
    "QQQ": 15,
    "GLD": 10,
    "BSV": 20,
    "SMH": 5,
    "BTC": 1.5
  },
  "currentHoldings": {
    "AAPL": 30,
    "VOO": 1,
    "BTC": 0.0002
  },
  "watching": ["MSFT", "NVDA", "AMD"],
  "watchingCrypto": ["BTC/CRO", "ETH/CRO"],
  "totalPortfolioValue": 50000,
  "defaultCurrency": "USD",
  "intradayAlerts": {
    "enabled": true,
    "confidenceIncreaseThreshold": 10
  }
}
```

---

## Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `targetPortfolio` | Yes | Target allocation percentages. Keys are ticker symbols, values are percentages that should sum to ~100%. |
| `currentHoldings` | Yes | Number of shares you currently own. Can include stocks not in your target (e.g., AAPL for ETF overlap detection). |
| `watching` | No | Array of tickers tracked but **not** in your target portfolio. Get fetched, scored by AI, and surfaced in a separate "Watch List" section — without polluting allocation maths. See [Watch List](#watch-list) below. |
| `totalPortfolioValue` | Yes | Your estimated total portfolio value (in `defaultCurrency`). Used for allocation math when actual holdings are smaller than the target. |
| `defaultCurrency` | No | ISO 4217 currency code (e.g. `"USD"`, `"GBP"`, `"AUD"`). Default: `"USD"`. All amounts in emails/Telegram render in this currency; non-matching tickers are FX-converted via live Yahoo Finance rates. |
| `watchingCrypto` | No | Array of crypto cross-pairs as `"BASE/QUOTE"` (e.g. `["BTC/CRO", "ETH/CRO"]`) — "the price of BASE denominated in QUOTE". Watch-only conversion signals priced from crypto.com's keyless public API, not Yahoo. See [Crypto Cross-Pairs](#crypto-cross-pairs) below. |
| `intradayAlerts` | No | Intraday alert settings (see below). Defaults apply if omitted. |
| `cryptoAlerts` | No | Alert settings for the `--crypto` schedule. Same fields as `intradayAlerts`, tuned independently. |

---

## Intraday Alerts

The `intradayAlerts` section controls when intraday checks send alerts. All fields are optional — sensible defaults apply.

Alerts trigger only for STRONG BUY-related changes:
1. **Upgraded to STRONG BUY** — any other level → STRONG BUY
2. **Downgraded from STRONG BUY** — STRONG BUY → any other level
3. **Confidence changed** — confidence shifted ≥ threshold while staying STRONG BUY

| Field | Default | Description |
|-------|---------|-------------|
| `enabled` | `true` | Master toggle. Set `false` to disable intraday alerts entirely. |
| `confidenceIncreaseThreshold` | `10` | Minimum confidence change (absolute, percentage points) to trigger an alert for STRONG BUY tickers. |

---

## Refresh Analysis

Re-analyze a single ticker with the latest price (including after-hours/pre-market). Sends email + Telegram with a new analysis URL.

Actions → Portfolio Monitor → **Run workflow** → mode: `refresh`, ticker: `SMH`.

Yahoo Finance's `postMarketPrice` and `preMarketPrice` are used when available. Falls back to regular market price if after-hours data isn't available.

---

## Watch List

The optional `watching` array tracks tickers you want **scored and surfaced as signals** but don't want in your target portfolio. They get fetched, prompted, and scored alongside portfolio tickers, but bypass all the allocation-based rules.

**Use it when:**

- You're researching a stock before committing to a target weight
- You want recommendations on names you don't currently own (e.g. *"is now a good time to start a position in NVDA?"*)
- You want signals on tickers without inflating your portfolio totals over 100%

### How watch tickers differ from portfolio tickers

| Behaviour | Portfolio ticker | Watch ticker |
|---|---|---|
| Counts toward allocation % | Yes | **No** |
| Allocation gap calculated | Yes | **No** |
| `gap ≥ 2%` required for STRONG BUY | Yes | **No** — STRONG BUY needs signal confluence instead |
| Overweight-position guard applies | Yes | **No** |
| Counts against max-2 STRONG BUY cap | Yes | **No** — surfaces every qualifying watch STRONG BUY |
| `suggestedBuyValue` populated | Yes (based on gap) | **Always 0** — you size manually |
| Rendered in main "AI Buy Recommendations" section | Yes | No — separate "Watch List" section |
| Limit price suggested | Yes | Yes (same logic) |
| Detailed STRONG BUY analysis page | Yes | Yes |

### Watch STRONG BUY criteria

Because there's no allocation gap to anchor on, watch tickers need stronger signal confluence to earn a STRONG BUY:

- ≥1 price-level signal (P/E below historical avg, 52-week position < 30%, or price below 200-day MA)
- ≥2 momentum signals confirming the price-level signal (RSI < 35, bullish MACD crossover, Bollinger %B < 0.15, Stochastic %K < 20, OBV rising)
- No major red flags
- Confidence ≥ 80% based on signal confluence alone
- Value rating A or B (for stocks; ETFs and crypto skip this)

### Example

```json
{
  "targetPortfolio": { "VOO": 20, "GLD": 10, ... },
  "currentHoldings": { "VOO": 5, "AAPL": 30 },
  "watching": ["MSFT", "NVDA", "AMD", "AVGO"]
}
```

This portfolio holds AAPL + VOO and tracks MSFT/NVDA/AMD/AVGO purely as research signals. Watch tickers appear in their own email/Telegram section, never push the portfolio total over 100%, and don't crowd portfolio STRONG BUYs.

---

## Crypto Cross-Pairs

The optional `watchingCrypto` array answers a different question from the rest of Richfolio: not *"should I buy this with cash?"* but *"I already hold coin X — is now a good moment to swap some of it for coin Y?"*

```json
{
  "watchingCrypto": ["BTC/CRO", "ETH/CRO"]
}
```

### Notation

`"BASE/QUOTE"` means **the price of BASE denominated in QUOTE** — the thing you're buying over the thing you're spending.

`"BTC/CRO"` is therefore "how much CRO does one BTC cost", which is precisely the number you want **low** before converting CRO into BTC. Adding, removing or swapping a pair is a config-only edit: `"SOL/CRO"`, `"BTC/USDT"` and `"ETH/BTC"` all work with no code change.

### Why one consistent direction matters

Exchanges list whichever side of a market they please. On crypto.com, CRO is the *base* of `CRO_BTC` but the *quote* of `ETH_CRO` — so read natively, the two pairs point in **opposite** directions: you'd want `CRO_BTC` high to convert CRO→BTC, but `ETH_CRO` low to convert CRO→ETH. Two polarities in one brief is a reliable way to misread it, and it gets worse with every pair added.

Richfolio normalises everything to "the asset you're buying, priced in the currency you're spending", so **low = cheap = good moment to convert**, always. Whichever way the exchange happens to list a pair is resolved automatically from its own instrument metadata, inverting the series when needed.

### What you get, and what's missing

| | |
|---|---|
| **Price source** | crypto.com Exchange public API — no key, no signup |
| **Denominated in** | the quote coin (e.g. `1,313,198 CRO`), never converted to your report currency |
| **Indicators** | the full set — SMA50/200, RSI, MACD, Bollinger, ATR, Stochastic, OBV, 90-day percentile |
| **52-week range** | derived from 365 daily candles (crypto trades every calendar day) |
| **P/E, fundamentals, dividends, earnings, analyst targets** | **none exist** for a coin pair — the AI is told so explicitly and won't invent a value rating |
| **Allocation target / gap** | none — watch-only, exactly like the `watching` list |
| **`suggestedBuyValue`** | always 0 (there's no cash outlay — you're swapping) |
| **Posted publicly to X/Facebook/etc.** | never, even with social posting enabled |

Since P/E doesn't exist, a cross-pair has only **two** price-level entry signals available instead of three: 52-week position < 30%, and price below the 200-day MA. The AI is told a missing P/E is not a failed check.

### Delivery and cadence

Cross-pairs show up in two places:

1. **The daily brief's Watch List**, alongside your `watching` tickers.
2. **Their own 8×/day schedule** (`.github/workflows/crypto-monitor.yml`, every 3 hours), which emails/Telegrams you only when a signal changes materially.

The higher cadence is worth having because crypto trades 24/7, unlike the equity intraday runs that mostly fire while the US market is shut. Run it locally with `npm run crypto`.

Note that daily candles still only close once a day, so the *indicators* are identical between two runs three hours apart — a bare action flip with no price move is scoring noise, not signal. `cryptoAlerts.minPriceMovePctToAlert` (default `1.0`) suppresses those. `cryptoAlerts` takes exactly the same fields as [`intradayAlerts`](#intraday-alerts) and is tuned independently:

```json
{
  "cryptoAlerts": {
    "enabled": true,
    "minConfidenceToAlert": 80,
    "minPriceMovePctToAlert": 1.0
  }
}
```

Set `"enabled": false` to keep the pairs in the daily brief but stop the dedicated alerts.

### Reading the signal

A cross-pair recommendation is a **conversion** signal, so read the verbs accordingly:

| Action | Means |
|---|---|
| STRONG BUY / BUY | Favourable window to convert the quote coin into the base coin |
| HOLD / WAIT | The base coin is expensive in quote-coin terms — wait |

One caveat worth keeping in mind: both legs are volatile, so a favourable pair price can come from the base coin falling *or* the quote coin rallying. The AI is asked to say which when the data supports it.

---

## Ticker Formats

| Type | Format | Examples |
|------|--------|----------|
| US stocks/ETFs | Standard symbol | `AAPL`, `VOO`, `QQQ`, `SMH` |
| Crypto | Short name | `BTC`, `ETH` (auto-converted to `BTC-USD`, `ETH-USD`) |
| International | Yahoo Finance symbol | `0700.HK` (Tencent), `TM` (Toyota) |

---

## Tips

- **Target percentages** should add up to 100%. If they don't, gap calculations still work but may suggest larger or smaller buys.

- **Holdings outside your target** are tracked for ETF overlap detection. For example, holding AAPL reduces the buy priority for ETFs that contain AAPL (like VOO or QQQ).

- **Fractional shares** are supported — useful for crypto (`"BTC": 0.000188`) or brokers that support fractional stock purchases.

- **Portfolio value** uses the higher of your actual holdings value or the configured estimate. This keeps gap calculations meaningful when you're still building toward your target allocation.

<details>
<summary><strong>How many tickers can I add?</strong></summary>

<br>

Richfolio works best with a focused portfolio. While there's no hard-coded limit, the free-tier API quotas and digest readability set practical boundaries.

**Recommended ranges:**

| Range | Verdict |
|-------|---------|
| **10–20** | Sweet spot — focused, actionable, all free tiers comfortable |
| **20–30** | Still good — manageable digest, well within limits |
| **30–50** | Works technically, but the daily digest gets noisy |
| **50+** | Not recommended (see below) |

**Why 50+ tickers is not recommended:**

- **NewsAPI (100 req/day)** — news is fetched in batches of 5 tickers. Running daily + intraday with 50 tickers uses ~22 calls; at 100 tickers it's ~42, leaving little room for refreshes.
- **AI analysis quality** — Gemini produces more diluted recommendations when evaluating too many options at once.
- **Digest readability** — email gets long and Telegram truncates at 4,096 characters. The signal-to-noise ratio drops sharply.
- **Execution time** — each ticker requires Yahoo Finance calls for price, technicals, and fundamentals, slowing down your GitHub Actions run.

Gemini's free tier is now the tightest constraint in the stack: a live 429 in August 2026 reported a request quota of ~20/day for `gemini-2.5-flash`, and richfolio's schedule (1 daily + 5 intraday runs) uses 13+ requests/day — so Gemini will often exhaust its quota and drop out of later runs. Token throughput is not the issue (even 100 tickers only uses ~53K tokens per run at 250K tokens/min) — it's the request *count* that binds. The other real constraints are NewsAPI quota and information overload.

**TL;DR — aim for ≤30 tickers for the best experience on all free tiers.**

</details>

---

## Updating

When your holdings change, update the `CONFIG_JSON` variable with the new JSON content (Settings → Secrets and variables → Actions → Variables tab).
