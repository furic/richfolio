// Pure helpers for send-invite; tested under Node by test/sendInvite.test.ts.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normaliseEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : null;
}

export function inviteErrorResponse(message: string): { status: number; message: string } {
  // GoTrue's wording for an existing account varies by version, so match loosely.
  if (/already (been )?registered|already exists/i.test(message)) {
    return {
      status: 409,
      message: "That person already has an account — they can sign in directly.",
    };
  }
  return { status: 502, message: `Invite email failed: ${message}` };
}
