/**
 * Local seed helper for demo / bootstrap notes.
 *
 * Database seed lives in `supabase/seed.sql` (apply via `supabase db reset`
 * or `psql … -f supabase/seed.sql`). This script does not require Supabase
 * when DEMO_MODE is on — it prints the checklist for a clean local desk.
 */
import { getEnv, resetEnvCache } from "../src/lib/env";

async function main() {
  resetEnvCache();
  const env = getEnv();

  console.log("IB Market Data local seed helper");
  console.log("─────────────────────");
  console.log(`NODE_ENV=${env.NODE_ENV}`);
  console.log(`DEMO_MODE=${env.DEMO_MODE}`);
  console.log(`ALLOW_MOCK_PROVIDERS=${env.ALLOW_MOCK_PROVIDERS}`);
  console.log("");
  console.log("1. Copy .env.example → .env.local");
  console.log("2. For DB: supabase start && supabase db reset");
  console.log("3. Bootstrap admin with BOOTSTRAP_ADMIN_EMAIL + service role");
  console.log("4. Or use /login demo buttons when Supabase is unset");
  console.log("");
  console.log("Provider keys present (booleans only):");
  console.log(
    `  ALPACA: ${Boolean(env.ALPACA_DATA_KEY_ID && env.ALPACA_DATA_SECRET_KEY)}`,
  );
  console.log(`  MASSIVE: ${Boolean(env.MASSIVE_API_KEY)}`);
  console.log(`  FINNHUB: ${Boolean(env.FINNHUB_API_KEY)}`);
  console.log(`  ALPHA_VANTAGE: ${Boolean(env.ALPHA_VANTAGE_API_KEY)}`);
  console.log(`  FRED: ${Boolean(env.FRED_API_KEY)}`);
  console.log(`  RSS: ${Boolean(env.NEWS_RSS_FEEDS)}`);
  console.log(`  RESEND: ${Boolean(env.RESEND_API_KEY)}`);
  console.log(
    `  AI: ${Boolean(env.ANTHROPIC_API_KEY || env.GOOGLE_GENERATIVE_AI_API_KEY || env.AI_GATEWAY_API_KEY)}`,
  );
  console.log("");
  console.log("Ops scripts: npm run check:env · npm run bootstrap:admin");
  console.log("Guide: docs/MANUAL_BACKEND_SETUP.md");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
