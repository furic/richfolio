import { validateRecommendations } from "./guards.js";
import { defaultCurrency, watchingSet, aiConfig } from "./config.js";
import { buildActiveProviders } from "./providers/index.js";
import {
  aggregateMultiAI,
  applyDegradedProviderPolicy,
  type ProviderRun,
  type ProviderDegradation,
} from "./aiAggregation.js";
import type { AIBuyRecommendation, AIProvider, AIProviderInput } from "./providers/types.js";

// ── Action-tier sort ───────────────────────────────────────────────
// Used by Phase 1's single-provider output and Phase 3's aggregated output.
// STRONG BUY > BUY > HOLD > WAIT, with confidence-descending within each tier.
const ACTION_PRIORITY: Record<string, number> = {
  "STRONG BUY": 0,
  BUY: 1,
  HOLD: 2,
  WAIT: 3,
};

function sortByActionTier(recs: AIBuyRecommendation[]): void {
  recs.sort((a, b) => {
    const pa = ACTION_PRIORITY[a.action] ?? 99;
    const pb = ACTION_PRIORITY[b.action] ?? 99;
    if (pa !== pb) return pa - pb;
    return b.confidence - a.confidence;
  });
}

// ── Per-provider attribution + guards ──────────────────────────────
// Runs one provider end-to-end: SDK call → attach metadata from price data
// → guard pipeline. Returns the cleaned, validated rec list. Guard mutations
// happen here (per provider) so each provider gets equal treatment.
async function runProvider(
  provider: AIProvider,
  input: AIProviderInput,
): Promise<AIBuyRecommendation[]> {
  const recommendations = await provider.analyze(input);

  // Attach tickerFullName + originalCurrency (deterministic; not model-supplied).
  const longNameMap = new Map(
    Object.values(input.priceData).map((q) => [q.ticker, q.longName ?? null]),
  );
  const currencyMap = new Map(
    Object.values(input.priceData).map((q) => [q.ticker, q.originalCurrency]),
  );
  // The currency the numbers are actually in (vs originalCurrency, which is the
  // pre-conversion label kept for audit). Equals the report currency for
  // everything FX-converted; the quote coin for crypto cross-pairs.
  const quoteCurrencyMap = new Map(
    Object.values(input.priceData).map((q) => [q.ticker, q.currency]),
  );
  const assetKindMap = new Map(Object.values(input.priceData).map((q) => [q.ticker, q.assetKind]));
  for (const rec of recommendations) {
    rec.tickerFullName = longNameMap.get(rec.ticker) ?? null;
    rec.originalCurrency = currencyMap.get(rec.ticker) ?? defaultCurrency;
    rec.quoteCurrency = quoteCurrencyMap.get(rec.ticker) ?? defaultCurrency;
    const kind = assetKindMap.get(rec.ticker);
    if (kind) rec.assetKind = kind;
    // Tag watch-list recommendations so guards / renderers can route them to
    // the WATCH LIST CRITERIA path instead of the portfolio path.
    if (watchingSet.has(rec.ticker)) {
      rec.isWatching = true;
    }
  }

  // Guard pipeline (bond ETF caps, earnings proximity, STRONG BUY criteria, etc.).
  validateRecommendations(recommendations, input.priceData, input.technicals, input.report);

  return recommendations;
}

// ── Entry point ────────────────────────────────────────────────────
// Runs all active providers. Behaviour depends on provider count:
//   0 → fallback (empty list, gap-based recommendations downstream)
//   1 → identical to pre-multi-AI behaviour: returns that provider's recs
//   2+ → runs providers concurrently, aggregates into a single rec list
//       per ticker with `providers[]` carrying the per-AI breakdown. The
//       top-level action/confidence reflect the consensus (see
//       src/aiAggregation.ts).
//
// If a provider throws mid-run, we log it and drop that provider — surviving
// providers continue. If all providers fail, we return [] and the caller
// falls back to gap-based recommendations.
export async function runAIAnalysis(input: AIProviderInput): Promise<AIBuyRecommendation[]> {
  const providers = buildActiveProviders();

  if (providers.length === 0) {
    console.warn("No AI provider configured (no GEMINI_API_KEY etc.) — skipping AI analysis\n");
    return [];
  }

  if (providers.length === 1) {
    return runSingle(providers[0], input);
  }

  return runMulti(providers, input);
}

// Attach a single-provider `providers[]` to each rec so saveReasoningHistory
// and renderers can iterate uniformly. Used by both the dedicated single-mode
// path AND the multi-mode degraded fallback (where only one provider survived
// a Promise.allSettled fan-out). Without this, renderers fall back to the
// hard-coded default label "Gemini" — which is wrong when the survivor is
// actually Claude.
function attachSingleProviderMetadata(
  recommendations: AIBuyRecommendation[],
  provider: AIProvider,
): void {
  for (const rec of recommendations) {
    rec.providers = [
      {
        providerId: provider.id,
        providerLabel: provider.label,
        providerShortLabel: provider.shortLabel,
        action: rec.action,
        confidence: rec.confidence,
        reason: rec.reason,
        suggestedBuyValue: rec.suggestedBuyValue,
        suggestedLimitPrice: rec.suggestedLimitPrice,
        limitPriceReason: rec.limitPriceReason,
        valueRating: rec.valueRating,
        bottomSignal: rec.bottomSignal,
      },
    ];
  }
}

// ── Single-provider path (identical to pre-multi-AI behaviour) ─────
async function runSingle(
  provider: AIProvider,
  input: AIProviderInput,
): Promise<AIBuyRecommendation[]> {
  try {
    const recommendations = await runProvider(provider, input);
    attachSingleProviderMetadata(recommendations, provider);
    sortByActionTier(recommendations);
    logRecommendationSummary(provider.label, recommendations);
    return recommendations;
  } catch (err) {
    console.error(`AI analysis failed (${provider.label}):`, (err as Error).message);
    console.log("Falling back to gap-based recommendations\n");
    return [];
  }
}

// ── Multi-provider path ────────────────────────────────────────────
// Runs all providers concurrently, then aggregates per ticker. A single
// provider failure does not fail the whole run — we drop the failed provider
// from the aggregation and continue with whoever survived. If exactly one
// provider survives, we degrade gracefully to single-provider rendering.
async function runMulti(
  providers: AIProvider[],
  input: AIProviderInput,
): Promise<AIBuyRecommendation[]> {
  console.log(`Running multi-AI analysis (${providers.map((p) => p.label).join(" + ")})...\n`);

  const settled = await Promise.allSettled(
    providers.map(async (provider) => ({
      provider,
      recommendations: await runProvider(provider, input),
    })),
  );

  const runs: ProviderRun[] = [];
  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    if (result.status === "fulfilled") {
      runs.push(result.value);
    } else {
      console.error(
        `Provider ${providers[i].label} failed: ${(result.reason as Error)?.message ?? result.reason}`,
      );
    }
  }

  if (runs.length === 0) {
    console.log("All providers failed — falling back to gap-based recommendations\n");
    return [];
  }

  // Degradation: 2+ providers were configured but not all answered. Mark every
  // rec so the renderers can show `⚠ n/m AI`; capping STRONG BUY on top of that
  // is opt-in via ai.strongBuyRequiresAllProviders (see
  // applyDegradedProviderPolicy).
  const answered = new Set(runs.map((r) => r.provider.id));
  const degradation: ProviderDegradation = {
    configured: providers.length,
    answered: runs.length,
    missing: providers.filter((p) => !answered.has(p.id)).map((p) => p.label),
  };

  if (runs.length === 1) {
    console.log(
      `Only ${runs[0].provider.label} survived — degrading to single-provider mode for this run`,
    );
    const recs = runs[0].recommendations;
    // Critical: attach providers[] so renderers identify the survivor correctly.
    // Without this, the email subtitle falls back to the default "Gemini" label
    // even when Claude was the actual survivor.
    attachSingleProviderMetadata(recs, runs[0].provider);
    applyDegradedProviderPolicy(recs, degradation, aiConfig.strongBuyRequiresAllProviders);
    sortByActionTier(recs);
    logRecommendationSummary(runs[0].provider.label, recs);
    return recs;
  }

  const aggregated = aggregateMultiAI(runs, aiConfig.strongBuyRequiresAllProviders);
  // 3+ providers configured, 2+ answered: still aggregated, but still degraded.
  applyDegradedProviderPolicy(aggregated, degradation, aiConfig.strongBuyRequiresAllProviders);
  sortByActionTier(aggregated);
  logRecommendationSummary(runs.map((r) => r.provider.label).join(" + "), aggregated);
  return aggregated;
}

// ── Log helper ─────────────────────────────────────────────────────
function logRecommendationSummary(label: string, recs: AIBuyRecommendation[]): void {
  for (const rec of recs) {
    if (rec.action === "STRONG BUY" || rec.action === "BUY") {
      const breakdown =
        rec.providers && rec.providers.length >= 2
          ? ` [${rec.providers.map((p) => `${p.providerShortLabel}:${p.action.replace(" ", "")}${p.confidence}`).join(" ")}]${rec.agreement ? ` ${rec.agreement}` : ""}`
          : "";
      console.log(
        `  ${rec.action} ${rec.ticker} (${rec.confidence}%)${breakdown}` +
          (rec.valueRating ? ` [${rec.valueRating}]` : "") +
          (rec.bottomSignal ? ` [${rec.bottomSignal}]` : "") +
          ` — ${rec.reason}` +
          (rec.suggestedLimitPrice
            ? ` [limit: ${rec.suggestedLimitPrice} ${rec.originalCurrency}]`
            : ""),
      );
    }
  }
  console.log(`AI analysis complete (${label}) — ${recs.length} tickers scored\n`);
}
