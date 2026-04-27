import { Resend } from "resend";
import { recipientEmail } from "./config.js";
import type { IntradayAlert } from "./intradayCompare.js";
import type { AIBuyRecommendation } from "./aiAnalysis.js";
import type { QuoteData } from "./fetchPrices.js";
import { escapeHtmlAttr } from "./util.js";

const resend = new Resend(process.env.RESEND_API_KEY);

// ── Styles (matches email.ts dark theme) ────────────────────────────
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
  return (
    "$" +
    n.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  );
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

function triggerLabel(type: IntradayAlert["triggerType"]): string {
  switch (type) {
    case "action_upgrade":
      return "Upgraded to STRONG BUY";
    case "action_downgrade":
      return "Downgraded from STRONG BUY";
    case "confidence_change":
      return "Confidence Changed";
  }
}

function priceDeltaHtml(delta: number): string {
  if (Math.abs(delta) < 0.01) return "";
  const color = delta < 0 ? S.green : S.red; // price drop = green (buying opp)
  const sign = delta > 0 ? "+" : "";
  return `<span style="color:${color};font-size:12px;">Price ${sign}${delta.toFixed(1)}% since morning</span>`;
}

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

function summarizeAlertDirection(alerts: IntradayAlert[]): string {
  const hasStrengthened = alerts.some(
    (a) =>
      a.triggerType === "action_upgrade" ||
      (a.triggerType === "confidence_change" && a.confidenceDelta > 0),
  );
  const hasWeakened = alerts.some(
    (a) =>
      a.triggerType === "action_downgrade" ||
      (a.triggerType === "confidence_change" && a.confidenceDelta < 0),
  );
  if (hasStrengthened && hasWeakened) return "changed";
  if (hasWeakened) return "weakened";
  return "strengthened";
}

// ── Build HTML ──────────────────────────────────────────────────────
export function buildIntradayEmailHtml(alerts: IntradayAlert[]): string {
  const time = new Date().toLocaleTimeString("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  const date = new Date().toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const alertRows = alerts
    .map(
      (a) => `
  <div style="padding:14px 0;border-bottom:1px solid ${S.border};">
    <div style="margin-bottom:6px;">
      <span style="font-weight:bold;font-size:16px;color:#fff;" title="${escapeHtmlAttr(a.tickerFullName ?? a.ticker)}">${a.ticker}</span>
      &nbsp;${actionBadge(a.currentAction)}${valueRatingBadge(a.valueRating)}
      <span style="float:right;font-size:11px;color:${S.yellow};text-transform:uppercase;">${triggerLabel(a.triggerType)}</span>
    </div>
    <div style="margin-bottom:6px;">
      <span style="color:${S.muted};font-size:12px;">Morning:</span>
      <span style="font-size:12px;color:${S.text};">${a.morningAction} ${a.morningConfidence}%</span>
      <span style="color:${S.muted};font-size:12px;"> → </span>
      <span style="font-size:13px;font-weight:bold;color:#fff;">${a.currentAction} ${a.currentConfidence}%</span>
      <span style="color:${a.confidenceDelta >= 0 ? S.green : S.red};font-size:12px;"> (${a.confidenceDelta >= 0 ? "+" : ""}${a.confidenceDelta})</span>
    </div>
    ${priceDeltaHtml(a.priceDelta) ? `<div style="margin-bottom:6px;">${priceDeltaHtml(a.priceDelta)}</div>` : ""}
    <div style="font-size:12px;color:${S.text};margin-bottom:4px;">${a.reason}</div>
    ${a.suggestedBuyValue > 0 ? `<div style="font-size:13px;font-weight:bold;color:#fff;">Suggested: ${fmt$(a.suggestedBuyValue)}</div>` : ""}
    ${a.currentAction === "STRONG BUY" && a.suggestedLimitPrice && a.suggestedLimitPrice > 0 ? `<div style="font-size:12px;color:${S.green};margin-top:4px;">Limit order: $${a.suggestedLimitPrice.toFixed(2)}${a.limitPriceReason ? ` — ${a.limitPriceReason}` : ""}</div>` : ""}
    ${a.bottomSignal && a.bottomSignal !== "" ? `<div style="font-size:11px;color:${S.yellow};margin-top:4px;">Bottom signal: ${a.bottomSignal}</div>` : ""}
    ${a.currentAction === "STRONG BUY" && a.analysisUrl ? `<div style="margin-top:8px;"><a href="${a.analysisUrl}" style="display:inline-block;background:#3498db22;color:#3498db;padding:4px 12px;border-radius:4px;font-size:11px;font-weight:bold;text-decoration:none;border:1px solid #3498db44;">More Details &rarr;</a></div>` : ""}
  </div>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:${S.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${S.text};font-size:14px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;padding:20px;">

<!-- Header -->
<tr><td style="padding:20px 24px;background:${S.accent};border-radius:8px 8px 0 0;">
  <h1 style="margin:0;font-size:20px;color:${S.yellow};">Intraday Alert</h1>
  <p style="margin:6px 0 0;color:${S.muted};font-size:13px;">${date} at ${time}</p>
  <p style="margin:4px 0 0;color:${S.text};font-size:12px;">${alerts.length} signal${alerts.length > 1 ? "s" : ""} ${summarizeAlertDirection(alerts)} since morning brief</p>
</td></tr>

<!-- Alerts -->
<tr><td style="padding:8px 24px 16px;background:${S.cardBg};">
  ${alertRows}
</td></tr>

<!-- Footer -->
<tr><td style="padding:12px 24px;background:${S.accent};border-radius:0 0 8px 8px;text-align:center;">
  <p style="margin:0;font-size:11px;color:${S.muted};">
    Intraday check · Powered by Richfolio
  </p>
</td></tr>

</table>
</body>
</html>`;
}

// ── Send email ──────────────────────────────────────────────────────
export async function sendIntradayAlert(alerts: IntradayAlert[]): Promise<void> {
  const html = buildIntradayEmailHtml(alerts);
  const tickers = alerts.map((a) => a.ticker).join(", ");

  const { error } = await resend.emails.send({
    from: "Richfolio <onboarding@resend.dev>",
    to: recipientEmail,
    subject: `Richfolio Alert: ${tickers} signal ${summarizeAlertDirection(alerts)}`,
    html,
  });

  if (error) {
    throw new Error(`Resend error: ${JSON.stringify(error)}`);
  }

  console.log(`Intraday alert email sent to ${recipientEmail}`);
}

// ── Refresh Analysis Email ──────────────────────────────────────────
export async function sendRefreshEmail(
  ticker: string,
  rec: AIBuyRecommendation,
  quote: QuoteData,
  priceSource: string,
): Promise<void> {
  const time = new Date().toLocaleTimeString("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  const date = new Date().toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:${S.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${S.text};font-size:14px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;padding:20px;">

<!-- Header -->
<tr><td style="padding:20px 24px;background:${S.accent};border-radius:8px 8px 0 0;">
  <h1 style="margin:0;font-size:20px;color:${S.blue};">Refresh Analysis — ${ticker}</h1>
  <p style="margin:6px 0 0;color:${S.muted};font-size:13px;">${date} at ${time}</p>
  <p style="margin:4px 0 0;color:${S.text};font-size:12px;">Updated with ${priceSource} price</p>
</td></tr>

<!-- Content -->
<tr><td style="padding:16px 24px;background:${S.cardBg};">
  <div style="margin-bottom:10px;">
    <span style="font-weight:bold;font-size:18px;color:#fff;" title="${escapeHtmlAttr(quote.longName ?? ticker)}">${ticker}</span>
    &nbsp;${actionBadge(rec.action)}${rec.valueRating ? valueRatingBadge(rec.valueRating) : ""}
  </div>
  <div style="font-size:13px;color:#fff;margin-bottom:6px;">Confidence: <strong>${rec.confidence}%</strong></div>
  <div style="font-size:13px;color:#fff;margin-bottom:8px;">Price: <strong>$${quote.price.toFixed(2)}</strong> <span style="color:${S.muted};">(${priceSource})</span></div>
  <div style="font-size:12px;color:${S.text};margin-bottom:10px;">${rec.reason}</div>
  ${rec.suggestedBuyValue > 0 ? `<div style="font-size:13px;font-weight:bold;color:#fff;margin-bottom:4px;">Suggested: ${fmt$(rec.suggestedBuyValue)}</div>` : ""}
  ${rec.suggestedLimitPrice && rec.suggestedLimitPrice > 0 ? `<div style="font-size:12px;color:${S.green};margin-bottom:4px;">Limit order: $${rec.suggestedLimitPrice.toFixed(2)}${rec.limitPriceReason ? ` — ${rec.limitPriceReason}` : ""}</div>` : ""}
  ${rec.bottomSignal ? `<div style="font-size:11px;color:${S.yellow};margin-bottom:4px;">Bottom signal: ${rec.bottomSignal}</div>` : ""}
  ${rec.analysisUrl ? `<div style="margin-top:12px;"><a href="${rec.analysisUrl}" style="display:inline-block;background:#3498db22;color:#3498db;padding:6px 16px;border-radius:4px;font-size:12px;font-weight:bold;text-decoration:none;border:1px solid #3498db44;">Full Analysis &rarr;</a></div>` : ""}
</td></tr>

<!-- Footer -->
<tr><td style="padding:12px 24px;background:${S.accent};border-radius:0 0 8px 8px;text-align:center;">
  <p style="margin:0;font-size:11px;color:${S.muted};">
    Refresh analysis · Powered by Richfolio
  </p>
</td></tr>

</table>
</body>
</html>`;

  const { error } = await resend.emails.send({
    from: "Richfolio <onboarding@resend.dev>",
    to: recipientEmail,
    subject: `Richfolio Refresh: ${rec.action} ${ticker} (${rec.confidence}%)`,
    html,
  });

  if (error) {
    throw new Error(`Resend error: ${JSON.stringify(error)}`);
  }

  console.log(`Refresh email sent to ${recipientEmail}`);
}
