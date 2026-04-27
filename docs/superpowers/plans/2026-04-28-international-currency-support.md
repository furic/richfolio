# International Currency Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Richfolio price-aware of non-USD tickers by converting all monetary values to a user-configured default currency at the fetch boundary, then displaying everything in that single currency.

**Architecture:** Convert at boundary (Approach A from spec). `fetchPrices.ts` captures Yahoo's per-ticker `currency` field, applies sub-unit fix for `GBp`/`GBX`/`ILA`/`ZAc`, looks up FX rates via a new `fetchFx.ts` module, and emits `QuoteData` with all monetary fields already in `defaultCurrency`. Downstream code (analyze, AI, emails, Telegram) reads already-converted numbers — no per-site conversion logic. New `formatMoney` helper replaces the four duplicated `fmt$` helpers.

**Tech Stack:** TypeScript ESM (strict), `tsx`, `yahoo-finance2` v3, no test framework — smoke scripts under `scratch/` (untracked) per existing repo convention.

**Branch:** `feat/issue-7-currency-support` (already created off main, with the spec already committed).

**Spec:** [docs/superpowers/specs/2026-04-28-international-currency-support-design.md](../specs/2026-04-28-international-currency-support-design.md)

**Verification cadence:** After each implementing task, run `npm run typecheck` and `npm run format:check`. Both must pass before commit. Format issues auto-fix with `npm run format`.

---

## Task 1: Add `formatMoney` helper to `src/util.ts`

**Files:**
- Modify: `src/util.ts` (append a new exported function)
- Smoke (untracked): `scratch/smoke-money-format.ts`

- [ ] **Step 1: Write the smoke script**

Create `scratch/smoke-money-format.ts`:

```ts
import { formatMoney } from "../src/util.js";

const cases: Array<[number, string, string]> = [
  // [amount, currency, expected]
  [1234, "USD", "$1,234"],
  [1234.56, "USD", "$1,235"],
  [0, "USD", "$0"],
  [-500, "USD", "-$500"],
  [1234, "GBP", "£1,234"],
  [1234, "EUR", "€1,234"],
  [1234, "JPY", "¥1,234"],
  [1234.56, "JPY", "¥1,235"],
  [1234, "AUD", "A$1,234"],
  [1234, "CAD", "CA$1,234"],
  [1234, "NZD", "NZ$1,234"],
  [1234, "CHF", "CHF 1,234"],
  [1234, "HKD", "HK$1,234"],
  [1234, "SGD", "S$1,234"],
  [1234, "ZZZ", "1,234 ZZZ"], // fallback
];

let failures = 0;
for (const [amount, currency, expected] of cases) {
  const got = formatMoney(amount, currency);
  const ok = got === expected;
  console.log(`${ok ? "PASS" : "FAIL"}  formatMoney(${amount}, ${currency}) = ${JSON.stringify(got)}${ok ? "" : `  (expected ${JSON.stringify(expected)})`}`);
  if (!ok) failures++;
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nAll cases passed.");
```

- [ ] **Step 2: Run smoke to verify it fails**

```bash
npx tsx scratch/smoke-money-format.ts
```

Expected: TypeScript error / ImportError because `formatMoney` doesn't exist yet.

- [ ] **Step 3: Implement `formatMoney`**

Append to `src/util.ts`:

```ts
// Currency formatter — replaces the duplicated fmt$ helpers across email/telegram modules.
// Uses Intl.NumberFormat for locale-aware grouping. Symbol mapping per the spec.
const CURRENCY_FORMAT: Record<string, { prefix: string; decimals: number }> = {
  USD: { prefix: "$", decimals: 0 },
  GBP: { prefix: "£", decimals: 0 },
  EUR: { prefix: "€", decimals: 0 },
  JPY: { prefix: "¥", decimals: 0 },
  AUD: { prefix: "A$", decimals: 0 },
  CAD: { prefix: "CA$", decimals: 0 },
  NZD: { prefix: "NZ$", decimals: 0 },
  CHF: { prefix: "CHF ", decimals: 0 },
  HKD: { prefix: "HK$", decimals: 0 },
  SGD: { prefix: "S$", decimals: 0 },
};

export function formatMoney(amount: number, currency: string): string {
  const fmt = CURRENCY_FORMAT[currency];
  if (!fmt) {
    // Fallback: digits + ISO code suffix
    const rounded = Math.round(amount).toLocaleString("en-US");
    return `${rounded} ${currency}`;
  }
  const negative = amount < 0;
  const rounded = Math.round(Math.abs(amount)).toLocaleString("en-US", {
    minimumFractionDigits: fmt.decimals,
    maximumFractionDigits: fmt.decimals,
  });
  return `${negative ? "-" : ""}${fmt.prefix}${rounded}`;
}
```

- [ ] **Step 4: Run smoke — should pass**

```bash
npx tsx scratch/smoke-money-format.ts
```

Expected: `All cases passed.`

- [ ] **Step 5: Verify typecheck + format**

```bash
npm run typecheck && npm run format:check
```

If format fails: `npm run format`, then re-run.

- [ ] **Step 6: Commit**

```bash
git add src/util.ts
git commit -m "$(cat <<'EOF'
feat(util): add formatMoney helper for currency-aware display

Replaces the duplicated fmt$ helpers across email.ts, intradayEmail.ts,
weeklyEmail.ts, telegram.ts. Supports USD/GBP/EUR/JPY/AUD/CAD/NZD/CHF/
HKD/SGD with currency-specific prefixes; unknown codes fall back to
"<amount> <CODE>".
EOF
)"
```

---

## Task 2: Add `src/fetchFx.ts` module

**Files:**
- Create: `src/fetchFx.ts`
- Smoke (untracked): `scratch/smoke-fx.ts`

- [ ] **Step 1: Write the smoke script**

Create `scratch/smoke-fx.ts`:

```ts
import { fetchFxRates } from "../src/fetchFx.js";

(async () => {
  const rates = await fetchFxRates(["GBP", "EUR", "JPY", "USD"], "USD");
  console.log("USD ← GBP:", rates.GBP);
  console.log("USD ← EUR:", rates.EUR);
  console.log("USD ← JPY:", rates.JPY);
  console.log("USD ← USD:", rates.USD);

  const ok =
    typeof rates.GBP === "number" && rates.GBP > 0.5 && rates.GBP < 2.5 &&
    typeof rates.EUR === "number" && rates.EUR > 0.5 && rates.EUR < 2.0 &&
    typeof rates.JPY === "number" && rates.JPY > 0.001 && rates.JPY < 0.05 &&
    rates.USD === 1;

  console.log(ok ? "\nPASS — rates within sanity bounds." : "\nFAIL — rates out of expected ranges.");
  if (!ok) process.exit(1);
})();
```

- [ ] **Step 2: Run smoke to verify it fails**

```bash
npx tsx scratch/smoke-fx.ts
```

Expected: ImportError because `fetchFx` doesn't exist.

- [ ] **Step 3: Implement `fetchFx.ts`**

Create `src/fetchFx.ts`:

```ts
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
  validation: { logErrors: false },
});

// Fetch FX rates for converting amounts FROM each `fromCurrencies[i]` TO `toCurrency`.
// Rate semantics: amount_in_to = amount_in_from * rates[from].
// Returns a map; same-currency entries are 1; failed lookups are omitted (caller decides).
export async function fetchFxRates(
  fromCurrencies: string[],
  toCurrency: string,
): Promise<Record<string, number>> {
  const unique = Array.from(new Set(fromCurrencies));
  const result: Record<string, number> = {};

  for (const from of unique) {
    if (from === toCurrency) {
      result[from] = 1;
      continue;
    }
    const ticker = `${from}${toCurrency}=X`;
    try {
      const summary = await yahooFinance.quoteSummary(ticker, { modules: ["price"] });
      const rate = summary.price?.regularMarketPrice;
      if (typeof rate === "number" && rate > 0) {
        result[from] = rate;
        console.log(`  ✓ FX ${from}→${toCurrency}: ${rate.toFixed(4)}`);
      } else {
        console.warn(`  ⚠ FX ${from}→${toCurrency}: missing rate`);
      }
    } catch (err) {
      console.warn(`  ⚠ FX ${from}→${toCurrency}: ${(err as Error).message}`);
    }
  }

  return result;
}
```

- [ ] **Step 4: Run smoke — should pass**

```bash
npx tsx scratch/smoke-fx.ts
```

Expected: rates printed, all within sanity bounds, "PASS".

- [ ] **Step 5: Verify typecheck + format**

```bash
npm run typecheck && npm run format:check
```

- [ ] **Step 6: Commit**

```bash
git add src/fetchFx.ts
git commit -m "$(cat <<'EOF'
feat(fx): add fetchFxRates module using yahoo-finance2 FX pairs

Single-call batch lookup for converting source currencies to a target
default. Same yahoo-finance2 instance, no new dependency. Same-currency
short-circuits to rate=1; individual failures log and omit from result.
EOF
)"
```

---

## Task 3: Migrate config schema (rename + `defaultCurrency`)

**Files:**
- Modify: `src/config.ts`
- Modify: `src/analyze.ts` (single rename)
- Modify: `config.json` (user's local file)
- Modify: `config.example.json`

- [ ] **Step 1: Update `config.example.json`**

Replace contents:

```json
{
  "targetPortfolio": {
    "AIQ": 5,
    "SMH": 5,
    "XLU": 5,
    "ITA": 3,
    "GLD": 10,
    "IJH": 3,
    "VOO": 20,
    "QQQ": 15,
    "ESGU": 9,
    "BSV": 20,
    "XLV": 2,
    "BTC": 1.5,
    "ETH": 1.5
  },
  "currentHoldings": {
    "AAPL": 30,
    "AMZN": 3,
    "BIPC": 1,
    "INTC": 5,
    "TSM": 10,
    "VOO": 1
  },
  "totalPortfolioValue": 50000,
  "defaultCurrency": "USD",
  "intradayAlerts": {
    "enabled": true,
    "confidenceIncreaseThreshold": 10,
    "minConfidenceToAlert": 80,
    "actionUpgradesAlert": true,
    "onlyAlertForActions": ["STRONG BUY", "BUY"]
  }
}
```

- [ ] **Step 2: Update `config.json` (user's local file) the same way**

Read `config.json`, rename `totalPortfolioValueUSD` → `totalPortfolioValue`, add `"defaultCurrency": "USD"` next to it. Preserve all other keys/values.

- [ ] **Step 3: Update `src/config.ts` schema + loader**

In `src/config.ts`, locate the type definition (currently around line 17):

```ts
// BEFORE
export interface ConfigFile {
  targetPortfolio: Record<string, number>;
  currentHoldings: Record<string, number>;
  totalPortfolioValueUSD: number;
  intradayAlerts?: ...;
}
```

Replace with:

```ts
const SUPPORTED_CURRENCIES = new Set([
  "USD", "GBP", "EUR", "AUD", "CAD", "JPY", "CHF", "HKD", "SGD", "NZD",
]);

export interface ConfigFile {
  targetPortfolio: Record<string, number>;
  currentHoldings: Record<string, number>;
  totalPortfolioValue: number;
  defaultCurrency: string;
  intradayAlerts?: IntradayAlertConfig;
}
```

Locate the loader (currently around line 36 with `export const totalPortfolioValueUSD = json.totalPortfolioValueUSD;`). Replace with:

```ts
// Migration guard — old field name is no longer accepted
if ((json as Record<string, unknown>).totalPortfolioValueUSD !== undefined) {
  throw new Error(
    'config.json: "totalPortfolioValueUSD" is deprecated. ' +
      'Rename it to "totalPortfolioValue" and add "defaultCurrency" (e.g. "USD"). ' +
      "See config.example.json.",
  );
}

if (typeof json.totalPortfolioValue !== "number") {
  throw new Error('config.json: "totalPortfolioValue" must be a number.');
}

const rawCurrency = (json as Record<string, unknown>).defaultCurrency;
if (rawCurrency === undefined) {
  console.warn('config.json: "defaultCurrency" missing — defaulting to "USD".');
}
const currency = typeof rawCurrency === "string" ? rawCurrency.toUpperCase() : "USD";
if (!SUPPORTED_CURRENCIES.has(currency)) {
  throw new Error(
    `config.json: "defaultCurrency": "${currency}" is not supported. ` +
      `Supported: ${Array.from(SUPPORTED_CURRENCIES).join(", ")}.`,
  );
}

export const totalPortfolioValue = json.totalPortfolioValue;
export const defaultCurrency = currency;
```

(Remove the old `export const totalPortfolioValueUSD` line.)

- [ ] **Step 4: Update `src/analyze.ts` import + usage**

In `src/analyze.ts:1`:

```ts
// BEFORE
import { targetPortfolio, currentHoldings, totalPortfolioValueUSD } from "./config.js";
// AFTER
import { targetPortfolio, currentHoldings, totalPortfolioValue } from "./config.js";
```

In `src/analyze.ts:48`:

```ts
// BEFORE
const portfolioValue = Math.max(totalCurrentValue, totalPortfolioValueUSD);
// AFTER
const portfolioValue = Math.max(totalCurrentValue, totalPortfolioValue);
```

- [ ] **Step 5: Verify typecheck + format**

```bash
npm run typecheck && npm run format:check
```

- [ ] **Step 6: Verify migration error works (negative test)**

Temporarily rename your `config.json`'s field back to `totalPortfolioValueUSD`, run `npx tsx -e "import('./src/config.js')"`, expect the helpful error to fire. Then revert.

```bash
# Quick negative-test snippet:
cp config.json config.json.bak
node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync('config.json'));c.totalPortfolioValueUSD=c.totalPortfolioValue;delete c.totalPortfolioValue;fs.writeFileSync('config.json',JSON.stringify(c,null,2));"
npx tsx -e "import('./src/config.js').catch(e => { console.log('ERROR (expected):', e.message); process.exit(0); })"
mv config.json.bak config.json
```

Expected: error message mentions "totalPortfolioValueUSD" and "rename".

- [ ] **Step 7: Commit**

```bash
git add config.example.json config.json src/config.ts src/analyze.ts
git commit -m "$(cat <<'EOF'
feat(config): rename totalPortfolioValueUSD → totalPortfolioValue + defaultCurrency

Hard-cut schema migration. Loader throws a helpful error if the old
field is still present. defaultCurrency is validated against an
allowlist (USD/GBP/EUR/AUD/CAD/JPY/CHF/HKD/SGD/NZD); missing field
defaults to USD with a one-line warning.

This commit only renames — no FX conversion is wired yet, so behavior
is unchanged for USD users (which is everyone today).
EOF
)"
```

---

## Task 4: Capture currency + apply sub-unit fix in `fetchPrices.ts`

This task plumbs `currency` and `originalCurrency` through `QuoteData` and applies the GBp/GBX/ILA/ZAc divide-by-100 fix. No FX conversion yet — Task 5 wires that in. After this commit, `originalCurrency` is captured, sub-unit prices are corrected, but cross-currency tickers still display as-is.

**Files:**
- Modify: `src/fetchPrices.ts`

- [ ] **Step 1: Add sub-unit fix map to top of `fetchPrices.ts`**

Just below the existing `yahooFinance` instance (around line 8):

```ts
// LSE quotes in pence (GBp/GBX), TASE in agorot (ILA), JSE in cents (ZAc).
// Yahoo reports the ticker's price in this sub-unit; divide by 100 to get the
// real currency. Extend this map when a new sub-unit currency code surfaces.
const SUB_UNIT_FIX: Record<string, { realCurrency: string; divisor: number }> = {
  GBp: { realCurrency: "GBP", divisor: 100 },
  GBX: { realCurrency: "GBP", divisor: 100 },
  ILA: { realCurrency: "ILS", divisor: 100 },
  ZAc: { realCurrency: "ZAR", divisor: 100 },
};
```

- [ ] **Step 2: Add `currency` + `originalCurrency` to `QuoteData`**

In the `QuoteData` interface (around line 15 in the post-PR-9 file):

```ts
export interface QuoteData {
  ticker: string;
  name: string | null;
  longName: string | null;
  currency: string;          // NEW — post-conversion currency (= defaultCurrency once Task 5 lands)
  originalCurrency: string;  // NEW — raw Yahoo currency (audit / logging)
  price: number;
  // ... rest unchanged
}
```

- [ ] **Step 3: Capture currency + apply sub-unit fix in `fetchOne`**

Inside the `fetchOne` function (in the existing return-block), just before `const price = result.price?.regularMarketPrice ?? null;`, add:

```ts
const rawCurrency = result.price?.currency ?? "USD";
const subUnit = SUB_UNIT_FIX[rawCurrency];
const originalCurrency = subUnit ? subUnit.realCurrency : rawCurrency;
const priceDivisor = subUnit ? subUnit.divisor : 1;
```

Then update every monetary field in the returned object to divide by `priceDivisor`:

```ts
return {
  ticker: configTicker,
  name: result.price?.shortName ?? result.price?.longName ?? null,
  longName: result.price?.longName ?? result.price?.shortName ?? null,
  currency: originalCurrency,         // NEW (Task 5 will overwrite to defaultCurrency)
  originalCurrency,                    // NEW
  price: price / priceDivisor,
  trailingPE: result.summaryDetail?.trailingPE ?? null,
  forwardPE: result.summaryDetail?.forwardPE ?? null,
  avgPE,
  fiftyTwoWeekHigh: high != null ? high / priceDivisor : null,
  fiftyTwoWeekLow: low != null ? low / priceDivisor : null,
  fiftyTwoWeekPercent: range != null ? Math.round(range * 1000) / 1000 : null,
  marketCap: (result.summaryDetail?.marketCap ?? result.price?.marketCap ?? null) === null
    ? null
    : (result.summaryDetail?.marketCap ?? result.price?.marketCap)! / priceDivisor,
  dividendYield: result.summaryDetail?.dividendYield ?? null,
  beta: result.defaultKeyStatistics?.beta ?? null,
  holdings,
  returnOnEquity: fin?.returnOnEquity ?? null,
  debtToEquity: fin?.debtToEquity ?? null,
  freeCashflow: fin?.freeCashflow != null ? fin.freeCashflow / priceDivisor : null,
  operatingCashflow: fin?.operatingCashflow != null ? fin.operatingCashflow / priceDivisor : null,
  profitMargins: fin?.profitMargins ?? null,
  revenueGrowth: fin?.revenueGrowth ?? null,
  earningsGrowth: fin?.earningsGrowth ?? null,
  targetMeanPrice: fin?.targetMeanPrice != null ? fin.targetMeanPrice / priceDivisor : null,
  recommendationKey: fin?.recommendationKey ?? null,
  postMarketPrice: result.price?.postMarketPrice != null ? result.price.postMarketPrice / priceDivisor : null,
  preMarketPrice: result.price?.preMarketPrice != null ? result.price.preMarketPrice / priceDivisor : null,
  earningsDate: (() => {
    const dates = result.calendarEvents?.earnings?.earningsDate;
    if (dates && dates.length > 0) return new Date(dates[0]);
    return null;
  })(),
  daysToEarnings: (() => {
    const dates = result.calendarEvents?.earnings?.earningsDate;
    if (dates && dates.length > 0) {
      const diff = new Date(dates[0]).getTime() - Date.now();
      return diff > 0 ? Math.ceil(diff / (1000 * 60 * 60 * 24)) : null;
    }
    return null;
  })(),
};
```

Note: also update the existing `price` and `high`/`low`/`range` calculations earlier in the function so the early-return guard (`if (price == null) ...`) still works — the divisor only applies after we've confirmed price is non-null. Keep the existing null-check on raw `price`, but apply `priceDivisor` only when constructing the return object.

Also update the line just before construction:
```ts
// BEFORE
const range = high != null && low != null && high !== low ? (price - low) / (high - low) : null;
// AFTER (range computation must use original Yahoo prices since both numerator and denominator divide by the same divisor; ratio is unchanged — keep as-is)
```

(The 52-week percent ratio is invariant under the divisor since it's `(price - low) / (high - low)` — leave that line untouched.)

- [ ] **Step 4: Verify typecheck + format**

```bash
npm run typecheck && npm run format:check
```

- [ ] **Step 5: Smoke check via dev run**

```bash
npm run dev 2>&1 | head -30
```

Expected: prices fetch as before, no crashes. (Since no LSE tickers are in your portfolio, divisor=1 path is exercised; output identical to pre-task.)

- [ ] **Step 6: Commit**

```bash
git add src/fetchPrices.ts
git commit -m "$(cat <<'EOF'
feat(fetch): capture per-ticker currency + apply sub-unit fix

QuoteData gains currency (post-conversion) and originalCurrency (raw
Yahoo). For tickers in SUB_UNIT_FIX (GBp/GBX/ILA/ZAc), divide all
monetary fields by 100 and upgrade the currency to its real form
(GBp → GBP, etc.).

No FX conversion yet — currency = originalCurrency at this point. The
next commit wires fetchFxRates to convert across currencies.
EOF
)"
```

---

## Task 5: Wire FX conversion in `fetchPrices.ts`

**Files:**
- Modify: `src/fetchPrices.ts` (top: import `fetchFxRates`; modify `fetchPrices` orchestrator)
- Modify: `src/index.ts` (pass `defaultCurrency` to `fetchPrices`)
- Smoke (untracked): `scratch/smoke-conversion.ts`

- [ ] **Step 1: Write the smoke script**

Create `scratch/smoke-conversion.ts`:

```ts
import { fetchPrices } from "../src/fetchPrices.js";

(async () => {
  // Use a real LSE ticker (TSCO.L = Tesco PLC, GBp) and a Frankfurt ticker (SAP.DE, EUR).
  const result = await fetchPrices(["AAPL", "TSCO.L", "SAP.DE"], "USD");
  for (const q of result.quotes) {
    console.log(
      `${q.ticker}  price=${q.price.toFixed(2)} ${q.currency}  ` +
        `(originalCurrency=${q.originalCurrency})`,
    );
  }
  console.log("skipped:", result.skipped);

  // Sanity: AAPL should be USD-native, all currencies = "USD" post-conversion
  const aapl = result.quotes.find((q) => q.ticker === "AAPL");
  const tsco = result.quotes.find((q) => q.ticker === "TSCO.L");
  const sap = result.quotes.find((q) => q.ticker === "SAP.DE");

  const ok =
    aapl?.currency === "USD" && aapl?.originalCurrency === "USD" &&
    (!tsco || (tsco.currency === "USD" && tsco.originalCurrency === "GBP" && tsco.price > 1 && tsco.price < 100)) &&
    (!sap || (sap.currency === "USD" && sap.originalCurrency === "EUR" && sap.price > 50));

  console.log(ok ? "\nPASS" : "\nFAIL");
  if (!ok) process.exit(1);
})();
```

- [ ] **Step 2: Update `fetchPrices` signature and orchestration**

In `src/fetchPrices.ts`, find the existing top-level `fetchPrices` orchestrator (the function that loops over tickers calling `fetchOne`). Update its signature and body:

```ts
import { fetchFxRates } from "./fetchFx.js";

// ...

export interface FetchResult {
  quotes: QuoteData[];
  skipped: Array<{ ticker: string; reason: string }>;
}

export async function fetchPrices(
  tickers: string[],
  defaultCurrency: string,
): Promise<FetchResult> {
  console.log(`Fetching prices for ${tickers.length} tickers...`);

  // Pass 1: fetch raw quotes (post-sub-unit-fix, pre-FX)
  const rawQuotes: QuoteData[] = [];
  for (const ticker of tickers) {
    const yahooTicker = toYahooTicker(ticker);
    const q = await fetchOne(yahooTicker);
    if (q != null) rawQuotes.push(q);
  }

  // Pass 2: collect unique source currencies, fetch FX rates in one batch
  const uniqueCurrencies = Array.from(new Set(rawQuotes.map((q) => q.originalCurrency)));
  console.log(`Fetching FX rates for: ${uniqueCurrencies.join(", ")} → ${defaultCurrency}`);
  const fxRates = await fetchFxRates(uniqueCurrencies, defaultCurrency);

  // Pass 3: apply conversion, build skip list for tickers whose FX failed
  const quotes: QuoteData[] = [];
  const skipped: Array<{ ticker: string; reason: string }> = [];

  for (const q of rawQuotes) {
    const rate = fxRates[q.originalCurrency];
    if (rate === undefined) {
      console.warn(`  ⚠ ${q.ticker}: skipping — no FX rate for ${q.originalCurrency}`);
      skipped.push({ ticker: q.ticker, reason: `no FX rate ${q.originalCurrency}→${defaultCurrency}` });
      continue;
    }
    quotes.push(applyFxRate(q, rate, defaultCurrency));
  }

  console.log(`Fetched ${quotes.length}/${tickers.length} tickers (${skipped.length} skipped)`);
  return { quotes, skipped };
}

function applyFxRate(q: QuoteData, rate: number, defaultCurrency: string): QuoteData {
  if (rate === 1) {
    return { ...q, currency: defaultCurrency };
  }
  return {
    ...q,
    currency: defaultCurrency,
    price: q.price * rate,
    fiftyTwoWeekHigh: q.fiftyTwoWeekHigh != null ? q.fiftyTwoWeekHigh * rate : null,
    fiftyTwoWeekLow: q.fiftyTwoWeekLow != null ? q.fiftyTwoWeekLow * rate : null,
    marketCap: q.marketCap != null ? q.marketCap * rate : null,
    freeCashflow: q.freeCashflow != null ? q.freeCashflow * rate : null,
    operatingCashflow: q.operatingCashflow != null ? q.operatingCashflow * rate : null,
    targetMeanPrice: q.targetMeanPrice != null ? q.targetMeanPrice * rate : null,
    postMarketPrice: q.postMarketPrice != null ? q.postMarketPrice * rate : null,
    preMarketPrice: q.preMarketPrice != null ? q.preMarketPrice * rate : null,
  };
}
```

(If the existing `fetchPrices` returns `Record<string, QuoteData>` or similar, keep the public shape compatible — adapt the return packaging at the end. The internal pipeline above is the load-bearing part.)

- [ ] **Step 3: Update `src/index.ts` to pass `defaultCurrency`**

Locate every call to `fetchPrices(...)` in `src/index.ts` and update:

```ts
// BEFORE
const priceData = await fetchPrices(tickers);
// AFTER
import { defaultCurrency } from "./config.js";
// ...
const result = await fetchPrices(tickers, defaultCurrency);
const priceData = result.quotes;  // or whatever wrapping the existing code does
const fxSkipped = result.skipped;  // hold for later footer use
```

If the call sites consume `priceData` as `Record<string, QuoteData>`, build that map from `result.quotes`:

```ts
const priceData: Record<string, QuoteData> = {};
for (const q of result.quotes) priceData[q.ticker] = q;
```

- [ ] **Step 4: Run smoke**

```bash
npx tsx scratch/smoke-conversion.ts
```

Expected: all three quotes show `currency=USD`. TSCO.L originalCurrency=GBP, price ~$25–35 (Tesco trades around £3.50, * GBPUSD ~1.27). SAP.DE originalCurrency=EUR, price > $50.

- [ ] **Step 5: Verify typecheck + format**

```bash
npm run typecheck && npm run format:check
```

- [ ] **Step 6: Smoke run end-to-end**

```bash
npm run dev 2>&1 | tail -40
```

Expected: prices print normally, FX section logs `✓ FX <currency>→USD` lines, no crashes. Email sends.

- [ ] **Step 7: Commit**

```bash
git add src/fetchPrices.ts src/index.ts
git commit -m "$(cat <<'EOF'
feat(fetch): convert per-ticker prices to defaultCurrency via Yahoo FX

fetchPrices now takes defaultCurrency, batches a one-pass FX lookup
across all unique source currencies, then applies conversion to every
monetary field on QuoteData. Tickers whose FX rate can't be fetched
are listed in result.skipped and the run continues without them.
EOF
)"
```

---

## Task 6: Apply FX conversion in `fetchTechnicals.ts`

**Files:**
- Modify: `src/fetchTechnicals.ts`
- Modify: `src/index.ts` (pass FX rate map per ticker, or pass `priceData` so the function can self-look-up)

- [ ] **Step 1: Update `fetchTechnicals` signature**

The simplest plumbing is to accept `priceData` (already enriched with `originalCurrency`) and an FX rate map:

```ts
export async function fetchTechnicals(
  tickers: string[],
  priceData: Record<string, QuoteData>,
  fxRates: Record<string, number>,
): Promise<Record<string, TechnicalData>>
```

(If the existing signature is different, adapt — the goal is making the function aware of each ticker's `originalCurrency` and the rate to apply.)

Inside the per-ticker loop, after fetching `quoteSummary`/`chart`, multiply every OHLCV input through the rate before computing indicators:

```ts
const original = priceData[configTicker]?.originalCurrency ?? "USD";
const rate = fxRates[original] ?? 1;

// Apply conversion to OHLCV BEFORE computing indicators so all derived
// numbers (sma50, sma200, atr, bollinger, recent7d/30d) come out in
// defaultCurrency naturally.
const closes = chart.quotes.map((q) => q.close * rate);
const highs = chart.quotes.map((q) => q.high * rate);
const lows = chart.quotes.map((q) => q.low * rate);
// ... use these for indicator math instead of the raw chart.quotes values
```

If the existing code reads `q.close` directly inside indicator calculations, refactor to compute the converted arrays once at the top and use them throughout.

- [ ] **Step 2: Update `index.ts` to pass FX map to fetchTechnicals**

Wherever `fetchTechnicals(tickers)` is called, expose the FX rate map. Simplest: re-fetch (cheap, hit the in-memory cache eventually — but the current design has no cache across calls, so a small refactor in index.ts to keep the rate map from the prior `fetchPrices` call):

```ts
const { quotes, skipped } = await fetchPrices(tickers, defaultCurrency);
// Build a rate map from quotes (rate = price / unconvertedPrice — or store rates separately)
```

Actually cleanest — have `fetchPrices` return the FX rate map alongside quotes:

```ts
export interface FetchResult {
  quotes: QuoteData[];
  skipped: Array<{ ticker: string; reason: string }>;
  fxRates: Record<string, number>;   // NEW
}
```

Update the return statement in `fetchPrices` to include `fxRates`, then in `index.ts`:

```ts
const { quotes, skipped, fxRates } = await fetchPrices(tickers, defaultCurrency);
const technicals = await fetchTechnicals(tickers, priceData, fxRates);
```

- [ ] **Step 3: Verify typecheck + format**

```bash
npm run typecheck && npm run format:check
```

- [ ] **Step 4: Smoke run end-to-end**

```bash
npm run dev 2>&1 | grep -E "Technicals|50MA|200MA" | head -20
```

Expected: indicator values look reasonable (50MA/200MA in same magnitude as price). Compare to a prior run — for USD-only tickers, numbers should be unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/fetchTechnicals.ts src/fetchPrices.ts src/index.ts
git commit -m "$(cat <<'EOF'
feat(technicals): convert OHLCV to defaultCurrency before computing indicators

Rebases the 365-day chart series through the current FX rate so
sma50/sma200/atr14/bollinger/recent-low values come out denominated
in defaultCurrency. Tiny error if FX has drifted across the window,
acceptable for entry-timing use.
EOF
)"
```

---

## Task 7: Migrate `email.ts` to `formatMoney` + currency-aware header & footer

**Files:**
- Modify: `src/email.ts`

- [ ] **Step 1: Replace `fmt$` helper with `formatMoney` binding**

In `src/email.ts`, locate `function fmt$(n: number): string { ... }` (around line 27). Replace with an import + local binding:

```ts
import { formatMoney } from "./util.js";
import { defaultCurrency } from "./config.js";

const fmt$ = (n: number) => formatMoney(n, defaultCurrency);
```

(Keeping the local name `fmt$` minimizes downstream changes. If lint complains, rename to `fmtMoney` and find/replace.)

- [ ] **Step 2: Add currency context to header card**

Locate the `Holdings Value` cell in `buildEmailHtml`. Update:

```ts
// BEFORE
<div style="font-size:11px;color:${S.muted};text-transform:uppercase;">Holdings Value</div>
<div style="font-size:20px;font-weight:bold;color:#fff;">${fmt$(report.totalCurrentValue)}</div>

// AFTER
<div style="font-size:11px;color:${S.muted};text-transform:uppercase;">Holdings Value · ${defaultCurrency}</div>
<div style="font-size:20px;font-weight:bold;color:#fff;">${fmt$(report.totalCurrentValue)}</div>
```

- [ ] **Step 3: Add footer caveat + skipped-tickers line**

Update `buildEmailHtml` signature to accept the `fxSkipped` list and `priceData` for the cross-currency check:

```ts
export function buildEmailHtml(
  report: AllocationReport,
  news: Record<string, NewsItem[]>,
  aiRecs: AIBuyRecommendation[] = [],
  technicals: Record<string, TechnicalData> = {},
  priceData: Record<string, QuoteData> = {},
  fxSkipped: Array<{ ticker: string; reason: string }> = [],
): string {
```

Compute "any cross-currency tickers present":

```ts
const hasCrossCurrency = Object.values(priceData).some(
  (q) => q.originalCurrency !== defaultCurrency,
);
```

In the existing footer block (just before `</table></body></html>`), insert before the closing `</table>`:

```ts
${hasCrossCurrency ? `
<tr><td style="padding:10px 24px;background:${S.cardBg};border-top:1px solid ${S.border};font-size:11px;color:${S.muted};">
  Limit prices shown in ${defaultCurrency} — check your broker's quote currency before placing an order.
</td></tr>` : ""}
${fxSkipped.length > 0 ? `
<tr><td style="padding:10px 24px;background:${S.cardBg};border-top:1px solid ${S.border};font-size:11px;color:${S.yellow};">
  FX lookup skipped: ${fxSkipped.map((s) => `${s.ticker} (${s.reason})`).join(", ")}
</td></tr>` : ""}
```

- [ ] **Step 4: Update `sendBrief` signature similarly**

Match the same parameter additions; pass through to `buildEmailHtml`.

- [ ] **Step 5: Update `src/index.ts` callers**

Find every `await sendBrief(...)` / `buildEmailHtml(...)` call in `src/index.ts` and add `fxSkipped` as the new arg (the value comes from the `fetchPrices` result).

- [ ] **Step 6: Verify typecheck + format**

```bash
npm run typecheck && npm run format:check
```

- [ ] **Step 7: Commit**

```bash
git add src/email.ts src/index.ts
git commit -m "$(cat <<'EOF'
feat(email): currency-aware fmt$, header label, footer caveat

Local fmt$ now delegates to formatMoney(_, defaultCurrency). The
holdings header shows the active currency. When any ticker has a
non-default originalCurrency, the email gains a footer caveat about
limit prices, and any FX-skipped tickers are listed.
EOF
)"
```

---

## Task 8: Migrate `intradayEmail.ts`

Same pattern as Task 7.

**Files:**
- Modify: `src/intradayEmail.ts`

- [ ] **Step 1: Replace local `fmt$`**

Replace the `function fmt$(n: number)` helper with:

```ts
import { formatMoney } from "./util.js";
import { defaultCurrency } from "./config.js";

const fmt$ = (n: number) => formatMoney(n, defaultCurrency);
```

- [ ] **Step 2: Add currency suffix to header**

In `buildIntradayEmailHtml`, find the header line containing the alert count:

```ts
// BEFORE
<p style="margin:4px 0 0;color:${S.text};font-size:12px;">${alerts.length} signal${alerts.length > 1 ? "s" : ""} ${summarizeAlertDirection(alerts)} since morning brief</p>

// AFTER
<p style="margin:4px 0 0;color:${S.text};font-size:12px;">${alerts.length} signal${alerts.length > 1 ? "s" : ""} ${summarizeAlertDirection(alerts)} since morning brief · ${defaultCurrency}</p>
```

- [ ] **Step 3: Same currency suffix for refresh email header**

In `sendRefreshEmail`, locate the header cell and add `· ${defaultCurrency}` to the date/time line.

- [ ] **Step 4: Add footer caveat (cross-currency case)**

Determine cross-currency status from `alerts[].tickerFullName` is insufficient — alerts don't carry `originalCurrency`. Two options:

- (a) Pass `priceData` into intraday email builder so it can compute `hasCrossCurrency`.
- (b) Threading `originalCurrency` onto `IntradayAlert` itself (parallels how `tickerFullName` was wired).

Choose **(b)** — symmetric with `tickerFullName`. In `src/intradayCompare.ts`:

```ts
export interface IntradayAlert {
  ticker: string;
  tickerFullName: string | null;
  originalCurrency: string;     // NEW
  // ...
}
```

In the alert push:

```ts
alerts.push({
  ticker: rec.ticker,
  tickerFullName: rec.tickerFullName ?? null,
  originalCurrency: rec.originalCurrency ?? defaultCurrency,  // adjust based on AIBuyRecommendation flow
  // ...
});
```

`AIBuyRecommendation` doesn't currently carry `originalCurrency`. Add it: in `src/aiAnalysis.ts`'s recommendation interface:

```ts
export interface AIBuyRecommendation {
  ticker: string;
  tickerFullName: string | null;
  originalCurrency: string;   // NEW
  // ...
}
```

And in the same post-Stage-2 block where `tickerFullName` is attached deterministically (around `aiAnalysis.ts:660`):

```ts
const longNameMap = new Map(Object.values(priceData).map((q) => [q.ticker, q.longName ?? null]));
const currencyMap = new Map(Object.values(priceData).map((q) => [q.ticker, q.originalCurrency]));
for (const rec of recommendations) {
  rec.tickerFullName = longNameMap.get(rec.ticker) ?? null;
  rec.originalCurrency = currencyMap.get(rec.ticker) ?? defaultCurrency;
}
```

(This task touches `aiAnalysis.ts` for that wiring — that's fine; flag the change in the commit.)

Then in `intradayEmail.ts`, compute and render the caveat:

```ts
const hasCrossCurrency = alerts.some((a) => a.originalCurrency !== defaultCurrency);
// ... before the closing </table>
${hasCrossCurrency ? `
<tr><td style="padding:10px 24px;background:${S.cardBg};border-top:1px solid ${S.border};font-size:11px;color:${S.muted};">
  Limit prices shown in ${defaultCurrency} — check your broker's quote currency before placing an order.
</td></tr>` : ""}
```

- [ ] **Step 5: Verify typecheck + format**

```bash
npm run typecheck && npm run format:check
```

- [ ] **Step 6: Commit**

```bash
git add src/intradayEmail.ts src/intradayCompare.ts src/aiAnalysis.ts
git commit -m "$(cat <<'EOF'
feat(intraday): currency-aware intraday alerts + originalCurrency on alerts

Threads originalCurrency through AIBuyRecommendation → IntradayAlert
so the intraday email can render the cross-currency footer caveat.
fmt$ now delegates to formatMoney; header shows defaultCurrency.
EOF
)"
```

---

## Task 9: Migrate `weeklyEmail.ts`

**Files:**
- Modify: `src/weeklyEmail.ts`

- [ ] **Step 1: Replace local `fmt$`**

```ts
import { formatMoney } from "./util.js";
import { defaultCurrency } from "./config.js";

const fmt$ = (n: number) => formatMoney(n, defaultCurrency);
```

- [ ] **Step 2: Add currency suffix to header**

Locate the `Holdings Value` cell (around `buildWeeklyEmailHtml`) — same pattern as Task 7:

```ts
// AFTER
<div style="font-size:11px;color:${S.muted};text-transform:uppercase;">Holdings Value · ${defaultCurrency}</div>
```

- [ ] **Step 3: Footer caveat**

Compute `hasCrossCurrency` from `report.items` — each `AllocationItem` does NOT yet carry `originalCurrency`. Add it:

In `src/analyze.ts`'s `AllocationItem`:

```ts
export interface AllocationItem {
  ticker: string;
  tickerFullName: string | null;
  originalCurrency: string;    // NEW
  // ...
}
```

In the items.push around line 109:

```ts
items.push({
  ticker,
  tickerFullName: quote.longName ?? null,
  originalCurrency: quote.originalCurrency,   // NEW
  // ...
});
```

Now in `weeklyEmail.ts`:

```ts
const hasCrossCurrency = report.items.some((i) => i.originalCurrency !== defaultCurrency);
// ... before closing </table>
${hasCrossCurrency ? `
<tr><td style="padding:10px 24px;background:${S.cardBg};border-top:1px solid ${S.border};font-size:11px;color:${S.muted};">
  Values shown in ${defaultCurrency} — multi-currency portfolio detected.
</td></tr>` : ""}
```

(Weekly doesn't show limit prices, so the caveat wording is slightly different.)

- [ ] **Step 4: Verify typecheck + format**

```bash
npm run typecheck && npm run format:check
```

- [ ] **Step 5: Commit**

```bash
git add src/weeklyEmail.ts src/analyze.ts
git commit -m "$(cat <<'EOF'
feat(weekly): currency-aware weekly rebalancing email

Threads originalCurrency through AllocationItem so the weekly email
can render its multi-currency footer when applicable. fmt$ now
delegates to formatMoney; header shows defaultCurrency.
EOF
)"
```

---

## Task 10: Migrate `telegram.ts`

**Files:**
- Modify: `src/telegram.ts`

- [ ] **Step 1: Replace local `fmt$`**

```ts
import { formatMoney } from "./util.js";
import { defaultCurrency } from "./config.js";

const fmt$ = (n: number) => formatMoney(n, defaultCurrency);
```

- [ ] **Step 2: Add currency context to message header**

In the daily Telegram builder (currently `buildMessage`), update the holdings line:

```ts
// BEFORE
lines.push(
  `💰 <b>${fmt$(report.totalCurrentValue)}</b>` +
    (report.portfolioBeta != null ? `  |  β ${report.portfolioBeta.toFixed(2)}` : "") +
    `  |  📈 ${fmt$(report.estimatedAnnualDividend)}/yr div`,
);

// AFTER
lines.push(
  `💰 <b>${fmt$(report.totalCurrentValue)}</b> ${defaultCurrency}` +
    (report.portfolioBeta != null ? `  |  β ${report.portfolioBeta.toFixed(2)}` : "") +
    `  |  📈 ${fmt$(report.estimatedAnnualDividend)}/yr div`,
);
```

- [ ] **Step 3: Apply same to weekly Telegram + intraday Telegram + refresh Telegram**

Each of these has its own header line in `buildWeeklyMessage` / `buildIntradayMessage` / refresh message builder. Append `${defaultCurrency}` after the holdings/totals figure in each.

- [ ] **Step 4: Footer caveat (Telegram)**

Telegram message length is bounded (4096 chars). Adding a caveat per cross-currency message is fine since it's one short line. After the body text but before the function returns the message, push:

```ts
const hasCrossCurrency = Object.values(priceData).some(
  (q) => q.originalCurrency !== defaultCurrency,
);
if (hasCrossCurrency) {
  lines.push("");
  lines.push(`<i>Limit prices in ${defaultCurrency} — confirm broker currency before ordering.</i>`);
}
```

(Apply to daily and intraday only; weekly has no limit prices, so use the more general `Values in ${defaultCurrency}` wording.)

- [ ] **Step 5: Verify typecheck + format**

```bash
npm run typecheck && npm run format:check
```

- [ ] **Step 6: Commit**

```bash
git add src/telegram.ts
git commit -m "$(cat <<'EOF'
feat(telegram): currency-aware totals + cross-currency caveat

fmt$ now delegates to formatMoney(_, defaultCurrency). Each message
type appends the active currency to its totals line and adds a
single-line caveat when a non-default original currency is present.
EOF
)"
```

---

## Task 11: AI prompt currency awareness

**Files:**
- Modify: `src/aiAnalysis.ts`
- Modify: `src/detailedAnalysis.ts`

- [ ] **Step 1: Add currency preamble to Stage 1 (`buildPrompt` / `buildObservationPrompt`)**

In `src/aiAnalysis.ts`, just before the existing `PORTFOLIO CONTEXT:` block in `buildPrompt`'s template literal:

```ts
return `You are a portfolio analyst. Analyze these tickers and recommend which to buy.

CURRENCY: All monetary values in this prompt are denominated in ${defaultCurrency}.

${macroContext ? macroContext + "\n" : ""}PORTFOLIO CONTEXT:
- Total portfolio value: ${formatMoney(report.totalCurrentValue, defaultCurrency)} (target: ${formatMoney(50000, defaultCurrency)})
...`;
```

(Replace the `$${...}` price interpolations with `formatMoney(value, defaultCurrency)` for `totalCurrentValue` and the target. Keep the per-ticker prices as `$${item.price.toFixed(2)}` — see step 2 for that.)

Imports:

```ts
import { formatMoney } from "./util.js";
import { defaultCurrency } from "./config.js";
```

- [ ] **Step 2: Audit annotation per ticker**

In `buildPrompt`, the per-ticker block prints `Price: $${item.price.toFixed(2)}`. Update to:

```ts
const priceLine = item.originalCurrency !== defaultCurrency
  ? `  Price: ${formatMoney(item.price, defaultCurrency)}  (originally ${item.originalCurrency})`
  : `  Price: ${formatMoney(item.price, defaultCurrency)}`;
// then push priceLine into the lines array instead of the literal
```

- [ ] **Step 3: Same in Stage 2 (`buildDecisionPrompt`)**

Add `CURRENCY:` preamble before `PORTFOLIO CONTEXT:`. Per-ticker block already comes from observations, no per-price update needed there — but the gap-amounts block uses `$${...}`:

```ts
// BEFORE
${report.items.filter(i => i.suggestedBuyValue > 0).map(i => `  ${i.ticker}: $${i.suggestedBuyValue.toFixed(0)} gap`).join("\n")}
// AFTER
${report.items.filter(i => i.suggestedBuyValue > 0).map(i => `  ${i.ticker}: ${formatMoney(i.suggestedBuyValue, defaultCurrency)} gap`).join("\n")}
```

- [ ] **Step 4: Update `detailedAnalysis.ts`**

Same preamble at the top of the prompt (just after the role line):

```ts
const lines = [
  `You are a senior investment analyst writing a detailed buy recommendation for a client.`,
  ``,
  `CURRENCY: All monetary values in this prompt are denominated in ${defaultCurrency}.`,
  ``,
  `TICKER: ${ticker}${quote.longName ? ` (${quote.longName})` : ""}`,
  `Current price: ${formatMoney(quote.price, defaultCurrency)}${quote.originalCurrency !== defaultCurrency ? ` (originally ${quote.originalCurrency})` : ""}`,
  // ...
];
```

(Replace the existing `$${quote.price.toFixed(2)}` and similar `$` interpolations throughout the function with `formatMoney(_, defaultCurrency)`.)

Imports at top of file:

```ts
import { formatMoney } from "./util.js";
import { defaultCurrency } from "./config.js";
```

- [ ] **Step 5: Verify typecheck + format**

```bash
npm run typecheck && npm run format:check
```

- [ ] **Step 6: Smoke run end-to-end**

```bash
npm run dev 2>&1 | tail -20
```

Expected: Gemini call succeeds (or 503-and-fallback), email sends with prices in defaultCurrency.

- [ ] **Step 7: Commit**

```bash
git add src/aiAnalysis.ts src/detailedAnalysis.ts
git commit -m "$(cat <<'EOF'
feat(ai): currency-aware AI prompts with original-currency audit

Adds a CURRENCY: preamble to all three prompts (Stage 1 observation,
Stage 2 decision, detailed thesis) so Gemini knows the active currency.
For tickers whose Yahoo source currency differs from default, appends
"(originally GBP)" etc. as audit context — keeps the model's reasoning
from sounding confused about magnitudes.
EOF
)"
```

---

## Task 12: Update docs + config example

**Files:**
- Modify: `docs/how-it-works.md`
- Modify: `README.md` (only if `totalPortfolioValueUSD` is referenced — check first)

- [ ] **Step 1: Update `docs/how-it-works.md` line 69**

Find the line referencing `totalPortfolioValueUSD` and rename it to `totalPortfolioValue`. Add a short paragraph nearby:

```markdown
The system supports portfolios denominated in any of the following
currencies: USD, GBP, EUR, AUD, CAD, JPY, CHF, HKD, SGD, NZD. Set
`defaultCurrency` in your config to your preferred display currency.
Tickers quoted in other currencies (e.g. UK LSE stocks in GBp) are
auto-detected, unit-fixed (LSE pence ÷ 100), and FX-converted via
Yahoo Finance for display.
```

- [ ] **Step 2: Check + update `README.md`**

```bash
grep -n "totalPortfolioValueUSD" README.md
```

If matches: rename in place, mention `defaultCurrency` if a config example block exists.

- [ ] **Step 3: Verify format**

```bash
npm run format:check
```

(Markdown is excluded from prettier per `.prettierignore`, so this should be a no-op pass — keep the step for safety.)

- [ ] **Step 4: Commit**

```bash
git add docs/how-it-works.md README.md
git commit -m "$(cat <<'EOF'
docs: update for new totalPortfolioValue + defaultCurrency schema

Renames the deprecated totalPortfolioValueUSD reference and documents
the new defaultCurrency option + supported currency list.
EOF
)"
```

---

## Task 13: End-to-end multi-currency smoke

**Files:**
- Temporarily modify: `config.json` (revert at end)

- [ ] **Step 1: Add a UK and a German ticker to `targetPortfolio`**

Edit `config.json`, add:

```jsonc
"targetPortfolio": {
  // existing entries...
  "TSCO.L": 1,
  "SAP.DE": 1
}
```

- [ ] **Step 2: Run `npm run dev` and capture output**

```bash
npm run dev 2>&1 | tee /tmp/richfolio-multicurrency-smoke.log
```

- [ ] **Step 3: Inspect output**

Verify:
- `Fetching FX rates for: USD, GBP, EUR → USD` (or similar) appears.
- `✓ FX GBP→USD: 1.27xx` and `✓ FX EUR→USD: 1.08xx` lines appear.
- `TSCO.L: $X.XX P/E=…` shows a USD-magnitude price (Tesco is ~£3.50, so ~$4.40), not 350-ish (which would mean sub-unit fix didn't apply).
- Email sends. Open the inbox.

- [ ] **Step 4: Inspect rendered email**

Open the delivered email. Verify:
- Header: `Holdings Value · USD: $X,XXX`
- Footer (since cross-currency tickers present): "Limit prices shown in USD — check your broker's quote currency before placing an order."
- TSCO.L appears in the allocation table with a USD-magnitude price.

- [ ] **Step 5: Revert `config.json`**

Remove the temporary `TSCO.L` and `SAP.DE` entries.

- [ ] **Step 6: Verify CI still passes**

```bash
npm run typecheck && npm run format:check
```

- [ ] **Step 7: Push branch and open PR**

```bash
git push -u origin feat/issue-7-currency-support
gh pr create --base main --title "Add international currency support (closes #7)" --body "$(cat <<'EOF'
## Summary

Closes #7. Makes the daily/weekly/intraday/refresh briefs currency-aware. Prices in any of 10 supported currencies (USD/GBP/EUR/AUD/CAD/JPY/CHF/HKD/SGD/NZD) are converted to the user-configured \`defaultCurrency\` at the fetch boundary; everything downstream sees a single-currency view.

## Schema migration

Old: \`totalPortfolioValueUSD: 50000\`
New: \`totalPortfolioValue: 50000\` + \`defaultCurrency: "USD"\`

The config loader throws a helpful error if the old field is still present.

## Approach

Approach A from the spec — convert at boundary in \`fetchPrices.ts\`. New \`fetchFx.ts\` module batches FX lookups via \`yahoo-finance2\` FX pairs (\`GBPUSD=X\` etc.). New \`formatMoney\` helper replaces 4 duplicated \`fmt$\` helpers. GBp/GBX/ILA/ZAc sub-unit fixes auto-applied (divide by 100). Tickers whose FX rate fails are skipped with a footer notice; run continues.

## Spec

[docs/superpowers/specs/2026-04-28-international-currency-support-design.md](docs/superpowers/specs/2026-04-28-international-currency-support-design.md)

## Test plan

- [x] \`npm run typecheck\` and \`npm run format:check\` pass
- [x] \`scratch/smoke-money-format.ts\` — formatter table tests
- [x] \`scratch/smoke-fx.ts\` — FX rate sanity bounds (GBP/EUR/JPY)
- [x] \`scratch/smoke-conversion.ts\` — TSCO.L (GBp) + SAP.DE (EUR) convert to USD-magnitude prices
- [x] End-to-end: temporarily added TSCO.L + SAP.DE to portfolio, ran \`npm run dev\`, verified header/footer/prices in delivered email; reverted config.
- [ ] CI \`validate\` job runs on this PR and passes.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

(No commit needed for Task 13 — it's a verification + PR-open step.)

---

## Self-Review

**Spec coverage check:**

- ✅ Schema rename + `defaultCurrency` allowlist (Task 3)
- ✅ Helpful migration error for `totalPortfolioValueUSD` (Task 3, step 6 negative test)
- ✅ `fetchFx.ts` module (Task 2)
- ✅ `currency`/`originalCurrency` on `QuoteData` (Task 4)
- ✅ Sub-unit fix for GBp/GBX/ILA/ZAc (Task 4)
- ✅ FX conversion of all listed monetary fields (Task 5)
- ✅ Skipped-tickers list returned from `fetchPrices` (Task 5)
- ✅ Technicals OHLCV conversion before indicators (Task 6)
- ✅ `formatMoney` helper (Task 1) replacing `fmt$` (Tasks 7-10)
- ✅ Currency context in headers (Tasks 7-10)
- ✅ Footer caveat for cross-currency (Tasks 7-10)
- ✅ AI prompt preamble + audit annotation (Task 11)
- ✅ Docs update (Task 12)
- ✅ End-to-end smoke with TSCO.L/SAP.DE (Task 13)
- ✅ `originalCurrency` plumbed onto `AIBuyRecommendation`, `IntradayAlert`, `AllocationItem` so display layer can compute `hasCrossCurrency` (Tasks 8, 9)

**Type consistency:** `defaultCurrency: string` (config), `originalCurrency: string` (QuoteData/AllocationItem/AIBuyRecommendation/IntradayAlert), `currency: string` (QuoteData post-conversion). Single field across the pipeline.

**Each commit leaves the repo working:**
- Tasks 1-2 add new modules — no existing behavior touched.
- Task 3 renames schema — at this point system still works (no FX yet, all USD).
- Task 4 adds `originalCurrency` capture + sub-unit fix — for USD-only portfolios, divisor=1, behavior identical.
- Task 5 wires FX — for USD-only portfolios, `rate=1` short-circuit, behavior identical.
- Tasks 6-10 are display/AI updates that only show currency context when ≠ default — invisible to USD-only users.
- Task 11 adds AI preamble — AI sees the new line; behavior unchanged for USD.
- Task 12 docs only.
- Task 13 verification.

Plan complete and saved to `docs/superpowers/plans/2026-04-28-international-currency-support.md`.

---

## Execution

**Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
