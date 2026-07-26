import { signOut } from "@workos-inc/authkit-nextjs";

// Route handler (not a page) so the WorkOS session cookie can be cleared before
// redirecting home. Used by the /access-denied page to let a non-allowlisted
// account drop its session and try a different Google account.
export async function GET() {
  await signOut({ returnTo: "/" });
}
