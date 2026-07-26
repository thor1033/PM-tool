import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle so the app can ship as a small Docker
  // image (enterprise/finance clients will want to run it in their own VPC).
  output: "standalone",
};

export default nextConfig;
