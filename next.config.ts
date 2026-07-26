import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle so the app can ship as a small Docker
  // image (enterprise/finance clients will want to run it in their own VPC).
  //
  // `output: "standalone"` changes the build output in a way Vercel's router
  // can't serve, which surfaces as a platform-level `404: NOT_FOUND` on every
  // route (static files still serve; all Next routes 404). Vercel builds and
  // serves Next natively, so we must NOT emit standalone there. It's only
  // needed for the Docker image, which opts in explicitly via BUILD_STANDALONE
  // (set in the Dockerfile). Default = off, so any host other than our Docker
  // build (Vercel, `next start`, etc.) gets normal output.
  output: process.env.BUILD_STANDALONE ? "standalone" : undefined,
};

export default nextConfig;
