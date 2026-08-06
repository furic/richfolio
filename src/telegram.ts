import type { AllocationReport } from "./analyze.js";
import type { AIBuyRecommendation } from "./aiAnalysis.js";
import type { NewsItem } from "./fetchNews.js";
import type { TechnicalData } from "./fetchTechnicals.js";
import type { IntradayAlert } from "./intradayCompare.js";
import type { QuoteData } from "./fetchPrices.js";
import { escapeHtmlText, formatMoney } from "./util.js";
import { defaultCurrency } from "./config.js";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const MAX_MESSAGE_LENGTH = 4096;

// ── Helpers ─────────────────────────────────────────────────────────
const fmt$ = (n: number) => formatMoney(n, defaultCurrency);

function actionEmoji(action: string): string {
  switch (action) {
    case "STRONG BUY":
      return "🟢";
    case "BUY":
      return "🔵";
    case "HOLD":
      return "⚪";
    case "WAIT":
      return "🔴";
    default:
      return "⚪";
  }
}

/** Trim an AI-supplied string so a few long reasons can't blow the 4096 limit. */
function truncateText(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

/**
 * Hard safety net: Telegram rejects any message > 4096 chars with a 400, which
 * drops the entire brief. Drop whole trailing lines (each line has balanced
 * HTML tags, so this stays valid) until the message fits, appending a marker.
 */
function clampToLimit(lines: string[], max = MAX_MESSAGE_LENGTH): string {
  const full = lines.join("\n");
  if (full.length <= max) return full;
  const note = "\n\n<i>…brief truncated to fit Telegram's limit.</i>";
  const out = [...lines];
  while (out.length > 1 && out.join("\n").length + note.length > max) {
    out.pop();
  }
  let msg = out.join("\n");
  if (msg.length + note.length > max) {
    // Pathological single huge line — hard cut.
    msg = msg.slice(0, max - note.length);
  }
  return msg + note;
}

// ── Build message ───────────────────────────────────────────────────
function buildMessage(
  report: AllocationReport,
  news: Record<string, NewsItem[]>,
  aiRecs: AIBuyRecommendation[],
  technicals: Record<string, TechnicalData> = {},
  priceData: Record<string, QuoteData> = {},
): string {
  const date = new Date().toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const lines: string[] = [];

  // Header
  lines.push(`📊 <b>Richfolio Brief</b> — ${date}`);
  lines.push("");
  lines.push(
    `💰 <b>${fmt$(report.totalCurrentValue)}</b> ${defaultCurrency}` +
      (report.portfolioBeta != null ? `  |  β ${report.portfolioBeta.toFixed(2)}` : "") +
      `  |  📈 ${fmt$(report.estimatedAnnualDividend)}/yr div`,
  );
  lines.push("");

  // AI Recommendations or fallback
  if (aiRecs.length > 0) {
    // Portfolio actionable recs (excludes watch list)
    const actionable = aiRecs
      .filter((r) => !r.isWatching && (r.action === "STRONG BUY" || r.action === "BUY"))
      .slice(0, 5);
    if (actionable.length > 0) {
      // Mode detection — multi-AI if any rec has ≥2 providers attached
      const firstWithProviders = aiRecs.find((r) => r.providers && r.providers.length > 0);
      const providerLabels = firstWithProviders?.providers?.map((p) => p.providerLabel) ?? [
        "Gemini",
      ];
      const multiAIMode = providerLabels.length >= 2;
      const heading = multiAIMode
        ? `🤖 <b>AI Recommendations (${providerLabels.join(" + ")}):</b>`
        : "🤖 <b>AI Recommendations:</b>";
      lines.push(heading);
      for (const rec of actionable) {
        const earningsDays = priceData[rec.ticker]?.daysToEarnings;
        const earningsTag =
          earningsDays != null && earningsDays <= 14 ? ` [earnings ${earningsDays}d]` : "";
        const isMulti = !!rec.providers && rec.providers.length >= 2;
        const confLabel = isMulti ? `avg ${rec.confidence}%` : `${rec.confidence}%`;
        const agreementTag = isMulti && rec.agreement ? ` ${rec.agreement}` : "";
        // Degraded run: a provider didn't answer, so cross-provider agreement
        // was never verified. Shown even in single-provider rendering.
        const degradedTag = rec.degradation
          ? ` ⚠ ${rec.degradation.answered}/${rec.degradation.configured} AI`
          : "";
        lines.push(
          `${actionEmoji(rec.action)} <b>${rec.action} ${rec.ticker}</b> (${confLabel})${agreementTag}${degradedTag}` +
            (rec.valueRating ? ` [${rec.valueRating}]` : "") +
            earningsTag +
            (rec.suggestedBuyValue > 0 ? ` — ${fmt$(rec.suggestedBuyValue)}` : ""),
        );
        // Per-provider breakdown (multi-AI mode only)
        if (isMulti) {
          const perAI = rec
            .providers!.map(
              (p) =>
                `${escapeHtmlText(p.providerShortLabel)} ${actionEmoji(p.action)}${p.confidence}`,
            )
            .join(" · ");
          lines.push(`   ${perAI}`);
        }
        // Critical: Telegram HTML mode rejects unrecognised < as malformed tags.
        // AI-generated prose routinely contains "<30%" / "<35" / "%B < 0.15"
        // which Telegram parses as "<30%>" and 400s the whole message. Escape
        // every AI-supplied string before injection.
        lines.push(`   <i>${escapeHtmlText(truncateText(rec.reason, 300))}</i>`);
        // Technical insight for STRONG BUY only
        if (rec.action === "STRONG BUY") {
          const tech = technicals[rec.ticker];
          if (tech) {
            lines.push(
              `   📈 ${tech.momentumSignal} · RSI ${tech.rsi14} · 50MA ${fmt$(tech.sma50)} (${tech.priceVsSma50 > 0 ? "+" : ""}${tech.priceVsSma50}%)` +
                (tech.macdCrossover
                  ? ` · MACD ${tech.macdCrossover}`
                  : tech.macdHistogram != null
                    ? ` · MACD hist ${tech.macdHistogram > 0 ? "+" : ""}${tech.macdHistogram}`
                    : "") +
                (tech.bollPercentB != null ? ` · %B ${tech.bollPercentB}` : "") +
                (tech.bollSqueeze ? " · 🔸squeeze" : ""),
            );
          }
          if (rec.suggestedLimitPrice && rec.suggestedLimitPrice > 0) {
            lines.push(
              `   💡 Limit: ${fmt$(rec.suggestedLimitPrice)}` +
                (rec.limitPriceReason ? ` — ${escapeHtmlText(rec.limitPriceReason)}` : ""),
            );
          }
          if (rec.bottomSignal && rec.bottomSignal !== "") {
            lines.push(`   🔻 Bottom: ${escapeHtmlText(rec.bottomSignal)}`);
          }
          if (rec.analysisUrl) {
            lines.push(`   📋 <a href="${rec.analysisUrl}">More Details</a>`);
          }
        }
      }

      const holds = aiRecs.filter(
        (r) => !r.isWatching && (r.action === "HOLD" || r.action === "WAIT"),
      );
      if (holds.length > 0) {
        lines.push("");
        lines.push(
          `⏸ Hold/Wait: ${holds.map((r) => r.ticker + (r.valueRating ? `[${r.valueRating}]` : "")).join(", ")}`,
        );
      }
    } else {
      lines.push("🤖 No strong buy opportunities identified today.");
    }

    // Watch List section (separate from portfolio — no buy size, signal only)
    const watching = aiRecs.filter((r) => r.isWatching);
    if (watching.length > 0) {
      const watchActionable = watching.filter(
        (r) => r.action === "STRONG BUY" || r.action === "BUY",
      );
      const watchHolds = watching.filter((r) => r.action === "HOLD" || r.action === "WAIT");
      lines.push("");
      lines.push("👁 <b>Watch List:</b>");
      for (const rec of watchActionable.slice(0, 5)) {
        const earningsDays = priceData[rec.ticker]?.daysToEarnings;
        const earningsTag =
          earningsDays != null && earningsDays <= 14 ? ` [earnings ${earningsDays}d]` : "";
        const isMulti = !!rec.providers && rec.providers.length >= 2;
        const confLabel = isMulti ? `avg ${rec.confidence}%` : `${rec.confidence}%`;
        const agreementTag = isMulti && rec.agreement ? ` ${rec.agreement}` : "";
        // Degraded run: a provider didn't answer, so cross-provider agreement
        // was never verified. Shown even in single-provider rendering.
        const degradedTag = rec.degradation
          ? ` ⚠ ${rec.degradation.answered}/${rec.degradation.configured} AI`
          : "";
        lines.push(
          `${actionEmoji(rec.action)} <b>${rec.action} ${rec.ticker}</b> (${confLabel})${agreementTag}${degradedTag}` +
            (rec.valueRating ? ` [${rec.valueRating}]` : "") +
            earningsTag,
        );
        if (isMulti) {
          const perAI = rec
            .providers!.map(
              (p) =>
                `${escapeHtmlText(p.providerShortLabel)} ${actionEmoji(p.action)}${p.confidence}`,
            )
            .join(" · ");
          lines.push(`   ${perAI}`);
        }
        lines.push(`   <i>${escapeHtmlText(truncateText(rec.reason, 300))}</i>`);
        if (rec.suggestedLimitPrice && rec.suggestedLimitPrice > 0) {
          lines.push(
            `   💡 Limit: ${fmt$(rec.suggestedLimitPrice)}` +
              (rec.limitPriceReason ? ` — ${escapeHtmlText(rec.limitPriceReason)}` : ""),
          );
        }
        if (rec.analysisUrl) {
          lines.push(`   📋 <a href="${rec.analysisUrl}">More Details</a>`);
        }
      }
      if (watchHolds.length > 0) {
        lines.push(
          `⏸ ${watchHolds.map((r) => r.ticker + (r.valueRating ? `[${r.valueRating}]` : "")).join(", ")}`,
        );
      }
    }
  } else {
    // Fallback: gap-based top buys
    const buys = report.items.filter((i) => i.gapPct > 0.5).slice(0, 5);
    if (buys.length > 0) {
      lines.push("📋 <b>Priority Buys (by gap):</b>");
      for (const b of buys) {
        lines.push(
          `• <b>${b.ticker}</b> — gap +${b.gapPct.toFixed(1)}% — buy ~${fmt$(b.suggestedBuyValue)}` +
            (b.overlapDiscount > 0 ? ` (−${fmt$(b.overlapDiscount)} overlap)` : ""),
        );
      }
    }
  }

  // News section
  const tickersWithNews = Object.entries(news).filter(([, items]) => items.length > 0);
  if (tickersWithNews.length > 0) {
    lines.push("");
    lines.push("📰 <b>News:</b>");

    const currentLength = lines.join("\n").length;
    const budgetForNews = MAX_MESSAGE_LENGTH - currentLength - 50; // reserve some buffer

    let newsText = "";
    for (const [ticker, articles] of tickersWithNews) {
      const headline = articles[0]; // 1 per ticker
      const line = `<b>${ticker}:</b> <a href="${headline.url}">${escapeHtmlText(headline.title)}</a>\n`;
      if (newsText.length + line.length > budgetForNews) break;
      newsText += line;
    }
    lines.push(newsText.trim());
  }

  const hasCrossCurrency = Object.values(priceData).some(
    (q) => q.originalCurrency !== defaultCurrency,
  );
  if (hasCrossCurrency) {
    lines.push("");
    lines.push(
      `<i>Limit prices in ${defaultCurrency} — confirm broker currency before ordering.</i>`,
    );
  }

  return clampToLimit(lines);
}

// ── Send to Telegram ────────────────────────────────────────────────
export async function sendTelegramBrief(
  report: AllocationReport,
  news: Record<string, NewsItem[]>,
  aiRecs: AIBuyRecommendation[] = [],
  technicals: Record<string, TechnicalData> = {},
  priceData: Record<string, QuoteData> = {},
): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.log("TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping Telegram\n");
    return;
  }

  const message = buildMessage(report, news, aiRecs, technicals, priceData);

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API error (${response.status}): ${body}`);
  }

  console.log("Telegram message sent");
}

// ── Weekly Telegram ─────────────────────────────────────────────────
function buildWeeklyMessage(report: AllocationReport): string {
  const date = new Date().toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const lines: string[] = [];

  lines.push(`📊 <b>Weekly Rebalancing Report</b> — ${date}`);
  lines.push("");
  lines.push(
    `💰 <b>${fmt$(report.totalCurrentValue)}</b> ${defaultCurrency}` +
      (report.portfolioBeta != null ? `  |  β ${report.portfolioBeta.toFixed(2)}` : "") +
      `  |  📈 ${fmt$(report.estimatedAnnualDividend)}/yr div`,
  );

  // Underweight (buy)
  const buys = report.items.filter((i) => i.gapPct > 0.5);
  if (buys.length > 0) {
    lines.push("");
    lines.push("🔴 <b>Underweight — Buy:</b>");
    for (const b of buys) {
      lines.push(
        `• <b>${b.ticker}</b>  ${b.currentPct.toFixed(1)}% → ${b.targetPct.toFixed(1)}%  gap +${b.gapPct.toFixed(1)}%  ~${fmt$(b.suggestedBuyValue)}` +
          (b.overlapDiscount > 0 ? ` (−${fmt$(b.overlapDiscount)} overlap)` : ""),
      );
    }
  }

  // Overweight (sell/trim)
  const sells = report.items.filter((i) => i.gapPct < -1);
  if (sells.length > 0) {
    lines.push("");
    lines.push("🟡 <b>Overweight — Consider Trimming:</b>");
    for (const s of sells) {
      lines.push(
        `• <b>${s.ticker}</b>  ${s.currentPct.toFixed(1)}% → ${s.targetPct.toFixed(1)}%  gap ${s.gapPct.toFixed(1)}%`,
      );
    }
  }

  // On target
  const onTarget = report.items.filter((i) => Math.abs(i.gapPct) <= 1 && i.targetPct > 0);
  if (onTarget.length > 0) {
    lines.push("");
    lines.push(`✅ On target: ${onTarget.map((i) => i.ticker).join(", ")}`);
  }

  const hasCrossCurrency = report.items.some((i) => i.originalCurrency !== defaultCurrency);
  if (hasCrossCurrency) {
    lines.push("");
    lines.push(`<i>Values in ${defaultCurrency} — multi-currency portfolio.</i>`);
  }

  return clampToLimit(lines);
}

export async function sendWeeklyTelegram(report: AllocationReport): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.log("TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping Telegram\n");
    return;
  }

  const message = buildWeeklyMessage(report);

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API error (${response.status}): ${body}`);
  }

  console.log("Weekly Telegram message sent");
}

// ── Intraday Alert Telegram ─────────────────────────────────────────
function buildIntradayMessage(alerts: IntradayAlert[]): string {
  const time = new Date().toLocaleTimeString("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const lines: string[] = [];

  lines.push(`🚨 <b>Intraday Alert</b> — ${time}`);
  lines.push("");

  for (const alert of alerts) {
    const triggerLabel =
      alert.triggerType === "action_upgrade"
        ? "upgraded"
        : alert.triggerType === "action_downgrade"
          ? "downgraded"
          : "confidence changed";

    lines.push(
      `${actionEmoji(alert.currentAction)} <b>${alert.currentAction} ${alert.ticker}</b> (${triggerLabel})`,
    );
    // Only show the numeric confidence delta when the action stayed the same.
    // STRONG BUY 82% → BUY 67% (-15) is misleading: the two scales aren't
    // directly comparable across action tiers — the action change IS the signal.
    const sameAction = alert.morningAction === alert.currentAction;
    const deltaSuffix = sameAction
      ? ` (${alert.confidenceDelta >= 0 ? "+" : ""}${alert.confidenceDelta})`
      : "";
    lines.push(
      `   ${alert.morningAction} ${alert.morningConfidence}% → ${alert.currentAction} ${alert.currentConfidence}%${deltaSuffix}`,
    );
    if (Math.abs(alert.priceDelta) >= 0.01) {
      const dir = alert.priceDelta < 0 ? "down" : "up";
      lines.push(`   Price ${dir} ${Math.abs(alert.priceDelta).toFixed(1)}% since morning`);
    }
    lines.push(`   <i>${escapeHtmlText(alert.reason)}</i>`);
    if (alert.suggestedBuyValue > 0) {
      lines.push(`   Suggested: ${fmt$(alert.suggestedBuyValue)}`);
    }
    if (alert.analysisUrl) {
      lines.push(`   📋 <a href="${alert.analysisUrl}">More Details</a>`);
    }
    lines.push("");
  }

  const hasCrossCurrency = alerts.some((a) => a.originalCurrency !== defaultCurrency);
  if (hasCrossCurrency) {
    lines.push("");
    lines.push(
      `<i>Limit prices in ${defaultCurrency} — confirm broker currency before ordering.</i>`,
    );
  }

  return clampToLimit(lines).trim();
}

export async function sendIntradayTelegram(alerts: IntradayAlert[]): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.log("TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping Telegram\n");
    return;
  }

  const message = buildIntradayMessage(alerts);

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API error (${response.status}): ${body}`);
  }

  console.log("Intraday Telegram alert sent");
}

// ── Refresh Analysis Telegram ───────────────────────────────────────
export async function sendRefreshTelegram(
  ticker: string,
  rec: AIBuyRecommendation,
  quote: QuoteData,
  priceSource: string,
): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.log("TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping Telegram\n");
    return;
  }

  const time = new Date().toLocaleTimeString("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const lines: string[] = [];
  lines.push(`🔄 <b>Refresh Analysis</b> — ${ticker} — ${time}`);
  lines.push("");
  lines.push(`${actionEmoji(rec.action)} <b>${rec.action}</b> (${rec.confidence}%)`);
  lines.push(`💰 Price: ${fmt$(quote.price)} ${defaultCurrency} (${priceSource})`);
  lines.push(`<i>${escapeHtmlText(truncateText(rec.reason, 400))}</i>`);
  if (rec.suggestedLimitPrice && rec.suggestedLimitPrice > 0) {
    lines.push(
      `💡 Limit: ${fmt$(rec.suggestedLimitPrice)}${rec.limitPriceReason ? " — " + escapeHtmlText(rec.limitPriceReason) : ""}`,
    );
  }
  if (rec.suggestedBuyValue > 0) {
    lines.push(`📊 Suggested: ${fmt$(rec.suggestedBuyValue)}`);
  }
  if (rec.analysisUrl) {
    lines.push(`📋 <a href="${rec.analysisUrl}">Full Analysis</a>`);
  }
  if (quote.originalCurrency !== defaultCurrency) {
    lines.push("");
    lines.push(`<i>Price in ${defaultCurrency} — confirm broker currency before ordering.</i>`);
  }

  const message = lines.join("\n");

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API error (${response.status}): ${body}`);
  }

  console.log("Refresh Telegram message sent");
}
