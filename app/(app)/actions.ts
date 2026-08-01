"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { devAuthEnabled, DEV_COOKIE } from "@/lib/auth/dev";

export async function signOutAction() {
  if (devAuthEnabled()) {
    (await cookies()).delete(DEV_COOKIE);
    redirect("/");
  }
  // Only import authkit's signOut when actually needed — its module has
  // "use server" at the top, which causes Next.js to register getAuthAction
  // (a WorkOS session check) during page render even if signOut is never called.
  // Dynamic import keeps that registration out of the dev-mode bundle.
  const { signOut } = await import("@workos-inc/authkit-nextjs");
  await signOut();
}
