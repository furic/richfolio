import type { AIBuyRecommendation, AIProvider, ProviderScore } from "./providers/types.js";

// ── Detailed-analysis eligibility ──────────────────────────────────
// ANY provider voting STRONG BUY earns the ticker its dedicated analysis page —
// whether or not that vote survived into the consensus action. So a rec the
// dissent-distance rule capped at BUY still gets the page, and the reader still
// gets the STRONG BUY voter's full thesis. That's often the most interesting
// recommendation in the brief, and the cap is a summary judgement, not a filter.
//
// Takes the minimal shape rather than AIBuyRecommendation so IntradayAlert can
// pass its own `currentAction` through the same predicate — one definition of
// "a provider called this a STRONG BUY" for every surface that asks.
export function hasStrongBuyVote(rec: { action: string; providers?: ProviderScore[] }): boolean {
  if (rec.action === "STRONG BUY") return true;
  if (!rec.providers) return false;
  return rec.providers.some((p) => p.action === "STRONG BUY");
}

// Returns the provider score that voted STRONG BUY (highest confidence if
// multiple), or null if no provider did. Used when generating the detailed
// analysis page so we can promote the STRONG BUY voter's view into the
// prompt (and use that provider's SDK for the call).
export function findStrongBuyVoter(rec: AIBuyRecommendation): ProviderScore | null {
  if (!rec.providers) return null;
  const voters = rec.providers
    .filter((p) => p.action === "STRONG BUY")
    .sort((a, b) => b.confidence - a.confidence);
  return voters[0] ?? null;
}

// ── Per-provider results bundle ────────────────────────────────────
// Input to aggregateMultiAI(). One entry per active provider, with the
// full guard-validated recommendation list it produced.
export interface ProviderRun {
  provider: AIProvider;
  recommendations: AIBuyRecommendation[];
}

const ACTION_ORDER: Record<string, number> = {
  "STRONG BUY": 0,
  BUY: 1,
  HOLD: 2,
  WAIT: 3,
};

function toProviderScore(provider: AIProvider, rec: AIBuyRecommendation): ProviderScore {
  return {
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
  };
}

// ── Consensus action ───────────────────────────────────────────────
// Mode of provider actions, with confidence-sum tiebreaker. If a tie still
// remains after the tiebreaker, we fall back to the more conservative action
// (closer to WAIT in ACTION_ORDER) — better to under-recommend than over.
//
// STRONG BUY used to require strict unanimity: one dissenting provider, of any
// kind, capped the consensus at BUY. Two problems with that.
//
// It scaled backwards. One provider returns its action untouched; two must both
// agree; three must all agree — so adding a model made STRONG BUY strictly
// rarer, when the reason for adding it was more scrutiny, not fewer signals.
//
// And it treated all dissent alike. A dissenting BUY agrees about direction and
// sits one rung away; a HOLD or WAIT is genuine disagreement. Both erased the
// STRONG BUY identically.
//
// So the cap is now weighted by **dissent distance**: a STRONG BUY survives
// while every dissenter is within one rung (BUY), and caps at BUY as soon as one
// is further out (HOLD/WAIT). `SB + SB + BUY` stands; `SB + SB + HOLD` caps.
//
// The aggregated action is a summary, not a gate. Every provider's action,
// confidence and thesis renders underneath it, and `hasStrongBuyVote` keeps the
// detailed-analysis page attached to any rec a provider called STRONG BUY — so a
// capped rec still shows you the votes that disagreed with the cap.
//
// `requireUnanimity` (from `ai.strongBuyRequiresAllProviders`) restores the old
// strict rule for anyone who wants it. Default false.
function computeConsensusAction(scores: ProviderScore[], requireUnanimity = false): string {
  if (scores.length === 0) return "HOLD";
  if (scores.length === 1) return scores[0].action;

  // Tally votes + confidence sums per action
  const tallies: Record<string, { count: number; confSum: number }> = {};
  for (const s of scores) {
    if (!tallies[s.action]) tallies[s.action] = { count: 0, confSum: 0 };
    tallies[s.action].count++;
    tallies[s.action].confSum += s.confidence;
  }

  // Find max count
  const maxCount = Math.max(...Object.values(tallies).map((t) => t.count));
  const topActions = Object.entries(tallies).filter(([, t]) => t.count === maxCount);

  let consensus: string;
  if (topActions.length === 1) {
    consensus = topActions[0][0];
  } else {
    // Tied counts → pick action with highest confidence sum
    topActions.sort((a, b) => b[1].confSum - a[1].confSum);
    if (topActions[0][1].confSum !== topActions[1][1].confSum) {
      consensus = topActions[0][0];
    } else {
      // Still tied → pick the more conservative action (higher ACTION_ORDER)
      topActions.sort((a, b) => (ACTION_ORDER[b[0]] ?? 99) - (ACTION_ORDER[a[0]] ?? 99));
      consensus = topActions[0][0];
    }
  }

  // Dissent-distance cap for STRONG BUY (strict unanimity when opted in).
  // An unrecognised action scores 99, so it counts as far dissent — an unknown
  // verdict should never be read as agreement.
  if (consensus === "STRONG BUY") {
    const dissent = scores.filter((s) => s.action !== "STRONG BUY");
    const capped = requireUnanimity
      ? dissent.length > 0
      : dissent.some((s) => (ACTION_ORDER[s.action] ?? 99) > ACTION_ORDER["BUY"]);
    if (capped) consensus = "BUY";
  }

  return consensus;
}

function computeAgreement(scores: ProviderScore[]): "unanimous" | "majority" | "split" {
  if (scores.length <= 1) return "unanimous";

  const actionCounts: Record<string, number> = {};
  for (const s of scores) actionCounts[s.action] = (actionCounts[s.action] ?? 0) + 1;
  const maxCount = Math.max(...Object.values(actionCounts));

  if (maxCount === scores.length) return "unanimous";
  if (maxCount > scores.length / 2) return "majority";
  return "split";
}

// ── Degraded multi-AI runs ─────────────────────────────────────────
// When a provider fails mid-run (quota exhausted, network blip), the surviving
// provider's recs pass through `computeConsensusAction`'s `scores.length === 1`
// short-circuit. The result used to look identical to a vetted consensus: a bare
// confidence number, no agreement badge, nothing saying a provider was missing.
// That is how a STRONG BUY on MSFT (2026-06-23) reached the brief on Claude's
// vote alone while Gemini was quota-exhausted.
//
// **Telling you is the fix.** So on a degraded run we always record the
// degradation on every rec, and every renderer shows it (`⚠ 1/2 AI`). What you
// do with a one-model call is your decision, not the pipeline's.
//
// `capStrongBuy` (from `ai.strongBuyRequiresAllProviders`, default false) also
// demotes STRONG BUY to BUY. It's off by default and shares the flag with the
// consensus rule above, deliberately: a provider that never answered isn't a
// dissenter at any distance, so capping on absence while letting a dissenting
// BUY through would be the stricter of two rules applied to the weaker evidence.
//
// Note this applies ONLY when 2+ providers were CONFIGURED and some failed.
// A deliberate single-provider setup (one API key) is not degraded — it never
// promised agreement — and is left completely untouched.
export interface ProviderDegradation {
  /** How many providers were configured for this run. */
  configured: number;
  /** How many actually returned recommendations. */
  answered: number;
  /** Labels of the providers that failed to answer. */
  missing: string[];
}

export function applyDegradedProviderPolicy(
  recs: AIBuyRecommendation[],
  degradation: ProviderDegradation,
  capStrongBuy = false,
): AIBuyRecommendation[] {
  // Not degraded: either everyone answered, or only one was ever configured.
  if (degradation.configured < 2 || degradation.answered >= degradation.configured) {
    return recs;
  }

  for (const rec of recs) {
    rec.degradation = degradation;
    if (capStrongBuy && rec.action === "STRONG BUY") {
      rec.action = "BUY";
      rec.reason =
        `[Guard: capped at BUY — ${degradation.missing.join(", ")} did not respond, ` +
        `so the cross-provider agreement STRONG BUY requires could not be verified] ${rec.reason}`;
      console.log(
        `Guard: ${rec.ticker} STRONG BUY → BUY (degraded run: ${degradation.answered}/${degradation.configured} providers)`,
      );
    }
  }
  return recs;
}

// ── Aggregate per-ticker across providers ──────────────────────────
// For each ticker that ≥1 provider returned, build a single merged rec with
// `providers[]` carrying the breakdown. The merged rec's top-level fields
// (action, confidence, reason, suggestedBuyValue, suggestedLimitPrice) reflect
// the consensus — they're what renderers display prominently.
//
// `suggestedBuyValue` and `suggestedLimitPrice` are inherited from the
// highest-confidence provider that voted for the consensus action. These
// fields don't average meaningfully across providers (different rounding,
// different reasoning paths) so deterministic inheritance keeps them stable.
//
// `requireUnanimity` is threaded to computeConsensusAction rather than read from
// config here, so this module stays config-free and unit-testable.
export function aggregateMultiAI(
  runs: ProviderRun[],
  requireUnanimity = false,
): AIBuyRecommendation[] {
  if (runs.length === 0) return [];
  if (runs.length === 1) {
    // Single-provider mode — pass through unchanged, providers[] stays undefined
    return runs[0].recommendations;
  }

  // Collect all tickers seen across any provider
  const tickerSet = new Set<string>();
  for (const r of runs) {
    for (const rec of r.recommendations) tickerSet.add(rec.ticker);
  }

  const aggregated: AIBuyRecommendation[] = [];

  for (const ticker of tickerSet) {
    // Find each provider's rec for this ticker (may be absent)
    const scores: ProviderScore[] = [];
    let sampleRec: AIBuyRecommendation | undefined;

    for (const run of runs) {
      const rec = run.recommendations.find((r) => r.ticker === ticker);
      if (rec) {
        scores.push(toProviderScore(run.provider, rec));
        if (!sampleRec) sampleRec = rec;
      }
    }

    if (scores.length === 0 || !sampleRec) continue;

    const consensusAction = computeConsensusAction(scores, requireUnanimity);
    const averageConfidence = Math.round(
      scores.reduce((sum, s) => sum + s.confidence, 0) / scores.length,
    );
    const agreement = computeAgreement(scores);

    // Pick the highest-confidence provider that voted for the consensus action
    // — its suggested buy value and limit price represent the "winning" voice.
    const consensusVoters = scores
      .filter((s) => s.action === consensusAction)
      .sort((a, b) => b.confidence - a.confidence);
    const lead = consensusVoters[0] ?? scores[0];

    aggregated.push({
      ticker,
      tickerFullName: sampleRec.tickerFullName,
      originalCurrency: sampleRec.originalCurrency,
      action: consensusAction,
      confidence: averageConfidence,
      reason: lead.reason,
      suggestedBuyValue: lead.suggestedBuyValue,
      suggestedLimitPrice: lead.suggestedLimitPrice,
      limitPriceReason: lead.limitPriceReason,
      valueRating: lead.valueRating,
      bottomSignal: lead.bottomSignal,
      providers: scores,
      agreement,
      // Preserve watch-list tag from the per-provider rec (set by the
      // orchestrator before guards). If any provider's rec was tagged, the
      // aggregated rec is too — the flag tracks the ticker, not the verdict.
      isWatching: sampleRec.isWatching,
    });
  }

  return aggregated;
}
