# International currency support — design

**Issue:** [#7](https://github.com/furic/richfolio/issues/7)
**Date:** 2026-04-28
**Status:** Approved (pending implementation)

## Context

Richfolio currently assumes all ticker prices are USD-denominated. This is incorrect for non-US tickers — UK LSE stocks quote in GBp (pence), Frankfurt-listed funds quote in EUR, etc. The existing `totalPortfolioValueUSD` config field hardcodes the USD assumption into the schema.

This design adds first-class currency support: per-ticker currency detection, FX conversion to a user-configured default, and currency-aware display in emails / Telegram / AI prompts.

## Goals

1. Support portfolios where holdings are quoted in different currencies.
2. Display all monetary values in the user's preferred default currency.
3. Make the AI's reasoning currency-consistent (no mixed-currency comparisons).
4. Handle the GBp sub-unit edge case correctly (LSE quotes are 100× the GBP value).
5. Fail gracefully when an FX rate can't be fetched — skip the affected ticker, keep the rest of the brief.

## Non-goals

- Per-display original-currency annotation. Single-currency UI.
- Disk-persisted FX cache or staleness fallback. Run is idempotent; next run refetches.
- FX sanity-checking (out-of-band detection of bad Yahoo data).
- Backwards compatibility with the old `totalPortfolioValueUSD` field — hard-cut rename with a clear migration error.
- Multi-currency arithmetic via a `Money` type. Approach A (convert at boundary) keeps the rest of the codebase number-typed.

## Approach (chosen: A — convert at boundary)

Conversion happens once per ticker inside `src/fetchPrices.ts` after Yahoo returns. Every consumer downstream (analyze, aiAnalysis, emails, Telegram) sees prices already in the default currency. Single source of truth, minimal touchpoints.

Rejected alternatives:
- **B (convert at display)** — every display site has to remember to convert; one missed call is a silent bug.
- **C (Money value type)** — type-safe but a 17-file refactor for a personal tool. Disproportionate.

## Config schema

```jsonc
{
  "targetPortfolio": { ... },
  "currentHoldings": { ... },
  "totalPortfolioValue": 50000,        // renamed from totalPortfolioValueUSD
  "defaultCurrency": "USD",            // new; ISO 4217
  "intradayAlerts": { ... }
}
```

Loader behavior in `src/config.ts`:
- If `totalPortfolioValueUSD` is present (regardless of new fields), throw with: `"totalPortfolioValueUSD is deprecated. Rename to totalPortfolioValue and add defaultCurrency (e.g. \"USD\"). See config.example.json."`
- If `defaultCurrency` is missing, default to `"USD"` and log a one-line warning.
- Validate `defaultCurrency` against an allowlist (USD, GBP, EUR, AUD, CAD, JPY, CHF, HKD, SGD, NZD). Hard error on unknown — easy to extend later.

Files updated for the rename: `config.example.json`, `docs/how-it-works.md` (line 69 references `totalPortfolioValueUSD`), `README.md` if it mentions the old name, the GitHub Actions Variables (`CONFIG_JSON` content) — that last one is user-side, flagged in the PR description.

## Components

### New: `src/fetchFx.ts`

```ts
export async function fetchFxRates(
  fromCurrencies: string[],
  toCurrency: string
): Promise<Record<string, number>>
```

- Returns `{ GBP: 1.27, EUR: 1.08, USD: 1, ... }` (rate to multiply a `from`-denominated amount to get `to`).
- Skips when `from === to` (rate = 1).
- Queries `${from}${to}=X` per Yahoo convention via the same `yahoo-finance2` instance.
- In-memory `Map` keyed by `${from}_${to}`, scoped to the run (no disk persistence).
- On individual fetch failure: omits that key from the returned map. Caller decides what to do.

### Modified: `src/fetchPrices.ts`

`QuoteData` interface gains:
```ts
currency: string;          // always equals defaultCurrency (post-conversion)
originalCurrency: string;  // raw Yahoo currency (audit / logging)
```

Converted fields (USD-denominated values become defaultCurrency-denominated):
`price`, `fiftyTwoWeekHigh`, `fiftyTwoWeekLow`, `marketCap`, `freeCashflow`, `operatingCashflow`, `targetMeanPrice`, `postMarketPrice`, `preMarketPrice`.

Untouched (unitless or percent): `trailingPE`, `forwardPE`, `avgPE`, `fiftyTwoWeekPercent`, `dividendYield`, `beta`, `returnOnEquity`, `debtToEquity`, `profitMargins`, `revenueGrowth`, `earningsGrowth`, `daysToEarnings`.

New flow inside `fetchPrices()`:
```
1. fetch all tickers via Yahoo (existing parallel logic, raw prices).
2. collect unique source currencies, including sub-unit fixes (GBp → GBP).
3. fetchFxRates(uniqueCurrencies, defaultCurrency) — single batch.
4. for each ticker:
   a. unit fix: SUB_UNIT_FIX[currency] applies (price /= 100, currency upgraded).
   b. fxRate = rates[currency] (1 if currency === defaultCurrency).
   c. if fxRate undefined → skip ticker, log warn, push ticker to a "skipped" list.
   d. convert all monetary fields × fxRate.
   e. emit QuoteData with currency = defaultCurrency, originalCurrency preserved.
5. return { quotes, skipped: ["TICKER (CURRENCY)", ...] }.
```

Sub-unit map (extensible):
```ts
const SUB_UNIT_FIX: Record<string, { realCurrency: string; divisor: number }> = {
  GBp: { realCurrency: "GBP", divisor: 100 },  // LSE pence
  GBX: { realCurrency: "GBP", divisor: 100 },  // alias seen in some feeds
  ILA: { realCurrency: "ILS", divisor: 100 },  // TASE agorot
  ZAc: { realCurrency: "ZAR", divisor: 100 },  // JSE cents
};
```

### Modified: `src/fetchTechnicals.ts`

Chart OHLCV from `yahooFinance.chart()` is in the ticker's native currency. Two options:
- **Convert OHLCV before computing indicators** (chosen) — rebases the whole 365-day window using the current FX rate. Tiny error if FX has drifted across the window, but indicator outputs (sma50, sma200, atr14, bollinger, recent7d/30d lows) come out in defaultCurrency naturally.
- Convert just the headline outputs after computing — simpler conversion math but the FX-window-drift error is identical, plus more sites to remember to convert.

Pass an FX rate map (or a converter callback) into `fetchTechnicals`. For tickers whose source currency has no rate (FX failed earlier), skip the technical fetch entirely (matches the "skipped tickers" set from `fetchPrices`).

### Modified: `src/analyze.ts`

`Math.max(totalCurrentValue, totalPortfolioValueUSD)` at line 48 → `Math.max(totalCurrentValue, totalPortfolioValue)`. Both numbers are now in the same currency by construction. No other changes — the math is currency-agnostic once everything's in the same unit.

### New: currency formatter

Replaces the duplicated `fmt$` helpers. Lives in `src/util.ts` (alongside `escapeHtmlAttr`):

```ts
export function formatMoney(amount: number, currency: string): string;
```

Format rules:
- `USD` → `"$1,234"`
- `GBP` → `"£1,234"`
- `EUR` → `"€1,234"`
- `JPY` → `"¥1,234"` (no decimals — JPY has no minor unit)
- `AUD` / `CAD` / `NZD` → `"A$1,234"` / `"CA$1,234"` / `"NZ$1,234"`
- `CHF` → `"CHF 1,234"`
- `HKD` → `"HK$1,234"`
- `SGD` → `"S$1,234"`
- fallback → `"1,234 XXX"` (3-letter code suffix)

Uses `Intl.NumberFormat` for locale-aware grouping. JPY-style "no decimals" rule comes from `currency` formatter when `maximumFractionDigits: 0` is set for the JPY case.

Each module that builds output binds locally:
```ts
const fmt = (n: number) => formatMoney(n, defaultCurrency);
```

Removes the four duplicated `fmt$` helpers in `email.ts`, `intradayEmail.ts`, `weeklyEmail.ts`, `telegram.ts`.

### Modified: AI prompts

`src/aiAnalysis.ts` (Stage 1 + Stage 2) and `src/detailedAnalysis.ts`:

- Add a one-line preamble: `"All monetary values in this prompt are denominated in {defaultCurrency} unless otherwise stated."`
- For tickers where `originalCurrency !== defaultCurrency`, append `"(native: 22.50 GBp)"` after the converted price in the per-ticker data block. Audit-only — gives the model context so its reasoning can mention "this UK-listed stock" without sounding confused about magnitudes.

### Modified: email / Telegram render

- Header card shows currency context once, e.g. `"Holdings Value · USD: $25,567"` or `"Holdings Value · GBP: £20,140"`.
- `fmt$` → `formatMoney(_, defaultCurrency)` everywhere.
- Footer note (only when ≥1 ticker has `originalCurrency !== defaultCurrency`):
  > "Limit prices shown in {defaultCurrency} — check your broker's quote currency before placing an order."
- Skipped-tickers list (only when non-empty): brief footer line listing tickers we couldn't FX-convert.

## Data flow diagram

```
config.json
  ├─ defaultCurrency ─────────────────┐
  └─ targetPortfolio + holdings       │
                                      ▼
yahoo.quoteSummary(tickers)  ──► raw { price, currency }
                                      │
                                      ▼
              fetchFxRates(unique source currencies, defaultCurrency)
                                      │
                                      ▼
        per ticker: unit-fix → fxConvert → QuoteData (in defaultCurrency)
                                      │
                                      ▼
        analyze, aiAnalysis (already-converted numbers throughout)
                                      │
                                      ▼
        email / Telegram (formatMoney, currency in header, footer caveats)
```

## Error handling

| Failure mode | Behavior |
|---|---|
| Yahoo `currency` field missing | Treat as `defaultCurrency`. `console.warn`. |
| Currency in `SUB_UNIT_FIX` (GBp etc.) | Auto divide-by-100 + currency upgrade. |
| FX fetch fails for currency X | Skip every ticker with that source currency. `console.warn`. Email footer notes the skip. Run continues. |
| FX fetch fails for ALL non-default currencies | Default-currency tickers still process. Same skip mechanic. |
| Unmapped sub-unit (lowercase 3-char currency we don't know) | No conversion. `console.warn` so future runs can add the mapping. Value will be off by 100× — visibly wrong, not silently. |
| `defaultCurrency` not in allowlist | Hard config-load error. Lists supported currencies. |
| `totalPortfolioValueUSD` still present in config | Hard config-load error pointing at migration. |
| Yahoo down entirely | Existing behavior unchanged — no prices, no email. |
| Crypto (BTC, ETH) when default ≠ USD | Yahoo returns `currency: "USD"` for `BTC-USD` / `ETH-USD`. Flows through the standard USD→default conversion. No special case needed — the GBP/EUR/etc. value of 1 BTC is the dollar price × FX rate, which is what we want. |

## Testing

No unit-test framework in repo. Following the established `scratch/` smoke-script pattern (untracked):

1. **`scratch/smoke-fx.ts`** — `fetchFxRates(["GBP","EUR","JPY","HKD","BTC"], "USD")` and print. Manual sanity check (GBP→USD ~1.25, etc.).
2. **`scratch/smoke-conversion.ts`** — fixture-driven. Synthetic GBp ticker (e.g. price `2250` representing TSCO.L at 22.50 GBP), assert post-conversion value ≈ `22.50 * fx(GBP→USD)`. Repeat for EUR.
3. **`scratch/smoke-money-format.ts`** — table test of `formatMoney` for USD/GBP/EUR/JPY/AUD/HKD with negative, zero, large values.
4. **End-to-end smoke** — temporarily add `TSCO.L` (GBP) and `SAP.DE` (EUR) to `targetPortfolio`, run `npm run dev`, eyeball: header shows correct currency, all values converted, footer caveat present, original currencies logged. Revert config.

Existing CI (`typecheck` + `format:check`) covers the rest.

## Files touched

**New:**
- `src/fetchFx.ts`

**Modified:**
- `src/config.ts` — schema rename, validation, allowlist
- `src/fetchPrices.ts` — currency capture, sub-unit fix, FX conversion, skip-list return
- `src/fetchTechnicals.ts` — accept FX map, convert OHLCV before indicators
- `src/analyze.ts` — single rename (`totalPortfolioValueUSD` → `totalPortfolioValue`)
- `src/aiAnalysis.ts` — prompt preamble + audit annotation
- `src/detailedAnalysis.ts` — prompt preamble + audit annotation
- `src/email.ts` — formatMoney, header currency, footer caveat, skipped list
- `src/intradayEmail.ts` — same pattern
- `src/weeklyEmail.ts` — same pattern
- `src/telegram.ts` — same pattern
- `src/util.ts` — add `formatMoney`
- `src/index.ts` — wire `defaultCurrency` from config to `fetchPrices`/`fetchTechnicals`

**Config & docs:**
- `config.example.json` — new schema
- `docs/how-it-works.md` — rename reference
- `README.md` — if old name appears

## Out of scope (future work)

- User option to display original currencies alongside converted (would require revisiting Approach A).
- Currency-aware historical comparisons (FX drift across the 365-day technicals window).
- Per-account currency (e.g. a USD account + a GBP ISA in the same brief).
- Adding currencies beyond the initial allowlist — trivial code change when needed.
