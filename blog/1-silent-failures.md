<!--
YOAST FIELDS (paste into WordPress → Yoast sidebar)
  Focus keyphrase : AI portfolio monitoring
  SEO title       : AI Portfolio Monitoring: Every Safety Net Failed Silently
  Slug            : ai-portfolio-monitoring-silent-failures
  Meta description: Six months of AI portfolio monitoring on GitHub Actions — and six
                    safeguards that silently stopped running while every output still
                    looked correct.
  Images          : hero = morning-debrief.png, alt "AI portfolio monitoring daily brief email"
                    + GOOG whipsaw inbox screenshot in "Then it happened again"
  Categories      : Web Dev (main), TypeScript, Finance
  Tags (as live)  : AI Portfolio Monitoring, Richfolio, Silent Failure, Side Project,
                    GitHub Actions
  Feature image prompt (copy whole thing):
    Cinematic dark tech illustration, 1200x630 wide landscape banner. A vast
    glowing lattice of fine amber-gold threads stretches across the frame like a
    web suspended in a dark cathedral of empty space, deep midnight blue and black
    behind it, volumetric haze catching the light. Near the centre one thread has
    snapped and its loose ends curl away, glowing hotter than the rest, a single
    spark drifting free. Dramatic rim lighting, high contrast, rich colour, shallow
    depth of field, moody and beautiful, editorial magazine quality, highly
    detailed. No text, no letters, no numbers, no logos, no people.
  Feature image alt: AI portfolio monitoring — a glowing lattice with one broken thread
  LinkedIn post   : blog/linkedin/1-silent-failures.txt (paste-ready, no indent)
  Note            : density will read orange at ~3,400 words. That is expected; don't stuff.
-->

*Part 1 of 4 — the safeguards. [Part 2: the free stack](https://www.richardfu.net/free-llm-api-three-model-stack/) · [Part 3: publishing signals](https://www.richardfu.net/linkedin-api-approval-rejected-organizational-website/) · [Part 4: what it returned](https://www.richardfu.net/six-months-ai-buy-signals-results/)*

Three months ago I wrote up [how Richfolio went from v1.0 to v1.6](https://www.richardfu.net/richfolio-three-months-in-ai-architecture-in-production/) — the guard pipeline, the two-stage Think/Plan prompt, the reasoning persistence, all of it borrowed from patterns I liked in OpenAlice. Richfolio is my **AI portfolio monitoring** system: a cron job that reads my holdings, asks two language models what to buy, and emails me a brief.

Four releases since then. [v1.7](https://github.com/furic/richfolio/releases/tag/v1.7.0) made the AI layer pluggable and put two providers side by side. [v1.8](https://github.com/furic/richfolio/releases/tag/v1.8.0) taught it to publish, to watch tickers I don't own, and to stop lying to me about prices. [v1.9](https://github.com/furic/richfolio/releases/tag/v1.9.0) and [v1.10](https://github.com/furic/richfolio/releases/tag/v1.10.0) are the ones I didn't plan — they exist entirely because of what writing this post turned up.

Those are the features. They're not what I learned.

What I learned is that I spent six releases building safeguards — a price-move deadband, a unanimity rule, a guard pipeline, a fail-open policy for missing data — and then discovered, one at a time, that **a safeguard which isn't running is indistinguishable from a safeguard that ran and approved.** Same alert in my inbox. Same clean number on the card. Same plausible file on my disk. Same green test suite. Six separate instances in one release window, and I found every one by accident — three of them while drafting this post, which is the part that should worry me most.

That's this post. The features are how I got there.

## What this AI portfolio monitoring system does now

Still one Node.js + TypeScript pipeline on GitHub Actions cron. No server, no dashboard, no database — just a `state/` directory cached between runs. [Part 2 covers the stack and architecture](https://www.richardfu.net/free-llm-api-three-model-stack/) if that's the interesting half for you.

Four modes:

- **Daily** (8am AEST) — allocation gaps, buy signals, news, the full brief
- **Intraday** (4× on weekdays) — re-runs the analysis, alerts only when a recommendation materially changes
- **Weekly** — rebalancing report
- **Refresh** (`npm run refresh -- SMH`) — re-analyze one ticker on demand

Output goes to email and Telegram, and optionally to social — [which turned out to be a story about approvals rather than code](https://www.richardfu.net/linkedin-api-approval-rejected-organizational-website/).

Everything below is about the intraday mode, because that's where an AI portfolio monitoring tool earns or destroys your trust.

## Case study: the day my AI portfolio monitoring alerts started whipsawing

This is the bug I'd share if I could only share one.

Late July, my Telegram lit up twice in ninety minutes:

```
4:32pm  VOO  BUY → STRONG BUY   64% → 87%   $670.63 → $673.20  (+0.38%)
6:05pm  VOO  STRONG BUY → BUY   87% → 76%   $673.20 → $672.00  (−0.18%)
```

My first instinct was that the AI was being flaky. It wasn't. I pulled both runs' technicals and they were **byte-identical** — same RSI, same MACD histogram, same Bollinger %B, to the last decimal. A 23-point confidence swing and back, on a ticker that had moved half a percent.

Here's why. Intraday technicals are computed from Yahoo **daily** candles, and a daily candle only updates at the US close. My four intraday crons were at 10am / 12pm / 2pm / 4pm AEST — every single one firing while the US market was shut. So on all four runs, the indicators feeding the AI were the same frozen numbers from the last US close.

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

The structural fix: the crons were badly placed to begin with. All four sat inside the US-closed dead zone because I'd picked times convenient for *me*, not times when the underlying data changes. Respaced ~3.75h apart across my waking window:

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

Two v1.8 features that don't compose, which is a recurring hazard in AI portfolio monitoring: the watch list can raise intraday alerts, and the guard that silences noisy intraday alerts couldn't see watch-list tickers. Neither feature is wrong in isolation. Nobody reviewing either diff would catch it.

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

**A fail-open guard cannot tell you it isn't running.** Mine had no way to distinguish "I checked and this is a real move" from "I had no data so I waved it through," and both outcomes look identical from outside: an alert arrives. I'd built a safety net, verified it on the case that motivated it, and never asked which inputs it silently didn't cover. Every day it did nothing on GOOG, the observable behaviour was the same as a working guard on a genuinely moving stock.

The concrete practice I'd extract: when a guard fails open, **the fail-open branch deserves a log line and a test of its own** — not just the happy path. And the regression test that matters is not "does the guard suppress noise" (it always did, when it ran). It's "does every ticker that can produce an alert have the data the guard needs?" That's a coverage question about the *inputs*, not a behaviour question about the function, and it's the test I didn't have:

```ts
test("every watch ticker gets a non-zero price (the guard needs > 0)", () => {
  const map = buildPriceMap(report);
  for (const w of report.watchingItems) {
    assert.ok(map[w.ticker] > 0, `${w.ticker} must have a price or the guard fails open`);
  }
});
```

## The price that lied

Same theme, different surface. Any AI portfolio monitoring pipeline has to decide which price is authoritative, and v1.7 already preferred the freshest quote — after-hours → pre-market → regular close — because a brief showing yesterday's close after an earnings gap is useless.

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

## The check that wasn't running

The most expensive instance involved no bug at all — just a rule that quietly had nothing to do.

Any AI portfolio monitoring setup running two models needs a policy for disagreement. Mine, at the time, was the **unanimity rule**: a STRONG BUY required *every* configured provider to vote STRONG BUY independently, otherwise the consensus capped at BUY. Four lines, and they were the whole justification for paying two models to look at the same portfolio. (It has since been replaced by a dissent-distance rule, for reasons that have nothing to do with this bug — [Part 2 has the current consensus logic](https://www.richardfu.net/free-llm-api-three-model-stack/).)

On 23 June my system produced the strongest signal it has ever produced: a STRONG BUY on MSFT at 91% confidence, with six independent entry signals and an RSI of 9.3. I'd already bought MSFT two days earlier, off an 88% card in the same run of signals, and I read this one as confirmation. [Part 4 covers what that trade did](https://www.richardfu.net/six-months-ai-buy-signals-results/).

Six weeks later, writing this, I went looking for the run — and found that **Gemini was down that day**, quota-exhausted. That STRONG BUY was one model, alone. So was the 21 June card I actually bought on. The rule hadn't run on either.

Which means the unanimity rule never ran:

```ts
function computeConsensusAction(scores: ProviderScore[]): string {
  if (scores.length === 0) return "HOLD";
  if (scores.length === 1) return scores[0].action;   // ← straight through
  // ... tally, tiebreak, then the unanimity rule
}
```

One provider, so the action passes through untouched. No unanimity check, because unanimity among one model is trivially satisfied.

This is the graceful degradation I wrote up in the v1.7 notes as a feature, and it *is* one — a provider hitting its quota shouldn't cost me the whole brief. But look at what it produced. My largest signal skipped the exact safeguard I'd built to make STRONG BUY mean something, and **nothing in the output said so.** No `avg` tag, no agreement badge, no "1 of 2 providers responded" line. Just a clean `91%`, identical in every visual respect to a vetted consensus.

**Graceful degradation is fail-open by another name.** When Gemini dropped out, the system silently downgraded from "two models must agree" to "one model decides" — a materially weaker guarantee, presented in exactly the same language as the strong one.

Which is the GOOG whipsaw wearing different clothes. There, a guard didn't run because its inputs were missing, and the output looked like a guard that had run and approved. Here, a rule didn't run because a provider was missing, and the output looked like a rule that had run and approved. Both times the absence of a check was invisible at exactly the moment it mattered.

[v1.9.0](https://github.com/furic/richfolio/releases/tag/v1.9.0) exists because of this. Every recommendation from a degraded run now carries what was lost:

```ts
degradation: { configured: 2, answered: 1, missing: ["Google Gemini"] }
```

and every surface says so. The email shows a `⚠ 1/2 AI` badge with the missing providers in the tooltip, Telegram shows the same tag — and both render **even in single-provider mode**, which is the entire point. That's exactly where the old code hid it.

Run that same 23 June brief through today's code and MSFT arrives as **STRONG BUY 91% ⚠ 1/2 AI**. Same analysis, same reasoning, same action — but labelled as the single-model call it actually was, which is the only thing I ever wanted from it.

v1.9 also demoted a degraded STRONG BUY to BUY, on the grounds that cross-provider agreement was part of the criteria and it demonstrably hadn't happened. That demotion is now opt-in and off by default: a provider that never answered isn't a dissenter, and the badge already tells you what you're looking at. The label was always the fix. The demotion was me deciding for myself in advance, in code, at 8am.

One case is deliberately left alone: if you only ever set one API key, nothing changes. That configuration never promised a comparison, so it isn't degraded — no cap, no badge. It has its own negative test, because getting that wrong would silently downgrade every single-key user's recommendations, which would be the same category of mistake in the opposite direction.

So capping is configurable (`ai.strongBuyRequiresAllProviders: true` brings it back). The badge isn't. Whether a lost guarantee should change the recommendation is a judgement call; whether you get told about it isn't.

## What connects all of this

Six incidents in one release window, and they're the same incident:

| The safeguard | Why it wasn't running | What I saw |
|---|---|---|
| Frozen-data deadband | watch tickers had no price in the map; the guard fails open on missing prices | an alert arrived, looking like a real move |
| STRONG BUY unanimity rule | one provider answered, so consensus short-circuits | a clean `91%` card, looking vetted |
| Fresh-price consistency | P/E and 52w position still computed off the stale close | a brief where every number looked like it agreed |
| Production `state/` | my local directory is a separate lineage from the Actions cache | a plausible file on disk with nothing to do with production |
| `AI_DETAILED_PROVIDER` fallback | validated once, then overridden downstream with the raw env value | a pinned provider that would fail every ticker |
| **The test suite itself** | `npm test` enumerated three filenames by hand, so new test files never ran | `104 passing`, green, confident |

The fifth annoys me most, because the fallback was *correct*. `pickDetailedProvider()` checked whether the pinned provider had an API key and fell back when it didn't. Then thirty lines later, the per-ticker loop did this:

```ts
explicitOverride === "gemini" || explicitOverride === "claude"
  ? (explicitOverride as DetailedProviderId)   // ← never verified it was configured
```

and threw the decision away. I'd written the guard, written the fallback, and then quietly bypassed both from the code that consumed them. A working safeguard and a bypassed one are indistinguishable until the day the bypass matters.

The last one deserves its own moment. I wrote nine tests for the v1.9 fix, ran the suite, watched it report a clean pass — and the count hadn't moved, because the runner was a hardcoded list of three files:

```diff
- "test": "node --import=tsx/esm --test test/util.test.ts test/social.test.ts test/intradayCompare.test.ts"
+ "test": "node --import=tsx/esm --test test/*.test.ts"
```

**A test that isn't executed looks exactly like a test that passed.** I had spent the previous hour writing about precisely this failure mode, in the tool I was using to verify the fix for it. The real total was 113 all along, with 9 of them not running.

None of these six threw. Nothing logged a warning. In every case the degraded output was rendered in exactly the same visual language as the healthy output, which is why they all survived for weeks and why I found each one by accident rather than by looking.

The shared root cause isn't carelessness in any single diff — each is defensible in isolation, and I'd approve all six in review today. It's that **I only ever tested the presence of a check, never its absence.** I had tests proving the deadband suppresses noise. I had none asking which tickers it could see. I had a unanimity rule with a clear spec. I had nothing asserting it was in force on the run that produced a STRONG BUY. I had a green suite. I had nothing checking the suite was running what I thought it was.

Four practices I'm taking forward:

1. **Every fail-open branch gets a log line.** If a guard waves something through because data was missing, that's an event, not a non-event. Silence should mean "checked and fine," never "couldn't check."
2. **Test the inputs, not just the behaviour.** The regression test that would have caught the GOOG bug isn't "does the guard suppress noise" — it always did, when it ran. It's "does every ticker that can raise an alert have the data the guard requires?" That's a coverage assertion about inputs, and a different shape of test than I was writing.
3. **Degraded modes must be visibly degraded.** If two providers are configured and one answers, say so on the card. A guarantee I can silently lose is not a guarantee.
4. **Testability is a design constraint, not a chore.** Two modules I needed to test couldn't be imported at all: `config.ts` reads `config.json` at module load and *throws* when it's absent, and CI runs without one — so anything importing it, directly or three hops away, was permanently untestable. That's not a testing problem, it's a coupling problem wearing a testing problem's clothes. Both got split into a pure module taking config as an argument and a thin wrapper injecting it. The tests I wanted became possible the moment the coupling went.

None of that is specific to AI portfolio monitoring, or to AI at all. It's what happens when you build defences and then only ever verify them on the day you wrote them.

An AI portfolio monitoring tool's real failure mode isn't being wrong — it's being noisy enough that you stop reading it. I'd started ignoring my own Telegram alerts before the frozen-data guard shipped. The reason I trust them now isn't that I added a guard; it's that I went and checked the guard was running.

---

**Next:** [Part 2 — the free LLM API stack behind it](https://www.richardfu.net/free-llm-api-three-model-stack/), including the provider I had to replace when its balance ran out.

Richfolio is open source: [github.com/furic/richfolio](https://github.com/furic/richfolio) · [docs](https://furic.github.io/richfolio)
