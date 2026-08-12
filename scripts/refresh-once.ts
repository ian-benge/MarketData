/**
 * One-shot refresh diagnostic. Prints status only — no secrets.
 * Usage: npx tsx scripts/refresh-once.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getEnv, resetEnvCache } from "../src/lib/env";
import { runMarketDataRefresh } from "../src/lib/market-data/refresh-service";
import { getMarketDataCache } from "../src/lib/market-data/cache";

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
  resetEnvCache();
  const env = getEnv();
  console.log("primary", env.MARKET_DATA_PRIMARY);
  console.log("hasAlpaca", Boolean(env.ALPACA_DATA_KEY_ID && env.ALPACA_DATA_SECRET_KEY));
  const result = await runMarketDataRefresh({ env, force: true });
  console.log("status", result.status);
  console.log("requested", result.symbolsRequested);
  console.log("received", result.symbolsReceived);
  console.log("provider", result.providerName);
  console.log("feed", result.feedCoverage);
  console.log("session", result.session);
  console.log("error", result.errorMessage);
  console.log("skipped", result.skippedReason);
  const snap = getMarketDataCache(env).getDashboardSnapshot();
  console.log("cacheTape", snap?.tape.length ?? 0);
  console.log("cacheLabel", snap?.latencyCoverageLabel ?? null);
}

main().catch((err) => {
  console.error("refresh_threw", err instanceof Error ? err.message : err);
  process.exit(1);
});
