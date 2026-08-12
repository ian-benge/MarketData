/**
 * Opt-in read-only market-data smoke.
 * Never runs in CI by default — requires live keys and MARKET_DATA_SMOKE=1.
 *
 * Usage:
 *   MARKET_DATA_SMOKE=1 npx tsx scripts/market-data-smoke.ts
 *   npm run test:market-smoke
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getEnv, resetEnvCache } from "../src/lib/env";
import { createMarketDataRouter } from "../src/lib/market-data/router";
import { buildUniverse } from "../src/lib/market-data/universe";
import { latencyCoverageLabel } from "../src/lib/market-data/schemas";

function loadEnvFile(filename: string): void {
  const path = resolve(process.cwd(), filename);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let raw = trimmed.slice(eq + 1).trim();
    if (
      (raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'"))
    ) {
      raw = raw.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = raw;
  }
}

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");
  resetEnvCache();

  if (process.env.MARKET_DATA_SMOKE !== "1") {
    console.log(
      "Skipping market-data smoke (set MARKET_DATA_SMOKE=1 to enable). Never enabled in CI default.",
    );
    process.exit(0);
  }

  const env = getEnv();
  const hasAlpaca = Boolean(env.ALPACA_DATA_KEY_ID && env.ALPACA_DATA_SECRET_KEY);
  const hasMassive = Boolean(env.MASSIVE_API_KEY);
  if (!hasAlpaca && !hasMassive && !env.FINNHUB_API_KEY) {
    console.log("No market-data API keys present — nothing to smoke.");
    process.exit(0);
  }

  const router = createMarketDataRouter(env);
  if (!router) {
    console.error("Router unavailable despite keys");
    process.exit(1);
  }

  const universe = buildUniverse({
    maxSize: Math.min(5, env.MARKET_DATA_MAX_UNIVERSE_SIZE),
  });
  console.log("Universe sample:", universe.symbols.join(", "));

  const quotes = await router.fetchQuotes({
    symbols: universe.symbols,
    surface: "dashboard_display",
  });

  const label = latencyCoverageLabel({
    feedCoverage: quotes.feedCoverage,
    latencyClass: quotes.latencyClass,
  });
  console.log("Provider:", quotes.providerName);
  console.log("Feed/latency label:", label);
  console.log("Quotes received:", quotes.quotes.length);

  if (quotes.feedCoverage === "iex" && /SIP|full market|NBBO/i.test(label)) {
    console.error("FAIL: IEX must not be labeled as SIP/full market/NBBO");
    process.exit(1);
  }

  console.log("Smoke OK (read-only).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
