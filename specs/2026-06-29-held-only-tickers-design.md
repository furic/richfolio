# Design: Drop held-only tickers from the daily brief and weekly TRIM

**Date:** 2026-06-29
**Status:** Approved

## Problem

Tickers that are in `config.json` `currentHoldings` but have **no** `targetPortfolio`
allocation (and are not in `watching`) produce low-value output:

- **Daily brief:** they always render as `HOLD` / `WAIT` ("X is N% overweight vs. 0%
  target — no allocation gap to close"). Richfolio is buy-only by design (the AI prompt,
  guards, and `suggestedBuyValue` all assume "close an underweight gap"), so there is no
  real sell logic behind these messages — they are noise.
- **Weekly rebalancing report:** they always render with a `TRIM` / `SELL` action,
  because their allocation gap is negative (target 0% < current %). This is misleading —
  the user holds these deliberately and does not want a standing trim suggestion.

The user keeps these extra holdings in `currentHoldings` on purpose: to keep portfolio
totals honest and to inform ETF overlap. They should remain configured, but stop
generating buy/sell recommendations.

## Definitions

- **held-only ticker:** present in `currentHoldings`, absent from `targetPortfolio`,
  absent from `watching`. Examples in the user's config: AAPL, AMZN, INTC, TSM, MSFT.
- A ticker present in **both** `targetPortfolio` and `currentHoldings` (e.g. VOO) is a
  normal target holding and is **unaffected**.
- A ticker in `targetPortfolio` but not held (e.g. SMH with 0 shares) stays a normal
  underweight target holding and is **unaffected**.

## Goals

1. Held-only tickers no longer appear in the **daily** AI recommendations or the daily
   email allocation table.
2. Held-only tickers no longer receive a **TRIM/SELL** action in the weekly report; they
   appear only in the neutral "Holdings Not in Target Portfolio" list.
3. Portfolio **value, beta, and dividend** totals continue to reflect *all* real
   holdings, including held-only tickers.
4. ETF **overlap** discounting against held-only tickers continues to work.
5. No held-only ticker is sent to the AI (zero token cost on them).

## Non-goals

- No sell-timing / SELL-signal logic is added. Richfolio stays buy-only.
- `currentHoldings` config is **not** changed; the user keeps their extra holdings.
- The ETF overlap feature is **not** removed (it is pure math in `analyze.ts`, not an AI
  call, and costs no tokens).
- The weekly report's `overweight` / `onTarget` / `underweight` sections are unchanged.

## Design

### 1. `src/analyze.ts` — the one structural change

The item-build loop currently iterates `targetPortfolio ∪ currentHoldings` (minus
`watching`) and pushes every ticker into a single `items` array. Split the output:

- `items: AllocationItem[]` — tickers **with** a `targetPortfolio` entry (today's
  behavior, minus held-only tickers).
- `untrackedItems: AllocationItem[]` — **new**. Held-only tickers (held, no target, not
  watching). Built with the identical `AllocationItem` construction (same fields:
  price, currentPct, gapPct, P/E, beta, dividend, 52w, etc.) so downstream renderers can
  reuse them without special-casing.

Routing rule inside the loop, for each non-watching ticker with a quote: if the ticker
has a `targetPortfolio` entry → `items`; otherwise (present only because it's held) →
`untrackedItems`.

Add `untrackedItems: AllocationItem[]` to the `AllocationReport` interface and the
returned object.

**Aggregate accuracy:** the portfolio-beta loop and the estimated-annual-dividend loop
currently iterate `items`. Change both to iterate `[...items, ...untrackedItems]` so
held-only holdings still count toward beta and dividend totals. `totalCurrentValue` is
summed independently from `currentHoldings` and is unaffected. The ETF overlap discount
reads `currentHoldings` directly and is unaffected.

### 2. Daily brief — no code change

`src/providers/prompts.ts` (AI prompt) and `src/email.ts` (daily recs filter + allocation
table) iterate `report.items`. Once held-only tickers are no longer in `items`, they
disappear from the AI prompt, the daily recommendations, and the daily allocation table
automatically. No edits required in these files.

Consequence: held-only tickers are not sent to the AI at all → zero tokens spent on them.

### 3. Weekly report — `src/weeklyEmail.ts`

The weekly report must keep showing held-only holdings, but without a TRIM/SELL action.

- **Rebalancing action table:** the `sorted` source becomes `report.items` only (held-only
  tickers removed from the action table → no `actionLabel` → no TRIM/SELL). The existing
  `.filter((i) => i.targetPct > 0 || i.currentValue > 0)` can be simplified to
  `targetPct > 0` since all `items` now have a target; keep behavior equivalent.
- **"Holdings Not in Target Portfolio" neutral list:** change `noTarget` to be sourced
  from `report.untrackedItems` (it currently filters `items` for
  `targetPct === 0 && currentValue > 0`). Renders ticker, value, and current % — no action
  verb. This is where MSFT et al. appear.
- **`hasCrossCurrency`:** check across `[...report.items, ...report.untrackedItems]` so a
  cross-currency held-only ticker still triggers the FX footnote.
- **`overweight` / `onTarget` / `underweight`:** already filter `targetPct > 0`; held-only
  tickers (targetPct 0) never matched these, so no change.
- **"On Target X/Y" stat:** denominator `report.items.filter((i) => i.targetPct > 0)` is
  unchanged and still correct.

### 4. Known behavior change

`npm run refresh -- MSFT` on a held-only ticker will no longer produce a recommendation,
because the ticker is no longer in `report.items`. The price fetch still works
(`allUniqueTickers()` includes `currentHoldings`), but there is no allocation item to
analyze. To get an opinion on a holding, move it to `watching`. Exact refresh handling
will be confirmed during implementation; if it errors ungracefully, add a clear message
("MSFT is a held-only ticker with no target allocation — add it to `watching` for
analysis").

## Testing

Unit tests for `runAnalysis` (new `test/analyze.test.ts`, pure function, no network —
construct a `priceData` map fixture):

1. A held-only ticker (in `currentHoldings`, not in `targetPortfolio`, not in `watching`)
   lands in `untrackedItems` and **not** in `items`.
2. A ticker in both `targetPortfolio` and `currentHoldings` stays in `items` (not in
   `untrackedItems`).
3. A `targetPortfolio` ticker with zero held shares stays in `items`.
4. A `watching` ticker appears in `watchingItems` and in neither `items` nor
   `untrackedItems`.
5. `portfolioBeta` and `estimatedAnnualDividend` include the contribution of a held-only
   ticker (i.e. totals reflect held-only holdings, proving the aggregate loops iterate
   both arrays).

Run `npm run typecheck` and `npm test`.

## Files touched

- `src/analyze.ts` — split `items`/`untrackedItems`, extend `AllocationReport`, fix
  beta/dividend loops.
- `src/weeklyEmail.ts` — re-point `noTarget` to `untrackedItems`, restrict action table
  to `items`, broaden `hasCrossCurrency`.
- `test/analyze.test.ts` — new unit tests.
- (No change to `src/providers/prompts.ts`, `src/email.ts`, `config.json`.)
