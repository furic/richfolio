import { deflateRawSync } from "node:zlib";

// ── Types ───────────────────────────────────────────────────────────
export interface AnalysisPageData {
  ticker: string;
  date: string;
  action: string;
  confidence: number;
  reason: string;
  buyThesis: string;
  risks: string[];
  suggestedBuyValue: number;
  suggestedLimitPrice?: number;
  limitPriceReason?: string;
  valueRating?: string;
  bottomSignal?: string;
  /**
   * Currency every monetary figure on the page is denominated in. Omitted for
   * the report currency (the overwhelming majority) to keep the URL short; the
   * page falls back to `$` when absent. Set for crypto cross-pairs, which are
   * quoted in their own coin and never FX-converted.
   */
  currency?: string;
  // Price data
  price: number;
  trailingPE: number | null;
  forwardPE: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  fiftyTwoWeekPercent: number | null;
  // Technicals
  sma50?: number;
  sma200?: number | null;
  rsi14?: number;
  momentumSignal?: string;
  goldenCross?: boolean;
  deathCross?: boolean;
  // Fundamentals (null for ETFs/crypto)
  returnOnEquity?: number | null;
  debtToEquity?: number | null;
  profitMargins?: number | null;
  revenueGrowth?: number | null;
  earningsGrowth?: number | null;
  targetMeanPrice?: number | null;
}

const BASE_URL = "https://furic.github.io/richfolio/analysis/";
const MAX_URL_LENGTH = 2000;

// ── Short keys to minimize URL size ─────────────────────────────────
function compact(d: AnalysisPageData): Record<string, unknown> {
  const o: Record<string, unknown> = {
    t: d.ticker,
    d: d.date,
    a: d.action,
    c: d.confidence,
    r: d.reason,
    bt: d.buyThesis,
    ri: d.risks,
    bv: d.suggestedBuyValue,
    p: d.price,
  };
  if (d.currency) o.cur = d.currency;
  if (d.suggestedLimitPrice) o.lp = d.suggestedLimitPrice;
  if (d.limitPriceReason) o.lr = d.limitPriceReason;
  if (d.valueRating) o.vr = d.valueRating;
  if (d.bottomSignal) o.bs = d.bottomSignal;
  if (d.trailingPE != null) o.pe = d.trailingPE;
  if (d.forwardPE != null) o.fpe = d.forwardPE;
  if (d.fiftyTwoWeekHigh != null) o.h = d.fiftyTwoWeekHigh;
  if (d.fiftyTwoWeekLow != null) o.l = d.fiftyTwoWeekLow;
  if (d.fiftyTwoWeekPercent != null) o.wp = d.fiftyTwoWeekPercent;
  if (d.sma50 != null) o.s50 = d.sma50;
  if (d.sma200 != null) o.s200 = d.sma200;
  if (d.rsi14 != null) o.rsi = d.rsi14;
  if (d.momentumSignal) o.ms = d.momentumSignal;
  if (d.goldenCross) o.gc = true;
  if (d.deathCross) o.dc = true;
  if (d.returnOnEquity != null) o.roe = d.returnOnEquity;
  if (d.debtToEquity != null) o.de = d.debtToEquity;
  if (d.profitMargins != null) o.pm = d.profitMargins;
  if (d.revenueGrowth != null) o.rg = d.revenueGrowth;
  if (d.earningsGrowth != null) o.eg = d.earningsGrowth;
  if (d.targetMeanPrice != null) o.tp = d.targetMeanPrice;
  return o;
}

function encode(data: Record<string, unknown>): string {
  const json = JSON.stringify(data);
  const compressed = deflateRawSync(Buffer.from(json));
  return compressed.toString("base64url");
}

// ── Build URL ───────────────────────────────────────────────────────
export function buildAnalysisUrl(data: AnalysisPageData): string {
  const compactData = compact(data);
  let encoded = encode(compactData);
  let url = `${BASE_URL}#${encoded}`;

  // Safety valve: truncate buyThesis if URL too long
  if (url.length > MAX_URL_LENGTH && data.buyThesis.length > 600) {
    compactData.bt = data.buyThesis.slice(0, 600) + "...";
    encoded = encode(compactData);
    url = `${BASE_URL}#${encoded}`;
  }

  console.log(`  Analysis URL for ${data.ticker}: ${url.length} chars`);
  return url;
}
