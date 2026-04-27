import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AIBuyRecommendation } from "./aiAnalysis.js";

// ── Types ───────────────────────────────────────────────────────────
export interface MorningBaseline {
  timestamp: string;
  date: string;
  recommendations: AIBuyRecommendation[];
  prices: Record<string, number>;
}

export interface ReasoningSnapshot {
  date: string;
  ticker: string;
  action: string;
  confidence: number;
  reason: string;
  price: number;
}

export interface ReasoningHistory {
  snapshots: Record<string, ReasoningSnapshot[]>; // date → array of per-ticker snapshots
}

// ── Paths ───────────────────────────────────────────────────────────
const STATE_DIR = resolve(process.cwd(), "state");
const BASELINE_FILE = resolve(STATE_DIR, "morning-baseline.json");
const REASONING_FILE = resolve(STATE_DIR, "reasoning-history.json");
const MAX_REASONING_DAYS = 7;

// ── Save / Load ─────────────────────────────────────────────────────
export function saveBaseline(baseline: MorningBaseline): void {
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true });
  }
  writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2));
  console.log(`Morning baseline saved (${baseline.recommendations.length} recs)`);
}

export function loadBaseline(): MorningBaseline | null {
  try {
    const raw = readFileSync(BASELINE_FILE, "utf-8");
    const data = JSON.parse(raw) as MorningBaseline;

    // Check baseline age instead of date string — works across any timezone
    // (daily at 10pm UTC + intraday at 0-6am UTC straddles midnight in many TZs)
    const ageHours = (Date.now() - new Date(data.timestamp).getTime()) / (1000 * 60 * 60);
    if (ageHours > 18) {
      console.log(`Baseline is ${ageHours.toFixed(1)}h old (max 18h) — skipping comparison`);
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

// ── Reasoning History ──────────────────────────────────────────────
export function saveReasoningHistory(
  recs: AIBuyRecommendation[],
  prices: Record<string, number>,
): void {
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true });
  }

  const today = new Date().toISOString().slice(0, 10);
  const history = loadReasoningHistory();

  // Add today's snapshots
  history.snapshots[today] = recs.map((rec) => ({
    date: today,
    ticker: rec.ticker,
    action: rec.action,
    confidence: rec.confidence,
    reason: rec.reason,
    price: prices[rec.ticker] ?? 0,
  }));

  // Prune old entries beyond MAX_REASONING_DAYS
  const dates = Object.keys(history.snapshots).sort();
  while (dates.length > MAX_REASONING_DAYS) {
    const oldest = dates.shift()!;
    delete history.snapshots[oldest];
  }

  writeFileSync(REASONING_FILE, JSON.stringify(history, null, 2));
  console.log(`Reasoning history saved (${dates.length} days)`);
}

export function loadReasoningHistory(): ReasoningHistory {
  try {
    const raw = readFileSync(REASONING_FILE, "utf-8");
    return JSON.parse(raw) as ReasoningHistory;
  } catch {
    return { snapshots: {} };
  }
}

/**
 * Format reasoning history as a prompt section for the AI.
 * Shows per-ticker conviction trend over the last 7 days.
 */
export function formatReasoningContext(history: ReasoningHistory): string {
  const dates = Object.keys(history.snapshots).sort();
  if (dates.length === 0) return "";

  // Collect per-ticker history across days
  const tickerHistory: Record<
    string,
    { date: string; action: string; confidence: number; price: number }[]
  > = {};
  for (const date of dates) {
    for (const snap of history.snapshots[date]) {
      if (!tickerHistory[snap.ticker]) tickerHistory[snap.ticker] = [];
      tickerHistory[snap.ticker].push({
        date,
        action: snap.action,
        confidence: snap.confidence,
        price: snap.price,
      });
    }
  }

  // Only show tickers with 2+ days of history
  const lines: string[] = ["HISTORICAL CONTEXT (AI conviction over last 7 days):"];
  for (const [ticker, entries] of Object.entries(tickerHistory)) {
    if (entries.length < 2) continue;
    const trend = entries
      .map((e) => `${e.action} ${e.confidence}% ($${e.price.toFixed(0)})`)
      .join(" → ");
    // Determine trend direction
    const first = entries[0].confidence;
    const last = entries[entries.length - 1].confidence;
    const direction =
      last > first + 5 ? "— strengthening" : last < first - 5 ? "— weakening" : "— stable";
    lines.push(`  ${ticker}: ${trend} ${direction}`);
  }

  if (lines.length === 1) return ""; // No multi-day history
  lines.push("");
  lines.push(
    "Use this to identify conviction momentum. Strengthening 3+ days confirms the trend. Weakening suggests caution.",
  );
  return lines.join("\n");
}
