// Smoke test: the real crypto cross-pair pipeline, end to end.
//
// smoke-cryptocom.ts validates the *exchange contract* with raw fetch and shares
// no code with the feature. This one is the complement: it drives the actual
// src/fetchCrypto.ts + src/technicals.ts path and asserts the numbers that come
// out are sane, so a regression in the transforms surfaces here.
//
// Config-free on purpose — it takes its pairs inline rather than reading
// config.json, so it runs anywhere.

import { fetchCryptoPairs } from "../src/fetchCrypto.js";
import type { CryptoPairSpec } from "../src/fetchCrypto.js";
import { computeTechnicals } from "../src/technicals.js";
import { formatMoney } from "../src/util.js";

const PAIRS: CryptoPairSpec[] = [
  { ticker: "BTC_CRO", base: "BTC", quote: "CRO" }, // inverted from CRO_BTC
  { ticker: "ETH_CRO", base: "ETH", quote: "CRO" }, // native
];

const failures: string[] = [];
function check(ok: boolean, label: string, detail = ""): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

(async () => {
  const { quotes, candles, skipped } = await fetchCryptoPairs(PAIRS);

  console.log("");
  check(skipped.length === 0, "no pairs skipped", skipped.map((s) => s.reason).join("; "));
  check(quotes.length === PAIRS.length, `all ${PAIRS.length} pairs returned a quote`);

  for (const quote of quotes) {
    console.log(`\n${quote.ticker} — ${quote.longName}`);
    const series = candles[quote.ticker] ?? [];

    check(quote.currency === "CRO", `${quote.ticker}: denominated in CRO`, quote.currency);
    check(quote.assetKind === "crypto-cross", `${quote.ticker}: tagged crypto-cross`);
    check(quote.price > 0, `${quote.ticker}: positive price`, String(quote.price));
    check(series.length >= 200, `${quote.ticker}: >=200 candles for SMA200`, `${series.length}`);

    // The 52-week range must bracket the current price.
    const { fiftyTwoWeekHigh: hi, fiftyTwoWeekLow: lo, fiftyTwoWeekPercent: pct } = quote;
    check(
      hi != null && lo != null && hi >= quote.price && lo <= quote.price,
      `${quote.ticker}: price sits inside the 52w range`,
      `${lo} .. ${quote.price} .. ${hi}`,
    );
    check(
      pct != null && pct >= 0 && pct <= 1,
      `${quote.ticker}: 52w position is a 0-1 fraction`,
      String(pct),
    );

    // Candle integrity: high >= low, ascending, no gaps big enough to imply a
    // dropped page.
    check(
      series.every((c) => c.high == null || c.low == null || c.high >= c.low),
      `${quote.ticker}: every candle has high >= low`,
    );
    check(
      series.every((c, i) => i === 0 || c.t > series[i - 1].t),
      `${quote.ticker}: candles strictly ascending (no dupes)`,
    );
    const maxGapDays = series.reduce(
      (m, c, i) => (i === 0 ? m : Math.max(m, (c.t - series[i - 1].t) / 86_400_000)),
      0,
    );
    check(maxGapDays <= 2, `${quote.ticker}: no page dropped`, `max gap ${maxGapDays.toFixed(1)}d`);
    const spanDays = series.length ? (series[series.length - 1].t - series[0].t) / 86_400_000 : 0;
    check(spanDays >= 360, `${quote.ticker}: covers a full 52 weeks`, `${spanDays.toFixed(0)}d`);

    // Indicators must all land — this is what the AI actually reasons over.
    const t = computeTechnicals(quote.ticker, series, quote.price);
    check(t != null, `${quote.ticker}: technicals computed`);
    if (!t) continue;

    check(t.sma200 != null, `${quote.ticker}: SMA200 present`);
    check(t.rsi14 >= 0 && t.rsi14 <= 100, `${quote.ticker}: RSI in range`, String(t.rsi14));
    check(t.macd != null, `${quote.ticker}: MACD present`);
    check(t.bollPercentB != null, `${quote.ticker}: Bollinger %B present`);
    check(t.atrPercent != null, `${quote.ticker}: ATR% present`);
    check(t.stochK != null, `${quote.ticker}: Stochastic present`);
    check(t.obvTrend != null, `${quote.ticker}: OBV trend present`);
    check(t.pricePercentile90d != null, `${quote.ticker}: 90d percentile present`);

    // The money-formatting claim that justified pricing in CRO: these are large
    // integers, so formatMoney's unknown-currency path renders them readably.
    const rendered = formatMoney(quote.price, quote.currency);
    check(
      /^[\d,]+ CRO$/.test(rendered),
      `${quote.ticker}: renders as a grouped CRO amount`,
      rendered,
    );
    console.log(
      `    price ${rendered} | 50MA ${formatMoney(t.sma50, quote.currency)}` +
        ` | RSI ${t.rsi14} | %B ${t.bollPercentB} | ATR ${t.atrPercent}%` +
        ` | 52w ${((pct ?? 0) * 100).toFixed(0)}% | ${t.momentumSignal}`,
    );
  }

  if (failures.length > 0) {
    console.error(`\nFAIL — ${failures.length} check(s) failed:`);
    for (const f of failures) console.error(`  • ${f}`);
    process.exit(1);
  }
  console.log("\nPASS — crypto cross-pair pipeline produces sane analysis input.");
})();
