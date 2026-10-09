import { createHmac, randomBytes } from "node:crypto";
import { socialConfig } from "./config.js";
import {
  buildPostText,
  buildSignalLines,
  type Platform,
  type SignalSource,
  type SocialMode,
} from "./socialContent.js";

export { intradayAlertsToSignals } from "./socialContent.js";
export type { SignalSource, SocialMode } from "./socialContent.js";

// ── Credentials (all optional — each poster gates on its own keys) ──
const X_API_KEY = process.env.X_API_KEY;
const X_API_SECRET = process.env.X_API_SECRET;
const X_ACCESS_TOKEN = process.env.X_ACCESS_TOKEN;
const X_ACCESS_TOKEN_SECRET = process.env.X_ACCESS_TOKEN_SECRET;

const FACEBOOK_PAGE_ID = process.env.FACEBOOK_PAGE_ID;
const FACEBOOK_PAGE_TOKEN = process.env.FACEBOOK_PAGE_TOKEN;

const THREADS_USER_ID = process.env.THREADS_USER_ID;
const THREADS_ACCESS_TOKEN = process.env.THREADS_ACCESS_TOKEN;

const LINKEDIN_ACCESS_TOKEN = process.env.LINKEDIN_ACCESS_TOKEN;
const LINKEDIN_ORG_URN = process.env.LINKEDIN_ORG_URN;
const LINKEDIN_API_VERSION = process.env.LINKEDIN_API_VERSION || "202406";

// ── Platform posters ────────────────────────────────────────────────
// Each gates on its own credentials (graceful skip, no throw), and throws
// only on a real API error so the orchestrator can log it per-channel.

function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(
    /[!*'()]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

async function postToX(text: string): Promise<"posted" | "skipped"> {
  if (!X_API_KEY || !X_API_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_TOKEN_SECRET) {
    console.log("X credentials not set — skipping X");
    return "skipped";
  }

  const url = "https://api.twitter.com/2/tweets";
  // OAuth 1.0a user-context. The JSON body is NOT part of the signature
  // base string (only oauth_* params are), per the OAuth 1.0a spec for
  // non-form-encoded bodies.
  const oauth: Record<string, string> = {
    oauth_consumer_key: X_API_KEY,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: X_ACCESS_TOKEN,
    oauth_version: "1.0",
  };

  const paramString = Object.keys(oauth)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(oauth[k])}`)
    .join("&");
  const baseString = ["POST", percentEncode(url), percentEncode(paramString)].join("&");
  const signingKey = `${percentEncode(X_API_SECRET)}&${percentEncode(X_ACCESS_TOKEN_SECRET)}`;
  oauth.oauth_signature = createHmac("sha1", signingKey).update(baseString).digest("base64");

  const authHeader =
    "OAuth " +
    Object.keys(oauth)
      .sort()
      .map((k) => `${percentEncode(k)}="${percentEncode(oauth[k])}"`)
      .join(", ");

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: authHeader, "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    throw new Error(`X API ${res.status}: ${await res.text()}`);
  }
  return "posted";
}

async function postToFacebook(text: string): Promise<"posted" | "skipped"> {
  if (!FACEBOOK_PAGE_ID || !FACEBOOK_PAGE_TOKEN) {
    console.log("Facebook credentials not set — skipping Facebook");
    return "skipped";
  }
  const url = `https://graph.facebook.com/v25.0/${FACEBOOK_PAGE_ID}/feed`;
  const body = new URLSearchParams({ message: text, access_token: FACEBOOK_PAGE_TOKEN });
  const res = await fetch(url, { method: "POST", body });
  if (!res.ok) {
    throw new Error(`Facebook API ${res.status}: ${await res.text()}`);
  }
  return "posted";
}

async function postToThreads(text: string): Promise<"posted" | "skipped"> {
  if (!THREADS_USER_ID || !THREADS_ACCESS_TOKEN) {
    console.log("Threads credentials not set — skipping Threads");
    return "skipped";
  }
  const base = "https://graph.threads.net/v1.0";
  // Threads publishing is two steps: create a media container, then publish it.
  const createRes = await fetch(`${base}/${THREADS_USER_ID}/threads`, {
    method: "POST",
    body: new URLSearchParams({ media_type: "TEXT", text, access_token: THREADS_ACCESS_TOKEN }),
  });
  const created = (await createRes.json()) as { id?: string; error?: { message: string } };
  if (!createRes.ok || !created.id) {
    throw new Error(`Threads create ${createRes.status}: ${created.error?.message ?? ""}`);
  }
  const pubRes = await fetch(`${base}/${THREADS_USER_ID}/threads_publish`, {
    method: "POST",
    body: new URLSearchParams({ creation_id: created.id, access_token: THREADS_ACCESS_TOKEN }),
  });
  const pub = (await pubRes.json()) as { id?: string; error?: { message: string } };
  if (!pubRes.ok || !pub.id) {
    throw new Error(`Threads publish ${pubRes.status}: ${pub.error?.message ?? ""}`);
  }
  return "posted";
}

async function postToLinkedIn(text: string): Promise<"posted" | "skipped"> {
  if (!LINKEDIN_ACCESS_TOKEN || !LINKEDIN_ORG_URN) {
    console.log("LinkedIn credentials not set — skipping LinkedIn");
    return "skipped";
  }
  const res = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LINKEDIN_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": LINKEDIN_API_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author: LINKEDIN_ORG_URN,
      commentary: text,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });
  if (!res.ok) {
    throw new Error(`LinkedIn API ${res.status}: ${await res.text()}`);
  }
  return "posted";
}

// ── Orchestrator ────────────────────────────────────────────────────
// Builds platform-specific text once and dispatches to each poster inside
// its own try/catch so one platform failing never blocks the others (or the
// already-sent email/Telegram). Master kill-switch via config.social.enabled.
export async function sendSocialPosts(sources: SignalSource[], mode: SocialMode): Promise<void> {
  if (socialConfig.enabled === false) {
    console.log("Social posting disabled in config — skipping\n");
    return;
  }
  // Per-run override (manual workflow_dispatch defaults to it) so a rerun can't double-post publicly.
  if (process.env.SOCIAL_POSTING === "off") {
    console.log("Social posting turned off for this run (SOCIAL_POSTING=off) — skipping\n");
    return;
  }

  const lines = buildSignalLines(sources);
  if (lines.length === 0) {
    console.log("No STRONG BUY / BUY signals to post socially\n");
    return;
  }

  const platforms: Array<{
    name: Platform;
    post: (text: string) => Promise<"posted" | "skipped">;
  }> = [
    { name: "x", post: postToX },
    { name: "facebook", post: postToFacebook },
    { name: "threads", post: postToThreads },
    { name: "linkedin", post: postToLinkedIn },
  ];

  for (const { name, post } of platforms) {
    const text = buildPostText(sources, name, mode, {
      includeLinkInX: socialConfig.includeLinkInX,
      hashtags: socialConfig.hashtags,
    });
    if (!text) continue;
    try {
      const result = await post(text);
      if (result === "posted") console.log(`Posted to ${name}`);
    } catch (err) {
      console.error(`${name} post failed:`, (err as Error).message);
    }
  }
}
