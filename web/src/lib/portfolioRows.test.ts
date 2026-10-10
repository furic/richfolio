import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildRows, mergeRowValues, parseRowInput, type PortfolioRow } from "./portfolioRows";

describe("buildRows", () => {
  test("merges targets and openings by ticker, sorted", () => {
    const rows = buildRows(
      [
        { ticker: "VOO", target_pct: 20 },
        { ticker: "BTC", target_pct: 5 },
      ],
      [
        { ticker: "VOO", shares: 10, price: 500, currency: "USD" },
        { ticker: "AAPL", shares: 30, price: null, currency: null },
      ],
    );
    assert.deepEqual(rows, [
      { ticker: "AAPL", targetPct: null, shares: 30, avgPrice: null, currency: null },
      { ticker: "BTC", targetPct: 5, shares: null, avgPrice: null, currency: null },
      { ticker: "VOO", targetPct: 20, shares: 10, avgPrice: 500, currency: "USD" },
    ]);
  });
});

describe("parseRowInput", () => {
  const ok = (targetPct: string, shares: string, avgPrice = "") =>
    parseRowInput({ targetPct, shares, avgPrice });
  test("blank fields become null", () => {
    assert.deepEqual(ok("20", ""), { targetPct: 20, shares: null, avgPrice: null });
    assert.deepEqual(ok("", "3", "101.5"), { targetPct: null, shares: 3, avgPrice: 101.5 });
  });
  test("needs a target or shares", () => {
    assert.equal(ok("", ""), "Enter a target %, shares held, or both.");
  });
  test("rejects out-of-range and non-finite numbers", () => {
    for (const [t, s, p] of [
      ["0.004", ""],
      ["101", ""],
      ["-1", ""],
      ["", "0"],
      ["", "-2"],
      ["", "1e999"],
      ["", "1", "-5"],
      ["", "1", "1e999"],
    ]) {
      assert.equal(typeof ok(t, s, p ?? ""), "string", `${t}|${s}|${p}`);
    }
  });
  test("avg price needs shares", () => {
    assert.equal(ok("10", "", "50"), "Enter shares held to record an average price.");
  });
});

describe("mergeRowValues", () => {
  const full: PortfolioRow = {
    ticker: "VOO",
    targetPct: 20,
    shares: 10,
    avgPrice: 500,
    currency: "USD",
  };
  test("target-only add keeps shares, price and currency", () => {
    assert.deepEqual(mergeRowValues(full, { targetPct: 30, shares: null, avgPrice: null }), {
      targetPct: 30,
      shares: 10,
      avgPrice: 500,
      currency: "USD",
    });
  });
  test("shares-only add keeps the target", () => {
    const targetOnly: PortfolioRow = {
      ticker: "BTC",
      targetPct: 5,
      shares: null,
      avgPrice: null,
      currency: null,
    };
    assert.deepEqual(mergeRowValues(targetOnly, { targetPct: null, shares: 0.5, avgPrice: null }), {
      targetPct: 5,
      shares: 0.5,
      avgPrice: null,
      currency: null,
    });
  });
  test("all fields given overwrite everything", () => {
    assert.deepEqual(mergeRowValues(full, { targetPct: 40, shares: 2, avgPrice: 600 }), {
      targetPct: 40,
      shares: 2,
      avgPrice: 600,
      currency: null,
    });
  });
});

describe("parseRowInput with an existing row", () => {
  test("avg price is fine when the existing row already has shares", () => {
    const existing: PortfolioRow = {
      ticker: "VOO",
      targetPct: null,
      shares: 10,
      avgPrice: null,
      currency: null,
    };
    assert.deepEqual(parseRowInput({ targetPct: "", shares: "", avgPrice: "50" }, existing), {
      targetPct: null,
      shares: null,
      avgPrice: 50,
    });
  });
});
