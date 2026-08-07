// ── Detailed-analysis provider selection ───────────────────────────
// Which provider writes the dedicated STRONG BUY "More Details" page.
//
// Pure on purpose: it takes the available provider ids and the raw env override
// rather than reading them, so it can be unit-tested. detailedAnalysis.ts (which
// imports config.js, and therefore can't be imported without a config.json)
// supplies both.

export type DetailedProviderId = "gemini" | "claude" | "mistral";

/**
 * Providers able to generate this page, in preference order. Narrower than the
 * main registry: a provider must have a call path in detailedAnalysis.ts to
 * appear here.
 */
export const DETAILED_PROVIDER_IDS = ["gemini", "claude", "mistral"] as const;

export function isDetailedProviderId(id: unknown): id is DetailedProviderId {
  return typeof id === "string" && (DETAILED_PROVIDER_IDS as readonly string[]).includes(id);
}

/**
 * Resolve the provider for the page.
 *
 * 1. An `AI_DETAILED_PROVIDER` override wins — but only when that provider is
 *    actually configured. Honouring an override for a provider with no API key
 *    would fail every ticker, so an unconfigured pin is reported and ignored.
 * 2. Otherwise the first available provider that can generate the page.
 *
 * Returns null when nothing can (caller skips the page rather than failing the
 * brief) — e.g. a Mistral-only setup before Mistral had a call path.
 *
 * `onIgnoredOverride` is invoked when an override is dropped, so the caller can
 * log it. A pin that silently doesn't apply is the same class of bug as a guard
 * that silently doesn't run.
 */
export function resolveDetailedProvider(
  availableProviderIds: readonly string[],
  override?: string,
  onIgnoredOverride?: (reason: string) => void,
): DetailedProviderId | null {
  const normalised = override?.toLowerCase();

  if (normalised) {
    if (!isDetailedProviderId(normalised)) {
      onIgnoredOverride?.(
        `AI_DETAILED_PROVIDER="${normalised}" is not a provider that can generate the detailed page ` +
          `(expected one of: ${DETAILED_PROVIDER_IDS.join(", ")}) — using first available`,
      );
    } else if (!availableProviderIds.includes(normalised)) {
      onIgnoredOverride?.(
        `AI_DETAILED_PROVIDER=${normalised} is not configured (no API key) — using first available`,
      );
    } else {
      return normalised;
    }
  }

  const first = availableProviderIds.find(isDetailedProviderId);
  return first ?? null;
}
