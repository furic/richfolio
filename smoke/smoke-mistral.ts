// Live smoke test for the Mistral provider. Needs MISTRAL_API_KEY.
//   npx tsx smoke/smoke-mistral.ts
//
// Verifies the two things unit tests cannot: that La Plateforme accepts our
// strict json_schema, and that the model actually fills every required field.
// Deliberately avoids the real pipeline (no config.json, no Yahoo calls) so it
// works from a bare checkout with only the key set.
import { decisionSchema, strictify } from "../src/providers/schemas.js";

const API_URL = "https://api.mistral.ai/v1/chat/completions";

(async () => {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    console.error("MISTRAL_API_KEY not set — get a free key at https://console.mistral.ai");
    process.exit(1);
  }
  const model = process.env.MISTRAL_MODEL || "mistral-large-latest";
  console.log(`Model: ${model}`);

  const prompt = [
    "You are testing a JSON schema. Return recommendations for exactly two tickers:",
    "VOO (price $670, 52w position 85%, RSI 61) and MSFT (price $349, 52w position 6%, RSI 9).",
    "Use action HOLD for VOO and STRONG BUY for MSFT. Fill every field.",
  ].join("\n");

  const started = Date.now();
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "submit_recommendations",
          schema: strictify(decisionSchema),
          strict: true,
        },
      },
    }),
  });

  if (!res.ok) {
    console.error(`FAIL — HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
    if (res.status === 401) console.error("  → key rejected");
    if (res.status === 422) console.error("  → schema rejected; check strictify() output");
    if (res.status === 429) console.error("  → rate limited; free tier throttle");
    process.exit(1);
  }

  const json = (await res.json()) as {
    choices?: Array<{ finish_reason?: string; message?: { content?: string } }>;
    usage?: Record<string, number>;
  };
  const choice = json.choices?.[0];
  console.log(`finish_reason: ${choice?.finish_reason} · ${Date.now() - started}ms`);
  if (json.usage) console.log("usage:", JSON.stringify(json.usage));

  const content = choice?.message?.content;
  if (!content) {
    console.error("FAIL — no content returned");
    process.exit(1);
  }

  const parsed = JSON.parse(content) as {
    recommendations: Array<Record<string, unknown>>;
  };
  const recs = parsed.recommendations ?? [];
  console.log(`\nParsed ${recs.length} recommendations:`);
  for (const r of recs) {
    console.log(`  ${r.action} ${r.ticker} (${r.confidence}%) limit=${r.suggestedLimitPrice}`);
  }

  const required = [
    "ticker",
    "action",
    "confidence",
    "reason",
    "suggestedBuyValue",
    "suggestedLimitPrice",
    "limitPriceReason",
    "valueRating",
    "bottomSignal",
  ];
  const missing = recs.flatMap((r) =>
    required.filter((f) => !(f in r)).map((f) => `${r.ticker}.${f}`),
  );

  const ok = recs.length >= 2 && missing.length === 0;
  if (missing.length) console.error("Missing fields:", missing.join(", "));
  console.log(
    ok
      ? "\nPASS — strict schema accepted and every required field present."
      : "\nFAIL — schema accepted but output incomplete.",
  );
  if (!ok) process.exit(1);
})();
