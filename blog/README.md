# Blog posts

Richfolio write-ups on [richardfu.net](https://www.richardfu.net), in publication order.

Two kinds of file live here:

- **Reference entries** (`2026-*.md`) — already published. Metadata, section outline and
  opening line only. The live post is canonical and the body is *not* mirrored, so there's
  no second copy to drift out of sync with what readers actually see.
- **Series drafts** (`1-*.md` … `4-*.md`) — the four-part v1.6→v1.10 series, full text,
  with a `YOAST FIELDS` header block to paste into WordPress and a matching paste-ready
  LinkedIn post in [`linkedin/`](linkedin/).

| # | Post | Status | Covers |
|---|---|---|---|
| 1 | [I Built a Free AI Portfolio Assistant…](2026-02-26-free-ai-portfolio-assistant.md) | live 2026-02-26 | v1.0 |
| 2 | [Richfolio, three months in: AI architecture in production](2026-05-22-richfolio-three-months-in.md) | live 2026-05-22 | v1.0 → v1.6 |
| 3 | [Every safety net I built failed silently](1-silent-failures.md) | **live 2026-08-08** | v1.6 → v1.10 |
| 4 | [The free LLM API stack behind my portfolio monitor](2-free-llm-api-stack.md) | draft | v1.6 → v1.10 |
| 5 | [LinkedIn API approval, rejected](3-publishing-signals.md) | draft | v1.8 |
| 6 | [Six months of AI buy signals: the honest numbers](4-six-months-results.md) | draft | results |

Posts 3–6 are one series with hard-coded cross-links, so each slug must be used **exactly**
as written in its `YOAST FIELDS` block or siblings 404.

## Publishing one per day

Posts 4–6 each contain live links to the others, so until all four are up, some links 404.
Two ways to handle it:

- **Reserve the slugs first.** Save 4, 5 and 6 as WordPress drafts now — the permalink is
  assigned on save, so you can confirm no `-2` suffix crept in while there's still time to
  fix it. Then publish one per day.
- **Or publish and accept it.** Post 3 is live and links forward to three posts that don't
  exist yet. Google will recrawl; readers who click get a 404 for a day or two.

The first option costs five minutes and removes the only real risk here, which is a slug
collision silently breaking eleven cross-links.

## Taxonomy

Posts carry **multiple categories**, main first. `Web Dev` is the main category for the
engineering posts — it's the existing bucket on the site that a TypeScript/Node project
belongs in, and it keeps the series clustered with the Unity and WebGL write-ups rather
than stranded in a finance silo.

| Post | Main | Also |
|---|---|---|
| v1.0 (Feb) | Web Dev | Finance, AI |
| v1.6 (May) | Web Dev | AI, Finance |
| Silent failures | Web Dev | Finance |
| Free LLM API | Web Dev | AI |
| LinkedIn approval | Web Dev | Finance |
| AI buy signals | **Finance** | Web Dev |

The results post leads with `Finance` on purpose — it's the only one whose audience is
investors rather than engineers, and the only one that would make sense to someone who
never opens the others.

Tags stay at **five**, shaped `<focus keyphrase>, Richfolio, <topical>, Side Project,
<topical>`.

`Richfolio` and `Side Project` appear on all six as the series spine; `GitHub Actions` and
`Gemini` recur across several. Every other tag is either a focus keyphrase (worth its own
archive) or shared with at least one sibling.

Two published posts need retagging to join — details in each reference entry:

| Post | Change |
|---|---|
| v1.0 (Feb) | Category already `Finance`. 12 tags → 6. |
| v1.6 (May) | Category `AI` → `Finance`. Add `Richfolio`, `Gemini`, `GitHub Actions`; drop `OpenAlice`, `Yahoo Finance`. |

**Check Posts → Tags for near-duplicates before adding anything.** The Feb post used
`side-project` and `github-actions`; the later posts use `Side Project` and
`GitHub Actions`. WordPress derives the same slug from both forms, so it may have merged
them already — or you may have two terms with one post each. Ten seconds to look, and
adding the spaced forms without checking is what creates the duplicate.

Dropping a tag doesn't remove information: `OpenAlice`, `Yahoo Finance`, `technical
analysis` and the rest are all still named in the post bodies, which is where they're
actually searchable. A tag archive holding a single post earns nothing.

## Per-post checklist

1. Paste the body, then fill the Yoast sidebar from the header block — **slug must match
   exactly**.
2. Generate the feature image from the prompt in the header; use the alt text given, which
   contains the focus keyphrase.
3. Add the screenshots named under `Images`. The two best already exist: the MSFT STRONG BUY
   card (post 6) and the GOOG whipsaw inbox (post 3, already published).
4. Post 3's keyphrase density reads orange — expected at ~3,500 words, not worth stuffing.
5. Share with the matching text in [`linkedin/`](linkedin/).
