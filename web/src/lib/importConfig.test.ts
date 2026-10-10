import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildImport } from "./importConfig";

const example = JSON.parse(readFileSync(resolve(process.cwd(), "../config.example.json"), "utf-8"));
const minimal = {
  targetPortfolio: { VOO: 100 },
  totalPortfolioValue: 1000,
  defaultCurrency: "USD",
};

describe("buildImport", () => {
  test("maps config.example.json", () => {
    const { payload, notes } = buildImport(example);
    assert.equal(payload.targets.length, 13);
    assert.deepEqual(
      payload.targets.find((t) => t.ticker === "VOO"),
      { ticker: "VOO", target_pct: 20 },
    );
    assert.deepEqual(
      payload.openings.find((o) => o.ticker === "AAPL"),
      { ticker: "AAPL", shares: 30 },
    );
    assert.deepEqual(payload.watchlist, [
      { symbol: "MSFT", kind: "equity" },
      { symbol: "NVDA", kind: "equity" },
      { symbol: "AMD", kind: "equity" },
      { symbol: "BTC/CRO", kind: "crypto_pair" },
      { symbol: "ETH/CRO", kind: "crypto_pair" },
    ]);
    assert.equal(payload.profile.planned_portfolio_value, 50000);
    assert.equal(payload.profile.settings.intradayAlerts.minConfidenceToAlert, 80);
    assert.ok(
      notes.some((n) => n.includes('"social"')),
      notes.join("\n"),
    );
  });

  test("normalises lowercase / padded tickers", () => {
    const { payload } = buildImport({
      ...minimal,
      targetPortfolio: { " voo ": 100 },
      watching: ["msft"],
    });
    assert.equal(payload.targets[0].ticker, "VOO");
    assert.equal(payload.watchlist[0].symbol, "MSFT");
  });

  test("skips 0-share holdings and out-of-range targets with notes, never fails", () => {
    const { payload, notes } = buildImport({
      ...minimal,
      targetPortfolio: { VOO: 100, QQQ: 0, SMH: 150 },
      currentHoldings: { AAPL: 0, MSFT: 2 },
    });
    assert.deepEqual(
      payload.targets.map((t) => t.ticker),
      ["VOO"],
    );
    assert.deepEqual(payload.openings, [{ ticker: "MSFT", shares: 2 }]);
    assert.ok(notes.some((n) => n.includes("QQQ")));
    assert.ok(notes.some((n) => n.includes("SMH")));
    assert.ok(notes.some((n) => n.includes("AAPL")));
  });

  test("skips malformed tickers with a note", () => {
    const { payload, notes } = buildImport({
      ...minimal,
      targetPortfolio: { VOO: 50, "NOT A TICKER!": 50 },
    });
    assert.deepEqual(
      payload.targets.map((t) => t.ticker),
      ["VOO"],
    );
    assert.ok(notes.some((n) => n.includes("NOT A TICKER!")));
  });

  test("keeps the first of two targets that normalise to the same ticker, with a note", () => {
    const { payload, notes } = buildImport({
      ...minimal,
      targetPortfolio: { VOO: 60, " voo ": 40 },
    });
    assert.deepEqual(payload.targets, [{ ticker: "VOO", target_pct: 60 }]);
    assert.ok(notes.some((n) => n.includes("VOO")));
  });

  test("dedupes the watchlist", () => {
    const { payload } = buildImport({ ...minimal, watching: ["MSFT", "msft"] });
    assert.equal(payload.watchlist.length, 1);
  });

  test("notes unknown keys", () => {
    const { notes } = buildImport({ ...minimal, somethingNew: 1 });
    assert.ok(notes.some((n) => n.includes('"somethingNew"')));
  });

  test("drops unknown alert keys so the database schema accepts the settings", () => {
    const { payload } = buildImport({
      ...minimal,
      intradayAlerts: { minConfidenceToAlert: 70, legacyKnob: true },
    });
    assert.equal(payload.profile.settings.intradayAlerts.minConfidenceToAlert, 70);
    assert.ok(!("legacyKnob" in payload.profile.settings.intradayAlerts));
  });

  test("throws on an invalid config, and on settings the schema rejects", () => {
    assert.throws(() => buildImport({ targetPortfolio: { VOO: 100 } }), /totalPortfolioValue/);
    assert.throws(
      () => buildImport({ ...minimal, cryptoAlerts: { onlyAlertForActions: ["SELL"] } }),
      /onlyAlertForActions/,
    );
  });
});
