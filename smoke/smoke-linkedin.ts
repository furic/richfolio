import "dotenv/config";

// LinkedIn Page posting smoke test.
//
//   npx tsx smoke/smoke-linkedin.ts                 # verifies the token (no posting)
//   npx tsx smoke/smoke-linkedin.ts --post          # publishes a real test post
//   npx tsx smoke/smoke-linkedin.ts --post --cleanup # publishes then deletes it
//
// Reads LINKEDIN_ACCESS_TOKEN / LINKEDIN_ORG_URN from .env. Hits the live
// LinkedIn API — run manually, not in CI. The access token must carry the
// w_organization_social scope and belong to an admin of the organization.

const API = "https://api.linkedin.com";
const VERSION = process.env.LINKEDIN_API_VERSION || "202406";
const TOKEN = process.env.LINKEDIN_ACCESS_TOKEN;
const ORG_URN = process.env.LINKEDIN_ORG_URN;

const doPost = process.argv.includes("--post");
const doCleanup = process.argv.includes("--cleanup");

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
  "LinkedIn-Version": VERSION,
  "X-Restli-Protocol-Version": "2.0.0",
};

(async () => {
  if (!TOKEN || !ORG_URN) {
    console.log("FAIL — LINKEDIN_ACCESS_TOKEN and/or LINKEDIN_ORG_URN missing from .env");
    process.exit(1);
  }

  // 1. Token validity check (no publishing). userinfo works when the token
  //    carries the openid/profile scope; a 403 here is non-fatal (the posting
  //    scope may still be present), so we just report it.
  const meRes = await fetch(`${API}/v2/userinfo`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (meRes.ok) {
    const me = (await meRes.json()) as { name?: string; sub?: string };
    console.log(`Token OK → authenticated as: ${me.name ?? me.sub ?? "(unknown)"}`);
  } else {
    console.log(
      `Token did not resolve via /v2/userinfo (${meRes.status}) — continuing; ` +
        "posting uses w_organization_social, which userinfo doesn't reflect.",
    );
  }
  console.log(`Org: ${ORG_URN}`);

  if (!doPost) {
    console.log("\nDONE — re-run with --post to publish a real test post.");
    return;
  }

  // 2. Real publish to the organization feed (what the daily/intraday flow does).
  const body = {
    author: ORG_URN,
    commentary: "✅ Richfolio LinkedIn smoke test — safe to delete.",
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  const postRes = await fetch(`${API}/rest/posts`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  // The created post URN comes back in a response header, not the body.
  const postUrn = postRes.headers.get("x-restli-id") || postRes.headers.get("x-linkedin-id");
  if (!postRes.ok || !postUrn) {
    console.log("FAIL — publish rejected:", postRes.status, await postRes.text());
    process.exit(1);
  }
  console.log(`Posted → ${postUrn}`);

  if (doCleanup) {
    const delRes = await fetch(`${API}/rest/posts/${encodeURIComponent(postUrn)}`, {
      method: "DELETE",
      headers,
    });
    console.log(
      delRes.ok || delRes.status === 204
        ? "Cleanup OK — test post deleted."
        : `Cleanup failed: ${delRes.status} ${await delRes.text()}`,
    );
  }

  console.log("\nPASS — LinkedIn posting works end-to-end.");
})();
