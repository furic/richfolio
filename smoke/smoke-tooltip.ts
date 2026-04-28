// Smoke test: render the daily-brief email HTML with a ticker whose name
// contains an apostrophe, verify the title attribute is escaped correctly,
// and write the HTML to disk so it can be eyeballed in a browser.

import { writeFileSync } from "node:fs";
import { buildEmailHtml } from "../src/email.js";
import type { AllocationReport, AllocationItem } from "../src/analyze.js";
import type { AIBuyRecommendation } from "../src/aiAnalysis.js";
import { escapeHtmlAttr } from "../src/util.js";

// Sanity-check the escape helper directly
const tricky = `Foo" onmouseover="alert(1)" data-x='evil`;
const escaped = escapeHtmlAttr(tricky);
console.log("escapeHtmlAttr direct check:");
console.log("  in : ", tricky);
console.log("  out: ", escaped);
console.log();

// Build a tiny synthetic report — three tickers, one with an apostrophe
const items: AllocationItem[] = [
  {
    ticker: "MCD",
    tickerFullName: "McDonald's Corporation",
    currentShares: 0,
    currentValue: 0,
    currentPct: 0,
    targetPct: 5,
    gapPct: 5,
    suggestedBuyShares: 0,
    suggestedBuyValue: 2500,
    overlapDiscount: 0,
    overlapPct: 0,
    price: 295.5,
    trailingPE: 24.1,
    peSignal: "✅ below avg",
    weekSignal: "🟢 near low",
    fiftyTwoWeekPercent: 0.18,
    dividendYield: 0.022,
    beta: 0.62,
  },
  {
    ticker: "AAPL",
    tickerFullName: "Apple Inc.",
    currentShares: 30,
    currentValue: 6000,
    currentPct: 12,
    targetPct: 10,
    gapPct: -2,
    suggestedBuyShares: 0,
    suggestedBuyValue: 0,
    overlapDiscount: 0,
    overlapPct: 0,
    price: 200,
    trailingPE: 30,
    peSignal: "⚠️ above avg",
    weekSignal: "—",
    fiftyTwoWeekPercent: 0.65,
    dividendYield: 0.005,
    beta: 1.2,
  },
  {
    // Adversarial: name contains a quote. Should NOT break the attribute.
    ticker: "EVIL",
    tickerFullName: `Foo" onmouseover="alert(1)`,
    currentShares: 0,
    currentValue: 0,
    currentPct: 0,
    targetPct: 1,
    gapPct: 1,
    suggestedBuyShares: 0,
    suggestedBuyValue: 500,
    overlapDiscount: 0,
    overlapPct: 0,
    price: 10,
    trailingPE: null,
    peSignal: null,
    weekSignal: null,
    fiftyTwoWeekPercent: null,
    dividendYield: null,
    beta: null,
  },
];

const report: AllocationReport = {
  items,
  portfolioBeta: 1.05,
  estimatedAnnualDividend: 132,
  totalCurrentValue: 6000,
};

const aiRecs: AIBuyRecommendation[] = [
  {
    ticker: "MCD",
    tickerFullName: "McDonald's Corporation",
    action: "STRONG BUY",
    confidence: 84,
    reason: "McDonald's Corporation is near 52-week lows with P/E below historical average.",
    suggestedBuyValue: 2500,
    suggestedLimitPrice: 290,
    limitPriceReason: "Near 50-day MA support",
    valueRating: "B",
    bottomSignal: "",
    analysisUrl: "",
  },
  {
    ticker: "AAPL",
    tickerFullName: "Apple Inc.",
    action: "HOLD",
    confidence: 55,
    reason: "Apple Inc. is above target allocation; no entry case.",
    suggestedBuyValue: 0,
    valueRating: "B",
  },
];

const html = buildEmailHtml(report, {}, aiRecs, {}, {});

const outPath = "scratch/smoke-tooltip.html";
writeFileSync(outPath, html, "utf8");

// Verify the apostrophe escape landed in the rendered HTML
const expectedFragment = `title="McDonald&#39;s Corporation"`;
const expectedEvilFragment = `title="Foo&quot; onmouseover=&quot;alert(1)"`;

console.log("Output written to:", outPath);
console.log("Bytes:", html.length);
console.log();
console.log(`Looking for: ${expectedFragment}`);
console.log("  found:    ", html.includes(expectedFragment));
console.log();
console.log(`Looking for: ${expectedEvilFragment}`);
console.log("  found:    ", html.includes(expectedEvilFragment));
console.log();

const mcdMatches = (html.match(/title="McDonald&#39;s Corporation"/g) ?? []).length;
console.log(`MCD escaped tooltip count in HTML: ${mcdMatches}`);

if (
  !html.includes(expectedFragment) ||
  !html.includes(expectedEvilFragment) ||
  mcdMatches < 2
) {
  console.error("\nFAIL — at least one expected escape was not found.");
  process.exit(1);
}

console.log("\nPASS — apostrophe and quote both escape correctly in title attributes.");
