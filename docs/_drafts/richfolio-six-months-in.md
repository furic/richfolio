---
title: "Richfolio, six months in: every safety net I built failed silently"
subtitle: "From v1.6 to v1.9 — multi-provider consensus, public signal posting, and five different ways a check that isn't running looks exactly like a check that passed"
date: 2026-08-07
tags: [richfolio, typescript, ai, investing, github-actions]
---

Three months ago I wrote up [how Richfolio went from v1.0 to v1.6](https://www.richardfu.net/richfolio-three-months-in-ai-architecture-in-production/) — the guard pipeline, the two-stage Think/Plan prompt, the reasoning persistence, all of it borrowed from patterns I liked in OpenAlice.

Three releases since then. [v1.7](https://github.com/furic/richfolio/releases/tag/v1.7.0) made the AI layer pluggable and put Gemini and Claude side by side. [v1.8](https://github.com/furic/richfolio/releases/tag/v1.8.0) taught it to publish, to watch tickers I don't own, and to stop lying to me about prices. [v1.9](https://github.com/furic/richfolio/releases/tag/v1.9.0) is the one I didn't plan — it exists entirely because of what writing this post turned up.

Those are the features. They're not what I learned.

What I learned is that I spent six releases building safeguards — a price-move deadband, a unanimity rule, a guard pipeline, a fail-open policy for missing data — and then discovered, one at a time, that **a safeguard which isn't running is indistinguishable from a safeguard that ran and approved.** Same alert in my inbox. Same clean number on the card. Same plausible file on my disk. Same green test suite. Five separate instances of it in this window, and I found every one by accident — two of them while drafting this.

That's the post. The features are how I got there.

## What Richfolio is now

Still one Node.js + TypeScript pipeline on GitHub Actions cron. No server, no dashboard, no database — just a `state/` directory cached between runs.

Four modes:

- **Daily** (8am AEST) — allocation gaps, buy signals, news, the full brief
- **Intraday** (4× on weekdays) — re-runs the analysis, alerts only when a recommendation materially changes
- **Weekly** — rebalancing report
- **Refresh** (`npm run refresh -- SMH`) — re-analyze one ticker on demand

Output goes to email (dark-themed HTML via Resend) and Telegram. As of v1.8, optionally to X, Facebook, Threads and LinkedIn as well.

## The stack — nearly still $0/month

| Component | Service | Free tier |
|---|---|---|
| Prices, fundamentals, technicals, ETF holdings | Yahoo Finance (`yahoo-finance2` v3) | unofficial, unmetered |
| Headlines | NewsAPI.org | 100 req/day |
| AI analysis | Google Gemini 2.5 Flash | 250 req/day |
| AI analysis (second opinion) | Anthropic Claude | **pay-per-use** |
| Email | Resend | 3,000/month |
| Telegram | Bot API | free |
| Scheduler | GitHub Actions | free (public repo) |
| Docs site | GitHub Pages | free |

The honest correction to my last post's headline: it's $0/month **if you run Gemini alone**. Turning on the second provider moves Claude onto pay-per-use, and X has had no free tier since February 2026 (~$0.015/post). Both are opt-in — set no key, pay nothing, and v1.8 behaves like v1.6 did.

The design constraint hasn't changed, though. It was never really about money; it's about **request budgets**. 250 Gemini calls/day sounds generous until you're doing two-stage prompting on four intraday runs. Everything that follows is shaped by that.

## The database is a cache, and that's fine

There's a `state/` directory holding two files: the morning baseline that intraday runs compare against, and the 7-day rolling reasoning history the AI prompts read. Both need to survive between runs of a workflow whose machine is destroyed every time it finishes.

The whole persistence layer is this:

```yaml
- uses: actions/cache@v5
  with:
    path: state/
    key: intraday-state-${{ github.run_id }}
    restore-keys: |
      intraday-state-
```

The `run_id` in the key is the part worth stealing. Cache entries in GitHub Actions are **immutable** — you cannot overwrite a key once it exists. A stable key like `intraday-state-v1` looks obviously right and then silently stops saving after the very first run, because every subsequent save is a no-op against an existing key. Making the key unique per run means the save always succeeds, and `restore-keys` prefix-matches to pull back the **most recent** entry. Each run reads the previous run's state and writes a new one: a rolling single-writer chain, no database, no S3 bucket, no credentials.

What makes this acceptable rather than reckless is that **nothing important lives only there.** It's a cache, and GitHub will evict it — 7 days without access, or LRU once the repo passes 10 GB. So every consumer has to treat absence as normal, not exceptional:

```ts
const ageHours = (Date.now() - new Date(data.timestamp).getTime()) / (1000 * 60 * 60);
if (ageHours > 18) {
  console.log(`Baseline is ${ageHours.toFixed(1)}h old (max 18h) — skipping comparison`);
  return null;
}
```

A missing baseline means the intraday run exits quietly instead of comparing against stale numbers. A missing reasoning history means the prompt omits its HISTORICAL CONTEXT section — the analysis is slightly worse that day and nothing breaks. When the history schema changed in v1.7 I simply discarded the old entries rather than writing a migration, on the grounds that seven days of conviction snapshots isn't precious data. That's only a defensible call because the storage was never load-bearing.

The trap I did fall into: for months I assumed my **local** `state/` reflected what production was doing. It doesn't — they're two completely separate lineages. My working copy is only written by local runs, so it had been frozen at 23 June while Actions quietly maintained its own chain in the cache. When I went looking for the run that produced a particular signal, the file on my disk had nothing to do with it. Worth knowing before you try to debug a scheduled job by reading your own checkout.

## Making the AI layer pluggable

v1.6 was Gemini-only, and the Gemini SDK was threaded through the analysis module. Adding a second provider meant first removing the first one from the plumbing.

What came out is a provider interface and a registry:

```
src/providers/
├── types.ts        # AIProvider interface + canonical AIBuyRecommendation
├── prompts.ts      # SDK-agnostic prompt builders
├── gemini.ts       # GeminiProvider (@google/genai)
├── claude.ts       # ClaudeProvider (@anthropic-ai/sdk, tool-use)
└── index.ts        # buildActiveProviders() — reads env, returns what's configured

src/aiOrchestrator.ts  # runs active providers concurrently, applies guards
src/aiAggregation.ts   # consensus action, averaging, the unanimity rule
```

The part that mattered was pulling the **prompt builders out of the SDK calls**. Both providers get byte-identical prompts; only the transport differs (Gemini's structured output vs Claude's tool-use). Adding a third provider is now about fifty lines, and the guard pipeline, reasoning history and renderers all pick it up for free.

Behaviour is keyed off how many keys you set. One key → single-AI mode, identical to v1.6. Two keys → multi-AI mode auto-engages, providers run concurrently, and every email and Telegram message shows a per-AI breakdown under each consensus call.

### The unanimity rule

Consensus is mode-of-votes with a confidence-sum tiebreaker, and if that still ties, it falls to whichever action is more conservative. Under-recommend rather than over-recommend.

Then one extra rule on top:

```ts
// Unanimity rule for STRONG BUY
if (consensus === "STRONG BUY") {
  const allStrongBuy = scores.every((s) => s.action === "STRONG BUY");
  if (!allStrongBuy) {
    consensus = "BUY";
  }
}
```

Four lines, and they're the whole point of running two AIs. STRONG BUY in Richfolio is supposed to be rare and high-conviction — it's gated on a ≥2% allocation gap, ≥80% base confidence, two or more entry signals including a price-level one, and a max of two live at any time. Averaging two providers' confidence would have quietly softened that: an 88% and a 74% average to 81%, which clears the bar that neither model individually agreed on.

So a dissent caps the consensus at BUY. If one model thinks it's exceptional and the other doesn't, that's not an exceptional setup — that's a disagreement, and it gets displayed as one (`unanimous` / `majority` / `split` badge).

The one place the dissent survives is the detailed analysis page. If any provider voted STRONG BUY, the ticker still qualifies, and the page is generated from that provider's thesis:

```ts
export function hasStrongBuyVote(rec: AIBuyRecommendation): boolean {
  if (rec.action === "STRONG BUY") return true;
  if (!rec.providers) return false;
  return rec.providers.some((p) => p.action === "STRONG BUY");
}
```

The dissenting recommendation is frequently the most interesting thing in the brief. Capping the headline action doesn't mean throwing away the argument.

## Case study: the day my alerts started whipsawing

This is the bug I'd share if I could only share one.

Late July, my Telegram lit up twice in ninety minutes:

```
4:32pm  VOO  BUY → STRONG BUY   64% → 87%   $670.63 → $673.20  (+0.38%)
6:05pm  VOO  STRONG BUY → BUY   87% → 76%   $673.20 → $672.00  (−0.18%)
```

My first instinct was that the AI was being flaky. It wasn't. I pulled both runs' technicals and they were **byte-identical** — same RSI, same MACD histogram, same Bollinger %B, to the last decimal. A 23-point confidence swing and back, on a ticker that had moved half a percent.

Here's why. Intraday technicals are computed from Yahoo **daily** candles, and a daily candle only updates at the US close. My four intraday crons were at 10am / 12pm / 2pm / 4pm AEST — every single one of them firing while the US market was shut. So on all four runs, the indicators feeding the AI were the same frozen numbers from the last US close.

Which means an action flip between two of those runs contained **zero new information**. It was a provider's confidence drifting across the 80% line by a couple of points — scoring noise on identical inputs — and my alert logic was faithfully paging me about it.

Two fixes, one tactical and one structural.

The tactical one: require a real price move before any alert fires. Prices *do* update off-hours (that's the after-hours quote), even when daily candles don't, so price movement is the honest signal that something changed.

```ts
// An action/confidence flip with no material price move on frozen off-hours
// data is AI scoring noise, not a real signal, so suppress it. Fail open when
// we lack both prices (can't prove it's noise) or the threshold is disabled (0).
if (
  triggerType &&
  config.minPriceMovePctToAlert > 0 &&
  morningPrice > 0 &&
  currentPrice > 0 &&
  Math.abs(priceDelta) < config.minPriceMovePctToAlert
) {
  triggerType = null;
}
```

Default threshold is 1.0%, configurable. Note the fail-open conditions — if either price is missing, or you set the threshold to 0, you get the old behaviour. I didn't want a data gap to silently mute alerts; a guard that fails closed on missing data is a guard that eventually hides something real.

That module had no unit tests before this. It has them now, and the first two replay both halves of that VOO whipsaw with the numbers straight out of the logs.

The structural fix: the crons were badly placed to begin with. All four sat inside the US-closed dead zone because I'd picked times that were convenient for *me*, not times when the underlying data changes. Respaced ~3.75h apart across my waking window:

```yaml
- cron: "15 3 * * 1-5"    # 1:15pm AEST  (US closed)
- cron: "0 7 * * 1-5"     # 5:00pm AEST  (US closed)
- cron: "45 10 * * 1-5"   # 8:45pm AEST  (US pre-market)
- cron: "30 14 * * 1-5"   # 12:30am AEST next day (US market open)
```

The last two now land in US pre-market and the US open, where prices actually move. The first two still fire on frozen data, and the guard keeps them quiet unless price moved for real.

One lesson I'd have written up right there, if I'd stopped at this point: **a scheduled job's cadence should be derived from when its inputs change, not from when you'd like to read the output.** I'd had that backwards for five releases.

### Then it happened again

Five days after that guard shipped, I was searching my mail for something unrelated and saw this:

```
Tue 16:08  GOOG signal weakened
Tue 19:43  GOOG signal strengthened
Tue 22:33  GOOG signal weakened
```

The same whipsaw. Three flips in six and a half hours, two of them on runs where the US market was shut and the candles were frozen. The guard I'd just written, tested, and blogged about in my head was sitting right there in the code path, doing nothing.

The reason is a good one, in the sense that I'd never have found it by re-reading the guard. **GOOG is a watch-list ticker.**

Watch-list tickers are deliberately excluded from `report.items` — that's the whole design, the thing that stops them polluting allocation percentages. But the intraday price map was built like this:

```ts
const priceMap: Record<string, number> = {};
for (const item of report.items) {   // ← watch-list tickers are not in here
  priceMap[item.ticker] = item.price;
}
```

So for GOOG, `morningPrice` and `currentPrice` were both `0`. And look again at what the guard requires:

```ts
if (
  triggerType &&
  config.minPriceMovePctToAlert > 0 &&
  morningPrice > 0 &&        // ← false
  currentPrice > 0 &&        // ← false
  Math.abs(priceDelta) < config.minPriceMovePctToAlert
)
```

It **fails open on missing prices** — the decision I described two paragraphs ago as deliberate, and still think is right for a genuine data gap. Except this wasn't a data gap. The prices existed; they just weren't in the map I handed the guard. So the guard didn't fail open on bad data, it quietly declined to run at all, for exactly the tickers a feature in the *same release* had introduced.

Two v1.8 features that don't compose: the watch list can raise intraday alerts, and the guard that silences noisy intraday alerts couldn't see watch-list tickers. Neither feature is wrong in isolation. Nobody reviewing either diff would catch it.

The fix, shipped as [v1.8.1](https://github.com/furic/richfolio/releases/tag/v1.8.1), is small — one shared builder, used by both the daily baseline and the intraday comparison, so the two maps can't drift apart again:

```ts
export function buildPriceMap(report: AllocationReport): Record<string, number> {
  const map: Record<string, number> = {};
  for (const item of report.items) map[item.ticker] = item.price;
  for (const item of report.watchingItems) map[item.ticker] = item.price;
  return map;
}
```

The lesson I actually took, which is better than the cron one:

**A fail-open guard cannot tell you it isn't running.** Mine had no way to distinguish "I checked and this is a real move" from "I had no data so I waved it through," and both outcomes look identical from the outside: an alert arrives. I'd built a safety net, verified it on the case that motivated it, and never asked which inputs it silently didn't cover. Every day it did nothing on GOOG, the observable behaviour was the same as a working guard on a genuinely moving stock.

The concrete practice I'd extract: when a guard fails open, **the fail-open branch deserves a log line and a test of its own** — not just the happy path. And the regression test that matters is not "does the guard suppress noise" (it always did, when it ran). It's "does every ticker that can produce an alert have the data the guard needs?" That's a coverage question about the *inputs*, not a behaviour question about the function, and it's the test I didn't have:

```ts
test("every watch ticker gets a non-zero price (the guard needs > 0)", () => {
  const map = buildPriceMap(report);
  for (const w of report.watchingItems) {
    assert.ok(map[w.ticker] > 0, `${w.ticker} must have a price or the guard fails open`);
  }
});
```

Both halves of this story are the same underlying mistake as the after-hours P/E bug below: two sources of truth, and no test asserting they agree.

## The price that lied

Same theme, different surface. v1.7 already preferred the freshest quote — after-hours → pre-market → regular close — because a brief showing yesterday's close after an earnings gap is useless.

But it only swapped `quote.price`. Everything *derived* from price kept using the close. So on a big earnings gap the brief would show the fresh price beside a P/E and a 52-week position both still computed off the stale close — a ticker up 15% after hours would print the pre-gap P/E, making it look cheaper than the price I was actually being asked to pay. Internally inconsistent, and worse, the AI was reasoning about a valuation that didn't match the price it was given.

The fix is arithmetic, not cleverness. EPS is fixed between earnings reports, so P/E scales linearly with price:

```ts
const ratio = latest.price / regularPrice;
if (quote.trailingPE != null) quote.trailingPE *= ratio;
if (quote.forwardPE != null) quote.forwardPE *= ratio;
if (quote.fiftyTwoWeekHigh != null && quote.fiftyTwoWeekLow != null && ...) {
  quote.fiftyTwoWeekPercent = /* recompute from latest.price within the 52w range */;
}
quote.price = latest.price;
```

Then the same question for the moving averages, where it gets more interesting. Distance from the 50/200-day MA should obviously use the fresh price — that's the number I'm acting on. But feeding a spot price into a series derived from raw chart closes has a units trap:

```ts
export function resolveTrendPrice(closeLast: number, spotPrice?: number | null): number {
  if (spotPrice != null && spotPrice > 0 && closeLast > 0) {
    const ratio = spotPrice / closeLast;
    if (ratio >= 0.5 && ratio <= 2) return spotPrice;
  }
  return closeLast;
}
```

That ±50% band catches two real failure modes I hit. **Sub-unit currencies**: LSE tickers quote in pence, and my pipeline divides `quote.price` by 100 to normalise — but the raw chart closes aren't divided, so the ratio comes out at 0.01 and the MA distance would read as a 99% crash. And **thin after-hours prints**: an illiquid ticker can trade at an absurd price on a handful of shares after the close, which isn't a move, it's an artifact.

The line I had to draw carefully: oscillators (RSI, MACD, Bollinger, Stochastic), ATR%, the 90-day percentile and the 1-day change all stay on completed daily closes. They're *defined* on the close series. You can't retrofit a single spot price into a 14-period average and call it an update — you'd get a number that looks precise and means nothing. Only the metrics that are genuinely "price versus a reference level" get the fresh price.

Both of these bugs, and the whipsaw, are the same mistake in different costumes: mixing data from two different clocks and not noticing.

## Publishing signals without publishing my portfolio

v1.8's headline feature is that Richfolio can post its BUY / STRONG BUY calls to X, Facebook, Threads and LinkedIn on daily and intraday runs.

The engineering problem isn't the four APIs. It's that every recommendation object in the pipeline carries private data — `suggestedBuyValue`, `gapPct`, `currentPct`, `targetPct`, `overlapDiscount` — and I'd rather not publish my position sizing to the internet.

The approach: one chokepoint that projects onto an explicit allowlist, rather than N call sites each remembering to omit the right fields.

```ts
/**
 * Privacy chokepoint. Filters to publishable buy signals and projects each
 * onto the generic allowlist — nothing else from the source object survives.
 */
export function buildSignalLines(sources: SignalSource[]): SignalSource[] {
  return sources
    .filter((s) => s.action === "STRONG BUY" || s.action === "BUY")
    .map((s) => ({
      ticker: s.ticker,
      tickerFullName: s.tickerFullName ?? null,
      action: s.action,
      confidence: s.confidence,
      reason: sanitizeReason(s.reason),
      valueRating: s.valueRating,
      analysisUrl: s.analysisUrl,
    }))
    .sort(/* action rank, then confidence */);
}
```

Explicit construction, not `delete` or destructured rest. A new private field added upstream can't leak by default — it simply isn't in the projection. And `socialContent.ts` deliberately imports no config and does no network calls, so it's unit-testable in CI with no `config.json` present. There's a test that asserts private values never appear in the output.

The harder half is prose. The `reason` field is written by the AI for *me*, so it says things like "underweight by 2.3%, fill ~$7,119 after ETF overlap discount". Field-level allowlisting doesn't help when the leak is inside a sentence:

```ts
const PRIVATE_SENTENCE =
  /(\$\s?\d{1,3}(?:,\d{3})+|allocation gap|overlap discount|after etf overlap|under-?weight|over-?weight|portfolio (?:value|total)|position siz)/i;
```

Sentence-level filtering: split the reason on sentence boundaries, drop any sentence that trips the pattern, keep the rest. Then a backstop regex strips any comma-grouped dollar figure that survived in a kept sentence.

The comma-grouping detail is deliberate. `$7,119` is my position size; `$205` is a share price, which is public information and useful in a post. Requiring comma-grouped thousands separates the two without needing to know which is which semantically.

Same pass also strips the pipeline's internal `[Guard: ...]` annotations and any sentence mentioning the watch list — because the other privacy leak is subtler than dollars. If posts labelled tickers as "portfolio" versus "watching", I'd be broadcasting exactly what I own. So portfolio and watch-list signals are merged into one undifferentiated list. **Which tickers I hold is not derivable from the output.**

Each platform gates on its own credentials and posts inside its own try/catch, so a dead token can't block the other three or the brief that already went out. X uses OAuth 1.0a signed with Node's built-in `crypto` — no npm dependency for any of the four.

## Watch list: tickers without allocations

Small feature, one non-obvious design decision. `watching: ["MSFT", "NVDA", "AMD"]` in config tracks tickers I'm researching but haven't committed to a target allocation.

The naive version gives them a 0% target and lets them flow through normally. That poisons everything downstream: a 0% target with a real position is an infinite overweight, and every other ticker's gap gets recomputed against a denominator that now includes stocks I'm not allocating to.

Instead they run the full fetch pipeline (prices, fundamentals, technicals, news, AI) but never enter `report.items`. They surface as `report.watchingItems`, get tagged `isWatching: true`, and route through separate WATCH LIST CRITERIA in the prompt.

Then the guards need to know. Allocation-based ones can't apply to something with no allocation:

```ts
if (rec.isWatching) continue;   // guardOverweightHold — no target, no overweight
```

The gap ≥ 2% STRONG BUY check and the max-2-STRONG-BUY cap skip them too. Confidence and signal-presence checks still bind — those are about evidence quality, which doesn't care whether I own the thing. And `suggestedBuyValue` is forced to 0, because there's no gap to fill.

## Also shipped since v1.6

- **Telegram no longer drops the whole brief.** A large universe pushed the daily message past Telegram's 4,096-char hard limit; the API 400'd and *nothing* sent. Email still worked, so I nearly missed it. Now each AI reason is truncated, and `clampToLimit()` pops whole trailing lines — each has balanced HTML tags, so the output stays valid markup — until it fits, with a hard cut for a pathological single huge line.
- **Overweight tickers downgrade to HOLD.** A holding already above target could still come back as a buy. Guarded, and the downgrade is annotated so the displayed reason matches the final action.
- **Claude Stage 1 no longer truncates** on large universes — `max_tokens` was too low, and it was silently dropping the tail of its observations, including the whole watch-list section.
- **Per-provider reasoning history.** The 7-day rolling store is now keyed by provider, so each AI sees only its own past convictions in the HISTORICAL CONTEXT prompt section. Cross-contaminating them would have made the "conviction trend" line meaningless.
- **`TIME_ZONE` Actions variable** — mapped to Node's `TZ` at workflow scope, so every `new Date()` renders in the configured zone with zero code changes.
- **Docs in 6 languages** (EN, 简中, 繁中, 日本語, 한국어, Español), plus a [privacy policy](https://furic.github.io/richfolio/privacy) page, which the Meta and LinkedIn app reviews require.
- **A macro event calendar** (CPI, NFP, FOMC, PCE) that I built and then reverted. The prompt was getting long enough that adding more context measurably degraded the STRONG BUY consistency I'd spent v1.4–v1.6 tightening. Worth noting because "shipped then removed" is a real outcome and the commit history shows it.

## The honest results so far

The portfolio sits at about **$37k, with ~$4.5k of profit** — a **13.8% return** on the $32.5k cost basis. Last post, three months ago, that number was 6%.

Four caveats, because the number on its own is close to meaningless:

- **It's return on capital deployed, not a time-weighted return.** I've been adding cash throughout, as Richfolio flagged gaps — that's what the tool is for. So a dollar that went in last week counts the same as one from February. You can't line this up against "the S&P did X% over the same window" and call the difference alpha.
- **The market was up too.** Most of 13.8% is beta, not skill. I haven't done the work to separate them, and I'm suspicious of anyone who claims they have on a six-month sample.
- **One portfolio is not a backtest.** N=1, no control, and I'm the one who chose which recommendations to act on. The tool suggests; I still click the button.
- **Six months is noise.** Any strategy can look good over one up-trending half-year.

What I'd actually want to know — whether the STRONG BUY gate has predictive value — needs a lot more STRONG BUYs than it has produced, which is by design. The unanimity rule made them rarer still. Ask me in two years.

### The uncomfortable part: my best trade broke my own plan

About **$2k of that $4.5k — 44% — came from one position, MSFT.** And MSFT was never in my target allocation.

It was on the **watch list**: the v1.8 feature for tickers I'm interested in but haven't committed to a target. On 23 June it came back a STRONG BUY at 91% confidence, Value A. I read the thesis and bought 16 shares at $370.14. Off-plan, discretionary, exactly the kind of decision allocation targets exist to prevent.

And — I only worked this out while writing this post — **it wasn't a consensus call at all.** Gemini was down that day, most likely quota-exhausted. That STRONG BUY was Claude alone.

Here's the card, verbatim:

> **MSFT** · STRONG BUY · Value A · 91%
>
> (watch) Exceptional confluence of oversold signals at multi-year lows. Forward P/E of 19.0 is below its historical avg of 22.7 — rare for MSFT. RSI at 9.3 is at an extreme oversold reading, Stochastic %K at 0.3 is deeply oversold, and Bollinger %B at 0.04 is at the lower band — 3 momentum signals plus 3 price-level signals (52w position 6%, below 200MA -18.5%, below 50MA -11%). Analyst target of $561 implies ~53% upside. ROE 34%, Debt/Equity 30% — strong fundamentals. Historical conviction has been strengthening over 5+ days. Only risk flag is the earnings event in 37 days and OBV falling, but the technical oversold extreme overwhelmingly dominates. Death cross is present but typical during sharp drawdowns at capitulation lows.
>
> **Momentum:** bearish · RSI 9.3 · 50MA $412.86 (-11%) · 200MA $450.66 · death cross · MACD hist -5.513 · %B 0.04
> **Limit order:** $360 — near the recent consolidation floor visible in the 90-day range (10th percentile ~$354); provides a small buffer below current price of $367
> **Bottom signal:** RSI < 10 (extreme oversold), Stochastic %K < 5, price below 200MA (-18.5%), death cross — 4 bottom indicators present

**RSI 9.3 on a mega-cap.** I had to re-read that. Sub-10 RSI on the largest companies in the world is close to a non-event historically — it's the kind of reading you get in a capitulation, which is precisely what the reasoning says.

The generous reading is that the feature did its job, and I'd go further: this is not a marginal call the gate waved through. Six independent signals, four bottom indicators, forward P/E below its own historical average, and — the part I care most about — **the risks are named, not buried.** Death cross present. OBV falling. Momentum bearish. Earnings in 37 days. The model argued *past* those rather than omitting them, and left me a written thesis I could audit six weeks later. That auditability is the real product; the profit is a side effect.

The "historical conviction has been strengthening over 5+ days" line is the v1.6 reasoning-persistence store paying off, too. Three features compounding: the watch list surfaced a ticker I didn't own, the bottom-fishing model caught the extreme, and the 7-day history confirmed it wasn't a one-day blip.

### The check that wasn't running

Except the fourth mechanism — the one I spent the first half of this post describing as the whole justification for running two AIs — **wasn't there.**

Remember the unanimity rule: STRONG BUY requires every provider to agree, otherwise it caps at BUY. With Gemini absent, the consensus function has nothing to reconcile:

```ts
function computeConsensusAction(scores: ProviderScore[]): string {
  if (scores.length === 0) return "HOLD";
  if (scores.length === 1) return scores[0].action;   // ← straight through
  // ... tally, tiebreak, then the unanimity rule
}
```

One provider, so the action passes through untouched. No unanimity check, because unanimity among one model is trivially satisfied.

This is the graceful degradation I wrote up in the v1.7 notes as a feature, and it *is* one — a provider hitting its quota shouldn't cost me the whole brief. But look at what it produced. My largest gain came from a signal that skipped the exact safeguard I'd built to make STRONG BUY mean something, and **nothing in the output said so.** No `avg` tag, no agreement badge, no "1 of 2 providers responded" line. Just a clean `91%` that looks identical to a vetted consensus. I acted on it without noticing, and only found out six weeks later because I went digging while writing this.

**Graceful degradation is fail-open by another name.** When Gemini dropped out, the system silently downgraded from "two models must agree" to "one model decides" — a materially weaker guarantee, presented in exactly the same visual language as the strong one.

Which is the same bug as the GOOG whipsaw, wearing different clothes. There, a guard didn't run because its inputs were missing, and the output looked like a guard that had run and approved. Here, a rule didn't run because a provider was missing, and the output looked like a rule that had run and approved. Both times the absence of a check was invisible at exactly the moment it mattered.

[v1.9.0](https://github.com/furic/richfolio/releases/tag/v1.9.0) exists because of this. Every recommendation from a degraded run now carries what was lost:

```ts
degradation: { configured: 2, answered: 1, missing: ["Google Gemini"] }
```

and STRONG BUY caps at BUY, because cross-provider agreement is part of the STRONG BUY criteria and it demonstrably did not happen. The email shows a `⚠ 1/2 AI` badge with the missing providers in the tooltip, Telegram shows the same tag — and both render **even in single-provider mode**, which is the entire point. That's exactly where the old code hid it.

Run that same 23 June brief through today's code and MSFT arrives as **BUY 91% ⚠ 1/2 AI**. Same analysis, same reasoning, same 33.7% — but labelled as the unverified single-model call it actually was, which is the only thing I ever wanted from it.

The one case deliberately left alone: if you only ever set one API key, nothing changes. That configuration never promised unanimity, so it isn't degraded — no cap, no badge. It has its own negative test, because getting that wrong would silently downgrade every single-key user's recommendations, which would be the same category of mistake in the opposite direction.

Capping is configurable (`ai.strongBuyRequiresAllProviders: false` keeps the survivor's action). The badge isn't. Whether a lost guarantee should change the recommendation is a judgement call; whether you get told about it isn't.

And then I ignored the one instruction it gave me. The card says **set a limit at $360**, reasoning from the 90-day consolidation floor. I bought at market for $370.14 because I didn't want to risk missing it. MSFT traded down to **$349.20 two days later** — the limit would have filled comfortably, and at better than $360.

That impatience cost about $162 on 16 shares: 33.7% instead of 37.5%. Trivial in dollars, and the most instructive line in this whole post. I built the limit-price feature, I read its reasoning, I agreed with it, and I overrode it anyway because a 91% STRONG BUY made me feel like I was about to miss something. The tool was right and the human was in a hurry.

The honest reading is less flattering:

- **A good thesis and a good outcome are different things.** Everything in that card was true on 23 June, and it would still have been true if MSFT had kept falling. "Buy the capitulation" works until the death cross the model waved past turns out to have meant something. I got the outcome; I can't claim the process is validated by it.
- **N=1.** If this trade had gone the other way, the same feature and the same reasoning would have produced the opposite anecdote — and I probably wouldn't be writing a section about it. That asymmetry is worth naming, because it's how every tool's success story gets written.
- **The split is unflattering to the plan.** That single off-plan position returned **33.7%** ($5,922 → $7,918). The other fourteen — only nine of which are the actual target allocation — returned the remaining $2.5k on a $26.6k base, about **9.4%**. My least disciplined decision beat my whole system by 24 points, which is either a lesson about signals or a lesson about small samples, and I genuinely don't know which.
- **44% of my gains in one unplanned position is a concentration risk**, not a result. I'd flag it red in anyone else's portfolio.

So I'm recording it, not celebrating it. Ask me again after the tenth watch-list buy.

### The bug this exposed

There's a design gap underneath the anecdote, and it's more useful than the anecdote.

Buying a watch-list ticker gives it nowhere to go. I took MSFT off `watching`, but I never gave it a `targetPortfolio` entry — so it became what the codebase calls a **held-only ticker**: held, no target, not watched. Its allocation gap is negative against an implied 0% target, which means:

- the daily brief renders it as HOLD/WAIT noise ("MSFT is N% overweight vs. a 0% target"), and
- the weekly rebalancing report hands it a standing **TRIM**, every week, forever.

My best-performing position is being told to sell itself on a schedule, because I bought it through a path that has no final step. The watch list can surface a ticker and it can hand me a signal, but there is no **promote to portfolio** — no moment where a watch-list buy becomes a target allocation with a real percentage.

I have [an approved design](https://github.com/furic/richfolio/blob/main/specs/2026-06-29-held-only-tickers-design.md) for half of it, written back in June, still unbuilt: split held-only tickers out of `items` into `untrackedItems` so they stop generating buy and trim recommendations while still counting toward portfolio value, beta, dividends and ETF overlap. That silences the noise.

It doesn't fix the real gap, though. Silencing the TRIM is not the same as deciding what MSFT's target weight should be, and that decision is mine, not the tool's. The most a tool can honestly do is stop pretending a deliberate off-plan holding is a rebalancing error — and then ask me the question.

One thing I can report without numbers: the frozen-data guard changed how much I trust the alerts, which is worth more than the alerts themselves — and the GOOG episode above is why I now trust them properly rather than just believing I should. Before the guard, a Telegram buzz meant "maybe something happened," and I'd started ignoring them. That's the real failure mode for a tool like this: not being wrong, but being noisy enough that you stop reading it.


## What connects all of this

Five incidents in one release window, and they're the same incident:

| The safeguard | Why it wasn't running | What I saw |
|---|---|---|
| Frozen-data deadband | watch tickers had no price in the map; the guard fails open on missing prices | an alert arrived, looking like a real move |
| STRONG BUY unanimity rule | one provider answered, so consensus short-circuits | a clean `91%` card, looking vetted |
| Fresh-price consistency | P/E and 52w position still computed off the stale close | a brief where every number looked like it agreed |
| Production `state/` | my local directory is a separate lineage from the Actions cache | a plausible file on disk with nothing to do with production |
| **The test suite itself** | `npm test` enumerated three filenames by hand, so new test files never ran | `104 passing`, green, confident |

That last one deserves its own moment. I wrote nine tests for the v1.9 fix, ran the suite, watched it report a clean pass — and the count hadn't moved, because the runner was a hardcoded list of three files:

```diff
- "test": "node --import=tsx/esm --test test/util.test.ts test/social.test.ts test/intradayCompare.test.ts"
+ "test": "node --import=tsx/esm --test test/*.test.ts"
```

**A test that isn't executed looks exactly like a test that passed.** I had spent the previous hour writing about precisely this failure mode, in the tool I was using to verify the fix for it. The real total was 113 all along, with 9 of them not running.

None of these five threw. Nothing logged a warning. In every case the degraded output was rendered in exactly the same visual language as the healthy output, which is why they all survived for weeks and why I found each one by accident rather than by looking.

The shared root cause isn't carelessness in any single diff — each is defensible in isolation, and I'd approve all five in review today. It's that **I only ever tested the presence of a check, never its absence.** I had tests proving the deadband suppresses noise. I had none asking which tickers it could see. I had a unanimity rule with a clear spec. I had nothing asserting it was in force on the run that produced a STRONG BUY. I had a green suite. I had nothing checking the suite was running what I thought it was.

Three practices I'm taking forward:

1. **Every fail-open branch gets a log line.** If a guard waves something through because data was missing, that's an event, not a non-event. Silence should mean "checked and fine," never "couldn't check."
2. **Test the inputs, not just the behaviour.** The regression test that would have caught the GOOG bug isn't "does the guard suppress noise" — it always did, when it ran. It's "does every ticker that can raise an alert have the data the guard requires?" That's a coverage assertion about inputs, and it's a different shape of test than I was writing.
3. **Degraded modes must be visibly degraded.** If two providers are configured and one answers, say so on the card. A guarantee I can silently lose is not a guarantee.

None of that is specific to portfolio tools or to AI. It's just what happens when you build defences and then only ever verify them on the day you wrote them.

## Still looking for alpha testers

Richfolio is open source and free to run: [github.com/furic/richfolio](https://github.com/furic/richfolio), docs at [furic.github.io/richfolio](https://furic.github.io/richfolio). Fork it, add your allocations to `config.json`, set a Gemini key, and GitHub Actions does the rest.

Most useful to me right now:

- **Non-US portfolios**, especially LSE/JSE tickers — the sub-unit currency guard above came out of exactly one such bug, and I doubt it's the last
- **Larger universes** (20+ tickers) — both truncation bugs this cycle came from a big universe, and mine isn't big
- **Anyone running both AI providers** — I'd like to know how often they actually disagree, on portfolios that aren't mine

Open an issue on the repo or DM me.
