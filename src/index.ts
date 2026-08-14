import {
  allUniqueTickers,
  intradayConfig,
  cryptoAlertConfig,
  cryptoPairSpecs,
  defaultCurrency,
} from "./config.js";
import { fetchCryptoPairs } from "./fetchCrypto.js";
import { computeTechnicals } from "./technicals.js";
import type { TimedCandle } from "./fetchCrypto.js";
import { buildAllocationReport } from "./allocation.js";
import { fetchPrices, fetchMacroIndicators, formatMacroContext } from "./fetchPrices.js";
import { fetchTechnicals } from "./fetchTechnicals.js";
import { fetchNews } from "./fetchNews.js";
import type { NewsItem } from "./fetchNews.js";
import { runAnalysis } from "./analyze.js";
import { aiAnalyze } from "./aiAnalysis.js";
import { sendBrief } from "./email.js";
import {
  sendTelegramBrief,
  sendWeeklyTelegram,
  sendIntradayTelegram,
  sendRefreshTelegram,
} from "./telegram.js";
import { applyLatestPrice, buildPriceMap } from "./util.js";
import { sendWeeklyBrief } from "./weeklyEmail.js";
import { saveBaseline, loadBaseline, loadReasoningHistory, saveReasoningHistory } from "./state.js";
import { compareWithBaseline } from "./intradayCompare.js";
import { sendIntradayAlert, sendRefreshEmail } from "./intradayEmail.js";
import { sendSocialPosts, intradayAlertsToSignals } from "./social.js";
import { fetchDetailedAnalyses } from "./detailedAnalysis.js";
import { buildAnalysisUrl } from "./analysisUrl.js";
import { hasStrongBuyVote, findStrongBuyVoter } from "./aiAggregation.js";

import type { AIBuyRecommendation } from "./aiAnalysis.js";
import type { QuoteData } from "./fetchPrices.js";
import type { TechnicalData } from "./fetchTechnicals.js";
import type { AllocationReport } from "./analyze.js";

async function enrichStrongBuysWithAnalysis(
  aiRecs: AIBuyRecommendation[],
  prices: Record<string, QuoteData>,
  technicals: Record<string, TechnicalData>,
  report: AllocationReport,
  macroContext: string = "",
): Promise<void> {
  // Any STRONG BUY vote qualifies, including recs the dissent-distance rule
  // capped at BUY — the dissenting provider's full thesis is still worth reading.
  const eligible = aiRecs.filter(hasStrongBuyVote);
  if (eligible.length === 0) return;

  const detailedMap = await fetchDetailedAnalyses(
    eligible.map((r) => r.ticker),
    prices,
    technicals,
    aiRecs,
    report,
    macroContext,
  );

  for (const rec of eligible) {
    const detailed = detailedMap[rec.ticker];
    if (!detailed) continue;

    const quote = prices[rec.ticker];
    const tech = technicals[rec.ticker];
    if (!quote) continue;

    // When consensus is BUY but a provider voted STRONG BUY (split case),
    // encode the STRONG BUY voter's view into the analysis page URL — that's
    // the thesis the reader wants to see when they click "More Details".
    // For consensus STRONG BUY, use rec as-is (existing behaviour).
    const sbVoter = rec.action !== "STRONG BUY" ? findStrongBuyVoter(rec) : null;
    const view = sbVoter ?? rec;

    rec.analysisUrl = buildAnalysisUrl({
      ticker: rec.ticker,
      date: new Date().toISOString().slice(0, 10),
      action: view.action,
      confidence: view.confidence,
      reason: view.reason,
      buyThesis: detailed.buyThesis,
      risks: detailed.risks,
      suggestedBuyValue: view.suggestedBuyValue,
      suggestedLimitPrice: view.suggestedLimitPrice,
      limitPriceReason: view.limitPriceReason,
      valueRating: view.valueRating,
      bottomSignal: view.bottomSignal,
      // Only stated when it isn't the report currency, to keep the URL short —
      // the page defaults to `$`. Set for crypto cross-pairs, which are quoted
      // in their own coin and never FX-converted.
      currency: quote.currency !== defaultCurrency ? quote.currency : undefined,
      price: quote.price,
      trailingPE: quote.trailingPE,
      forwardPE: quote.forwardPE,
      fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
      fiftyTwoWeekPercent: quote.fiftyTwoWeekPercent,
      sma50: tech?.sma50,
      sma200: tech?.sma200,
      rsi14: tech?.rsi14,
      momentumSignal: tech?.momentumSignal,
      goldenCross: tech?.goldenCross,
      deathCross: tech?.deathCross,
      returnOnEquity: quote.returnOnEquity,
      debtToEquity: quote.debtToEquity,
      profitMargins: quote.profitMargins,
      revenueGrowth: quote.revenueGrowth,
      earningsGrowth: quote.earningsGrowth,
      targetMeanPrice: quote.targetMeanPrice,
    });
  }
}

// The crypto schedule's first run of each UTC day establishes that day's
// comparison anchor. Runs starting before this hour are treated as the anchor;
// keep it just above the first cron slot so a late-firing run still counts.
const CRYPTO_ANCHOR_HOUR_UTC = 2;

// ── Crypto cross-pair mode ──────────────────────────────────────────
// Deliberately self-contained and dispatched BEFORE the shared prologue below:
// that prologue fetches every portfolio ticker from Yahoo and runs the allocation
// report, none of which a cross-pair run needs. Running it anyway would cost ~25
// pointless Yahoo calls per run, eight times a day.
//
// Cross-pairs are watch-only, so the report is built with an empty portfolio and
// a watch set containing just the pairs — `buildAllocationReport` then routes them
// all to `watchingItems`, and every allocation-based guard skips them.
async function runCryptoMode(): Promise<void> {
  console.log("\nMode: crypto cross-pair check");

  if (cryptoPairSpecs.length === 0) {
    console.log('No "watchingCrypto" pairs configured — nothing to do');
    return;
  }
  if (!cryptoAlertConfig.enabled) {
    console.log("Crypto alerts disabled in config — exiting");
    return;
  }

  const [{ quotes, candles, skipped }, macroIndicators] = await Promise.all([
    fetchCryptoPairs(cryptoPairSpecs),
    // Crypto is risk-on: VIX / DXY / rates genuinely inform these signals, and
    // the macro fetch is independent of the pair fetch.
    fetchMacroIndicators(),
  ]);

  if (quotes.length === 0) {
    console.error("No crypto pairs could be priced — aborting");
    if (skipped.length > 0) {
      for (const s of skipped) console.error(`  ${s.ticker}: ${s.reason}`);
    }
    return;
  }

  const prices: Record<string, QuoteData> = {};
  for (const q of quotes) prices[q.ticker] = q;

  // Indicators come straight from the crypto.com candles — no Yahoo, no FX. The
  // candles are already denominated in the quote coin.
  const technicals: Record<string, TechnicalData> = {};
  for (const q of quotes) {
    const tech = computeTechnicals(q.ticker, candles[q.ticker], q.price);
    if (tech) technicals[q.ticker] = tech;
  }

  const report = buildAllocationReport(prices, {
    targetPortfolio: {},
    currentHoldings: {},
    totalPortfolioValue: 0,
    watchingSet: new Set(quotes.map((q) => q.ticker)),
  });

  const macroContext = formatMacroContext(macroIndicators);
  const emptyNews: Record<string, NewsItem[]> = {};
  const aiRecs = await aiAnalyze(report, prices, emptyNews, technicals, macroContext);
  if (aiRecs.length === 0) {
    console.log("AI analysis returned no results — nothing to compare");
    return;
  }

  await enrichStrongBuysWithAnalysis(aiRecs, prices, technicals, report, macroContext);

  const priceMap = buildPriceMap(report);
  const baseline = loadBaseline("crypto");

  // Anchor on the first run of the UTC day, then compare the rest of the day
  // against it. Unlike the equity schedule there is no separate daily run to
  // establish an anchor, so this mode has to establish its own — and it must save
  // unconditionally when there is nothing to compare against, or a day with no
  // alerts would leave the baseline to age out and never recover.
  const isDayAnchor = new Date().getUTCHours() < CRYPTO_ANCHOR_HOUR_UTC;
  if (!baseline || isDayAnchor) {
    saveBaseline(
      {
        timestamp: new Date().toISOString(),
        date: new Date().toISOString().slice(0, 10),
        recommendations: aiRecs,
        prices: priceMap,
      },
      "crypto",
    );
    console.log(
      baseline
        ? "First run of the UTC day — reset the crypto anchor, no comparison"
        : "No usable crypto baseline — anchored today's, no comparison",
    );
    for (const rec of aiRecs) {
      console.log(`  ${rec.ticker}: ${rec.action} ${rec.confidence}%`);
    }
    return;
  }

  const alerts = compareWithBaseline(aiRecs, priceMap, baseline, cryptoAlertConfig);

  if (alerts.length === 0) {
    console.log("No crypto signals strengthened vs today's anchor — no alert needed");
    for (const rec of aiRecs) {
      console.log(`  ${rec.ticker}: ${rec.action} ${rec.confidence}%`);
    }
    return;
  }

  console.log(`\n${alerts.length} crypto signal(s) changed:`);
  for (const a of alerts) {
    console.log(
      `  ${a.ticker}: ${a.morningAction} ${a.morningConfidence}% → ${a.currentAction} ${a.currentConfidence}% (${a.triggerType})`,
    );
  }

  await sendIntradayAlert(alerts);
  try {
    await sendIntradayTelegram(alerts);
  } catch (err) {
    console.error("Telegram send failed:", (err as Error).message);
  }
  // Deliberately NOT posted publicly. These are personal conversion signals on
  // thin books, and the social copy is built for equities (a `$BTC_CRO` cashtag
  // is meaningless). See the filter at the daily-mode sendSocialPosts call.

  // The anchor is intentionally left alone: the rest of the day keeps comparing
  // against the same reference point rather than ratcheting after each alert.
}

const isWeekly = process.argv.includes("--weekly");
const isIntraday = process.argv.includes("--intraday");
const isCrypto = process.argv.includes("--crypto");
const isRefresh = process.argv.includes("--refresh");
const isDailyBrief = !isWeekly && !isIntraday && !isCrypto && !isRefresh;
const refreshTickerRaw = isRefresh ? process.argv[process.argv.length - 1] : null;
const refreshTicker =
  refreshTickerRaw && !refreshTickerRaw.startsWith("-") ? refreshTickerRaw.toUpperCase() : null;

// Dispatched first: this mode shares none of the prologue below.
if (isCrypto) {
  try {
    await runCryptoMode();
    console.log("\nDone.");
    process.exit(0);
  } catch (err) {
    console.error("Fatal error:", (err as Error).stack ?? (err as Error).message);
    process.exit(1);
  }
}

try {
  const tickers = allUniqueTickers();
  const [priceResult, macroIndicators] = await Promise.all([
    fetchPrices(tickers, defaultCurrency),
    fetchMacroIndicators(),
  ]);
  const prices: Record<string, QuoteData> = {};
  for (const q of priceResult.quotes) prices[q.ticker] = q;
  const fxSkipped = priceResult.skipped;
  const fxRates = priceResult.fxRates;
  if (fxSkipped.length > 0) {
    console.warn(
      `⚠ Skipped ${fxSkipped.length} ticker(s) (no FX rate): ${fxSkipped.map((s) => s.ticker).join(", ")}`,
    );
  }
  // fxSkipped is also passed to email/Telegram footers in later tasks

  // Upgrade each quote to the latest available price (after-hours / pre-market)
  // for daily + intraday briefs, so analysis, limit prices, the morning
  // baseline, and intraday comparison all reason about current extended-hours
  // trading rather than the stale regular-session close. applyLatestPrice also
  // rescales the price-derived fields (P/E, 52w position) and is a no-op when
  // no extended-hours quote is available (e.g. overnight/weekends). Weekly keeps
  // regular prices; refresh mode does its own per-ticker upgrade in its branch.
  if (!isWeekly && !isRefresh) {
    for (const q of Object.values(prices)) {
      const latest = applyLatestPrice(q);
      if (latest.source !== "regular") {
        console.log(
          `  ${q.ticker}: using ${latest.source} price $${q.price.toFixed(2)} (regular close $${latest.regularPrice.toFixed(2)})`,
        );
      }
    }
  }

  // Crypto cross-pairs join the DAILY brief's Watch List. Scoped to daily on
  // purpose: the dedicated `--crypto` schedule already covers them 8x/day, so
  // including them in the equity intraday runs too would just double-alert. They
  // are priced by fetchCrypto (Yahoo has no such market) and merged in here, AFTER
  // fetchPrices has run its FX pass — a cross-pair is quoted in a coin, and a
  // "CROUSD=X" lookup would fail and drop it. `watchingSet` already contains them,
  // so runAnalysis routes them straight into report.watchingItems.
  const cryptoCandles: Record<string, TimedCandle[]> = {};
  if (isDailyBrief && cryptoPairSpecs.length > 0) {
    try {
      const crypto = await fetchCryptoPairs(cryptoPairSpecs);
      for (const q of crypto.quotes) prices[q.ticker] = q;
      Object.assign(cryptoCandles, crypto.candles);
      if (crypto.skipped.length > 0) {
        console.warn(
          `⚠ Skipped ${crypto.skipped.length} crypto pair(s): ${crypto.skipped.map((s) => `${s.ticker} (${s.reason})`).join(", ")}`,
        );
      }
    } catch (err) {
      // An optional watch-list extra must never take down the brief.
      console.error("Crypto cross-pair fetch failed:", (err as Error).message);
    }
  }

  const macroContext = formatMacroContext(macroIndicators);
  const report = runAnalysis(prices);

  // Console summary
  console.log("═══ Portfolio Summary ═══");
  console.log(`Holdings value: $${report.totalCurrentValue.toLocaleString()}`);
  if (report.portfolioBeta != null) {
    console.log(`Portfolio beta: ${report.portfolioBeta}`);
  }
  console.log(`Est. annual dividends: $${report.estimatedAnnualDividend.toLocaleString()}`);

  // Log overlap discounts
  for (const item of report.items) {
    if (item.overlapDiscount > 0) {
      console.log(
        `  ETF overlap: ${item.ticker} -$${item.overlapDiscount.toFixed(0)} (${item.overlapPct.toFixed(0)}%)`,
      );
    }
  }

  if (isRefresh) {
    // Refresh mode: re-analyze a single ticker with latest price (including after-hours)
    if (!refreshTicker) {
      console.error("Usage: npm run refresh -- <TICKER>");
      console.error("Example: npm run refresh -- SMH");
      process.exit(1);
    }

    if (!prices[refreshTicker]) {
      console.error(`Ticker "${refreshTicker}" not found. Available: ${tickers.join(", ")}`);
      process.exit(1);
    }

    console.log(`\nMode: refresh analysis for ${refreshTicker}`);

    // Use after-hours/pre-market price if available (also rescales P/E + 52w)
    const quote = prices[refreshTicker];
    const latest = applyLatestPrice(quote);
    console.log(`  Regular price: $${latest.regularPrice.toFixed(2)}`);
    if (latest.source !== "regular") {
      console.log(`  ${latest.source} price: $${quote.price.toFixed(2)} (using this)`);
    }

    // Re-run analysis with updated price, fetch technicals for target only
    const refreshReport = runAnalysis(prices);
    const technicals = await fetchTechnicals([refreshTicker], prices, fxRates);
    const emptyNews: Record<string, NewsItem[]> = {};
    const aiRecs = await aiAnalyze(refreshReport, prices, emptyNews, technicals, macroContext);

    const targetRec = aiRecs.find((r) => r.ticker === refreshTicker);
    if (!targetRec) {
      // Held-only tickers (held, no target, not watched) are deliberately kept
      // out of report.items, so the AI never scores them and there is nothing to
      // refresh. Say so explicitly rather than leaving the generic message.
      if (refreshReport.untrackedItems.some((i) => i.ticker === refreshTicker)) {
        console.log(
          `${refreshTicker} is a held-only ticker — it has no target allocation, so it is not analyzed.\n` +
            `Add it to "watching" in config.json (or give it a targetPortfolio weight) to get a recommendation.`,
        );
      } else {
        console.log(`AI did not return a recommendation for ${refreshTicker}`);
      }
      process.exit(0);
    }

    // Generate detailed analysis + URL
    await enrichStrongBuysWithAnalysis(aiRecs, prices, technicals, refreshReport, macroContext);

    // Output results
    console.log(`\n${"═".repeat(50)}`);
    console.log(`${targetRec.action} ${refreshTicker} (${targetRec.confidence}% confidence)`);
    console.log(`Price: $${quote.price.toFixed(2)} (${latest.source})`);
    console.log(`Reason: ${targetRec.reason}`);
    if (targetRec.suggestedLimitPrice) {
      console.log(
        `Limit: $${targetRec.suggestedLimitPrice.toFixed(2)}${targetRec.limitPriceReason ? " — " + targetRec.limitPriceReason : ""}`,
      );
    }
    if (targetRec.suggestedBuyValue > 0) {
      console.log(`Suggested buy: $${targetRec.suggestedBuyValue.toFixed(0)}`);
    }
    if (targetRec.analysisUrl) {
      console.log(`\nAnalysis URL:\n${targetRec.analysisUrl}`);
    }
    console.log("═".repeat(50));

    // Send email + Telegram
    await sendRefreshEmail(refreshTicker, targetRec, quote, latest.source);
    try {
      await sendRefreshTelegram(refreshTicker, targetRec, quote, latest.source);
    } catch (err) {
      console.error("Telegram send failed:", (err as Error).message);
    }
  } else if (isWeekly) {
    // Weekly mode: rebalancing report only (no news, no AI)
    console.log("\nMode: weekly rebalancing");
    await sendWeeklyBrief(report);
    try {
      await sendWeeklyTelegram(report);
    } catch (err) {
      console.error("Telegram send failed:", (err as Error).message);
    }
  } else if (isIntraday) {
    // Intraday mode: compare against morning baseline, alert on strengthening
    console.log("\nMode: intraday check");

    if (!intradayConfig.enabled) {
      console.log("Intraday alerts disabled in config — exiting");
      process.exit(0);
    }

    const baseline = loadBaseline();
    if (!baseline) {
      console.log("No morning baseline found for today — skipping intraday check");
      process.exit(0);
    }

    // Run AI analysis WITHOUT news (saves NewsAPI quota), WITH technicals
    const emptyNews: Record<string, NewsItem[]> = {};
    const technicals = await fetchTechnicals(tickers, prices, fxRates);
    const aiRecs = await aiAnalyze(report, prices, emptyNews, technicals, macroContext);

    // Generate detailed analysis + "More Details" URLs for STRONG BUY tickers
    await enrichStrongBuysWithAnalysis(aiRecs, prices, technicals, report, macroContext);

    if (aiRecs.length === 0) {
      console.log("AI analysis returned no results — skipping comparison");
      process.exit(0);
    }

    // Build price map for comparison — must include watch-list tickers, or the
    // frozen-data guard fails open for them (see buildPriceMap).
    const priceMap = buildPriceMap(report);

    const alerts = compareWithBaseline(aiRecs, priceMap, baseline, intradayConfig);

    if (alerts.length === 0) {
      console.log("No signals strengthened — no alert needed");
    } else {
      console.log(`\n${alerts.length} signal(s) strengthened:`);
      for (const a of alerts) {
        console.log(
          `  ${a.ticker}: ${a.morningAction} ${a.morningConfidence}% → ${a.currentAction} ${a.currentConfidence}% (${a.triggerType})`,
        );
      }

      await sendIntradayAlert(alerts);
      try {
        await sendIntradayTelegram(alerts);
      } catch (err) {
        console.error("Telegram send failed:", (err as Error).message);
      }
      try {
        await sendSocialPosts(intradayAlertsToSignals(alerts), "intraday");
      } catch (err) {
        console.error("Social post failed:", (err as Error).message);
      }

      // Update baseline so next intraday check compares against post-alert state
      saveBaseline({
        timestamp: new Date().toISOString(),
        date: new Date().toISOString().slice(0, 10),
        recommendations: aiRecs,
        prices: priceMap,
      });
      console.log("Baseline updated after alert — next check will use current values");
    }
  } else {
    // Daily mode: full brief with news + AI + technicals
    const [news, technicals] = await Promise.all([
      fetchNews(tickers, prices),
      fetchTechnicals(tickers, prices, fxRates),
    ]);
    // Cross-pair indicators come from the crypto.com candles, not Yahoo. Required,
    // not optional: without them the watch block shows no indicators at all and
    // the STRONG BUY signal-presence guard has nothing to check.
    for (const [ticker, candles] of Object.entries(cryptoCandles)) {
      const tech = computeTechnicals(ticker, candles, prices[ticker]?.price);
      if (tech) technicals[ticker] = tech;
    }
    const reasoningHistory = loadReasoningHistory();
    const aiRecs = await aiAnalyze(
      report,
      prices,
      news,
      technicals,
      macroContext,
      reasoningHistory,
    );

    // Generate detailed analysis + "More Details" URLs for STRONG BUY tickers
    await enrichStrongBuysWithAnalysis(aiRecs, prices, technicals, report, macroContext);

    // Save morning baseline + reasoning history
    if (aiRecs.length > 0) {
      const priceMap = buildPriceMap(report);
      saveReasoningHistory(aiRecs, priceMap);
      saveBaseline({
        timestamp: new Date().toISOString(),
        date: new Date().toISOString().slice(0, 10),
        recommendations: aiRecs,
        prices: priceMap,
      });
    }

    await sendBrief(report, news, aiRecs, technicals, prices, fxSkipped);
    try {
      await sendTelegramBrief(report, news, aiRecs, technicals, prices);
    } catch (err) {
      console.error("Telegram send failed:", (err as Error).message);
    }
    try {
      // Cross-pairs are excluded from public posts. They are personal conversion
      // signals on thin order books, and the post format is built for equities —
      // a `$BTC_CRO` cashtag is not a real symbol. buildSignalLines filters only
      // on action and SignalSource carries no asset kind, so the filter has to
      // live here at the call site.
      await sendSocialPosts(
        aiRecs.filter((r) => r.assetKind !== "crypto-cross"),
        "daily",
      );
    } catch (err) {
      console.error("Social post failed:", (err as Error).message);
    }
  }

  console.log("\nDone.");
} catch (err) {
  console.error("Fatal error:", (err as Error).stack ?? (err as Error).message);
  process.exit(1);
}
