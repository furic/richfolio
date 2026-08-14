import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  formatMoney,
  applyFxRate,
  SUB_UNIT_FIX,
  getLatestPrice,
  applyLatestPrice,
  resolveTrendPrice,
  buildPriceMap,
} from "../src/util.js";
import type { QuoteData } from "../src/fetchPrices.js";
import type { AllocationReport } from "../src/analyze.js";

// ── Helpers ──────────────────────────────────────────────────────────

function makeQuote(overrides?: Partial<QuoteData>): QuoteData {
  return {
    ticker: "TEST",
    name: "Test Corp",
    longName: "Test Corp Inc.",
    currency: "USD",
    originalCurrency: "USD",
    price: 100,
    trailingPE: null,
    forwardPE: null,
    avgPE: null,
    fiftyTwoWeekHigh: 150,
    fiftyTwoWeekLow: 80,
    fiftyTwoWeekPercent: 0.5,
    marketCap: 1_000_000,
    dividendYield: null,
    beta: null,
    holdings: null,
    returnOnEquity: null,
    debtToEquity: null,
    freeCashflow: 50_000,
    operatingCashflow: 60_000,
    profitMargins: null,
    revenueGrowth: null,
    earningsGrowth: null,
    targetMeanPrice: 120,
    recommendationKey: null,
    postMarketPrice: 101,
    preMarketPrice: 99,
    earningsDate: null,
    daysToEarnings: null,
    ...overrides,
  };
}

// ── formatMoney ──────────────────────────────────────────────────────

describe("formatMoney", () => {
  // Known currency prefixes
  test("USD uses $ prefix", () => assert.equal(formatMoney(1234, "USD"), "$1,234"));
  test("GBP uses £ prefix", () => assert.equal(formatMoney(1234, "GBP"), "£1,234"));
  test("EUR uses € prefix", () => assert.equal(formatMoney(1234, "EUR"), "€1,234"));
  test("JPY uses ¥ prefix", () => assert.equal(formatMoney(1234, "JPY"), "¥1,234"));
  test("AUD uses A$ prefix", () => assert.equal(formatMoney(1234, "AUD"), "A$1,234"));
  test("CAD uses CA$ prefix", () => assert.equal(formatMoney(1234, "CAD"), "CA$1,234"));
  test("NZD uses NZ$ prefix", () => assert.equal(formatMoney(1234, "NZD"), "NZ$1,234"));
  test("CHF uses CHF prefix with space", () => assert.equal(formatMoney(1234, "CHF"), "CHF 1,234"));
  test("HKD uses HK$ prefix", () => assert.equal(formatMoney(1234, "HKD"), "HK$1,234"));
  test("SGD uses S$ prefix", () => assert.equal(formatMoney(1234, "SGD"), "S$1,234"));

  // Fallback for unknown currency
  test("unknown currency uses amount + code suffix", () =>
    assert.equal(formatMoney(1234, "ZZZ"), "1,234 ZZZ"));
  test("unknown currency negative", () => assert.equal(formatMoney(-500, "ZZZ"), "-500 ZZZ"));

  // Crypto cross-pairs ride the same fallback, and it has to render them
  // legibly — this is what makes pricing them in the quote coin workable without
  // touching formatMoney at all. It also has to NOT emit a "$", which would
  // claim an FX conversion that never happened.
  test("a crypto cross-pair renders as a grouped amount plus its coin", () => {
    assert.equal(formatMoney(1_295_840, "CRO"), "1,295,840 CRO");
    assert.equal(formatMoney(38_599, "CRO"), "38,599 CRO");
  });
  test("a crypto cross-pair never renders a currency symbol", () => {
    for (const amount of [1_295_840, 38_599, 0.5, -12]) {
      assert.ok(!formatMoney(amount, "CRO").includes("$"), `${amount} must not render a $`);
    }
  });

  // Edge cases
  test("zero", () => assert.equal(formatMoney(0, "USD"), "$0"));
  test("negative amount", () => assert.equal(formatMoney(-500, "USD"), "-$500"));
  test("negative GBP", () => assert.equal(formatMoney(-1234, "GBP"), "-£1,234"));
  test("rounds fractional amount up", () => assert.equal(formatMoney(1234.56, "USD"), "$1,235"));
  test("rounds fractional JPY", () => assert.equal(formatMoney(1234.56, "JPY"), "¥1,235"));
  test("large number with comma grouping", () =>
    assert.equal(formatMoney(1_234_567, "USD"), "$1,234,567"));
  test("sub-dollar amount rounds to zero", () => assert.equal(formatMoney(0.49, "USD"), "$0"));
  test("sub-dollar amount rounds to one", () => assert.equal(formatMoney(0.5, "USD"), "$1"));
});

// ── applyFxRate ──────────────────────────────────────────────────────

describe("applyFxRate — rate = 1 (same currency, no conversion)", () => {
  const q = makeQuote();
  const result = applyFxRate(q, 1, "USD");

  test("price unchanged", () => assert.equal(result.price, 100));
  test("fiftyTwoWeekHigh unchanged", () => assert.equal(result.fiftyTwoWeekHigh, 150));
  test("fiftyTwoWeekLow unchanged", () => assert.equal(result.fiftyTwoWeekLow, 80));
  test("marketCap unchanged", () => assert.equal(result.marketCap, 1_000_000));
  test("freeCashflow unchanged", () => assert.equal(result.freeCashflow, 50_000));
  test("operatingCashflow unchanged", () => assert.equal(result.operatingCashflow, 60_000));
  test("targetMeanPrice unchanged", () => assert.equal(result.targetMeanPrice, 120));
  test("postMarketPrice unchanged", () => assert.equal(result.postMarketPrice, 101));
  test("preMarketPrice unchanged", () => assert.equal(result.preMarketPrice, 99));
  test("currency set to defaultCurrency", () => assert.equal(result.currency, "USD"));
  test("originalCurrency preserved", () => assert.equal(result.originalCurrency, "USD"));
  test("returns a new object (spread)", () => assert.notStrictEqual(result, q));
});

describe("applyFxRate — rate = 2 (doubles all monetary fields)", () => {
  const q = makeQuote({ originalCurrency: "GBP", currency: "GBP" });
  const result = applyFxRate(q, 2, "USD");

  test("price doubled", () => assert.equal(result.price, 200));
  test("fiftyTwoWeekHigh doubled", () => assert.equal(result.fiftyTwoWeekHigh, 300));
  test("fiftyTwoWeekLow doubled", () => assert.equal(result.fiftyTwoWeekLow, 160));
  test("marketCap doubled", () => assert.equal(result.marketCap, 2_000_000));
  test("freeCashflow doubled", () => assert.equal(result.freeCashflow, 100_000));
  test("operatingCashflow doubled", () => assert.equal(result.operatingCashflow, 120_000));
  test("targetMeanPrice doubled", () => assert.equal(result.targetMeanPrice, 240));
  test("postMarketPrice doubled", () => assert.equal(result.postMarketPrice, 202));
  test("preMarketPrice doubled", () => assert.equal(result.preMarketPrice, 198));
  test("currency set to USD", () => assert.equal(result.currency, "USD"));
  test("originalCurrency preserved as GBP", () => assert.equal(result.originalCurrency, "GBP"));
});

describe("applyFxRate — non-monetary fields are not touched", () => {
  const q = makeQuote({ trailingPE: 25, forwardPE: 22, beta: 1.2, dividendYield: 0.03 });
  const result = applyFxRate(q, 2, "USD");

  test("trailingPE unchanged", () => assert.equal(result.trailingPE, 25));
  test("forwardPE unchanged", () => assert.equal(result.forwardPE, 22));
  test("beta unchanged", () => assert.equal(result.beta, 1.2));
  test("dividendYield unchanged", () => assert.equal(result.dividendYield, 0.03));
  test("fiftyTwoWeekPercent unchanged", () => assert.equal(result.fiftyTwoWeekPercent, 0.5));
});

describe("applyFxRate — null nullable fields stay null", () => {
  const q = makeQuote({
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow: null,
    marketCap: null,
    freeCashflow: null,
    operatingCashflow: null,
    targetMeanPrice: null,
    postMarketPrice: null,
    preMarketPrice: null,
  });
  const result = applyFxRate(q, 1.5, "EUR");

  test("fiftyTwoWeekHigh stays null", () => assert.equal(result.fiftyTwoWeekHigh, null));
  test("fiftyTwoWeekLow stays null", () => assert.equal(result.fiftyTwoWeekLow, null));
  test("marketCap stays null", () => assert.equal(result.marketCap, null));
  test("freeCashflow stays null", () => assert.equal(result.freeCashflow, null));
  test("operatingCashflow stays null", () => assert.equal(result.operatingCashflow, null));
  test("targetMeanPrice stays null", () => assert.equal(result.targetMeanPrice, null));
  test("postMarketPrice stays null", () => assert.equal(result.postMarketPrice, null));
  test("preMarketPrice stays null", () => assert.equal(result.preMarketPrice, null));
  test("price still scaled", () => assert.equal(result.price, 150));
});

// ── SUB_UNIT_FIX ─────────────────────────────────────────────────────

describe("SUB_UNIT_FIX map", () => {
  test("GBp → GBP ÷100", () => {
    assert.equal(SUB_UNIT_FIX["GBp"]?.realCurrency, "GBP");
    assert.equal(SUB_UNIT_FIX["GBp"]?.divisor, 100);
  });

  test("GBX → GBP ÷100 (alternate feed alias)", () => {
    assert.equal(SUB_UNIT_FIX["GBX"]?.realCurrency, "GBP");
    assert.equal(SUB_UNIT_FIX["GBX"]?.divisor, 100);
  });

  test("ILA → ILS ÷100 (TASE agorot)", () => {
    assert.equal(SUB_UNIT_FIX["ILA"]?.realCurrency, "ILS");
    assert.equal(SUB_UNIT_FIX["ILA"]?.divisor, 100);
  });

  test("ZAc → ZAR ÷100 (JSE cents)", () => {
    assert.equal(SUB_UNIT_FIX["ZAc"]?.realCurrency, "ZAR");
    assert.equal(SUB_UNIT_FIX["ZAc"]?.divisor, 100);
  });

  test("USD is not in the map (major currencies need no fix)", () =>
    assert.equal(SUB_UNIT_FIX["USD"], undefined));

  test("GBP is not in the map (only the pence sub-unit is)", () =>
    assert.equal(SUB_UNIT_FIX["GBP"], undefined));
});

// ── getLatestPrice ───────────────────────────────────────────────────

describe("getLatestPrice — freshest-quote preference", () => {
  test("prefers after-hours over pre-market and regular", () => {
    const { price, source } = getLatestPrice(
      makeQuote({ price: 100, postMarketPrice: 110, preMarketPrice: 105 }),
    );
    assert.equal(price, 110);
    assert.equal(source, "after-hours");
  });

  test("falls back to pre-market when post-market is null", () => {
    const { price, source } = getLatestPrice(
      makeQuote({ price: 100, postMarketPrice: null, preMarketPrice: 105 }),
    );
    assert.equal(price, 105);
    assert.equal(source, "pre-market");
  });

  test("falls back to regular when both extended-hours prices are null", () => {
    const { price, source } = getLatestPrice(
      makeQuote({ price: 100, postMarketPrice: null, preMarketPrice: null }),
    );
    assert.equal(price, 100);
    assert.equal(source, "regular");
  });
});

// ── applyLatestPrice ─────────────────────────────────────────────────

describe("applyLatestPrice — swap price + rescale price-derived fields", () => {
  test("after-hours: scales P/E and recomputes 52w position", () => {
    const q = makeQuote({
      price: 100,
      postMarketPrice: 110, // +10%
      preMarketPrice: null,
      trailingPE: 20,
      forwardPE: 18,
      fiftyTwoWeekHigh: 150,
      fiftyTwoWeekLow: 50,
      fiftyTwoWeekPercent: 0.5,
    });
    const res = applyLatestPrice(q);
    assert.equal(res.source, "after-hours");
    assert.equal(res.regularPrice, 100);
    assert.equal(q.price, 110);
    assert.equal(q.trailingPE, 22); // 20 × 1.1
    assert.ok(Math.abs(q.forwardPE! - 19.8) < 1e-9); // 18 × 1.1
    assert.equal(q.fiftyTwoWeekPercent, 0.6); // (110-50)/(150-50)
  });

  test("no extended-hours quote: no-op, leaves fields untouched", () => {
    const q = makeQuote({
      price: 100,
      postMarketPrice: null,
      preMarketPrice: null,
      trailingPE: 20,
      fiftyTwoWeekPercent: 0.5,
    });
    const res = applyLatestPrice(q);
    assert.equal(res.source, "regular");
    assert.equal(q.price, 100);
    assert.equal(q.trailingPE, 20);
    assert.equal(q.fiftyTwoWeekPercent, 0.5);
  });

  test("null P/E (e.g. ETF) stays null while 52w still recomputes", () => {
    const q = makeQuote({
      price: 100,
      postMarketPrice: 90, // -10%
      preMarketPrice: null,
      trailingPE: null,
      forwardPE: null,
      fiftyTwoWeekHigh: 150,
      fiftyTwoWeekLow: 50,
    });
    applyLatestPrice(q);
    assert.equal(q.price, 90);
    assert.equal(q.trailingPE, null);
    assert.equal(q.forwardPE, null);
    assert.equal(q.fiftyTwoWeekPercent, 0.4); // (90-50)/100
  });
});

// ── resolveTrendPrice ────────────────────────────────────────────────
// Chart closes are in raw units (close × fxRate, no sub-unit divisor); the
// spot price is in final default currency. They match for normal currencies
// but are ~100× apart for sub-unit ones (LSE pence) — the ±50% guard keeps
// those (and erroneous thin prints) on the close.

describe("resolveTrendPrice — fresh spot with sanity guard", () => {
  test("uses the spot price for a normal after-hours move", () => {
    assert.equal(resolveTrendPrice(100, 103), 103); // +3%
    assert.equal(resolveTrendPrice(100, 92), 92); // -8%
  });

  test("falls back to close when spot is missing", () => {
    assert.equal(resolveTrendPrice(100), 100);
    assert.equal(resolveTrendPrice(100, null), 100);
    assert.equal(resolveTrendPrice(100, 0), 100);
  });

  test("falls back to close on a units mismatch (sub-unit currency)", () => {
    // quote.price in £ (÷100) vs chart close in pence → ratio ≈ 0.01
    assert.equal(resolveTrendPrice(5000, 50), 5000);
  });

  test("falls back to close on an absurd ratio (bad thin print)", () => {
    assert.equal(resolveTrendPrice(100, 250), 100); // +150% is never a real move
    assert.equal(resolveTrendPrice(100, 40), 100); // -60%
  });

  test("boundaries: ±50% is accepted, just beyond is rejected", () => {
    assert.equal(resolveTrendPrice(100, 50), 50); // ratio 0.5 → accepted
    assert.equal(resolveTrendPrice(100, 200), 200); // ratio 2.0 → accepted
    assert.equal(resolveTrendPrice(100, 49), 100); // ratio 0.49 → rejected
  });
});

// Watch-list tickers live in `watchingItems`, not `items`. Omitting them from
// the price map left the intraday frozen-data guard with no prices to compare,
// and it fails open — so every AI scoring flip on a watch ticker alerted.
describe("buildPriceMap — covers watch-list tickers", () => {
  const report = {
    items: [
      { ticker: "VOO", price: 673.2 },
      { ticker: "BSV", price: 77.74 },
    ],
    watchingItems: [
      { ticker: "GOOG", price: 201.4 },
      { ticker: "TSM", price: 310.0 },
    ],
    portfolioBeta: 1,
    estimatedAnnualDividend: 0,
    totalCurrentValue: 0,
  } as unknown as AllocationReport;

  test("includes both target holdings and watch-list tickers", () => {
    assert.deepEqual(buildPriceMap(report), {
      VOO: 673.2,
      BSV: 77.74,
      GOOG: 201.4,
      TSM: 310.0,
    });
  });

  test("every watch ticker gets a non-zero price (the guard needs > 0)", () => {
    const map = buildPriceMap(report);
    for (const w of report.watchingItems) {
      assert.ok(map[w.ticker] > 0, `${w.ticker} must have a price or the guard fails open`);
    }
  });

  test("handles an empty watch list", () => {
    const noWatch = { ...report, watchingItems: [] } as unknown as AllocationReport;
    assert.deepEqual(buildPriceMap(noWatch), { VOO: 673.2, BSV: 77.74 });
  });
});
