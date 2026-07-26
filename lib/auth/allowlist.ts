/**
 * Email allowlist. While Atlas is single-user, only these Google accounts may
 * sign in — every other authenticated WorkOS identity is rejected at the auth
 * context gate (see `lib/auth/context.ts`).
 *
 * Configure via `ALLOWED_EMAILS` (comma-separated). When unset it falls back to
 * the sole owner account so the app is locked down by default.
 */
const DEFAULT_ALLOWED = [
  "thoralexanderbjesimonsen@gmail.com",
  "ditlevbj@gmail.com",
];

function allowedEmails(): string[] {
  const raw = process.env.ALLOWED_EMAILS;
  const list = raw
    ? raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_ALLOWED;
  return list.length ? list : DEFAULT_ALLOWED;
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return allowedEmails().includes(email.toLowerCase());
}
