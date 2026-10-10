const EXPIRED = "That link expired — send a new one.";
const GENERIC = "Sign-in failed — try again.";

// Failed sign-ins arrive as redirect params: query under PKCE, hash otherwise.
export function authErrorFromUrl(href: string): string | null {
  const url = new URL(href);
  const query = url.searchParams;
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const get = (k: string) => query.get(k) ?? hash.get(k);

  if (!get("error") && !get("error_code") && !get("error_description")) return null;
  if (get("error_code") === "otp_expired") return EXPIRED;
  return get("error_description") ?? GENERIC;
}
