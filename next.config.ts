import path from "node:path";
import type { NextConfig } from "next";

const harnessTurbopackRoot = process.env.HARNESS_TURBOPACK_ROOT?.trim();

const nextConfig: NextConfig = {
  // Keep Playwright's dev server isolated from an already-running local server.
  distDir: process.env.E2E_DIST_DIR || ".next",
  devIndicators: false,
  // Worktree isolation junctions node_modules to the parent repo. Turbopack
  // rejects that link unless root covers both the worktree and the real install.
  ...(harnessTurbopackRoot
    ? { turbopack: { root: path.resolve(harnessTurbopackRoot) } }
    : {}),
};

export default nextConfig;
