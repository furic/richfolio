import type { AllocationReport } from "../analyze.js";
import type { QuoteData } from "../fetchPrices.js";
import type { NewsItem } from "../fetchNews.js";
import type { TechnicalData } from "../fetchTechnicals.js";
import type { ReasoningHistory } from "../state.js";

// ── Per-provider score (multi-AI mode) ─────────────────────────────
// One entry per active provider, attached to AIBuyRecommendation.providers
// when more than one provider is active. In single-provider mode, the
// providers array is undefined and renderers stay in their original layout.
export interface ProviderScore {
  providerId: string;
  providerLabel: string;
  providerShortLabel: string;
  action: string;
  confidence: number;
  reason: string;
  suggestedBuyValue: number;
  suggestedLimitPrice?: number;
  limitPriceReason?: string;
  valueRating?: string;
  bottomSignal?: string;
}

// ── Recommendation shape (canonical home) ──────────────────────────
// Lives here so multiple providers can produce values of this type. The
// existing `src/aiAnalysis.ts` re-exports this for backward compat — all
// pre-existing `import type { AIBuyRecommendation } from "./aiAnalysis.js"`
// imports keep working unchanged.
//
// In single-provider mode (only one of GEMINI_API_KEY / ANTHROPIC_API_KEY
// set), `providers` and `agreement` are undefined and `action`/`confidence`
// reflect that one provider's verdict.
//
// In multi-provider mode (≥2 keys set), `providers` carries the per-AI
// breakdown, `agreement` indicates how aligned the providers are, and
// `action`/`confidence` reflect the consensus across providers (see
// src/aiAggregation.ts for the algorithm). Renderers branch on
// `rec.providers && rec.providers.length >= 2` to switch to multi-mode UI.
export interface AIBuyRecommendation {
  ticker: string;
  tickerFullName: string | null;
  originalCurrency: string;
  action: string;
  confidence: number;
  reason: string;
  suggestedBuyValue: number;
  suggestedLimitPrice?: number;
  limitPriceReason?: string;
  valueRating?: string;
  bottomSignal?: string;
  analysisUrl?: string;
  /** Set only in multi-provider mode (length ≥2). */
  providers?: ProviderScore[];
  /** Set only when providers is set. */
  agreement?: "unanimous" | "majority" | "split";
  /**
   * Set only when 2+ providers were CONFIGURED but some failed to answer. Marks
   * the run as never having had a cross-provider comparison, so renderers can
   * say so instead of presenting a lone provider's vote in the same visual
   * language as a compared one. A deliberate single-provider setup never sets
   * this — it never promised a comparison.
   * See applyDegradedProviderPolicy() in aiAggregation.ts.
   */
  degradation?: {
    configured: number;
    answered: number;
    missing: string[];
  };
  /**
   * True when the ticker is from the user's `watching` list rather than the
   * target portfolio. Allocation-based guards (overweight, gap < 2% STRONG BUY
   * threshold, max-2 STRONG BUY cap) are skipped for these. Renderers separate
   * them into a "Watch List" section instead of mixing with portfolio recs.
   */
  isWatching?: boolean;
}

// ── Provider input bundle ──────────────────────────────────────────
// Single struct passed to every provider's `analyze()` call. Adding a
// new field here is a non-breaking change for downstream providers.
export interface AIProviderInput {
  report: AllocationReport;
  priceData: Record<string, QuoteData>;
  news: Record<string, NewsItem[]>;
  technicals: Record<string, TechnicalData>;
  macroContext: string;
  reasoningHistory: ReasoningHistory;
}

// ── Provider interface ─────────────────────────────────────────────
// Each AI backend (Gemini, Claude, OpenAI, ...) implements this. Providers
// own their internal staging (single-call vs Two-stage Think/Plan) and
// return a normalised list of recommendations. They do NOT run guards —
// the orchestrator runs the shared guard pipeline after each provider
// returns, so guard logic stays provider-agnostic.
export interface AIProvider {
  /** Stable identifier — env keys, storage keys, telemetry, display IDs. */
  readonly id: string;
  /** Human-friendly label for email/Telegram. */
  readonly label: string;
  /** Compact label for tight UI surfaces (Telegram badges). 1–3 chars. */
  readonly shortLabel: string;
  /** Whether this provider is configured (e.g. API key present). */
  readonly available: boolean;

  analyze(input: AIProviderInput): Promise<AIBuyRecommendation[]>;
}
