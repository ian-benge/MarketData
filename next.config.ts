import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Playwright's dev server isolated from an already-running local server.
  distDir: process.env.E2E_DIST_DIR || ".next",
  devIndicators: false,
};

export default nextConfig;
