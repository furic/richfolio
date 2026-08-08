<!--
PUBLISHED POST — reference entry, not a working draft.
The live post is canonical; this file records its metadata so the series has a
complete index. Body deliberately not mirrored (see blog/README.md).

  Title           : Richfolio, three months in: AI architecture in production
  Subtitle        : From v1.0 to v1.6 — what I rebuilt, what I borrowed, and what's
                    running in production for $0/month
  URL             : https://www.richardfu.net/richfolio-three-months-in-ai-architecture-in-production/
  Slug            : richfolio-three-months-in-ai-architecture-in-production
  Published       : 2026-05-22
  Covers          : Richfolio v1.0 → v1.6
  Categories (live): AI
  Categories (→)  : Web Dev (main), TypeScript, AI, Finance
  Tags (as live)  : Software Architecture, Side Project, Yahoo Finance, OpenAlice
  Tags (retag to) : Software Architecture, Richfolio, Side Project, Gemini,
                    GitHub Actions
                    → adds Richfolio + two tags shared with the rest of the
                      series. Drops OpenAlice and Yahoo Finance (single-post
                      tags); both are still named in the body where they matter.
  Length          : ~3,500 words
-->

# Richfolio, three months in: AI architecture in production

*From v1.0 to v1.6 — what I rebuilt, what I borrowed, and what's running in production for $0/month*

**Published 22 May 2026** · covers v1.0 → v1.6
**Live:** https://www.richardfu.net/richfolio-three-months-in-ai-architecture-in-production/

The architecture post. Establishes the four patterns the current series builds on —
two-stage prompting, the guard pipeline, reasoning persistence, macro context — and
the structure the v1.6→v1.10 series deliberately reuses.

> Three months ago I shipped v1.0 of Richfolio — a zero-maintenance side project that emails me a daily AI-powered portfolio digest. I wrote about the original motivation and v1 architecture in this earlier post if you want the background.

## Section outline

1. What Richfolio is now
2. The stack — still $0/month
3. Architecture: patterns I borrowed from OpenAlice
   1. Two-stage Think/Plan AI prompting
   2. Post-AI guard pipeline
   3. Seven-day reasoning persistence
   4. Macro environment context
4. Case study: fixing the BSV "75% BUY every day" problem
5. Other things shipped since v1.0
6. The honest results so far
7. Alpha testers wanted

## Claims the later series revisits

- **"still $0/month"** — became "nearly $0" when Claude was added on pay-per-use, then
  back to $0 in v1.10 via Mistral. See [Part 2](https://www.richardfu.net/free-llm-api-two-model-stack/).
- **"up 6%"** — now 13.8% on cost basis, with four caveats.
  See [Part 4](https://www.richardfu.net/six-months-ai-buy-signals-results/).
- **The guard pipeline** — presented here as working. [Part 1](https://www.richardfu.net/ai-portfolio-monitoring-silent-failures/)
  is largely about the ways it silently wasn't.

## Referenced by

- [Part 1 — every safety net failed silently](https://www.richardfu.net/ai-portfolio-monitoring-silent-failures/) — opening paragraph links here
