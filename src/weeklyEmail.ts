import { Resend } from "resend";
import { recipientEmail } from "./config.js";
import type { AllocationItem, AllocationReport } from "./analyze.js";
import { escapeHtmlAttr } from "./util.js";

const resend = new Resend(process.env.RESEND_API_KEY);

// ── Styles (same dark theme as daily email) ─────────────────────────
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

function actionLabel(gap: number): { text: string; color: string } {
  if (gap > 1) return { text: "BUY", color: S.red };
  if (gap < -1) return { text: "TRIM", color: S.yellow };
  return { text: "OK", color: S.green };
}

// ── Build HTML ──────────────────────────────────────────────────────
export function buildWeeklyEmailHtml(report: AllocationReport): string {
  const date = new Date().toLocaleDateString("en-AU", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const onTarget = report.items.filter((i) => Math.abs(i.gapPct) <= 1 && i.targetPct > 0);
  const underweight = report.items.filter((i) => i.gapPct > 1);
  const overweight = report.items.filter((i) => i.gapPct < -1 && i.targetPct > 0);
  const noTarget = report.items.filter((i) => i.targetPct === 0 && i.currentValue > 0);

  // All items sorted by |gap| descending for the full table
  const sorted = [...report.items].sort((a, b) => Math.abs(b.gapPct) - Math.abs(a.gapPct));

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:${S.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${S.text};font-size:14px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;padding:20px;">

<!-- Header -->
<tr><td style="padding:20px 24px;background:${S.accent};border-radius:8px 8px 0 0;">
  <h1 style="margin:0;font-size:22px;color:#fff;">Weekly Rebalancing Report</h1>
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
      <div style="font-size:11px;color:${S.muted};text-transform:uppercase;">On Target</div>
      <div style="font-size:20px;font-weight:bold;color:${S.green};">${onTarget.length}/${report.items.filter((i) => i.targetPct > 0).length}</div>
    </td>
    <td style="text-align:center;padding:8px;">
      <div style="font-size:11px;color:${S.muted};text-transform:uppercase;">Est. Annual Div</div>
      <div style="font-size:20px;font-weight:bold;color:#fff;">${fmt$(report.estimatedAnnualDividend)}</div>
    </td>
  </tr></table>
</td></tr>

<!-- Rebalancing Actions -->
<tr><td style="padding:20px 24px 8px;background:${S.cardBg};">
  <h2 style="margin:0;font-size:16px;color:${S.blue};">Rebalancing Actions</h2>
  <p style="margin:4px 0 0;font-size:11px;color:${S.muted};">Sorted by drift from target. Positions within ±1% are considered on-target.</p>
</td></tr>
<tr><td style="padding:0 24px 16px;background:${S.cardBg};">
  <table width="100%" cellpadding="0" cellspacing="0" style="font-size:12px;">
    <tr style="color:${S.muted};font-size:10px;text-transform:uppercase;">
      <td style="padding:5px 3px;border-bottom:1px solid ${S.border};">Ticker</td>
      <td style="padding:5px 3px;border-bottom:1px solid ${S.border};text-align:center;">Action</td>
      <td style="padding:5px 3px;border-bottom:1px solid ${S.border};text-align:right;">Current</td>
      <td style="padding:5px 3px;border-bottom:1px solid ${S.border};text-align:right;">Target</td>
      <td style="padding:5px 3px;border-bottom:1px solid ${S.border};text-align:right;">Gap</td>
      <td style="padding:5px 3px;border-bottom:1px solid ${S.border};text-align:right;">Amount</td>
    </tr>
    ${sorted
      .filter((i) => i.targetPct > 0 || i.currentValue > 0)
      .map((item) => {
        const action = actionLabel(item.gapPct);
        return `
    <tr>
      <td style="padding:5px 3px;border-bottom:1px solid ${S.border};font-weight:bold;" title="${escapeHtmlAttr(item.tickerFullName ?? item.ticker)}">${item.ticker}</td>
      <td style="padding:5px 3px;border-bottom:1px solid ${S.border};text-align:center;">
        <span style="background:${action.color};color:#000;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:bold;">${action.text}</span>
      </td>
      <td style="padding:5px 3px;border-bottom:1px solid ${S.border};text-align:right;">${item.currentPct.toFixed(1)}%</td>
      <td style="padding:5px 3px;border-bottom:1px solid ${S.border};text-align:right;">${item.targetPct.toFixed(1)}%</td>
      <td style="padding:5px 3px;border-bottom:1px solid ${S.border};text-align:right;color:${action.color};">${fmtPct(item.gapPct)}</td>
      <td style="padding:5px 3px;border-bottom:1px solid ${S.border};text-align:right;">${item.suggestedBuyValue > 0 ? `Buy ${fmt$(item.suggestedBuyValue)}${item.overlapDiscount > 0 ? `<div style="font-size:10px;color:${S.muted};">-${fmt$(item.overlapDiscount)} overlap</div>` : ""}` : "—"}</td>
    </tr>`;
      })
      .join("")}
  </table>
</td></tr>

${
  overweight.length > 0
    ? `
<!-- Overweight Warning -->
<tr><td style="padding:16px 24px;background:${S.cardBg};border-top:1px solid ${S.border};">
  <h3 style="margin:0;font-size:14px;color:${S.yellow};">⚠ Overweight Positions</h3>
  <p style="margin:4px 0 0;font-size:12px;color:${S.text};">
    ${overweight.map((i) => `<b>${i.ticker}</b> (${i.currentPct.toFixed(1)}% vs ${i.targetPct.toFixed(1)}% target)`).join(", ")}
  </p>
</td></tr>`
    : ""
}

${
  noTarget.length > 0
    ? `
<!-- No-target holdings -->
<tr><td style="padding:16px 24px;background:${S.cardBg};border-top:1px solid ${S.border};">
  <h3 style="margin:0;font-size:14px;color:${S.muted};">Holdings Not in Target Portfolio</h3>
  <p style="margin:4px 0 0;font-size:12px;color:${S.text};">
    ${noTarget.map((i) => `<b>${i.ticker}</b> (${fmt$(i.currentValue)}, ${i.currentPct.toFixed(1)}%)`).join(", ")}
  </p>
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

// ── Send weekly email ───────────────────────────────────────────────
export async function sendWeeklyBrief(report: AllocationReport): Promise<void> {
  const html = buildWeeklyEmailHtml(report);

  const { error } = await resend.emails.send({
    from: "Richfolio <onboarding@resend.dev>",
    to: recipientEmail,
    subject: `Richfolio Weekly Rebalance — ${new Date().toLocaleDateString("en-AU")}`,
    html,
  });

  if (error) {
    throw new Error(`Resend error: ${JSON.stringify(error)}`);
  }

  console.log(`Weekly email sent to ${recipientEmail}`);
}
