<!--
YOAST FIELDS (paste into WordPress → Yoast sidebar)
  Focus keyphrase : AI buy signals
  SEO title       : Six Months of AI Buy Signals: The Honest Numbers
  Slug            : six-months-ai-buy-signals-results
  Meta description: What six months of AI buy signals returned on a real portfolio — up 13.8%,
                    why that number means less than it looks, and the trade that broke my plan.
  Images          : the MSFT STRONG BUY card (highest-value image in the series)
                    + weekly report before/after the held-only fix
  Categories      : Finance (main), Web Dev
  Tags            : AI Buy Signals, Richfolio, Investing, Side Project, RSI
  Feature image prompt (copy whole thing):
    Cinematic dark illustration, 1200x630 wide landscape banner. A dark archery
    target fills the right of the frame at a slight angle. A scatter of arrows is
    lodged around its outer rings, dull and unlit. One single arrow stands dead
    centre in the bullseye, glowing brilliant emerald green, throwing light and a
    long shadow across the target face and into the dark. Deep midnight blue and
    black, volumetric dust in the light beam. Dramatic lighting, high contrast,
    rich saturated colour, shallow depth of field, editorial magazine quality,
    highly detailed. No text, no letters, no numbers, no logos, no people.
  Feature image alt: AI buy signals — one glowing arrow in the bullseye
  LinkedIn post   : blog/linkedin/4-six-months-results.txt (paste-ready, no indent)
  Note            : ~2,000 words. Add a "not financial advice" line if your blog doesn't
                    already carry one — this post shows a real position.
-->

# Six months of AI buy signals: the honest numbers

*Part 4 of 4 — the results. [Part 1: every safety net failed silently](https://www.richardfu.net/ai-portfolio-monitoring-silent-failures/) · [Part 2: the free stack](https://www.richardfu.net/free-llm-api-two-model-stack/) · [Part 3: publishing signals](https://www.richardfu.net/linkedin-api-approval-rejected-organizational-website/)*

The first three parts were about how my portfolio monitor works and how its safeguards failed. This one is the question everybody actually asks: do the **AI buy signals** make money?

The portfolio is up **13.8% on cost basis**. Last post, three months ago, that number was 6%. I'll keep the balances to myself — the ratios are the only part that carries information anyway, and a tool whose whole design premise is "don't publish your position sizing" is a poor place to publish mine.

Now the four reasons that number tells you much less about the AI buy signals than it looks like it does.

## Four caveats before you read anything into it

- **It's return on capital deployed, not a time-weighted return.** I've been adding cash throughout, as the tool flagged gaps — that's what it's for. So a dollar that went in last week counts the same as one from February. You can't line this up against "the S&P did X% over the same window" and call the difference alpha.
- **The market was up too.** Most of 13.8% is beta, not skill. I haven't done the work to separate them, and I'm suspicious of anyone claiming they have on a six-month sample.
- **One portfolio is not a backtest.** N=1, no control, and I chose which AI buy signals to act on. The tool suggests; I still click the button.
- **Six months is noise.** Any strategy can look good over one up-trending half-year.

What I'd actually want to know about these AI buy signals — whether the STRONG BUY gate has predictive value — needs far more STRONG BUYs than it has produced, which is by design. [The unanimity rule](https://www.richardfu.net/free-llm-api-two-model-stack/) made them rarer still. Ask me in two years.

## The uncomfortable part: my best trade broke my own plan

**44% of that gain came from a single position, MSFT.** And MSFT was never in my target allocation.

It was on the **watch list**: a feature for tickers I'm interested in but haven't committed to a target weight. On 23 June it came back a STRONG BUY at 91% confidence, Value A. I read the thesis and bought at $370.14. Off-plan, discretionary, exactly the kind of decision allocation targets exist to prevent.

Here's the card, verbatim:

> **MSFT** · STRONG BUY · Value A · 91%
>
> (watch) Exceptional confluence of oversold signals at multi-year lows. Forward P/E of 19.0 is below its historical avg of 22.7 — rare for MSFT. RSI at 9.3 is at an extreme oversold reading, Stochastic %K at 0.3 is deeply oversold, and Bollinger %B at 0.04 is at the lower band — 3 momentum signals plus 3 price-level signals (52w position 6%, below 200MA -18.5%, below 50MA -11%). Analyst target of $561 implies ~53% upside. ROE 34%, Debt/Equity 30% — strong fundamentals. Historical conviction has been strengthening over 5+ days. Only risk flag is the earnings event in 37 days and OBV falling, but the technical oversold extreme overwhelmingly dominates. Death cross is present but typical during sharp drawdowns at capitulation lows.
>
> **Momentum:** bearish · RSI 9.3 · 50MA $412.86 (-11%) · 200MA $450.66 · death cross · MACD hist -5.513 · %B 0.04
> **Limit order:** $360 — near the recent consolidation floor visible in the 90-day range (10th percentile ~$354); provides a small buffer below current price of $367
> **Bottom signal:** RSI < 10 (extreme oversold), Stochastic %K < 5, price below 200MA (-18.5%), death cross — 4 bottom indicators present

**RSI 9.3 on a mega-cap.** I had to re-read that. Sub-10 RSI on the largest companies in the world is close to a non-event historically — it's the kind of reading you get in a capitulation, which is precisely what the reasoning says.

The generous reading is that the feature did its job, and I'd go further: this is not a marginal call the gate waved through. Six independent signals, four bottom indicators, forward P/E below its own historical average, and — the part I care most about — **the risks are named, not buried.** Death cross present. OBV falling. Momentum bearish. Earnings in 37 days. The model argued *past* those rather than omitting them, and left me a written thesis I could audit six weeks later.

That auditability is the real product. AI buy signals you can't interrogate afterwards are just a number with a colour.

The "historical conviction has been strengthening over 5+ days" line is the reasoning-persistence store paying off, too. Three features compounding: the watch list surfaced a ticker I didn't own, the bottom-fishing model caught the extreme, and the 7-day history confirmed it wasn't a one-day blip.

There's also a fourth mechanism that was supposed to be involved and wasn't — the cross-model agreement check silently didn't run on this signal, because one provider was down that day. That story is [Part 1](https://www.richardfu.net/ai-portfolio-monitoring-silent-failures/), and it's the reason v1.9 exists.

## Then I ignored the one instruction it gave me

The card says **set a limit at $360**, reasoning from the 90-day consolidation floor. I bought at market for $370.14 because I didn't want to risk missing it.

MSFT traded down to **$349.20 two days later**. The limit would have filled comfortably, and at better than $360.

That impatience cost about four percentage points: 33.7% instead of 37.5%. Trivial in absolute terms, and the most instructive line in this whole series. I built the limit-price feature, I read its reasoning, I agreed with it, and I overrode it anyway because a 91% STRONG BUY made me feel like I was about to miss something.

The tool was right and the human was in a hurry. If you build AI buy signals for yourself, budget for that — the failure mode isn't the model, it's you at 11pm deciding you know better.

## The honest reading

- **A good thesis and a good outcome are different things.** Everything in that card was true on 23 June, and it would still have been true if MSFT had kept falling. "Buy the capitulation" works until the death cross the model waved past turns out to have meant something. I got the outcome; I can't claim the process is validated by it.
- **N=1.** If this trade had gone the other way, the same feature and the same reasoning would have produced the opposite anecdote — and I probably wouldn't be writing a section about it. That asymmetry is worth naming, because it's how every tool's success story gets written.
- **The split is unflattering to the plan.** That single off-plan position returned **33.7%**. The other fourteen — only nine of which are the actual target allocation — returned the remaining 56% of the gains on a much larger base, about **9.4%**. My least disciplined decision beat my whole system by 24 points, which is either a lesson about signals or a lesson about small samples, and I genuinely don't know which.
- **44% of gains in one unplanned position is a concentration risk**, not a result. I'd flag it red in anyone else's portfolio.

So I'm recording it, not celebrating it — one lucky trade is not evidence about AI buy signals in general. Ask me again after the tenth watch-list buy.

## The bug this exposed

There's a design gap underneath the anecdote, and it's more useful than the anecdote.

Buying a watch-list ticker gives it nowhere to go. I took MSFT off `watching`, but never gave it a target allocation — so it became what the codebase calls a **held-only ticker**: held, no target, not watched. Its allocation gap is permanently negative against an implied 0% target, which means:

- the daily brief rendered it as HOLD/WAIT noise ("MSFT is N% overweight vs. a 0% target"), and
- the weekly rebalancing report handed it a standing **TRIM**, every week, forever.

My best-performing position was being told to sell itself on a schedule, because I bought it through a path with no final step. The watch list can surface a ticker and hand me a signal, but there is no **promote to portfolio** — no moment where a watch-list buy becomes a target allocation with a real percentage.

I'd written [a design for half of it](https://github.com/furic/richfolio/blob/main/specs/2026-06-29-held-only-tickers-design.md) back in June, before MSFT gave me a reason to care — the standing TRIM was already visible on other holdings, just not on one I felt anything about. It shipped in v1.10: held-only tickers route to a separate `untrackedItems` array, so they stop generating buy and trim recommendations while still counting toward portfolio value, beta, dividends and ETF overlap. The weekly report now lists them neutrally — value and current %, no action verb.

The nice side effect is token cost. Every consumer that feeds the AI iterates the tracked-items array, so removing them from it took them out of the prompt entirely. Four tickers I was paying to have opinions generated about, opinions I could never act on.

That still doesn't fix the real gap. Silencing the TRIM is not the same as deciding what MSFT's target weight should be, and that decision is mine, not the tool's. The most a tool can honestly do is stop pretending a deliberate off-plan holding is a rebalancing error — and then leave the question with me.

One more thing I only noticed while implementing it. Two other holdings, MU and MRVL, sit in both `currentHoldings` **and** `watching`, because I bought them off watch-list signals and never cleaned up. That combination accidentally did the right thing all along: watched tickers were already excluded from the allocation table, so those two never got the standing TRIM the others did. I'd been running the fix by hand, on two tickers, without knowing it.

## Where that leaves the experiment

Six months in, the honest summary is that I can't tell you whether AI buy signals beat buying the index, and neither can anyone else with one portfolio and one up-trending half-year. What I can tell you is what changed about *using* it: I read the briefs again. Before the frozen-data guard, a Telegram buzz meant "maybe something happened," and I'd started ignoring them.

That's the real failure mode for a tool like this — not being wrong, but being noisy enough that you stop reading it. Fixing the noise was worth more than any individual recommendation — AI buy signals you've stopped opening are worth exactly nothing.

## Still looking for alpha testers

Richfolio is open source and free to run: [github.com/furic/richfolio](https://github.com/furic/richfolio), docs at [furic.github.io/richfolio](https://furic.github.io/richfolio). Fork it, add your allocations to a config file, set a Gemini key, and GitHub Actions does the rest.

Most useful to me right now:

- **Non-US portfolios**, especially LSE/JSE tickers — the sub-unit currency guard in [Part 1](https://www.richardfu.net/ai-portfolio-monitoring-silent-failures/) came out of exactly one such bug, and I doubt it's the last
- **Larger universes** (20+ tickers) — both truncation bugs this cycle came from a big universe, and mine isn't big
- **Anyone running two AI providers** — Gemini + Mistral is now free on both sides, so this costs nothing to try. I'd like to know how often two models actually disagree on portfolios that aren't mine, because the unanimity rule is only worth its complexity if that number is meaningfully above zero

Open an issue on the repo or DM me.

*Nothing here is financial advice. It's a description of a tool I built for myself and the mistakes I made using it.*
