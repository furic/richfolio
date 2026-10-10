import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  normaliseTicker,
  isValidEquitySymbol,
  parsePair,
  toYahooSymbol,
  classifyYahooChart,
  findPairInstrument,
  statusWrite,
  unverifiedInfo,
  invalidShapeReason,
  usableInstruments,
} from "../supabase/functions/ticker-lookup/lookup.js";

const chart = (meta: object) => ({ chart: { result: [{ meta }], error: null } });

describe("normaliseTicker", () => {
  test("upper-cases and strips whitespace from equities", () => {
    assert.equal(normaliseTicker("  voo ", "equity"), "VOO");
    assert.equal(normaliseTicker("azn .l", "equity"), "AZN.L");
  });
  test("normalises spaces around a pair slash", () => {
    assert.equal(normaliseTicker(" btc / cro ", "crypto_pair"), "BTC/CRO");
  });
});

describe("isValidEquitySymbol / parsePair", () => {
  test("accepts real symbol shapes, rejects junk", () => {
    for (const s of ["VOO", "AZN.L", "BRK-B", "CL=F"]) assert.ok(isValidEquitySymbol(s), s);
    for (const s of ["", "voo", "VO O", ".L", "ABCDEFGHIJKLMNOP"])
      assert.ok(!isValidEquitySymbol(s), s);
  });
  test("parsePair", () => {
    assert.deepEqual(parsePair("BTC/CRO"), { base: "BTC", quote: "CRO" });
    assert.equal(parsePair("BTCCRO"), null);
    assert.equal(parsePair("CRO/CRO"), null);
  });
});

describe("toYahooSymbol", () => {
  test("maps the supported crypto holdings, passes equities through", () => {
    assert.equal(toYahooSymbol("BTC"), "BTC-USD");
    assert.equal(toYahooSymbol("ETH"), "ETH-USD");
    assert.equal(toYahooSymbol("VOO"), "VOO");
  });
});

describe("classifyYahooChart", () => {
  test("verified equity carries name, exchange, currency", () => {
    const r = classifyYahooChart(
      "AZN.L",
      200,
      chart({
        instrumentType: "EQUITY",
        longName: "AstraZeneca PLC",
        fullExchangeName: "LSE",
        currency: "GBp",
      }),
    );
    assert.deepEqual(r, {
      ok: true,
      info: {
        symbol: "AZN.L",
        kind: "equity",
        verified: true,
        name: "AstraZeneca PLC",
        exchange: "LSE",
        quoteCurrency: "GBp",
      },
    });
  });
  test("404 Not Found is a definitive no", () => {
    const r = classifyYahooChart("VOOO", 404, {
      chart: { result: null, error: { code: "Not Found" } },
    });
    assert.equal(r.ok, false);
    assert.match((r as { reason: string }).reason, /no ticker "VOOO"/);
  });
  test("throttled / blocked responses fall back to unverified, not rejection", () => {
    for (const status of [401, 403, 429, 500, 503]) {
      assert.deepEqual(classifyYahooChart("VOO", status, null), {
        ok: true,
        info: unverifiedInfo("VOO", "equity"),
      });
    }
  });
  test("unsupported crypto holding rejected; BTC accepted", () => {
    const crypto = chart({ instrumentType: "CRYPTOCURRENCY", currency: "USD" });
    assert.equal(classifyYahooChart("SOL", 200, crypto).ok, false);
    assert.equal(classifyYahooChart("BTC-USD", 200, crypto).ok, false);
    assert.equal(classifyYahooChart("BTC", 200, crypto).ok, true);
  });
});

describe("findPairInstrument", () => {
  const instruments = [
    { symbol: "CRO_BTC", inst_type: "CCY_PAIR", tradable: true },
    { symbol: "ETH_CRO", inst_type: "CCY_PAIR", tradable: true },
    { symbol: "SOL_CRO", inst_type: "CCY_PAIR", tradable: false },
    { symbol: "BTCUSD-PERP", inst_type: "PERPETUAL_SWAP", tradable: true },
  ];
  test("either listing direction is accepted", () => {
    assert.equal(findPairInstrument("BTC/CRO", instruments).ok, true);
    assert.equal(findPairInstrument("ETH/CRO", instruments).ok, true);
  });
  test("untradable or missing markets are rejected", () => {
    assert.equal(findPairInstrument("SOL/CRO", instruments).ok, false);
    assert.equal(findPairInstrument("DOGE/CRO", instruments).ok, false);
  });
  test("malformed pair is rejected with a format hint", () => {
    const r = findPairInstrument("BTCCRO", instruments);
    assert.equal(r.ok, false);
    assert.match((r as { reason: string }).reason, /BASE\/QUOTE/);
  });
});

describe("statusWrite", () => {
  test("a verified result overwrites", () => {
    const info = {
      symbol: "VOO",
      kind: "equity" as const,
      verified: true,
      name: "Vanguard",
      exchange: "NYSEArca",
      quoteCurrency: "USD",
    };
    const w = statusWrite(info);
    assert.equal(w.ignoreDuplicates, false);
    assert.equal(w.row.quote_currency, "USD");
  });
  test("an unverified result never overwrites an existing row", () => {
    assert.equal(statusWrite(unverifiedInfo("VOO", "equity")).ignoreDuplicates, true);
  });
});

describe("invalidShapeReason", () => {
  test("rejects junk equities and oversized input, passes real ones", () => {
    assert.match(invalidShapeReason("FOOBAR!!", "equity") ?? "", /isn't a valid ticker/);
    assert.ok(invalidShapeReason("A".repeat(10_000), "equity"));
    assert.equal(invalidShapeReason("AZN.L", "equity"), null);
  });
  test("a pair string is not a valid equity", () => {
    assert.ok(invalidShapeReason("BTC/CRO", "equity"));
    assert.ok(invalidShapeReason("BTC/CRO".toLowerCase(), "equity"));
  });
  test("pair shape is left to parsePair", () => {
    assert.equal(invalidShapeReason("BTC/CRO", "crypto_pair"), null);
  });
});

describe("usableInstruments", () => {
  test("missing, non-array or empty data is not evidence of absence", () => {
    for (const d of [undefined, null, {}, "x", []]) assert.equal(usableInstruments(d), null);
  });
  test("a non-empty array passes through", () => {
    const d = [{ symbol: "CRO_BTC", inst_type: "CCY_PAIR", tradable: true }];
    assert.equal(usableInstruments(d), d);
  });
});
