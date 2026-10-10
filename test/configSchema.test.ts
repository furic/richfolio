import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parsePortfolioConfig, DEFAULT_ALERTS } from "../src/configSchema.js";

const example = JSON.parse(readFileSync(resolve(process.cwd(), "config.example.json"), "utf-8"));
const minimal = {
  targetPortfolio: { VOO: 100 },
  totalPortfolioValue: 1000,
  defaultCurrency: "USD",
};

describe("parsePortfolioConfig", () => {
  test("parses config.example.json", () => {
    const c = parsePortfolioConfig(example);
    assert.equal(c.targetPortfolio.VOO, 20);
    assert.equal(c.currentHoldings.AAPL, 30);
    assert.equal(c.totalPortfolioValue, 50000);
    assert.equal(c.defaultCurrency, "USD");
    assert.deepEqual(c.watchingTickers, ["MSFT", "NVDA", "AMD"]);
    assert.deepEqual(
      c.cryptoPairSpecs.map((s) => s.ticker),
      ["BTC_CRO", "ETH_CRO"],
    );
    assert.deepEqual(c.warnings, []);
  });

  test("applies defaults", () => {
    const c = parsePortfolioConfig(minimal);
    assert.deepEqual(c.currentHoldings, {});
    assert.deepEqual(c.intradayAlerts, DEFAULT_ALERTS);
    assert.deepEqual(c.cryptoAlerts, DEFAULT_ALERTS);
    assert.equal(c.ai.strongBuyRequiresAllProviders, false);
    assert.equal(c.social.enabled, true);
    assert.equal(c.social.includeLinkInX, false);
  });

  test("merges partial alert overrides over defaults", () => {
    const c = parsePortfolioConfig({ ...minimal, intradayAlerts: { minConfidenceToAlert: 70 } });
    assert.equal(c.intradayAlerts.minConfidenceToAlert, 70);
    assert.equal(c.intradayAlerts.minPriceMovePctToAlert, DEFAULT_ALERTS.minPriceMovePctToAlert);
  });

  test("missing currency defaults to USD with a warning", () => {
    const { defaultCurrency: _drop, ...noCurrency } = minimal;
    const c = parsePortfolioConfig(noCurrency);
    assert.equal(c.defaultCurrency, "USD");
    assert.match(c.warnings.join("\n"), /defaultCurrency" missing/);
  });

  test("upper-cases currency", () => {
    assert.equal(
      parsePortfolioConfig({ ...minimal, defaultCurrency: "aud" }).defaultCurrency,
      "AUD",
    );
  });

  test("filters blank and non-string watching entries", () => {
    const c = parsePortfolioConfig({ ...minimal, watching: ["MSFT", "", 3] });
    assert.deepEqual(c.watchingTickers, ["MSFT"]);
  });

  test("skips a malformed crypto pair with a warning", () => {
    const c = parsePortfolioConfig({ ...minimal, watchingCrypto: ["BTC/CRO", "BTCCRO"] });
    assert.deepEqual(
      c.cryptoPairSpecs.map((s) => s.ticker),
      ["BTC_CRO"],
    );
    assert.match(c.warnings.join("\n"), /ignoring invalid "watchingCrypto" entry "BTCCRO"/);
  });

  const bad: Array<[string, unknown, RegExp]> = [
    ["not an object", 42, /must be a JSON object/],
    ["missing targetPortfolio", { totalPortfolioValue: 1 }, /"targetPortfolio" must be an object/],
    ["non-number target", { ...minimal, targetPortfolio: { VOO: "20" } }, /targetPortfolio\.VOO/],
    ["non-number holding", { ...minimal, currentHoldings: { VOO: "x" } }, /currentHoldings\.VOO/],
    ["string portfolio value", { ...minimal, totalPortfolioValue: "1000" }, /must be a number/],
    ["deprecated USD field", { ...minimal, totalPortfolioValueUSD: 1 }, /deprecated/],
    ["unsupported currency", { ...minimal, defaultCurrency: "XYZ" }, /not supported/],
    ["watching not array", { ...minimal, watching: "MSFT" }, /"watching" must be an array/],
    ["watchingCrypto not array", { ...minimal, watchingCrypto: "BTC/CRO" }, /"watchingCrypto"/],
  ];
  for (const [name, input, message] of bad) {
    test(`throws: ${name}`, () => {
      assert.throws(() => parsePortfolioConfig(input), message);
    });
  }
});
