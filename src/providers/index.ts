import { geminiProvider } from "./gemini.js";
import { claudeProvider } from "./claude.js";
import { mistralProvider } from "./mistral.js";
import type { AIProvider } from "./types.js";

export type { AIProvider, AIProviderInput, AIBuyRecommendation } from "./types.js";

// ── Provider registry ──────────────────────────────────────────────
// All known providers, in stable display order. A provider is "active" when
// its `available` getter returns true (typically because its API key env var
// is set). Adding a new provider is: implement the AIProvider interface,
// import it here, append to ALL_PROVIDERS.

const ALL_PROVIDERS: AIProvider[] = [
  geminiProvider,
  claudeProvider,
  mistralProvider,
  // openaiProvider, // future
];

export function buildActiveProviders(): AIProvider[] {
  return ALL_PROVIDERS.filter((p) => p.available);
}

export function getAllProviders(): readonly AIProvider[] {
  return ALL_PROVIDERS;
}
