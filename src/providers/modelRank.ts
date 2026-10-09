// ── Model rank (1–10): how much a provider's vote weighs in the consensus ──
// Pure and config-free so it is unit-testable; the orchestrator injects ai.providerRanks overrides.

/** Rank for a model no pattern matches, and the weight assumed when a score carries none. */
export const DEFAULT_RANK = 5;

// First match wins, so more specific patterns (flash-lite) precede broader ones (flash).
const MODEL_RANKS: Array<[RegExp, number]> = [
  [/opus/, 10],
  [/sonnet/, 8],
  [/haiku/, 5],
  [/^gemini-.*-pro/, 8],
  [/^gemini-.*flash-lite/, 4],
  [/^gemini-.*flash/, 6],
  [/^magistral-medium/, 7],
  [/^mistral-large/, 7],
  [/^mistral-medium/, 6],
  [/^magistral-small/, 5],
  [/^mistral-small/, 5],
  [/^ministral-14b/, 4],
  [/^ministral-8b/, 3],
  [/^ministral-3b/, 2],
];

/** Default rank for a model id, case-insensitive. */
export function defaultModelRank(model: string): number {
  const id = model.toLowerCase();
  for (const [pattern, rank] of MODEL_RANKS) if (pattern.test(id)) return rank;
  return DEFAULT_RANK;
}

// A config override (keyed by provider id) beats the model default; both are clamped to 1–10.
export function resolveProviderRank(
  providerId: string,
  model: string,
  overrides: Record<string, number> = {},
): number {
  const override = overrides[providerId];
  const rank =
    typeof override === "number" && Number.isFinite(override) ? override : defaultModelRank(model);
  return Math.min(10, Math.max(1, rank));
}
