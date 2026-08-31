import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a minimal, self-contained server bundle in .next/standalone
  // so the production Docker image doesn't need to ship node_modules or
  // the full source tree.
  output: "standalone",
};

export default nextConfig;