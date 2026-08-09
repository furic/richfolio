import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildSignalLines,
  buildPostText,
  intradayAlertsToSignals,
  sanitizeReason,
  defuseEmoticons,
  DISCLAIMER,
  type SignalSource,
} from "../src/socialContent.js";
import type { IntradayAlert } from "../src/intradayCompare.js";

// A rec carries private allocation fields alongside the generic ones. We feed
// distinctive private values and assert they never reach the public output.
const PRIVATE_BUY_VALUE = 99999;

function makeSource(overrides?: Partial<SignalSource> & Record<string, unknown>): SignalSource {
  return {
    ticker: "NVDA",
    tickerFullName: "NVIDIA Corp",
    action: "STRONG BUY",
    confidence: 88,
    reason: "Strong momentum and undervalued vs peers.",
    valueRating: "undervalued",
    analysisUrl: "https://example.com/a/nvda",
    // Private fields that exist on the real AIBuyRecommendation but must be ignored:
    suggestedBuyValue: PRIVATE_BUY_VALUE,
    suggestedBuyShares: 12345,
    gapPct: 7.7,
    ...overrides,
  } as SignalSource;
}

describe("buildSignalLines", () => {
  test("keeps only STRONG BUY and BUY", () => {
    const lines = buildSignalLines([
      makeSource({ ticker: "A", action: "STRONG BUY" }),
      makeSource({ ticker: "B", action: "BUY" }),
      makeSource({ ticker: "C", action: "HOLD" }),
      makeSource({ ticker: "D", action: "WAIT" }),
    ]);
    assert.deepEqual(
      lines.map((l) => l.ticker),
      ["A", "B"],
    );
  });

  test("sorts STRONG BUY before BUY, then by confidence", () => {
    const lines = buildSignalLines([
      makeSource({ ticker: "B", action: "BUY", confidence: 90 }),
      makeSource({ ticker: "S1", action: "STRONG BUY", confidence: 70 }),
      makeSource({ ticker: "S2", action: "STRONG BUY", confidence: 85 }),
    ]);
    assert.deepEqual(
      lines.map((l) => l.ticker),
      ["S2", "S1", "B"],
    );
  });

  test("projects onto the allowlist — private fields do not survive", () => {
    const [line] = buildSignalLines([makeSource()]);
    assert.deepEqual(Object.keys(line).sort(), [
      "action",
      "analysisUrl",
      "confidence",
      "reason",
      "ticker",
      "tickerFullName",
      "valueRating",
    ]);
    assert.equal((line as Record<string, unknown>).suggestedBuyValue, undefined);
    assert.equal((line as Record<string, unknown>).gapPct, undefined);
  });
});

describe("buildPostText", () => {
  const sources = [
    makeSource({ ticker: "NVDA", action: "STRONG BUY", confidence: 88 }),
    makeSource({ ticker: "SMH", action: "BUY", confidence: 76 }),
  ];

  test("never leaks private values on any platform", () => {
    for (const platform of ["x", "facebook", "linkedin", "threads"] as const) {
      const text = buildPostText(sources, platform, "daily", { includeLinkInX: true });
      assert.ok(!text.includes(String(PRIVATE_BUY_VALUE)), `${platform} leaked buy value`);
      assert.ok(!text.includes("12345"), `${platform} leaked shares`);
      assert.ok(!text.includes("7.7"), `${platform} leaked gap`);
    }
  });

  test("appends the disclaimer", () => {
    const text = buildPostText(sources, "linkedin", "daily");
    assert.ok(text.includes(DISCLAIMER));
  });

  test("respects the 280-char X budget", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      makeSource({ ticker: `TICK${i}`, reason: "x".repeat(500) }),
    );
    const text = buildPostText(many, "x", "daily", { includeLinkInX: true });
    assert.ok(text.length <= 280, `X post was ${text.length} chars`);
  });

  test("respects the 500-char Threads budget", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      makeSource({ ticker: `TICK${i}`, reason: "x".repeat(500) }),
    );
    const text = buildPostText(many, "threads", "daily");
    assert.ok(text.length <= 500, `Threads post was ${text.length} chars`);
  });

  test("merges portfolio + watch recs with no portfolio/watchlist labels", () => {
    const text = buildPostText(sources, "facebook", "daily");
    assert.ok(!/portfolio/i.test(text.replace(/Richfolio/g, "")));
    assert.ok(!/watch ?list/i.test(text));
  });

  test("daily vs intraday header differs", () => {
    assert.ok(buildPostText(sources, "facebook", "daily").startsWith("📊"));
    assert.ok(buildPostText(sources, "facebook", "intraday").startsWith("⚡"));
  });

  test("empty when no actionable signals", () => {
    assert.equal(buildPostText([makeSource({ action: "HOLD" })], "x", "daily"), "");
  });
});

describe("defuseEmoticons", () => {
  const WJ = "\u2060";
  // Strip joiners to prove the visible text is byte-identical to the input.
  const visible = (s: string) => s.split(WJ).join("");

  test("breaks the emoticon Facebook found in a P/E reason", () => {
    const input = "P/E below historical average (17.7 vs. 17.8) with OBV rising.";
    const out = defuseEmoticons(input);
    assert.ok(!/\d\)/.test(out), "digit is still adjacent to the paren");
    assert.equal(visible(out), input);
  });

  test("leaves no shorter emoticon behind when defusing a compound one", () => {
    for (const [input, remnant] of [
      ["3:)", ":)"],
      [">:(", ":("],
      ["O:)", ":)"],
    ] as const) {
      assert.ok(!defuseEmoticons(input).includes(remnant), `${input} still contains ${remnant}`);
    }
  });

  test("covers the common emoticon set", () => {
    for (const e of [":)", ":-)", ";)", ":D", ":P", "8)", "B)", "<3", ":/", "^_^", "(y)", ":'("]) {
      const out = defuseEmoticons(`x ${e} y`);
      assert.ok(out.includes(WJ), `${e} not defused`);
      assert.equal(visible(out), `x ${e} y`);
    }
  });

  test("leaves ordinary prose and URLs untouched", () => {
    for (const s of [
      "Near 52-week low (11% position) and OBV rising.",
      "Volume -28.7% on 8/10 with RSI 55.9",
      "Stochastic 89.5 (overbought)",
      "https://richardfu.net/a/goog?x=1",
      "See https://example.com/a/nvda for detail",
    ]) {
      assert.equal(defuseEmoticons(s), s, `modified: ${s}`);
    }
  });

  test("applied to Facebook only", () => {
    const sources = [
      makeSource({ reason: "P/E below historical average (17.7 vs. 17.8) with OBV rising." }),
    ];
    assert.ok(buildPostText(sources, "facebook", "daily").includes(WJ));
    for (const platform of ["x", "threads", "linkedin"] as const) {
      assert.ok(
        !buildPostText(sources, platform, "daily", { includeLinkInX: true }).includes(WJ),
        `${platform} should not carry word joiners`,
      );
    }
  });
});

describe("hashtags", () => {
  const sources = [
    makeSource({ ticker: "NVDA", action: "STRONG BUY", confidence: 88 }),
    makeSource({ ticker: "SMH", action: "BUY", confidence: 76 }),
  ];
  const opts = { hashtags: ["investing", "stocks"] };

  test("appends ticker + generic hashtags on FB / Threads / LinkedIn", () => {
    for (const platform of ["facebook", "threads", "linkedin"] as const) {
      const text = buildPostText(sources, platform, "daily", opts);
      assert.ok(text.includes("#NVDA"), `${platform} missing #NVDA`);
      assert.ok(text.includes("#investing"), `${platform} missing #investing`);
    }
  });

  test("does NOT add hashtags on X", () => {
    const text = buildPostText(sources, "x", "daily", { ...opts, includeLinkInX: false });
    assert.ok(!text.includes("#"), `X should have no hashtags: ${text}`);
    assert.ok(text.includes("$NVDA"), "X keeps the inline cashtag");
  });

  test("hashtags keep Threads within its 500-char budget", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      makeSource({ ticker: `TICK${i}`, reason: "x".repeat(500) }),
    );
    const text = buildPostText(many, "threads", "daily", { hashtags: ["investing", "stocks"] });
    assert.ok(text.length <= 500, `Threads post was ${text.length} chars`);
  });
});

describe("sanitizeReason", () => {
  test("strips the internal [Guard: ...] annotation", () => {
    const r = sanitizeReason(
      "[Guard: watch list: confidence 78% < 80% STRONG BUY threshold] Price-level signals: P/E of 19.3 is well below average.",
    );
    assert.ok(!r.includes("[Guard"));
    assert.ok(r.startsWith("Price-level signals"));
  });

  test("strips a leading (Watch) marker and watch-list sentences", () => {
    const r = sanitizeReason(
      "(Watch) MSFT is on the watch list and is evaluated purely on signal merit. Price-level signals: P/E of 19.3 is well below the historical average.",
    );
    assert.ok(!/watch/i.test(r), `still mentions watch: ${r}`);
    assert.ok(r.startsWith("Price-level signals"));
  });

  test("leaves a clean reason untouched", () => {
    const clean = "Strong momentum and undervalued vs peers.";
    assert.equal(sanitizeReason(clean), clean);
  });

  test("strips allocation gap + dollar sizing from the reason (real BSV example)", () => {
    const r = sanitizeReason(
      "Short-duration bond ETF with a 14.2% allocation gap (full gap ~$7,119). Per bond ETF framework: gap >= 5% means base score 55; 90-day percentile at 16.7%.",
    );
    assert.ok(!r.includes("allocation gap"), `leaked allocation gap: ${r}`);
    assert.ok(!/\$\s?\d{1,3},\d{3}/.test(r), `leaked dollar amount: ${r}`);
    // Generic framework + technical content survives.
    assert.ok(/percentile/i.test(r), `dropped too much: ${r}`);
  });

  test("strips overlap-discount sizing (real VOO example)", () => {
    const r = sanitizeReason(
      "18.6% allocation gap (full gap ~$8,466, ~$7,608 after ETF overlap discount). VOO offers broad-market S&P 500 exposure at a P/E of 26.4; golden cross in place.",
    );
    assert.ok(!/\$\s?\d{1,3},\d{3}/.test(r));
    assert.ok(!/overlap discount/i.test(r));
    assert.ok(/golden cross/i.test(r), `dropped too much: ${r}`);
  });

  test("keeps per-share dollar price levels (no comma) — not private", () => {
    const r = sanitizeReason("Strong support near $205 with a bullish setup.");
    assert.ok(r.includes("$205"));
  });

  test("buildSignalLines applies the sanitizer", () => {
    const [line] = buildSignalLines([
      makeSource({ reason: "[Guard: capped] (Watch) On the watch list. Good entry near support." }),
    ]);
    assert.ok(!line.reason.includes("[Guard"));
    assert.ok(!/watch/i.test(line.reason));
    assert.ok(line.reason.includes("Good entry near support"));
  });
});

describe("intradayAlertsToSignals", () => {
  test("uses current action/confidence and the generic fields only", () => {
    const alert = {
      ticker: "NVDA",
      tickerFullName: "NVIDIA Corp",
      currentAction: "STRONG BUY",
      currentConfidence: 90,
      morningAction: "BUY",
      morningConfidence: 70,
      reason: "Upgraded.",
      valueRating: "undervalued",
      analysisUrl: "https://example.com/x",
      suggestedBuyValue: PRIVATE_BUY_VALUE,
    } as unknown as IntradayAlert;
    const [s] = intradayAlertsToSignals([alert]);
    assert.equal(s.action, "STRONG BUY");
    assert.equal(s.confidence, 90);
    assert.equal((s as Record<string, unknown>).suggestedBuyValue, undefined);
  });
});
