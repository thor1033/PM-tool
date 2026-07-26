import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";
import { authkitProxy } from "@workos-inc/authkit-nextjs";
import { devAuthEnabled } from "@/lib/auth/dev";

// Next.js 16 renamed `middleware` → `proxy` (nodejs runtime). AuthKit's proxy
// refreshes the session cookie and, with middlewareAuth enabled, redirects
// unauthenticated requests to WorkOS sign-in — except for the public paths.
const authProxy = authkitProxy({
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: [
      "/",
      "/callback",
      "/sign-in",
      "/sign-up",
      "/sign-out",
      "/access-denied",
    ],
  },
});

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  // In dev-login mode WorkOS is fully bypassed; route guards live in the app
  // layout (requireAuthContext → /dev-login).
  if (devAuthEnabled()) return NextResponse.next();
  return authProxy(req, event);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?|ico)$).*)",
  ],
};
