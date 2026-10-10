import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, validateSettings, withDefaults } from "./settings";

describe("validateSettings", () => {
  test("defaults are valid", () => {
    assert.deepEqual(validateSettings(DEFAULT_SETTINGS), []);
  });
  test("wrong type is reported with its path", () => {
    const errors = validateSettings({ intradayAlerts: { minConfidenceToAlert: "high" } });
    assert.ok(
      errors.some((e) => e.includes("/intradayAlerts/minConfidenceToAlert")),
      errors.join("; "),
    );
  });
  test("unknown keys and actions are rejected", () => {
    assert.ok(validateSettings({ unknownKey: true }).length > 0);
    assert.ok(validateSettings({ cryptoAlerts: { onlyAlertForActions: ["SELL"] } }).length > 0);
  });
});

describe("withDefaults", () => {
  test("fills gaps from the pipeline defaults", () => {
    const s = withDefaults({ intradayAlerts: { minConfidenceToAlert: 70 } });
    assert.equal(s.intradayAlerts.minConfidenceToAlert, 70);
    assert.equal(s.intradayAlerts.minPriceMovePctToAlert, 1.0);
    assert.deepEqual(s.cryptoAlerts, DEFAULT_SETTINGS.cryptoAlerts);
    assert.equal(s.delivery.email, true);
  });
  test("null/empty becomes the defaults", () => {
    assert.deepEqual(withDefaults(null), DEFAULT_SETTINGS);
    assert.deepEqual(withDefaults({}), DEFAULT_SETTINGS);
  });
});
