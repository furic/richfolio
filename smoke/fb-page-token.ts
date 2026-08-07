import "dotenv/config";

// One-shot helper: turn a (short-lived) USER token into a long-lived,
// non-expiring PAGE access token for FACEBOOK_PAGE_ID.
//
// Set these in .env temporarily, then run `npx tsx smoke/fb-page-token.ts`:
//   FB_USER_TOKEN        — a user token with pages_show_list + pages_manage_posts
//                          (your current FACEBOOK_PAGE_TOKEN value is one)
//   FACEBOOK_APP_SECRET  — App settings → Basic → App secret
//   FACEBOOK_APP_ID      — optional, defaults to the Richfolio Poster app id
//   FACEBOOK_PAGE_ID     — already set
//
// Paste the printed token into FACEBOOK_PAGE_TOKEN, then delete FB_USER_TOKEN
// and FACEBOOK_APP_SECRET from .env (the app never needs them).

const GRAPH = "https://graph.facebook.com/v25.0";
const APP_ID = process.env.FACEBOOK_APP_ID || "2787912211595116";
const APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const USER_TOKEN = process.env.FB_USER_TOKEN || process.env.FACEBOOK_PAGE_TOKEN;
const PAGE_ID = process.env.FACEBOOK_PAGE_ID;

(async () => {
  if (!APP_SECRET || !USER_TOKEN || !PAGE_ID) {
    console.log(
      "Need FACEBOOK_APP_SECRET, FB_USER_TOKEN (or current FACEBOOK_PAGE_TOKEN), FACEBOOK_PAGE_ID",
    );
    process.exit(1);
  }

  // 1. Short-lived user token → long-lived user token (~60 days)
  const exRes = await fetch(
    `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token` +
      `&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${USER_TOKEN}`,
  );
  const ex = (await exRes.json()) as { access_token?: string; error?: { message: string } };
  if (!exRes.ok || !ex.access_token) {
    console.log("FAIL — token exchange:", ex.error?.message ?? exRes.status);
    process.exit(1);
  }
  console.log("Long-lived user token obtained.");

  // 2. List managed Pages — each Page's access_token derived from a long-lived
  //    user token is itself non-expiring.
  const acctRes = await fetch(
    `${GRAPH}/me/accounts?fields=id,name,access_token&access_token=${ex.access_token}`,
  );
  const acct = (await acctRes.json()) as {
    data?: Array<{ id: string; name: string; access_token: string }>;
    error?: { message: string };
  };
  if (!acctRes.ok || !acct.data) {
    console.log("FAIL — me/accounts:", acct.error?.message ?? acctRes.status);
    process.exit(1);
  }

  const page = acct.data.find((p) => p.id === PAGE_ID);
  if (!page) {
    console.log(
      `FAIL — Page ${PAGE_ID} not in your managed Pages: ${acct.data.map((p) => `${p.name}(${p.id})`).join(", ") || "(none)"}`,
    );
    process.exit(1);
  }

  console.log(`\nPage: ${page.name} (${page.id})`);
  console.log("\n=== FACEBOOK_PAGE_TOKEN (non-expiring) — paste this into .env ===\n");
  console.log(page.access_token);
  console.log("\n(Then remove FB_USER_TOKEN and FACEBOOK_APP_SECRET from .env.)");
})();
