import { GoogleGenAI, Type } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { AllocationReport } from "./analyze.js";
import type { QuoteData } from "./fetchPrices.js";
import type { TechnicalData } from "./fetchTechnicals.js";
import type { AIBuyRecommendation } from "./aiAnalysis.js";
import { defaultCurrency } from "./config.js";
import { formatMoney } from "./util.js";
import { buildActiveProviders } from "./providers/index.js";
import { mistralCall, mistralModel } from "./providers/mistral.js";
import { detailedSchema, strictify } from "./providers/schemas.js";
import {
  resolveDetailedProvider,
  isDetailedProviderId,
  type DetailedProviderId,
} from "./providers/detailedProvider.js";
import { findStrongBuyVoter } from "./aiAggregation.js";
import { resolveClaudeTransport, extractStructuredPayload } from "./providers/claudeTransport.js";

// ── Types ───────────────────────────────────────────────────────────
export interface DetailedAnalysis {
  ticker: string;
  buyThesis: string;
  risks: string[];
}

// ── Gemini response schema ──────────────────────────────────────────
const geminiDetailedSchema = {
  type: Type.OBJECT,
  properties: {
    buyThesis: {
      type: Type.STRING,
      description:
        "3-4 paragraph detailed buy thesis (150-200 words total) covering: why now, valuation, technical setup, portfolio fit",
    },
    risks: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "3-4 specific risk factors, each 1 sentence",
    },
  },
  propertyOrdering: ["buyThesis", "risks"],
};

// Claude (tool-use) and Mistral (strict json_schema) share one JSON Schema —
// see providers/schemas.ts. Mistral's strict mode needs additionalProperties
// and exhaustive `required`, derived rather than duplicated.
const strictDetailedSchema = strictify(detailedSchema);

// ── Provider selection ─────────────────────────────────────────────
// Thin wrapper over the pure resolver in providers/detailedProvider.ts, which
// holds the priority rules and is unit-tested there.
function pickDetailedProvider(): DetailedProviderId | null {
  return resolveDetailedProvider(
    buildActiveProviders().map((p) => p.id),
    process.env.AI_DETAILED_PROVIDER,
    (reason) => console.log(reason),
  );
}

// ── Build per-ticker prompt (shared across providers) ───────────────
function buildDetailedPrompt(
  ticker: string,
  quote: QuoteData,
  tech: TechnicalData | undefined,
  rec: AIBuyRecommendation,
  report: AllocationReport,
  macroContext: string = "",
): string {
  const item = report.items.find((i) => i.ticker === ticker);
  const gap = item ? `${item.gapPct > 0 ? "+" : ""}${item.gapPct.toFixed(1)}%` : "N/A";
  const current = item ? `${item.currentPct.toFixed(1)}%` : "N/A";
  const target = item ? `${item.targetPct.toFixed(1)}%` : "N/A";

  const lines = [
    `You are a senior investment analyst writing a detailed buy recommendation for a client.`,
    ``,
    `CURRENCY: All monetary values in this prompt are denominated in ${defaultCurrency}.`,
    ``,
    `TICKER: ${ticker}${quote.longName ? ` (${quote.longName})` : ""}`,
    `Current price: ${formatMoney(quote.price, defaultCurrency)}${quote.originalCurrency !== defaultCurrency ? ` (originally ${quote.originalCurrency})` : ""}`,
    `Trailing P/E: ${quote.trailingPE?.toFixed(1) ?? "N/A"} | Forward P/E: ${quote.forwardPE?.toFixed(1) ?? "N/A"} | Avg P/E: ${quote.avgPE?.toFixed(1) ?? "N/A"}`,
    (() => {
      const wpPct =
        quote.fiftyTwoWeekPercent != null ? Math.round(quote.fiftyTwoWeekPercent * 100) : null;
      const belowHigh =
        quote.fiftyTwoWeekHigh != null
          ? (((quote.fiftyTwoWeekHigh - quote.price) / quote.fiftyTwoWeekHigh) * 100).toFixed(1)
          : null;
      const aboveLow =
        quote.fiftyTwoWeekLow != null
          ? (((quote.price - quote.fiftyTwoWeekLow) / quote.fiftyTwoWeekLow) * 100).toFixed(1)
          : null;
      if (wpPct == null)
        return `52-week: low ${quote.fiftyTwoWeekLow != null ? formatMoney(quote.fiftyTwoWeekLow, defaultCurrency) : "N/A"} — high ${quote.fiftyTwoWeekHigh != null ? formatMoney(quote.fiftyTwoWeekHigh, defaultCurrency) : "N/A"} (position N/A)`;
      const qualifier = wpPct < 20 ? " ← NEAR ANNUAL LOW" : wpPct > 70 ? " ← NEAR ANNUAL HIGH" : "";
      return (
        `52-week: low ${formatMoney(quote.fiftyTwoWeekLow!, defaultCurrency)} — high ${formatMoney(quote.fiftyTwoWeekHigh!, defaultCurrency)} | ${wpPct}% of range (0%=at low, 100%=at high)${qualifier}` +
        (belowHigh != null ? ` | ${belowHigh}% below 52w high` : "") +
        (aboveLow != null ? ` | ${aboveLow}% above 52w low` : "")
      );
    })(),
    `Dividend yield: ${quote.dividendYield != null ? (quote.dividendYield * 100).toFixed(2) + "%" : "N/A"} | Beta: ${quote.beta?.toFixed(2) ?? "N/A"}`,
    `Allocation: current ${current}, target ${target}, gap ${gap}`,
    `AI summary: "${rec.reason}" (confidence ${rec.confidence}%)`,
  ];

  if (tech) {
    const priceBelow200 =
      tech.sma200 != null && tech.priceVsSma200 != null && tech.priceVsSma200 < 0;
    const goldenCrossNote = tech.goldenCross
      ? priceBelow200
        ? " (golden cross — BUT price is below 200MA, so this is a lagging artifact, NOT a bullish signal)"
        : " (golden cross)"
      : "";
    lines.push(
      `Technical: ${tech.momentumSignal} momentum, RSI ${tech.rsi14}, 50MA ${formatMoney(tech.sma50, defaultCurrency)} (${tech.priceVsSma50 > 0 ? "+" : ""}${tech.priceVsSma50}%)${tech.sma200 != null ? `, 200MA ${formatMoney(tech.sma200, defaultCurrency)} (${tech.priceVsSma200! > 0 ? "+" : ""}${tech.priceVsSma200}%)` : ""}${goldenCrossNote}${tech.deathCross ? " (death cross)" : ""}${tech.macdCrossover ? `, MACD ${tech.macdCrossover}` : tech.macdHistogram != null ? `, MACD hist ${tech.macdHistogram > 0 ? "+" : ""}${tech.macdHistogram}` : ""}${tech.bollPercentB != null ? `, %B=${tech.bollPercentB}` : ""}${tech.bollSqueeze ? " (squeeze)" : ""}`,
    );
  }

  if (quote.returnOnEquity != null || quote.debtToEquity != null) {
    const fundamentals = [
      quote.returnOnEquity != null ? `ROE ${(quote.returnOnEquity * 100).toFixed(1)}%` : null,
      quote.debtToEquity != null ? `D/E ${quote.debtToEquity.toFixed(1)}%` : null,
      quote.profitMargins != null ? `margin ${(quote.profitMargins * 100).toFixed(1)}%` : null,
      quote.revenueGrowth != null ? `rev growth ${(quote.revenueGrowth * 100).toFixed(1)}%` : null,
      quote.earningsGrowth != null
        ? `earnings growth ${(quote.earningsGrowth * 100).toFixed(1)}%`
        : null,
      quote.targetMeanPrice != null
        ? `analyst target ${formatMoney(quote.targetMeanPrice, defaultCurrency)}`
        : null,
    ].filter(Boolean);
    lines.push(`Fundamentals: ${fundamentals.join(", ")}`);
  }

  if (rec.valueRating) {
    lines.push(`Value rating: ${rec.valueRating}`);
  }
  if (rec.bottomSignal) {
    lines.push(`Bottom signal: ${rec.bottomSignal}`);
  }

  if (macroContext) {
    lines.push("");
    lines.push(macroContext);
  }

  lines.push("");
  lines.push("Write a detailed buy thesis (3-4 paragraphs, 150-200 words total) covering:");
  lines.push("1. Why this is a STRONG BUY opportunity right now (timing + catalyst)");
  lines.push("2. Valuation analysis (P/E vs historical, fundamentals, analyst targets)");
  lines.push("3. Technical setup (momentum, support levels, entry timing)");
  lines.push("4. Portfolio fit (allocation need, diversification benefit)");
  lines.push("");
  lines.push("CRITICAL RULES:");
  lines.push(
    '- Use the full company/ETF name shown next to the ticker above (when available) in your thesis, not generic phrases like "this stock" or "this ETF".',
  );
  lines.push(
    "- The 52-week position percentage is the position WITHIN the annual range (0%=at 52w low, 100%=at 52w high). Do NOT describe it as '% of 52-week high' — that is a different number. Use the explicit '% below 52w high' value provided.",
  );
  lines.push(
    "- If price is below the 200-day MA, do NOT cite a golden cross as bullish — it is a lagging artifact when price has already fallen below the long-term trend.",
  );
  lines.push("");
  lines.push("Also list 3-4 specific risks to watch. Be concise and reference actual numbers.");

  return lines.join("\n");
}

// ── SDK calls (one per provider) ───────────────────────────────────
async function callGemini(prompt: string): Promise<{ buyThesis?: string; risks?: string[] }> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: { responseMimeType: "application/json", responseSchema: geminiDetailedSchema },
  });
  return JSON.parse(response.text ?? "{}") as { buyThesis?: string; risks?: string[] };
}

async function callClaude(prompt: string): Promise<{ buyThesis?: string; risks?: string[] }> {
  // Always pin the model, even when CLAUDE_MODEL is unset — a live spike showed
  // the Agent SDK otherwise inherits an ambient Opus-tier model, which would
  // drain the Pro allocation this transport exists to conserve.
  const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
  const transport = resolveClaudeTransport(
    process.env.CLAUDE_CODE_OAUTH_TOKEN,
    process.env.ANTHROPIC_API_KEY,
  );

  if (transport === "subscription") {
    // Strip ANTHROPIC_API_KEY from the child env — it outranks OAuth inside
    // Claude Code, so leaving it set would silently bill API credits instead
    // of using the Pro/Max allocation this transport exists to use.
    const { ANTHROPIC_API_KEY: _dropped, ...env } = process.env;

    // Same detailedSchema the tool-use path below uses — one contract, two
    // transports.
    for await (const message of query({
      prompt,
      options: {
        tools: [],
        outputFormat: { type: "json_schema", schema: detailedSchema },
        env,
        model,
        // Left unset, the Agent SDK loads every setting source, and
        // Settings.env from a filesystem settings.json (~/.claude/settings.json,
        // .claude/settings.json, or a managed-settings policy) is applied AFTER
        // the env-strip above — so a settings file defining ANTHROPIC_API_KEY
        // (or ANTHROPIC_AUTH_TOKEN) would silently re-inject the credential we
        // just stripped. It also keeps this repo's own CLAUDE.md and coding
        // instructions (git-tracked, so live in CI) out of what's meant to be a
        // pure inference prompt.
        settingSources: [],
      },
    })) {
      if (message.type !== "result") continue;
      const payload = extractStructuredPayload(message);
      if (payload !== null && typeof payload === "object") {
        return payload as { buyThesis?: string; risks?: string[] };
      }
    }
    // Every result message came back with no usable structured_output/result
    // payload — likely an expired or revoked OAuth token. The caller only
    // logs "Detailed analysis: <TICKER> (claude)" and moves on, so without
    // this the empty page has no trace in the Actions log explaining why.
    const tickerMatch = /^TICKER: (\S+)/m.exec(prompt);
    console.warn(
      `  Claude detailed analysis (subscription) for ${tickerMatch?.[1] ?? "unknown ticker"}: ` +
        `no usable structured payload in any result message — returning empty`,
    );
    return {};
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    tools: [
      {
        name: "submit_detailed_analysis",
        description: "Submit the structured detailed buy thesis + risks.",
        input_schema: detailedSchema,
      },
    ],
    tool_choice: { type: "tool", name: "submit_detailed_analysis" },
    messages: [{ role: "user", content: prompt }],
  });
  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "submit_detailed_analysis") {
      return block.input as { buyThesis?: string; risks?: string[] };
    }
  }
  return {};
}

async function callMistral(prompt: string): Promise<{ buyThesis?: string; risks?: string[] }> {
  const raw = await mistralCall(
    process.env.MISTRAL_API_KEY!,
    mistralModel(),
    prompt,
    "submit_detailed_analysis",
    strictDetailedSchema,
    2,
    2048, // matches Claude's ceiling here — one thesis + 3-4 risks is small
  );
  return JSON.parse(raw) as { buyThesis?: string; risks?: string[] };
}

// Single dispatch point, so adding a provider to DETAILED_PROVIDER_IDS without
// giving it a call path fails to compile instead of silently falling back.
function callDetailedProvider(
  id: DetailedProviderId,
  prompt: string,
): Promise<{ buyThesis?: string; risks?: string[] }> {
  switch (id) {
    case "gemini":
      return callGemini(prompt);
    case "claude":
      return callClaude(prompt);
    case "mistral":
      return callMistral(prompt);
  }
}

// ── Fetch detailed analyses for STRONG BUY tickers ──────────────────
// `eligibleTickers` includes both consensus STRONG BUYs and split cases
// where at least one provider voted STRONG BUY but the unanimity rule
// capped consensus at BUY. For split cases we promote the STRONG BUY
// voter's view into the prompt and prefer that provider's SDK for the
// call, so the resulting page reflects their actual reasoning rather
// than a watered-down consensus.
export async function fetchDetailedAnalyses(
  eligibleTickers: string[],
  priceData: Record<string, QuoteData>,
  technicals: Record<string, TechnicalData>,
  aiRecs: AIBuyRecommendation[],
  report: AllocationReport,
  macroContext: string = "",
): Promise<Record<string, DetailedAnalysis>> {
  if (eligibleTickers.length === 0) return {};

  const defaultProviderId = pickDetailedProvider();
  if (!defaultProviderId) {
    console.log("No AI provider available for detailed analysis — skipping");
    return {};
  }

  // A pinned provider wins over every per-ticker heuristic below — but only if
  // it's actually configured. pickDetailedProvider() already validated that and
  // returned it as the default, so agreement between the two means the pin held;
  // a mismatch means it was ignored (and already logged) and we must not
  // re-apply it here, or every ticker would call a provider with no key.
  const rawOverride = process.env.AI_DETAILED_PROVIDER?.toLowerCase();
  const pinnedProviderId =
    isDetailedProviderId(rawOverride) && rawOverride === defaultProviderId ? rawOverride : null;

  const recMap = new Map(aiRecs.map((r) => [r.ticker, r]));
  const result: Record<string, DetailedAnalysis> = {};

  for (const ticker of eligibleTickers) {
    const quote = priceData[ticker];
    const rec = recMap.get(ticker);
    if (!quote || !rec) continue;

    // Decide per-ticker which view + which provider drives the page.
    // Consensus STRONG BUY → use rec as-is + default provider.
    // Split (consensus BUY but a provider voted STRONG BUY) → promote that
    // provider's view + use that provider's SDK (unless user pinned via
    // AI_DETAILED_PROVIDER env, in which case we respect the override).
    const sbVoter = rec.action !== "STRONG BUY" ? findStrongBuyVoter(rec) : null;
    const promptRec: AIBuyRecommendation = sbVoter
      ? {
          ...rec,
          action: sbVoter.action,
          confidence: sbVoter.confidence,
          reason: sbVoter.reason,
          suggestedBuyValue: sbVoter.suggestedBuyValue,
          suggestedLimitPrice: sbVoter.suggestedLimitPrice,
          limitPriceReason: sbVoter.limitPriceReason,
          valueRating: sbVoter.valueRating,
          bottomSignal: sbVoter.bottomSignal,
        }
      : rec;

    // Provider selection priority:
    //   1. Explicit AI_DETAILED_PROVIDER env override (user pinned)
    //   2. STRONG BUY voter (split case)
    //   3. The actual provider(s) that produced this rec — important when
    //      multi-mode degraded to single (e.g. Gemini 503'd, Claude survived):
    //      defaultProviderId is still "gemini" by registry order, but Gemini
    //      will fail again. Prefer the survivor.
    //   4. Fall back to registry default.
    const recProviderIds = (rec.providers ?? [])
      .map((p) => p.providerId)
      .filter(isDetailedProviderId);

    const providerId: DetailedProviderId =
      pinnedProviderId ??
      (sbVoter && isDetailedProviderId(sbVoter.providerId)
        ? sbVoter.providerId
        : recProviderIds.length === 1
          ? recProviderIds[0]
          : recProviderIds.includes(defaultProviderId)
            ? defaultProviderId
            : (recProviderIds[0] ?? defaultProviderId));

    const tag = sbVoter
      ? ` (split — using ${providerId} STRONG BUY voter)`
      : recProviderIds.length === 1 && recProviderIds[0] !== defaultProviderId
        ? ` (${providerId} — only survivor of multi-AI run)`
        : ` (${providerId})`;
    console.log(`  Detailed analysis: ${ticker}${tag}`);

    try {
      const prompt = buildDetailedPrompt(
        ticker,
        quote,
        technicals[ticker],
        promptRec,
        report,
        macroContext,
      );
      const parsed = await callDetailedProvider(providerId, prompt);

      if (parsed.buyThesis) {
        result[ticker] = {
          ticker,
          buyThesis: parsed.buyThesis,
          risks: parsed.risks ?? [],
        };
        console.log(`  Detailed analysis ready for ${ticker}`);
      }
    } catch (err) {
      console.warn(`  Detailed analysis failed for ${ticker}: ${(err as Error).message}`);
    }
  }

  return result;
}
