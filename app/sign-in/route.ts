import { redirect } from "next/navigation";
import { getSignInUrl } from "@workos-inc/authkit-nextjs";

// Route handler (not a page) so AuthKit may set the PKCE cookie before
// redirecting the user to WorkOS sign-in.
export async function GET() {
  redirect(await getSignInUrl());
}
