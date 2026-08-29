/**
 * Richfolio scheduler — a Cloudflare Worker that fires the GitHub Actions
 * workflows on time.
 *
 * WHY THIS EXISTS
 *
 * GitHub's `schedule` event is not a scheduler you can rely on. Its own docs
 * say scheduled runs "may be delayed during periods of high load" and, at
 * sufficient load, dropped entirely — so this is documented behaviour, never
 * reported as an incident on githubstatus.com. GitHub staff acknowledged the
 * regression in community discussion #196910 (opened 2026-05-25, still open):
 * drift "has got worse", caused by load balancing under >30% growth in
 * scheduled job volume, with no committed fix date.
 *
 * Measured on this repo, the 22:00 UTC daily brief fired:
 *   2026-08-11..13   +51m      (~9:15am AEST — as designed)
 *   2026-08-14..25   +30m      (~8:55am AEST)
 *   2026-08-26       never     (dropped during an Actions incident)
 *   2026-08-27       +5h02m    (1:24pm AEST)
 *   2026-08-28       +8h03m    (4:30pm AEST)
 *   2026-08-29       +5h36m    (2:01pm AEST)
 *
 * Cloudflare Cron Triggers fire these workflows via `repository_dispatch`
 * instead. The GitHub `schedule:` triggers have been REMOVED from both
 * workflows rather than kept as a fallback: once GitHub finally delivers a
 * late cron it would run a second, duplicate brief — and `daily`/`intraday`
 * modes post publicly to X / Facebook / LinkedIn / Threads, so a duplicate is
 * not just a second email but a second public post. `workflow_dispatch` stays
 * on both workflows as the manual recovery path.
 *
 * COST: entirely within the Workers Free plan. Free allows 100,000 requests/day
 * and 5 Cron Triggers per ACCOUNT (not per Worker); this uses 4 triggers and
 * ~13 invocations/day. The 10ms free-plan CPU ceiling is not a constraint
 * either — Cloudflare does not count time awaiting `fetch()` toward CPU time,
 * and all this Worker does is build a small JSON body and POST it.
 */

/**
 * Cron expression → `repository_dispatch` event type.
 *
 * Keyed by the wrangler.jsonc cron strings, matched case- and
 * whitespace-insensitively (see `normalizeCron`) rather than by raw equality —
 * a lookup miss here sends nothing at all, which is too quiet a failure to hang
 * on the exact casing Cloudflare happens to echo back in `event.cron`.
 *
 * Day-of-week is written as 3-letter names on purpose: Cloudflare follows
 * Quartz, where 1 = SUNDAY, not Monday as in Unix cron. `1-5` would silently
 * mean Sun-Thu.
 *
 * The event type doubles as the run mode: each workflow filters on it via
 * `repository_dispatch.types`, and its "Determine mode" step reads
 * `github.event.action`. So `daily` reaches portfolio-monitor.yml and `crypto`
 * reaches crypto-monitor.yml with no routing logic here.
 */
export const TRIGGERS = {
  // 8:00am AEST. The one genuinely time-anchored run: it writes the morning
  // baseline that every intraday comparison is measured against.
  "0 22 * * *": "daily",

  // Sunday 22:30 UTC = Monday 8:30am AEST. Deliberately 30min after the daily
  // rather than sharing its slot, so the two never run concurrently against the
  // same state/ cache.
  //
  // This replaces portfolio-monitor.yml's old `send-weekly` job, which ran on
  // every schedule tick and decided by asking the RUNNER for the weekday
  // (`date -u +%u`). Drift silently broke that: a Sunday 22:00 cron delivered
  // at Monday 03:00 UTC computes day=1 and skips the weekly entirely. Naming
  // the mode in the dispatch removes the guesswork.
  "30 22 * * SUN": "weekly",

  // 1:15pm / 5:15pm / 9:15pm AEST, and 12:15am AEST next day. Weekdays only.
  // Collapsed from four separate GitHub crons (3:15/7:00/10:45/14:30) into one
  // expression to stay inside the 5-trigger free-plan budget. Minute :15 keeps
  // them off the crypto schedule's :00 slots, as the original spacing did.
  "15 3,7,11,14 * * MON-FRI": "intraday",

  // Every 3 hours. Crypto trades 24/7, so unlike the equity intraday runs these
  // always have real price movement to compare against.
  "0 */3 * * *": "crypto",
};

const GITHUB_API = "https://api.github.com";
const MAX_ATTEMPTS = 3;

/** Case- and whitespace-insensitive form of a cron expression, for lookup. */
export function normalizeCron(cron) {
  return String(cron).trim().toUpperCase().replace(/\s+/g, " ");
}

const TRIGGERS_BY_NORMALIZED = new Map(
  Object.entries(TRIGGERS).map(([cron, type]) => [normalizeCron(cron), type]),
);

/**
 * POST a `repository_dispatch` to the richfolio repo.
 *
 * Retries on network errors, 5xx and 429 only. A 401/403/404 means the token is
 * wrong, expired, or missing `contents: write` — retrying that just burns the
 * window and buries the real cause, so it fails fast and loudly instead.
 */
async function dispatch(env, type, scheduledAt) {
  const url = `${GITHUB_API}/repos/${env.GITHUB_REPO}/dispatches`;
  const body = JSON.stringify({
    event_type: type,
    client_payload: { source: "cloudflare-cron", scheduled_at: scheduledAt },
  });

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
          // GitHub rejects API requests with no User-Agent.
          "User-Agent": "richfolio-scheduler",
        },
        body,
      });

      // A successful repository_dispatch returns 204 with an empty body.
      if (res.status === 204) {
        console.log(`dispatched "${type}" (attempt ${attempt})`);
        return;
      }

      const detail = (await res.text()).slice(0, 300);
      lastError = new Error(`GitHub returned ${res.status} — ${detail}`);

      const retriable = res.status >= 500 || res.status === 429;
      if (!retriable) break;
    } catch (err) {
      lastError = err;
    }

    if (attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    }
  }

  throw new Error(`dispatch("${type}") failed: ${lastError?.message ?? "unknown error"}`);
}

export default {
  /**
   * Cron Trigger entry point. Cloudflare gives a scheduled invocation up to 15
   * minutes of wall time, so the retry loop has room; awaiting it directly (not
   * via ctx.waitUntil) is what makes a failure show up as a failed cron
   * invocation in the Workers dashboard rather than a silent no-op.
   */
  async scheduled(event, env) {
    const type = TRIGGERS_BY_NORMALIZED.get(normalizeCron(event.cron));
    const scheduledAt = new Date(event.scheduledTime).toISOString();

    if (!type) {
      // Reachable only if wrangler.jsonc gains a cron that TRIGGERS doesn't
      // know. Logged rather than thrown so one stray trigger can't look like a
      // GitHub outage.
      console.error(`no dispatch type mapped for cron "${event.cron}" — nothing sent`);
      return;
    }

    console.log(`cron "${event.cron}" fired for ${scheduledAt} → dispatching "${type}"`);
    await dispatch(env, type, scheduledAt);
  },
};
