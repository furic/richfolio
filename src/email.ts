import { Resend } from "resend";
import { recipientEmail, defaultCurrency } from "./config.js";
import type { AllocationItem, AllocationReport } from "./analyze.js";
import type { AIBuyRecommendation } from "./aiAnalysis.js";
import type { NewsItem } from "./fetchNews.js";
import type { TechnicalData } from "./fetchTechnicals.js";
import type { QuoteData } from "./fetchPrices.js";
import { escapeHtmlAttr, formatMoney } from "./util.js";
import { hasStrongBuyVote } from "./aiAggregation.js";

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
const fmt$ = (n: number) => formatMoney(n, defaultCurrency);

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

// ── Multi-AI helpers (rendered only when providers.length >= 2) ─────
function agreementBadge(agreement: AIBuyRecommendation["agreement"]): string {
  if (!agreement) return "";
  const colors: Record<string, string> = {
    unanimous: S.green,
    majority: S.yellow,
    split: S.red,
  };
  const c = colors[agreement] ?? S.muted;
  return `<span style="background:${c}22;color:${c};padding:1px 6px;border-radius:3px;font-size:10px;font-weight:bold;margin-left:6px;">${agreement}</span>`;
}

// A degraded run lost the cross-provider agreement STRONG BUY requires, so it
// must NOT look like a verified consensus. Rendered on every rec of the run —
// unlike agreementBadge this shows even in single-provider rendering, because
// that is precisely the case being flagged.
function degradedBadge(degradation: AIBuyRecommendation["degradation"]): string {
  if (!degradation) return "";
  const label = `${degradation.answered}/${degradation.configured} AI`;
  const title = escapeHtmlAttr(
    `${degradation.missing.join(", ")} did not respond — cross-provider agreement could not be verified on this run`,
  );
  return `<span title="${title}" style="background:${S.yellow}22;color:${S.yellow};padding:1px 6px;border-radius:3px;font-size:10px;font-weight:bold;margin-left:6px;">⚠ ${label}</span>`;
}

function isMultiAI(rec: AIBuyRecommendation): boolean {
  return !!rec.providers && rec.providers.length >= 2;
}

// Per-provider breakdown shown beneath the consensus reason. Each row:
// short tag (G/C/...) · provider label · action badge · confidence · short reason.
function buildProvidersBreakdown(rec: AIBuyRecommendation): string {
  if (!isMultiAI(rec)) return "";
  const providers = rec.providers!;
  const rows = providers
    .map((p) => {
      const reasonSnippet =
        p.reason.length > 140 ? p.reason.slice(0, 137).trimEnd() + "…" : p.reason;
      return `
    <tr>
      <td style="padding:4px 8px 4px 0;vertical-align:top;white-space:nowrap;">
        <span style="display:inline-block;background:${S.accent};color:${S.text};padding:1px 6px;border-radius:3px;font-size:10px;font-weight:bold;min-width:18px;text-align:center;">${escapeHtmlAttr(p.providerShortLabel)}</span>
        <span style="font-size:11px;color:${S.muted};margin-left:6px;">${escapeHtmlAttr(p.providerLabel)}</span>
      </td>
      <td style="padding:4px 8px 4px 0;vertical-align:top;white-space:nowrap;">
        ${actionBadge(p.action)} <span style="font-size:11px;color:${S.muted};">${p.confidence}%</span>
      </td>
      <td style="padding:4px 0;vertical-align:top;font-size:11px;color:${S.text};">${reasonSnippet}</td>
    </tr>`;
    })
    .join("");

  return `
  <table cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;width:100%;border-collapse:collapse;border-top:1px solid ${S.border};">
    ${rows}
  </table>`;
}

// ── Technical Insight (STRONG BUY + BUY with extras) ────────────────
function buildTechnicalInsight(rec: AIBuyRecommendation, tech: TechnicalData | undefined): string {
  const hasExtras =
    (rec.valueRating && rec.valueRating !== "") || (rec.bottomSignal && rec.bottomSignal !== "");
  // Gated on hasStrongBuyVote, not on the aggregated action: when the
  // dissent-distance rule caps a STRONG BUY at BUY, the technicals and the limit
  // price are exactly what you need to judge the cap for yourself. Hiding them
  // would make a demoted rec look thinner than the evidence behind it.
  if (!hasStrongBuyVote(rec) && !hasExtras) return "";
  if (!tech && !hasExtras) return "";

  let html = `<div style="font-size:11px;color:${S.muted};margin-top:6px;border-top:1px solid ${S.border};padding-top:6px;">`;

  // Technical momentum line (any STRONG BUY vote)
  if (hasStrongBuyVote(rec) && tech) {
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

  // Limit order (any STRONG BUY vote)
  if (hasStrongBuyVote(rec) && rec.suggestedLimitPrice && rec.suggestedLimitPrice > 0) {
    html += `<br><span style="color:${S.green};">Limit order:</span> ${fmt$(rec.suggestedLimitPrice)}`;
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
  // Portfolio tickers (excludes watch list)
  const portfolioRecs = aiRecs.filter((r) => !r.isWatching);
  const actionable = portfolioRecs.filter((r) => r.action === "STRONG BUY" || r.action === "BUY");
  const others = portfolioRecs.filter((r) => r.action !== "STRONG BUY" && r.action !== "BUY");
  // Watch list tickers — rendered as a separate sub-section below the portfolio
  // recommendations. Allocation rules don't apply; suggestedBuyValue is always 0.
  const watching = aiRecs.filter((r) => r.isWatching);
  const watchActionable = watching.filter((r) => r.action === "STRONG BUY" || r.action === "BUY");
  const watchOthers = watching.filter((r) => r.action !== "STRONG BUY" && r.action !== "BUY");

  // Detect provider mode from the first rec's providers[] (uniformly populated
  // by the orchestrator). When ≥2 active, surface that in the subtitle.
  const firstWithProviders = aiRecs.find((r) => r.providers && r.providers.length > 0);
  const providerLabels = firstWithProviders?.providers?.map((p) => p.providerLabel) ?? ["Gemini"];
  const multiAIMode = providerLabels.length >= 2;
  const subtitle = multiAIMode
    ? `Powered by ${providerLabels.join(" + ")} — scores averaged across providers. Per-AI breakdown below each ticker.`
    : `Powered by ${providerLabels[0]} — considers fundamentals, valuation, allocation gap, technicals, and news sentiment.`;

  return `
<tr><td style="padding:20px 24px 8px;background:${S.cardBg};">
  <h2 style="margin:0;font-size:16px;color:${S.blue};">AI Buy Recommendations</h2>
  <p style="margin:4px 0 0;font-size:11px;color:${S.muted};">${subtitle}</p>
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
      &nbsp;${actionBadge(rec.action)}${valueRatingBadge(rec.valueRating)}${earningsBadge(priceData[rec.ticker]?.daysToEarnings ?? null)}${isMultiAI(rec) ? agreementBadge(rec.agreement) : ""}${degradedBadge(rec.degradation)}
      &nbsp;${confidenceBar(rec.confidence)}${isMultiAI(rec) ? `<span style="font-size:10px;color:${S.muted};margin-left:6px;">avg</span>` : ""}
      ${rec.suggestedBuyValue > 0 ? `<span style="float:right;font-weight:bold;color:#fff;">${fmt$(rec.suggestedBuyValue)}</span>` : ""}
    </div>
    <div style="font-size:12px;color:${S.text};margin-top:4px;">${rec.reason}</div>
    ${buildProvidersBreakdown(rec)}
    ${buildTechnicalInsight(rec, technicals[rec.ticker])}
    ${
      hasStrongBuyVote(rec) && rec.analysisUrl
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
  ${
    watching.length > 0
      ? `
  <div style="margin-top:18px;padding-top:14px;border-top:2px dashed ${S.border};">
    <div style="font-size:13px;color:${S.yellow};font-weight:bold;margin-bottom:2px;">Watch List</div>
    <div style="font-size:11px;color:${S.muted};margin-bottom:10px;">Tickers tracked but not in your target portfolio — signals only, no buy size suggested.</div>
    ${watchActionable
      .map(
        (rec) => `
    <div style="padding:10px 0;border-bottom:1px solid ${S.border};">
      <div style="margin-bottom:4px;">
        <span style="font-weight:bold;font-size:14px;color:#fff;" title="${escapeHtmlAttr(rec.tickerFullName ?? rec.ticker)}">${rec.ticker}</span>
        &nbsp;${actionBadge(rec.action)}${valueRatingBadge(rec.valueRating)}${earningsBadge(priceData[rec.ticker]?.daysToEarnings ?? null)}${isMultiAI(rec) ? agreementBadge(rec.agreement) : ""}${degradedBadge(rec.degradation)}
        &nbsp;${confidenceBar(rec.confidence)}${isMultiAI(rec) ? `<span style="font-size:10px;color:${S.muted};margin-left:6px;">avg</span>` : ""}
      </div>
      <div style="font-size:12px;color:${S.text};margin-top:4px;">${rec.reason}</div>
      ${buildProvidersBreakdown(rec)}
      ${buildTechnicalInsight(rec, technicals[rec.ticker])}
      ${
        hasStrongBuyVote(rec) && rec.analysisUrl
          ? `
      <div style="margin-top:8px;">
        <a href="${rec.analysisUrl}" style="display:inline-block;background:${S.blue}22;color:${S.blue};padding:4px 12px;border-radius:4px;font-size:11px;font-weight:bold;text-decoration:none;border:1px solid ${S.blue}44;">More Details &rarr;</a>
      </div>`
          : ""
      }
    </div>`,
      )
      .join("")}
    ${
      watchOthers.length > 0
        ? `
    <div style="margin-top:8px;">
      ${watchOthers
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
  fxSkipped: Array<{ ticker: string; reason: string }> = [],
): string {
  const date = new Date().toLocaleDateString("en-AU", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const tickersWithNews = Object.entries(news).filter(([, items]) => items.length > 0);

  const hasCrossCurrency = Object.values(priceData).some(
    (q) => q.originalCurrency !== defaultCurrency,
  );

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
      <div style="font-size:11px;color:${S.muted};text-transform:uppercase;">Holdings Value · ${defaultCurrency}</div>
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
      <td style="padding:5px 3px;border-bottom:1px solid ${S.border};text-align:right;">${fmt$(item.price)}</td>
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

${
  hasCrossCurrency
    ? `
<!-- FX caveat -->
<tr><td style="padding:10px 24px;background:${S.cardBg};border-top:1px solid ${S.border};font-size:11px;color:${S.muted};">
  Limit prices shown in ${defaultCurrency} — check your broker's quote currency before placing an order.
</td></tr>`
    : ""
}
${
  fxSkipped.length > 0
    ? `
<!-- FX skipped tickers -->
<tr><td style="padding:10px 24px;background:${S.cardBg};border-top:1px solid ${S.border};font-size:11px;color:${S.yellow};">
  FX lookup failed — skipped: ${fxSkipped.map((s) => `${s.ticker} (${s.reason})`).join(", ")}
</td></tr>`
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
  fxSkipped: Array<{ ticker: string; reason: string }> = [],
): Promise<void> {
  const html = buildEmailHtml(report, news, aiRecs, technicals, priceData, fxSkipped);

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
