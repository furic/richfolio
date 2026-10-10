import { INVITE_ONLY } from "./authErrors";

const NETWORK = "Can't reach Richfolio right now. Check your connection and try again.";
const RATE_LIMIT = "Too many attempts. Wait a minute and try again.";
const CHECK_VIOLATION = "One of those values isn't allowed. Check it and try again.";
const GENERIC = "Something went wrong. Try again.";

/** Maps any thrown value to copy fit for a friend; logs what it could not classify. */
export function friendlyError(err: unknown): string {
  const e = err as { message?: unknown; status?: unknown; code?: unknown } | null;
  const message = typeof e?.message === "string" ? e.message : typeof err === "string" ? err : "";
  if (message === INVITE_ONLY) return INVITE_ONLY;
  if (err instanceof TypeError || /Failed to fetch|NetworkError/i.test(message)) return NETWORK;
  if (e?.status === 429 || /rate limit/i.test(message)) return RATE_LIMIT;
  if (e?.code === "23514") return CHECK_VIOLATION;
  console.error(err);
  return GENERIC;
}
