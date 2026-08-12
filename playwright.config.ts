import { defineConfig, devices } from "@playwright/test";

const E2E_PORT = 3100;
const E2E_BASE_URL = `http://127.0.0.1:${E2E_PORT}`;
const USE_EXTERNAL_SERVER = process.env.PLAYWRIGHT_EXTERNAL_SERVER === "true";

/**
 * Demo e2e clears Supabase keys so cookie demo auth stays enabled.
 * Blank strings override `.env.local` (Next does not replace existing process.env).
 */
function demoWebServerEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value == null) continue;
    env[key] = value;
  }
  env.DEMO_MODE = "true";
  env.ALLOW_MOCK_PROVIDERS = "true";
  env.NODE_ENV = "development";
  env.NEXT_PUBLIC_APP_URL = E2E_BASE_URL;
  env.E2E_DIST_DIR = ".next-e2e";
  env.NEXT_PUBLIC_SUPABASE_URL = "";
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
  env.SUPABASE_SERVICE_ROLE_KEY = "";
  return env;
}

export default defineConfig({
  testDir: "./e2e",
  // Next dev compiles routes on demand; serial browser work avoids a first-run
  // compile storm on constrained local/CI machines.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: E2E_BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "installed-chrome",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
      },
    },
  ],
  webServer: USE_EXTERNAL_SERVER
    ? undefined
    : {
        // Invoke Next directly so Windows can reliably terminate the process tree.
        command: `node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port ${E2E_PORT}`,
        url: `${E2E_BASE_URL}/login`,
        reuseExistingServer: false,
        timeout: 180_000,
        env: demoWebServerEnv(),
      },
});
