import { allUniqueTickers, intradayConfig } from "./config.js";
import { fetchAllPrices, fetchMacroIndicators, formatMacroContext } from "./fetchPrices.js";
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
import { getLatestPrice } from "./fetchPrices.js";
import { sendWeeklyBrief } from "./weeklyEmail.js";
import { saveBaseline, loadBaseline, loadReasoningHistory, saveReasoningHistory } from "./state.js";
import { compareWithBaseline } from "./intradayCompare.js";
import { sendIntradayAlert, sendRefreshEmail } from "./intradayEmail.js";
import { fetchDetailedAnalyses } from "./detailedAnalysis.js";
import { buildAnalysisUrl } from "./analysisUrl.js";

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
  const strongBuys = aiRecs.filter((r) => r.action === "STRONG BUY");
  if (strongBuys.length === 0) return;

  const detailedMap = await fetchDetailedAnalyses(
    strongBuys.map((r) => r.ticker),
    prices,
    technicals,
    aiRecs,
    report,
    macroContext,
  );

  for (const rec of strongBuys) {
    const detailed = detailedMap[rec.ticker];
    if (!detailed) continue;

    const quote = prices[rec.ticker];
    const tech = technicals[rec.ticker];
    if (!quote) continue;

    rec.analysisUrl = buildAnalysisUrl({
      ticker: rec.ticker,
      date: new Date().toISOString().slice(0, 10),
      action: rec.action,
      confidence: rec.confidence,
      reason: rec.reason,
      buyThesis: detailed.buyThesis,
      risks: detailed.risks,
      suggestedBuyValue: rec.suggestedBuyValue,
      suggestedLimitPrice: rec.suggestedLimitPrice,
      limitPriceReason: rec.limitPriceReason,
      valueRating: rec.valueRating,
      bottomSignal: rec.bottomSignal,
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

const isWeekly = process.argv.includes("--weekly");
const isIntraday = process.argv.includes("--intraday");
const isRefresh = process.argv.includes("--refresh");
const refreshTickerRaw = isRefresh ? process.argv[process.argv.length - 1] : null;
const refreshTicker =
  refreshTickerRaw && !refreshTickerRaw.startsWith("-") ? refreshTickerRaw.toUpperCase() : null;

try {
  const tickers = allUniqueTickers();
  const [prices, macroIndicators] = await Promise.all([
    fetchAllPrices(tickers),
    fetchMacroIndicators(),
  ]);
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

    // Use after-hours/pre-market price if available
    const quote = prices[refreshTicker];
    const latest = getLatestPrice(quote);
    console.log(`  Regular price: $${quote.price.toFixed(2)}`);
    if (latest.source !== "regular") {
      console.log(`  ${latest.source} price: $${latest.price.toFixed(2)} (using this)`);
      quote.price = latest.price;
    }

    // Re-run analysis with updated price, fetch technicals for target only
    const refreshReport = runAnalysis(prices);
    const technicals = await fetchTechnicals([refreshTicker]);
    const emptyNews: Record<string, NewsItem[]> = {};
    const aiRecs = await aiAnalyze(refreshReport, prices, emptyNews, technicals, macroContext);

    const targetRec = aiRecs.find((r) => r.ticker === refreshTicker);
    if (!targetRec) {
      console.log(`AI did not return a recommendation for ${refreshTicker}`);
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
    const technicals = await fetchTechnicals(tickers);
    const aiRecs = await aiAnalyze(report, prices, emptyNews, technicals, macroContext);

    // Generate detailed analysis + "More Details" URLs for STRONG BUY tickers
    await enrichStrongBuysWithAnalysis(aiRecs, prices, technicals, report, macroContext);

    if (aiRecs.length === 0) {
      console.log("AI analysis returned no results — skipping comparison");
      process.exit(0);
    }

    // Build price map for comparison
    const priceMap: Record<string, number> = {};
    for (const item of report.items) {
      priceMap[item.ticker] = item.price;
    }

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
      fetchTechnicals(tickers),
    ]);
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
      const priceMap: Record<string, number> = {};
      for (const item of report.items) {
        priceMap[item.ticker] = item.price;
      }
      saveReasoningHistory(aiRecs, priceMap);
      saveBaseline({
        timestamp: new Date().toISOString(),
        date: new Date().toISOString().slice(0, 10),
        recommendations: aiRecs,
        prices: priceMap,
      });
    }

    await sendBrief(report, news, aiRecs, technicals, prices);
    try {
      await sendTelegramBrief(report, news, aiRecs, technicals, prices);
    } catch (err) {
      console.error("Telegram send failed:", (err as Error).message);
    }
  }

  console.log("\nDone.");
} catch (err) {
  console.error("Fatal error:", (err as Error).stack ?? (err as Error).message);
  process.exit(1);
}
