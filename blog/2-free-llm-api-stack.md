<!--
YOAST FIELDS (paste into WordPress → Yoast sidebar)
  Focus keyphrase : free LLM API
  SEO title       : Free LLM API Tiers: Running Two Models for $0/month
  Slug            : free-llm-api-two-model-stack
  Meta description: Which free LLM API tiers survive a year of production use — why I dropped
                    Claude for Mistral, skipped DeepSeek and Groq, and how two models vote.
  Images          : github_actions_secrets.png or a provider-comparison graphic
  Categories      : Web Dev (main), TypeScript, AI
  Tags            : Free LLM API, Richfolio, Mistral, Side Project, GitHub Actions
  Feature image prompt (copy whole thing):
    Cinematic dark tech illustration, 1200x630 wide landscape banner. Two rivers of
    light — one emerald green, one cool cyan — flow in from opposite sides of the
    frame and braid together into a single brighter stream at the centre, then
    continue as one. They pass through a series of floating translucent glass
    panels that refract and split the light into thin bands. Deep midnight blue
    background, volumetric glow, wet reflective floor beneath. Dramatic lighting,
    high contrast, rich saturated colour, shallow depth of field, editorial
    magazine quality, highly detailed. No text, no letters, no numbers, no logos,
    no people.
  Feature image alt: Free LLM API stack — two streams of light merging into one
  LinkedIn post   : blog/linkedin/2-free-llm-api-stack.txt (paste-ready, no indent)
  Note            : ~2,000 words — density should reach green comfortably.
-->

# The free LLM API stack behind my portfolio monitor

*Part 2 of 4 — the stack. [Part 1: every safety net failed silently](https://www.richardfu.net/ai-portfolio-monitoring-silent-failures/) · [Part 3: publishing signals](https://www.richardfu.net/linkedin-api-approval-rejected-organizational-website/) · [Part 4: what it returned](https://www.richardfu.net/six-months-ai-buy-signals-results/)*

[Part 1](https://www.richardfu.net/ai-portfolio-monitoring-silent-failures/) was about the safeguards in my portfolio monitoring tool and the six ways they silently stopped running. This one is the boring, useful half: what it actually runs on, why every component is a **free LLM API** or free tier, and which of those free tiers turned out to be load-bearing in a way I hadn't thought about.

## The stack — back to $0/month, the second time around

| Component | Service | Free tier |
|---|---|---|
| Prices, fundamentals, technicals, ETF holdings | Yahoo Finance (`yahoo-finance2` v3) | unofficial, unmetered |
| Headlines | NewsAPI.org | 100 req/day |
| AI analysis | Google Gemini 2.5 Flash | ~20 req/day |
| AI analysis (second opinion) | Mistral Large | ~1B tokens/month (Experiment tier) |
| Email | Resend | 3,000/month |
| Telegram | Bot API | free |
| Scheduler | GitHub Actions | free (public repo) |
| Docs site | GitHub Pages | free |

That second-opinion row spent most of this window saying "Anthropic Claude — pay-per-use", because Claude has no free LLM API tier. Then the balance ran out, and I got a useful lesson in what a free tier is actually load-bearing for: **not cost, continuity.**

A free LLM API tier is a promise about next month; pay-per-use inside a zero-maintenance system is a scheduled outage with an unknown date. Mine landed silently. Because the orchestrator degrades gracefully when a provider fails, every brief kept arriving — just quietly weaker — and it took me days to notice. The failure mode wasn't the bill; it was that nothing broke loudly enough to tell me.

### Why not DeepSeek

DeepSeek was the obvious replacement and I skipped it. Its free LLM API allowance is a one-time 5M-token grant valid for 30 days, not a perpetual tier. After that it's pay-as-you-go — very cheap, roughly $1/month at my volume after the ~75% price cut in May 2026, but that's the same trap with a longer fuse. I'd be back here in a month, and the whole point of this project is that I don't want to maintain it.

If you're happy paying a dollar rather than managing a free LLM API allowance, DeepSeek is a genuinely good answer. It just isn't a free one.

### Why not Groq or Cerebras

Both offer generous permanent free tiers — Groq at ~30 requests/minute serving Llama 3.3 70B, Cerebras at 1M tokens/day — and both are far faster than what I'm using. I still skipped them, for a reason that has nothing to do with their free LLM API terms.

Free LLM API generosity was never the deciding factor. My system caps a STRONG BUY unless *both* models independently agree. That means a second model only adds information when its disagreement reflects the **data** rather than the model being weaker. Pair a strong model with a noticeably weaker one and you don't get a cross-check, you get a random gate: the weaker model dissents on cases it simply handled worse, and your best signals get suppressed for the wrong reason.

A 70B open-weight model against Gemini 2.5 Flash would have been a downgrade dressed as an upgrade. Its dissent would mostly tell me about the model.

### Why Mistral

Mistral Large sits at comparable capability to Gemini Flash on this kind of structured reasoning, on a genuinely different model lineage, with a permanent Experiment tier of roughly 1B tokens/month against my actual usage of about 7M. That combination — capable, independent, permanently free — is the only free LLM API pairing where a disagreement between the two is worth reading.

It also has proper **strict structured output**, which matters more than it sounds. More on that below.

One constraint hasn't changed across any of this: it was never really about money, it's about **request budgets**. 250 Gemini calls/day sounds generous until you're doing two-stage prompting across four intraday runs. Every design decision downstream is shaped by that ceiling.

## The database is a cache, and that's fine

There's a `state/` directory holding two files: the morning baseline that intraday runs compare against, and the 7-day rolling reasoning history the prompts read. Both need to survive between runs of a workflow whose machine is destroyed every time it finishes.

The whole persistence layer is this:

```yaml
- uses: actions/cache@v5
  with:
    path: state/
    key: intraday-state-${{ github.run_id }}
    restore-keys: |
      intraday-state-
```

The `run_id` in the key is the part worth stealing. Cache entries in GitHub Actions are **immutable** — you cannot overwrite a key once it exists. A stable key like `intraday-state-v1` looks obviously right and then silently stops saving after the very first run, because every subsequent save is a no-op against an existing key. Making the key unique per run means the save always succeeds, and `restore-keys` prefix-matches to pull back the **most recent** entry. Each run reads the previous run's state and writes a new one: a rolling single-writer chain, no database, no S3 bucket, no credentials.

What makes this acceptable rather than reckless is that **nothing important lives only there.** It's a cache, and GitHub will evict it — 7 days without access, or LRU once the repo passes 10 GB. So every consumer treats absence as normal, not exceptional:

```ts
const ageHours = (Date.now() - new Date(data.timestamp).getTime()) / (1000 * 60 * 60);
if (ageHours > 18) {
  console.log(`Baseline is ${ageHours.toFixed(1)}h old (max 18h) — skipping comparison`);
  return null;
}
```

A missing baseline means the intraday run exits quietly instead of comparing against stale numbers. A missing reasoning history means the prompt omits its HISTORICAL CONTEXT section — the analysis is slightly worse that day and nothing breaks. When the history schema changed in v1.7 I discarded the old entries rather than writing a migration, on the grounds that seven days of conviction snapshots isn't precious data. That's only defensible because the storage was never load-bearing.

The trap I did fall into: for months I assumed my **local** `state/` reflected what production was doing. It doesn't — they're two completely separate lineages. My working copy is only written by local runs, so it had been frozen at 23 June while Actions quietly maintained its own chain in the cache. When I went looking for the run that produced a particular signal, the file on my disk had nothing to do with it. Worth knowing before you try to debug a scheduled job by reading your own checkout.

## Making the AI layer pluggable

v1.6 was Gemini-only, and the Gemini SDK was threaded through the analysis module. Adding a second provider meant first removing the first one from the plumbing.

What came out is a provider interface and a registry:

```
src/providers/
├── types.ts        # AIProvider interface + canonical AIBuyRecommendation
├── prompts.ts      # SDK-agnostic prompt builders
├── schemas.ts      # shared JSON Schemas + strictify() for strict-mode dialects
├── gemini.ts       # GeminiProvider (@google/genai)
├── claude.ts       # ClaudeProvider (@anthropic-ai/sdk, tool-use)
├── mistral.ts      # MistralProvider (native fetch, strict json_schema)
└── index.ts        # buildActiveProviders() — reads env, returns what's configured

src/aiOrchestrator.ts  # runs active providers concurrently, applies guards
src/aiAggregation.ts   # consensus action, averaging, the unanimity rule
```

The part that mattered was pulling the **prompt builders out of the SDK calls**. Every provider gets byte-identical prompts; only the transport differs — Gemini's `responseSchema`, Claude's tool-use, Mistral's `json_schema` with `strict: true`. Adding a provider really is about fifty lines, and the guard pipeline, reasoning history, degradation policy and renderers all pick it up for free. I know it's fifty lines because I did it twice: Claude in v1.7, Mistral in v1.10, the second needing no changes to anything upstream.

Behaviour is keyed off how many keys you set. One key → single-provider mode. Two or more → multi-model mode auto-engages, providers run concurrently, and every email and Telegram message shows a per-AI breakdown under each consensus call.

One practical note on picking a free LLM API for this kind of work: adding Mistral needed no SDK at all. Its endpoint is OpenAI-compatible, so it's native `fetch` and zero new dependencies — the same approach the social posting module takes for four platforms.

### One refactor worth the effort

`schemas.ts`. The two-stage output contract started life inside `claude.ts`, then got copied into `detailedAnalysis.ts`, and adding a third provider would have made three hand-maintained copies of the same JSON Schema.

They're one module now, with `strictify()` *deriving* the strict-mode variant rather than a second copy maintained by hand. Strict dialects — Mistral's `json_schema` with `strict: true`, OpenAI's structured outputs — require every object to declare `additionalProperties: false` and list all properties in `required`. That's mechanical, so derive it:

```ts
export function strictify<T>(schema: T): T { /* walk the tree, add what strict mode demands */ }
```

Two providers asking for subtly different fields would mean the same portfolio produces structurally different recommendations depending on which model answered. That's a bug that would have been invisible in exactly the way [Part 1](https://www.richardfu.net/ai-portfolio-monitoring-silent-failures/) is about — so it's worth spending a module to make it impossible.

Worth knowing if you're evaluating a free LLM API for structured work: **"supports JSON" and "constrains decoding to a schema" are different guarantees.** JSON mode gets you parseable output. Strict schema mode gets you output with the fields you asked for. The second one removes an entire category of repair code, and not every provider has it.

## The unanimity rule

Consensus is mode-of-votes with a confidence-sum tiebreaker, and if that still ties, it falls to whichever action is more conservative. Under-recommend rather than over-recommend.

Then one extra rule on top:

```ts
// Unanimity rule for STRONG BUY
if (consensus === "STRONG BUY") {
  const allStrongBuy = scores.every((s) => s.action === "STRONG BUY");
  if (!allStrongBuy) {
    consensus = "BUY";
  }
}
```

Four lines, and they're the whole point of running two models. STRONG BUY here is supposed to be rare and high-conviction — gated on a ≥2% allocation gap, ≥80% base confidence, two or more entry signals including a price-level one, and a maximum of two live at any time. Averaging two providers' confidence would have quietly softened that: an 88% and a 74% average to 81%, which clears a bar neither model individually agreed on.

So a dissent caps the consensus at BUY. If one model thinks a setup is exceptional and the other doesn't, that's not an exceptional setup — that's a disagreement, and it gets displayed as one (`unanimous` / `majority` / `split` badge).

The one place dissent survives is the detailed analysis page. If any provider voted STRONG BUY, the ticker still qualifies, and the page is generated from that provider's thesis:

```ts
export function hasStrongBuyVote(rec: AIBuyRecommendation): boolean {
  if (rec.action === "STRONG BUY") return true;
  if (!rec.providers) return false;
  return rec.providers.some((p) => p.action === "STRONG BUY");
}
```

The dissenting recommendation is frequently the most interesting thing in the brief. Capping the headline action doesn't mean throwing away the argument.

What I still don't know is how *often* two capable models disagree on the same portfolio. On mine the sample is too small to say, which makes the unanimity rule a well-reasoned bet rather than a validated one. If you run it, that's the number I'd most like to hear about.

---

**Next:** [Part 3 — publishing signals publicly without publishing my portfolio](https://www.richardfu.net/linkedin-api-approval-rejected-organizational-website/), where two of four integrations never sent a single request.

Richfolio is open source: [github.com/furic/richfolio](https://github.com/furic/richfolio) · [docs](https://furic.github.io/richfolio)
