# Blog posts

Richfolio write-ups on [richardfu.net](https://www.richardfu.net). All six are published.
Filenames are `{publication-date}-{slug}`, so `ls` sorts chronologically.

Two kinds of file, differing only in whether the body is mirrored here:

- **Metadata only** — the first two posts. Written before this folder existed, so there's
  no local draft to keep. The live post is canonical.
- **Full text** — the four-part series. Drafted here, so the body is kept alongside the
  Yoast fields that were used, plus a paste-ready LinkedIn post in [`linkedin/`](linkedin/).

Where the body *is* mirrored it will drift from the live post over time — the live version
is always canonical. Treat these as the drafting record, not the source of truth.

| Post | Published | Covers |
|---|---|---|
| [I Built a Free AI Portfolio Assistant…](2026-02-26-free-ai-portfolio-assistant.md) | 2026-02-26 | v1.0 |
| [Richfolio, three months in: AI architecture in production](2026-05-22-richfolio-three-months-in.md) | 2026-05-22 | v1.0 → v1.6 |
| [AI Portfolio Monitoring: Every Safety Net Failed Silently](2026-08-08-ai-portfolio-monitoring-silent-failures.md) | 2026-08-08 | v1.6 → v1.10 |
| [Free LLM API Tiers: Running Three Models for $0/month](2026-08-09-free-llm-api-three-model-stack.md) | 2026-08-09 | v1.6 → v1.10 |
| [LinkedIn API Approval Rejected: What They Actually Require](2026-08-09-linkedin-api-approval-rejected.md) | 2026-08-09 | v1.8 |
| [Six Months of AI Buy Signals: The Honest Numbers](2026-08-10-six-months-ai-buy-signals-results.md) | 2026-08-10 | results |

The last four are one series and cross-link to each other by live URL, so **the slug in
each header is load-bearing** — changing one on WordPress breaks the siblings pointing at
it. Two slugs were already revised before publication (`free-llm-api-two-model-stack` →
`-three-model-stack`), and the headers reflect what actually went live.

## Taxonomy

Posts carry **multiple categories**, main first. `Web Dev` is the main category for the
engineering posts — the existing bucket on the site a TypeScript/Node project belongs in,
which keeps the series clustered with the Unity and WebGL write-ups rather than stranded in
a finance silo.

| Post | Main | Also |
|---|---|---|
| v1.0 (Feb) | Web Dev | TypeScript, Finance, AI |
| v1.6 (May) | Web Dev | TypeScript, AI, Finance |
| Silent failures | Web Dev | TypeScript, Finance |
| Free LLM API | Web Dev | TypeScript, AI |
| LinkedIn approval | Web Dev | TypeScript, Finance |
| AI buy signals | **Finance** | Web Dev |

`TypeScript` is a **category, not a tag** — a durable technology bucket that will accumulate
posts beyond this project. It's off the results post: that one is about returns, not code.

The results post leads with `Finance` on purpose — the only one whose audience is investors
rather than engineers, and the only one that stands alone for someone who never opens the
others.

Tags stay at **five**, shaped `<focus keyphrase>, Richfolio, <topical>, Side Project,
<topical>`. `Richfolio` and `Side Project` appear on all six as the series spine;
`GitHub Actions` and `Gemini` recur. Every other tag is either a focus keyphrase (worth its
own archive) or shared with a sibling — nothing sits alone on a one-post archive.

### Still outstanding

The two older posts predate this scheme and haven't been retagged. Each one's header carries
its own `Categories (→)` and `Tags (retag to)` line with the exact change.

Permalinks here are flat (`/slug/`, no `%category%`), so adding or reordering categories
**cannot** change an existing URL — retagging published posts is safe, no redirects needed.
If you use Yoast breadcrumbs, set the primary category explicitly in the Yoast box, since
with several assigned WordPress otherwise picks the lowest term ID.

**Check Posts → Tags for near-duplicates first.** The Feb post used `side-project` and
`github-actions`; the later posts use `Side Project` and `GitHub Actions`. WordPress derives
the same slug from both forms, so it may have merged them already — or there may be two
terms holding one post each.

## If you write a fifth

The series drafts double as a template. What each header needs: focus keyphrase, SEO title
(keyphrase near the front, ≤60 chars), slug, meta description ≤156 chars, categories, five
tags, a feature-image prompt, and image alt text containing the keyphrase.

Two things learned the hard way, both recorded in the drafts:

- **Feature-image prompts must describe a physical object, never a diagram.** A prompt for
  "thin vertical bars, one plunging below the baseline" produced a green audio waveform.
  Nets, doorways and targets survive generation; charts and axes don't.
- **Keyphrase density reads orange on anything past ~3,000 words** and isn't worth stuffing
  to fix. The placement checks — title, slug, meta, intro, subheadings, alt text — are the
  ones that matter.
