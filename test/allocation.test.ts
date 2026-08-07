import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildAllocationReport, type AllocationInputs } from "../src/allocation.js";
import type { QuoteData } from "../src/fetchPrices.js";

// ── Fixtures ─────────────────────────────────────────────────────────

function quote(ticker: string, overrides?: Partial<QuoteData>): QuoteData {
  return {
    ticker,
    longName: `${ticker} Inc.`,
    originalCurrency: "USD",
    currency: "USD",
    price: 100,
    trailingPE: null,
    forwardPE: null,
    avgPE: null,
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow: null,
    fiftyTwoWeekPercent: null,
    dividendYield: null,
    beta: null,
    ...overrides,
  } as QuoteData;
}

// VOO: in target AND held. SMH: in target, zero shares. MSFT: held only.
// GOOG: watched (and also held, to prove watching wins).
const priceData: Record<string, QuoteData> = {
  VOO: quote("VOO", { price: 670, beta: 1.0, dividendYield: 0.013 }),
  SMH: quote("SMH", { price: 300 }),
  MSFT: quote("MSFT", { price: 494.9, beta: 0.9, dividendYield: 0.007 }),
  GOOG: quote("GOOG", { price: 201.4 }),
};

const inputs: AllocationInputs = {
  targetPortfolio: { VOO: 60, SMH: 20 },
  currentHoldings: { VOO: 10, MSFT: 16, GOOG: 5 },
  totalPortfolioValue: 0, // force portfolioValue to come from real holdings
  watchingSet: new Set(["GOOG"]),
};

const report = () => buildAllocationReport(priceData, inputs);

const tickers = (items: { ticker: string }[]) => items.map((i) => i.ticker).sort();

// A held-only ticker is one in currentHoldings with no targetPortfolio entry and
// not in watching. With an implied 0% target its gap is always negative, which
// used to render as permanent "N% overweight" noise in the daily brief and a
// standing TRIM in the weekly report — neither actionable, since Richfolio is
// buy-only and has no sell logic behind them.
describe("buildAllocationReport — held-only ticker routing", () => {
  test("a held-only ticker lands in untrackedItems, not items", () => {
    const r = report();
    assert.ok(!tickers(r.items).includes("MSFT"), "MSFT must not be a tracked allocation item");
    assert.deepEqual(tickers(r.untrackedItems), ["MSFT"]);
  });

  test("a ticker in both target and holdings stays in items", () => {
    const r = report();
    assert.ok(tickers(r.items).includes("VOO"));
    assert.ok(!tickers(r.untrackedItems).includes("VOO"));
  });

  test("a target ticker with zero shares held stays in items", () => {
    const r = report();
    const smh = r.items.find((i) => i.ticker === "SMH");
    assert.ok(smh, "SMH must remain a tracked item so its gap can be closed");
    assert.equal(smh.currentShares, 0);
    assert.ok(smh.gapPct > 0, "zero-held target ticker is underweight");
  });

  test("a watched ticker is in watchingItems and in neither allocation array", () => {
    const r = report();
    assert.deepEqual(tickers(r.watchingItems), ["GOOG"]);
    assert.ok(!tickers(r.items).includes("GOOG"));
    assert.ok(
      !tickers(r.untrackedItems).includes("GOOG"),
      "watching takes precedence over held-only",
    );
  });

  test("untrackedItems carry the full AllocationItem shape", () => {
    const msft = report().untrackedItems[0];
    assert.equal(msft.ticker, "MSFT");
    assert.equal(msft.currentShares, 16);
    assert.equal(msft.price, 494.9);
    assert.equal(msft.targetPct, 0);
    assert.ok(msft.currentValue > 0);
    assert.equal(msft.suggestedBuyValue, 0, "nothing to buy toward with no target");
  });
});

// Goal 3 of the design: totals must still reflect ALL real holdings. Held-only
// positions are real exposure paying real dividends — dropping them from these
// loops would understate portfolio risk and income.
describe("buildAllocationReport — aggregates include held-only holdings", () => {
  test("portfolioBeta includes the held-only contribution", () => {
    const withMsft = report().portfolioBeta;

    // Same config minus the held-only position.
    const withoutMsft = buildAllocationReport(priceData, {
      ...inputs,
      currentHoldings: { VOO: 10, GOOG: 5 },
    }).portfolioBeta;

    assert.ok(withMsft != null && withoutMsft != null);
    assert.notEqual(withMsft, withoutMsft, "MSFT's beta must move the portfolio number");

    // VOO 10×670=6700 @1.0, MSFT 16×494.9=7918.4 @0.9 → weighted ≈ 0.946
    const expected = Math.round(((1.0 * 6700 + 0.9 * 7918.4) / (6700 + 7918.4)) * 100) / 100;
    assert.equal(withMsft, expected);
  });

  test("estimatedAnnualDividend includes the held-only contribution", () => {
    const r = report();
    // VOO 6700 × 0.013 + MSFT 7918.4 × 0.007
    const expected = Math.round((6700 * 0.013 + 7918.4 * 0.007) * 100) / 100;
    assert.equal(r.estimatedAnnualDividend, expected);
  });

  test("totalCurrentValue counts every holding, tracked or not", () => {
    const r = report();
    // VOO 6700 + MSFT 7918.4 + GOOG 5×201.4=1007
    assert.equal(r.totalCurrentValue, Math.round((6700 + 7918.4 + 1007) * 100) / 100);
  });
});

describe("buildAllocationReport — edge cases", () => {
  test("no held-only tickers yields an empty untrackedItems", () => {
    const r = buildAllocationReport(priceData, {
      ...inputs,
      currentHoldings: { VOO: 10 },
    });
    assert.deepEqual(r.untrackedItems, []);
  });

  test("a ticker with no quote is skipped entirely", () => {
    const r = buildAllocationReport(priceData, {
      ...inputs,
      currentHoldings: { VOO: 10, NOSUCH: 99 },
    });
    assert.ok(!tickers(r.untrackedItems).includes("NOSUCH"));
    assert.ok(!tickers(r.items).includes("NOSUCH"));
  });

  test("untrackedItems are sorted by value, largest first", () => {
    const r = buildAllocationReport(
      { ...priceData, AMZN: quote("AMZN", { price: 200 }) },
      { ...inputs, currentHoldings: { VOO: 10, MSFT: 16, AMZN: 3 } },
    );
    assert.deepEqual(
      r.untrackedItems.map((i) => i.ticker),
      ["MSFT", "AMZN"],
    );
  });
});
