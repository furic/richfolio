<!--
YOAST FIELDS (paste into WordPress → Yoast sidebar)
  Focus keyphrase : LinkedIn API approval
  SEO title       : LinkedIn API Approval Rejected: What They Actually Require
  Slug            : linkedin-api-approval-rejected-organizational-website
  Meta description: My LinkedIn API approval was rejected after two weeks — identity vetting,
                    not code. What the review actually checks, and the answer I should have given.
  Images          : the "Identity vetting failed" denial tooltip on the app's Products tab —
                    it's the exact line quoted in the post, so it carries real weight. Crop out
                    the Client ID in the app header, and don't use the appeal-form screenshot
                    (it shows the Client ID and personal email in plain text).
                    Second image: a live Threads/FB post.
  Categories      : Web Dev (main), TypeScript, Finance
  Tags            : LinkedIn API Approval, Richfolio, Social Media API, Side Project, OAuth
  Feature image prompt (copy whole thing):
    Cinematic dark tech illustration, 1200x630 wide landscape banner. Four immense
    monolithic stone doorways stand in a row in a dark empty hall. The two on the
    left blaze with warm golden light pouring through and spilling across the wet
    floor. The two on the right are sealed solid — flat blank slabs of dark stone,
    no opening, no handle, faintly outlined in cold red. Fog drifts low, strong
    shafts of light cut the air. Dramatic chiaroscuro lighting, high contrast, rich
    colour, epic scale, shallow depth of field, editorial magazine quality, highly
    detailed. No text, no letters, no numbers, no logos, no people.
  Feature image alt: LinkedIn API approval — two open doorways and two sealed
  LinkedIn post   : blog/linkedin/3-publishing-signals.txt (paste-ready, no indent)
  Note            : ~1,700 words. Highest-intent keyphrase of the four — real search demand,
                    almost no first-hand write-ups.
-->

*Part 3 of 4 — publishing. [Part 1: every safety net failed silently](https://www.richardfu.net/ai-portfolio-monitoring-silent-failures/) · [Part 2: the free stack](https://www.richardfu.net/free-llm-api-three-model-stack/) · [Part 4: what it returned](https://www.richardfu.net/six-months-ai-buy-signals-results/)*

I built social posting into my portfolio tool so it could publish its own buy signals — four platforms: X, Facebook Page, Threads, LinkedIn Page. The code took hours per platform. Getting *permission* — the LinkedIn API approval in particular — took weeks, and two of the four never sent a single request.

The **LinkedIn API approval** is the one worth writing down, because the rejection reason isn't in the docs and I couldn't find a first-hand account of it anywhere.

## Two of the four have never posted anything

| Platform | Status | Blocked by |
|---|---|---|
| Facebook Page | live | — |
| Threads | live | — |
| X | dormant | no free tier since Feb 2026; ~$0.015/post, more with a link |
| LinkedIn Page | dormant | **identity vetting failed** — appeal in flight |

**X** is a straightforward economic decision. The API works, the OAuth 1.0a signing works, and I'm not paying per post to broadcast signals nobody asked for. My `includeLinkInX` flag defaults to `false` for the same reason — adding a link raises the per-post cost by more than 10×. If I ever turn it on, that flag is why.

**LinkedIn** is the interesting failure, and the rest of this post is about it.

## What the LinkedIn API approval process actually checks

Posting to a LinkedIn Page as an app requires the `w_organization_social` permission, which is gated behind their "Share on LinkedIn" product review — that review *is* the LinkedIn API approval. The API itself is free. So I:

- created the app and associated it with a Page
- wrote a privacy policy page specifically for this review (and Meta's)
- documented what the app posts, how often, and what data it touches
- submitted, and waited **two weeks**

The LinkedIn API approval rejection, when it arrived, mentioned none of that. Not the code, not the privacy policy, not the posting behaviour, not the data handling. The developer portal gave one reason:

> **Identity vetting failed.** We were unable to verify that your organization is a legally registered, active entity.

The fix it suggested was a valid link to an organizational website. I had given them the project's GitHub Pages documentation site. **Not accepted.**

Those two things are worth separating, because I ran them together for weeks. The *requirement* is proof that a legally registered entity exists. The *website* is only the evidence they ask for by default, because for most applicants it's the fastest thing for a reviewer to check. A docs site on `github.io` demonstrates that a project exists. It demonstrates nothing about registration.

The signal was there in the permission name: `w_organization_social`. The product is built for organizations posting as themselves, and a reviewer asking "is there a registered entity behind this" is doing the job correctly.

What I got wrong is that I read the question as being about *size*, and answered no — there's a repository and one user. It isn't about size. I've held an active sole-trader ABN, an Australian business registration listed on a public government register, since months before I created the app. I never gave it to them. I gave them a documentation site and expected substance to stand in for registration.

## The options, and the one I missed

Two ways forward, as I saw it at the time:

1. **Stand up a real site.** Buy `richfolio.app`, build a landing page, resubmit, wait another two weeks, probably pass.
2. **Leave LinkedIn dormant.**

I picked the second, and I'd still pick it over the first. Buying a domain and building a marketing site whose only purpose is to unlock a posting integration — for a tool with one user — is the tail wagging the dog. If the project ever justifies a site on its own merits, I'll do it then and the LinkedIn API approval becomes a free side effect rather than the reason.

What I'd missed is that the rejection isn't the end of it. The denial notice links to a **vetting appeal** form, and the appeal asks for the thing my original application never contained: documentation that a legally registered entity exists. Not a website. A registration someone can look up.

So there's a third option, and it's the one I'm taking — appeal with the ABN and let a reviewer check it against the public register. That's in flight as I publish this, and I don't know yet how it lands. If a website turns out to be required in practice regardless of what the appeal form asks for, the conclusion I started with stands. If it isn't, then two weeks of this was me answering a question nobody had asked.

That's not a complaint about LinkedIn either way. The bar is a fair rule, enforced consistently. I just spent two weeks failing to notice which rule it was.

## The estimate I got wrong

I planned all four integrations as engineering work, and the engineering was genuinely small — each platform is roughly fifty lines against a shared content builder, gated on its own credentials, wrapped in its own try/catch so one dead token can't block the others.

**Platform access was the real cost: weeks of calendar time, and two of four failed on criteria no amount of code could satisfy.** For X the blocker is a price. For LinkedIn it was an identity check I answered with the wrong document.

If you're scoping "post to social" for a personal project, the useful advice is: **budget the approvals, not the integrations** — and expect a nonzero share to simply not happen. Two of mine didn't. I'd plan for that ratio next time rather than treating it as bad luck.

There's one more thing worth flagging, which connects to [Part 1](https://www.richardfu.net/ai-portfolio-monitoring-silent-failures/): both dormant integrations are *in* the codebase, tested, and permanently no-op because their credentials are unset. That's the correct design — every platform skips silently when unconfigured, which is exactly what you want when a token expires overnight. But it does mean "shipped in the repo" and "running in production" are two different claims, and the code can't tell you which one it is.

## The part I'd have written even if all four worked

The interesting engineering problem was never the four APIs. It's that every recommendation object in my pipeline carries private data — suggested buy amounts, allocation gaps, current and target percentages, ETF overlap discounts — and I'd rather not publish my position sizing to the internet.

The approach: one chokepoint that projects onto an explicit allowlist, rather than N call sites each remembering to omit the right fields.

```ts
/**
 * Privacy chokepoint. Filters to publishable buy signals and projects each
 * onto the generic allowlist — nothing else from the source object survives.
 */
export function buildSignalLines(sources: SignalSource[]): SignalSource[] {
  return sources
    .filter((s) => s.action === "STRONG BUY" || s.action === "BUY")
    .map((s) => ({
      ticker: s.ticker,
      tickerFullName: s.tickerFullName ?? null,
      action: s.action,
      confidence: s.confidence,
      reason: sanitizeReason(s.reason),
      valueRating: s.valueRating,
      analysisUrl: s.analysisUrl,
    }))
    .sort(/* action rank, then confidence */);
}
```

Explicit construction, not `delete` or destructured rest. A new private field added upstream can't leak by default — it simply isn't in the projection. And that module deliberately imports no config and does no network calls, so it's unit-testable with no config file present. There's a test asserting private values never appear in the output.

The harder half is prose. The reason text is written by the AI for *me*, so it says things like "underweight by 2.3%, fill ~$4,180 after ETF overlap discount" (figures illustrative — that sentence is exactly what must never reach a feed). Field-level allowlisting doesn't help when the leak is inside a sentence:

```ts
const PRIVATE_SENTENCE =
  /(\$\s?\d{1,3}(?:,\d{3})+|allocation gap|overlap discount|after etf overlap|under-?weight|over-?weight|portfolio (?:value|total)|position siz)/i;
```

Sentence-level filtering: split on sentence boundaries, drop any sentence that trips the pattern, keep the rest. Then a backstop regex strips any comma-grouped dollar figure that survived in a kept sentence.

The comma-grouping detail is deliberate. `$4,180` is a position size; `$205` is a share price, which is public information and useful in a post. Requiring comma-grouped thousands separates the two without needing to know which is which semantically.

The same pass strips internal guard annotations and any sentence mentioning the watch list — because the subtler leak isn't dollars. If posts labelled tickers as "portfolio" versus "watching", I'd be broadcasting exactly what I own. So portfolio and watch-list signals merge into one undifferentiated list. **Which tickers I hold is not derivable from the output.**

That was the design constraint I cared about, and it's the half that works. The half that didn't work was asking four companies for permission.

---

**Next:** [Part 4 — what six months of AI buy signals actually returned](https://www.richardfu.net/six-months-ai-buy-signals-results/), including the trade that beat my whole system and the reason that's uncomfortable.

Richfolio is open source: [github.com/furic/richfolio](https://github.com/furic/richfolio) · [docs](https://furic.github.io/richfolio)
