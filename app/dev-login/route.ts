import { NextResponse, type NextRequest } from "next/server";
import { devAuthEnabled, DEV_COOKIE } from "@/lib/auth/dev";

// Dev-only: sets the dev session cookie and drops into the seeded workspace.
export async function GET(req: NextRequest) {
  if (!devAuthEnabled()) {
    return new NextResponse("Not found", { status: 404 });
  }
  const res = NextResponse.redirect(new URL("/projects", req.url));
  res.cookies.set(DEV_COOKIE, "demo", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
