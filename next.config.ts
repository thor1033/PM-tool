import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle so the app can ship as a small Docker
  // image (enterprise/finance clients will want to run it in their own VPC).
  //
  // NOT on Vercel: `output: "standalone"` changes the build output in a way
  // Vercel's router can't serve, which surfaces as a platform-level
  // `404: NOT_FOUND` on every route. Vercel builds and serves Next natively, so
  // we only opt into standalone off-Vercel (Docker). `VERCEL` is set during
  // Vercel builds.
  output: process.env.VERCEL ? undefined : "standalone",
};

export default nextConfig;
