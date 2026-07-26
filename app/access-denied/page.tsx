import Link from "next/link";
import { ShieldX } from "lucide-react";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { Button } from "@/components/ui/button";

// Public terminal page shown when a valid Google/WorkOS session belongs to an
// account that is not on the allowlist (see lib/auth/allowlist.ts). It never
// calls requireAuthContext, so it can't loop.
export default async function AccessDenied() {
  // Best-effort: show which account is signed in. `withAuth` throws when the
  // AuthKit proxy hasn't run for this path (e.g. under the DEV_AUTH bypass), so
  // this page must never depend on it — fall back to a generic message.
  let user: { email?: string | null } | null = null;
  try {
    ({ user } = await withAuth());
  } catch {
    user = null;
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <ShieldX className="text-destructive size-10" />
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">
        Access denied
      </h1>
      <p className="text-muted-foreground mt-3 max-w-md text-pretty">
        {user?.email ? (
          <>
            You&apos;re signed in as <strong>{user.email}</strong>, which
            isn&apos;t authorised to use Atlas.
          </>
        ) : (
          <>This account isn&apos;t authorised to use Atlas.</>
        )}{" "}
        Sign out and try a different Google account.
      </p>
      <div className="mt-8 flex gap-3">
        <Button asChild>
          <Link href="/sign-out" prefetch={false}>
            Sign out
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/" prefetch={false}>
            Back to home
          </Link>
        </Button>
      </div>
    </div>
  );
}
