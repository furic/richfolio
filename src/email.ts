import { Resend } from "resend";
import { recipientEmail } from "./config.js";
import type { AllocationItem, AllocationReport } from "./analyze.js";
import type { AIBuyRecommendation } from "./aiAnalysis.js";
import type { NewsItem } from "./fetchNews.js";
import type { TechnicalData } from "./fetchTechnicals.js";
import type { QuoteData } from "./fetchPrices.js";
import { escapeHtmlAttr } from "./util.js";

const resend = new Resend(process.env.RESEND_API_KEY);

// ── Styles ──────────────────────────────────────────────────────────
const S = {
  bg: "#1a1a2e",
  cardBg: "#16213e",
  text: "#e0e0e0",
  muted: "#8a8a9a",
  accent: "#0f3460",
  green: "#2ecc71",
  red: "#e74c3c",
  yellow: "#f39c12",
  blue: "#3498db",
  border: "#2a2a4a",
} as const;

// ── Helpers ─────────────────────────────────────────────────────────
function fmt$(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtPct(n: number): string {
  return (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
}

function gapColor(gap: number): string {
  if (gap > 1) return S.red;
  if (gap < -1) return S.yellow;
  return S.green;
}

function weekBar(pct: number | null): string {
  if (pct == null) return "—";
  const filled = Math.round(pct * 10);
  const bar = "█".repeat(filled) + "░".repeat(10 - filled);
  return `${bar} ${(pct * 100).toFixed(0)}%`;
}

function fmtPE(item: AllocationItem): string {
  if (item.trailingPE == null) return "—";
  const value = item.trailingPE.toFixed(1);
  if (item.peSignal === "✅ below avg") return `${value} ✅`;
  if (item.peSignal === "⚠️ above avg") return `${value} ⚠️`;
  return value;
}

function actionBadge(action: string): string {
  const colors: Record<string, { bg: string; text: string }> = {
    "STRONG BUY": { bg: "#2ecc71", text: "#000" },
    BUY: { bg: "#3498db", text: "#fff" },
    HOLD: { bg: "#95a5a6", text: "#fff" },
    WAIT: { bg: "#e74c3c", text: "#fff" },
  };
  const c = colors[action] || colors.HOLD;
  return `<span style="background:${c.bg};color:${c.text};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold;">${action}</span>`;
}

function confidenceBar(pct: number): string {
  const color = pct >= 70 ? S.green : pct >= 40 ? S.yellow : S.red;
  return (
    `<div style="display:inline-block;width:60px;height:8px;background:${S.border};border-radius:4px;vertical-align:middle;">` +
    `<div style="width:${pct}%;height:100%;background:${color};border-radius:4px;"></div>` +
    `</div> <span style="font-size:11px;color:${S.muted};">${pct}%</span>`
  );
}

// ── Value rating color ───────────────────────────────────────────────
const ratingColors: Record<string, string> = {
  A: "#2ecc71",
  B: "#3498db",
  C: "#f39c12",
  D: "#e74c3c",
};

function valueRatingBadge(rating: string | undefined): string {
  if (!rating || rating === "") return "";
  const color = ratingColors[rating] || S.muted;
  return `<span style="background:${color}22;color:${color};padding:1px 6px;border-radius:3px;font-size:10px;font-weight:bold;margin-left:6px;">Value ${rating}</span>`;
}

function earningsBadge(daysToEarnings: number | null): string {
  if (daysToEarnings == null || daysToEarnings > 14) return "";
  const color = daysToEarnings <= 3 ? S.red : daysToEarnings <= 7 ? S.yellow : S.muted;
  return `<span style="background:${color}22;color:${color};padding:1px 6px;border-radius:3px;font-size:10px;font-weight:bold;margin-left:6px;">earnings ${daysToEarnings}d</span>`;
}

// ── Technical Insight (STRONG BUY + BUY with extras) ────────────────
function buildTechnicalInsight(rec: AIBuyRecommendation, tech: TechnicalData | undefined): string {
  const hasExtras =
    (rec.valueRating && rec.valueRating !== "") || (rec.bottomSignal && rec.bottomSignal !== "");
  if (rec.action !== "STRONG BUY" && !hasExtras) return "";
  if (!tech && !hasExtras) return "";

  let html = `<div style="font-size:11px;color:${S.muted};margin-top:6px;border-top:1px solid ${S.border};padding-top:6px;">`;

  // Technical momentum line (STRONG BUY only)
  if (rec.action === "STRONG BUY" && tech) {
    const momentumColor =
      tech.momentumSignal === "bullish"
        ? S.green
        : tech.momentumSignal === "bearish"
          ? S.red
          : S.muted;
    const rsiColor = tech.rsi14 < 30 ? S.green : tech.rsi14 > 70 ? S.red : S.muted;

    const lines = [
      `<span style="color:${momentumColor};">${tech.momentumSignal}</span>`,
      `RSI <span style="color:${rsiColor};">${tech.rsi14}</span>`,
      `50MA $${tech.sma50} (${tech.priceVsSma50 > 0 ? "+" : ""}${tech.priceVsSma50}%)`,
    ];
    if (tech.sma200 != null) {
      lines.push(`200MA $${tech.sma200}`);
    }
    if (tech.goldenCross) lines.push(`<span style="color:${S.green};">golden cross</span>`);
    if (tech.deathCross) lines.push(`<span style="color:${S.red};">death cross</span>`);
    if (tech.macdCrossover) {
      const macdColor = tech.macdCrossover === "bullish" ? S.green : S.red;
      lines.push(`MACD <span style="color:${macdColor};">${tech.macdCrossover}</span>`);
    } else if (tech.macdHistogram != null) {
      const histColor = tech.macdHistogram > 0 ? S.green : S.red;
      lines.push(
        `MACD hist <span style="color:${histColor};">${tech.macdHistogram > 0 ? "+" : ""}${tech.macdHistogram}</span>`,
      );
    }
    if (tech.bollPercentB != null) {
      const bColor = tech.bollPercentB < 0.2 ? S.green : tech.bollPercentB > 0.8 ? S.red : S.muted;
      lines.push(`%B <span style="color:${bColor};">${tech.bollPercentB}</span>`);
    }
    if (tech.bollSqueeze) lines.push(`<span style="color:${S.yellow};">squeeze</span>`);

    html += `<span style="color:${S.blue};">Momentum:</span> ${lines.join(" · ")}`;
  }

  // Limit order (STRONG BUY only)
  if (rec.action === "STRONG BUY" && rec.suggestedLimitPrice && rec.suggestedLimitPrice > 0) {
    html += `<br><span style="color:${S.green};">Limit order:</span> $${rec.suggestedLimitPrice.toFixed(2)}`;
    if (rec.limitPriceReason) {
      html += ` — ${rec.limitPriceReason}`;
    }
  }

  // Bottom signal (oversold detection)
  if (rec.bottomSignal && rec.bottomSignal !== "") {
    html += `<br><span style="color:${S.yellow};">Bottom signal:</span> ${rec.bottomSignal}`;
  }

  html += `</div>`;
  return html;
}

// ── AI Recommendations Section ──────────────────────────────────────
function buildAISection(
  aiRecs: AIBuyRecommendation[],
  technicals: Record<string, TechnicalData> = {},
  priceData: Record<string, QuoteData> = {},
): string {
  const actionable = aiRecs.filter((r) => r.action === "STRONG BUY" || r.action === "BUY");
  const others = aiRecs.filter((r) => r.action !== "STRONG BUY" && r.action !== "BUY");

  return `
<tr><td style="padding:20px 24px 8px;background:${S.cardBg};">
  <h2 style="margin:0;font-size:16px;color:${S.blue};">AI Buy Recommendations</h2>
  <p style="margin:4px 0 0;font-size:11px;color:${S.muted};">Powered by Gemini — considers fundamentals, valuation, allocation gap, technicals, and news sentiment.</p>
</td></tr>
<tr><td style="padding:0 24px 16px;background:${S.cardBg};">
  ${
    actionable.length > 0
      ? actionable
          .map(
            (rec) => `
  <div style="padding:10px 0;border-bottom:1px solid ${S.border};">
    <div style="margin-bottom:4px;">
      <span style="font-weight:bold;font-size:14px;color:#fff;" title="${escapeHtmlAttr(rec.tickerFullName ?? rec.ticker)}">${rec.ticker}</span>
      &nbsp;${actionBadge(rec.action)}${valueRatingBadge(rec.valueRating)}${earningsBadge(priceData[rec.ticker]?.daysToEarnings ?? null)}
      &nbsp;${confidenceBar(rec.confidence)}
      ${rec.suggestedBuyValue > 0 ? `<span style="float:right;font-weight:bold;color:#fff;">${fmt$(rec.suggestedBuyValue)}</span>` : ""}
    </div>
    <div style="font-size:12px;color:${S.text};margin-top:4px;">${rec.reason}</div>
    ${buildTechnicalInsight(rec, technicals[rec.ticker])}
    ${
      rec.action === "STRONG BUY" && rec.analysisUrl
        ? `
    <div style="margin-top:8px;">
      <a href="${rec.analysisUrl}" style="display:inline-block;background:${S.blue}22;color:${S.blue};padding:4px 12px;border-radius:4px;font-size:11px;font-weight:bold;text-decoration:none;border:1px solid ${S.blue}44;">More Details &rarr;</a>
    </div>`
        : ""
    }
  </div>`,
          )
          .join("")
      : `<p style="color:${S.muted};font-size:13px;">No strong buy opportunities identified today.</p>`
  }
  ${
    others.length > 0
      ? `
  <div style="margin-top:12px;">
    <div style="font-size:11px;color:${S.muted};text-transform:uppercase;margin-bottom:6px;">Hold / Wait</div>
    ${others
      .map(
        (rec) => `
    <div style="padding:4px 0;font-size:12px;">
      <span style="font-weight:bold;" title="${escapeHtmlAttr(rec.tickerFullName ?? rec.ticker)}">${rec.ticker}</span>
      &nbsp;${actionBadge(rec.action)}${valueRatingBadge(rec.valueRating)}
      <span style="color:${S.muted};margin-left:8px;">${rec.reason}</span>
    </div>`,
      )
      .join("")}
  </div>`
      : ""
  }
</td></tr>`;
}

// ── Fallback Priority Buys Section ──────────────────────────────────
function buildFallbackBuysSection(report: AllocationReport): string {
  const buys = report.items.filter((i) => i.gapPct > 0.5).slice(0, 5);
  if (buys.length === 0) return "";

  return `
<tr><td style="padding:20px 24px 8px;background:${S.cardBg};">
  <h2 style="margin:0;font-size:16px;color:${S.blue};">Priority Buys</h2>
  <p style="margin:4px 0 0;font-size:11px;color:${S.muted};">Sorted by allocation gap. Set GEMINI_API_KEY for AI-powered recommendations.</p>
</td></tr>
<tr><td style="padding:0 24px 16px;background:${S.cardBg};">
  <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;">
    <tr style="color:${S.muted};font-size:11px;text-transform:uppercase;">
      <td style="padding:6px 4px;border-bottom:1px solid ${S.border};">Ticker</td>
      <td style="padding:6px 4px;border-bottom:1px solid ${S.border};text-align:right;">Gap</td>
      <td style="padding:6px 4px;border-bottom:1px solid ${S.border};text-align:right;">Buy ~Shares</td>
      <td style="padding:6px 4px;border-bottom:1px solid ${S.border};text-align:right;">Buy ~Value</td>
      <td style="padding:6px 4px;border-bottom:1px solid ${S.border};text-align:center;">P/E</td>
      <td style="padding:6px 4px;border-bottom:1px solid ${S.border};text-align:center;">52w</td>
    </tr>
    ${buys
      .map(
        (b) => `
    <tr>
      <td style="padding:6px 4px;border-bottom:1px solid ${S.border};font-weight:bold;" title="${escapeHtmlAttr(b.tickerFullName ?? b.ticker)}">${b.ticker}</td>
      <td style="padding:6px 4px;border-bottom:1px solid ${S.border};text-align:right;color:${S.red};">${fmtPct(b.gapPct)}</td>
      <td style="padding:6px 4px;border-bottom:1px solid ${S.border};text-align:right;">${b.suggestedBuyShares.toFixed(1)}</td>
      <td style="padding:6px 4px;border-bottom:1px solid ${S.border};text-align:right;">${fmt$(b.suggestedBuyValue)}${b.overlapDiscount > 0 ? `<div style="font-size:10px;color:${S.muted};">-${fmt$(b.overlapDiscount)} overlap</div>` : ""}</td>
      <td style="padding:6px 4px;border-bottom:1px solid ${S.border};text-align:center;">${fmtPE(b)}</td>
      <td style="padding:6px 4px;border-bottom:1px solid ${S.border};text-align:center;">${b.weekSignal ?? "—"}</td>
    </tr>`,
      )
      .join("")}
  </table>
</td></tr>`;
}

// ── Build HTML ──────────────────────────────────────────────────────
export function buildEmailHtml(
  report: AllocationReport,
  news: Record<string, NewsItem[]>,
  aiRecs: AIBuyRecommendation[] = [],
  technicals: Record<string, TechnicalData> = {},
  priceData: Record<string, QuoteData> = {},
): string {
  const date = new Date().toLocaleDateString("en-AU", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const tickersWithNews = Object.entries(news).filter(([, items]) => items.length > 0);

  // Use AI section if available, otherwise fallback to gap-based
  const buysSection =
    aiRecs.length > 0
      ? buildAISection(aiRecs, technicals, priceData)
      : buildFallbackBuysSection(report);

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:${S.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${S.text};font-size:14px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;padding:20px;">

<!-- Header -->
<tr><td style="padding:20px 24px;background:${S.accent};border-radius:8px 8px 0 0;">
  <h1 style="margin:0;font-size:22px;color:#fff;">Richfolio Daily Brief</h1>
  <p style="margin:6px 0 0;color:${S.muted};font-size:13px;">${date}</p>
</td></tr>

<!-- Portfolio Stats -->
<tr><td style="padding:16px 24px;background:${S.cardBg};border-bottom:1px solid ${S.border};">
  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="text-align:center;padding:8px;">
      <div style="font-size:11px;color:${S.muted};text-transform:uppercase;">Holdings Value</div>
      <div style="font-size:20px;font-weight:bold;color:#fff;">${fmt$(report.totalCurrentValue)}</div>
    </td>
    <td style="text-align:center;padding:8px;">
      <div style="font-size:11px;color:${S.muted};text-transform:uppercase;">Portfolio Beta</div>
      <div style="font-size:20px;font-weight:bold;color:#fff;">${report.portfolioBeta?.toFixed(2) ?? "—"}</div>
    </td>
    <td style="text-align:center;padding:8px;">
      <div style="font-size:11px;color:${S.muted};text-transform:uppercase;">Est. Annual Div</div>
      <div style="font-size:20px;font-weight:bold;color:#fff;">${fmt$(report.estimatedAnnualDividend)}</div>
    </td>
  </tr></table>
</td></tr>

<!-- Buy Recommendations (AI or fallback) -->
${buysSection}

<!-- Full Allocation Table -->
<tr><td style="padding:20px 24px 8px;background:${S.cardBg};border-top:1px solid ${S.border};">
  <h2 style="margin:0;font-size:16px;color:${S.blue};">Allocation Table</h2>
</td></tr>
<tr><td style="padding:0 24px 16px;background:${S.cardBg};">
  <table width="100%" cellpadding="0" cellspacing="0" style="font-size:12px;">
    <tr style="color:${S.muted};font-size:10px;text-transform:uppercase;">
      <td style="padding:5px 3px;border-bottom:1px solid ${S.border};">Ticker</td>
      <td style="padding:5px 3px;border-bottom:1px solid ${S.border};text-align:right;">Price</td>
      <td style="padding:5px 3px;border-bottom:1px solid ${S.border};text-align:right;">Current</td>
      <td style="padding:5px 3px;border-bottom:1px solid ${S.border};text-align:right;">Target</td>
      <td style="padding:5px 3px;border-bottom:1px solid ${S.border};text-align:right;">Gap</td>
      <td style="padding:5px 3px;border-bottom:1px solid ${S.border};text-align:right;">P/E</td>
      <td style="padding:5px 3px;border-bottom:1px solid ${S.border};text-align:right;">Div</td>
      <td style="padding:5px 3px;border-bottom:1px solid ${S.border};text-align:right;">Beta</td>
      <td style="padding:5px 3px;border-bottom:1px solid ${S.border};">52w Range</td>
    </tr>
    ${report.items
      .map(
        (item) => `
    <tr>
      <td style="padding:5px 3px;border-bottom:1px solid ${S.border};font-weight:bold;" title="${escapeHtmlAttr(item.tickerFullName ?? item.ticker)}">${item.ticker}</td>
      <td style="padding:5px 3px;border-bottom:1px solid ${S.border};text-align:right;">$${item.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>
      <td style="padding:5px 3px;border-bottom:1px solid ${S.border};text-align:right;">${item.currentPct.toFixed(1)}%</td>
      <td style="padding:5px 3px;border-bottom:1px solid ${S.border};text-align:right;">${item.targetPct.toFixed(1)}%</td>
      <td style="padding:5px 3px;border-bottom:1px solid ${S.border};text-align:right;color:${gapColor(item.gapPct)};">${fmtPct(item.gapPct)}${item.overlapDiscount > 0 ? `<div style="font-size:10px;color:${S.muted};">-${fmt$(item.overlapDiscount)} overlap</div>` : ""}</td>
      <td style="padding:5px 3px;border-bottom:1px solid ${S.border};text-align:right;">${fmtPE(item)}</td>
      <td style="padding:5px 3px;border-bottom:1px solid ${S.border};text-align:right;">${item.dividendYield != null ? (item.dividendYield * 100).toFixed(1) + "%" : "—"}</td>
      <td style="padding:5px 3px;border-bottom:1px solid ${S.border};text-align:right;">${item.beta?.toFixed(2) ?? "—"}</td>
      <td style="padding:5px 3px;border-bottom:1px solid ${S.border};font-family:monospace;font-size:11px;">${weekBar(item.fiftyTwoWeekPercent)}</td>
    </tr>`,
      )
      .join("")}
  </table>
</td></tr>

<!-- News Digest -->
${
  tickersWithNews.length > 0
    ? `
<tr><td style="padding:20px 24px 8px;background:${S.cardBg};border-top:1px solid ${S.border};">
  <h2 style="margin:0;font-size:16px;color:${S.blue};">News Digest</h2>
</td></tr>
<tr><td style="padding:0 24px 16px;background:${S.cardBg};">
  ${tickersWithNews
    .map(
      ([ticker, articles]) => `
  <div style="margin-bottom:12px;">
    <div style="font-weight:bold;font-size:13px;color:#fff;margin-bottom:4px;">${ticker}</div>
    ${articles
      .map(
        (a) => `
    <div style="margin-left:12px;margin-bottom:4px;font-size:12px;">
      <a href="${a.url}" style="color:${S.blue};text-decoration:none;">→ ${a.title}</a>
      <span style="color:${S.muted};font-size:11px;"> — ${a.source}</span>
    </div>`,
      )
      .join("")}
  </div>`,
    )
    .join("")}
</td></tr>
`
    : ""
}

<!-- Footer -->
<tr><td style="padding:16px 24px;background:${S.accent};border-radius:0 0 8px 8px;text-align:center;">
  <p style="margin:0;font-size:11px;color:${S.muted};">
    Edit CONFIG_JSON variable to update your portfolio · Powered by Richfolio
  </p>
</td></tr>

</table>
</body>
</html>`;
}

// ── Send email ──────────────────────────────────────────────────────
export async function sendBrief(
  report: AllocationReport,
  news: Record<string, NewsItem[]>,
  aiRecs: AIBuyRecommendation[] = [],
  technicals: Record<string, TechnicalData> = {},
  priceData: Record<string, QuoteData> = {},
): Promise<void> {
  const html = buildEmailHtml(report, news, aiRecs, technicals, priceData);

  const { error } = await resend.emails.send({
    from: "Richfolio <onboarding@resend.dev>",
    to: recipientEmail,
    subject: `Richfolio Brief — ${new Date().toLocaleDateString("en-AU")}`,
    html,
  });

  if (error) {
    throw new Error(`Resend error: ${JSON.stringify(error)}`);
  }

  console.log(`Email sent to ${recipientEmail}`);
}
