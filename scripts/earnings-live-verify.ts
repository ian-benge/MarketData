/**
 * Non-destructive earnings calendar verification.
 * Prints counts only — never keys, URLs, or raw provider bodies.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { getEnv, resetEnvCache } from "../src/lib/env";
import { fetchAlphaVantageEarningsCalendar } from "../src/lib/market-data/earnings/alpha-vantage";
import { fetchFinnhubEarningsCalendar } from "../src/lib/market-data/earnings/finnhub";
import { assembleEarningsSnapshot } from "../src/lib/market-data/earnings/service";
import {
  earningsCoverageWindow,
  earningsProviderFetchWindow,
  isDateInInclusiveWindow,
} from "../src/lib/market-data/earnings/window";

function loadEnvFile(filename: string): void {
  const path = resolve(process.cwd(), filename);
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
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

function redact(message: string): string {
  return message.replaceAll(/apikey=[^&\s"]+/gi, "apikey=redacted").slice(0, 200);
}

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");
  resetEnvCache();
  const env = getEnv();
  const now = new Date();
  const window = earningsCoverageWindow(now);
  const fetchWindow = earningsProviderFetchWindow(window);

  console.log("Earnings live verify (counts only, no secrets)");
  console.log(`  window: ${window.from} → ${window.to}`);
  console.log(`  FINNHUB configured: ${Boolean(env.FINNHUB_API_KEY)}`);
  console.log(`  ALPHA_VANTAGE configured: ${Boolean(env.ALPHA_VANTAGE_API_KEY)}`);

  let finnhubEvents: Awaited<ReturnType<typeof fetchFinnhubEarningsCalendar>>["events"] =
    [];
  let finnhubError: string | null = env.FINNHUB_API_KEY
    ? null
    : "FINNHUB_API_KEY is not set";
  let finnhubOk = false;
  let finnhubFetchedAt: string | null = null;
  let finnhubRaw = 0;

  if (env.FINNHUB_API_KEY) {
    try {
      const parsed = await fetchFinnhubEarningsCalendar({
        apiKey: env.FINNHUB_API_KEY,
        window: fetchWindow,
      });
      finnhubEvents = parsed.events;
      finnhubRaw = parsed.diagnostics.rawRows;
      finnhubOk = true;
      finnhubFetchedAt = new Date().toISOString();
      console.log(
        `  finnhub: raw=${parsed.diagnostics.rawRows} parsed=${parsed.diagnostics.parsed} emptySymbol=${parsed.diagnostics.emptySymbol} invalidDate=${parsed.diagnostics.invalidDate}`,
      );
    } catch (error) {
      finnhubError = redact(error instanceof Error ? error.message : "finnhub failed");
      console.log(`  finnhub: FAILED ${finnhubError}`);
    }
  }

  let avEvents: Awaited<ReturnType<typeof fetchAlphaVantageEarningsCalendar>>["events"] =
    [];
  let avError: string | null = env.ALPHA_VANTAGE_API_KEY
    ? null
    : "ALPHA_VANTAGE_API_KEY is not set";
  let avOk = false;
  let avFetchedAt: string | null = null;
  let avRaw = 0;

  if (env.ALPHA_VANTAGE_API_KEY) {
    try {
      const parsed = await fetchAlphaVantageEarningsCalendar({
        apiKey: env.ALPHA_VANTAGE_API_KEY,
      });
      avEvents = parsed.events;
      avRaw = parsed.diagnostics.rawRows;
      avOk = true;
      avFetchedAt = new Date().toISOString();
      console.log(
        `  alphaVantage: raw=${parsed.diagnostics.rawRows} parsed=${parsed.diagnostics.parsed} emptySymbol=${parsed.diagnostics.emptySymbol} invalidDate=${parsed.diagnostics.invalidDate}`,
      );
    } catch (error) {
      avError = redact(error instanceof Error ? error.message : "alpha vantage failed");
      console.log(`  alphaVantage: FAILED ${avError}`);
    }
  }

  const snapshot = assembleEarningsSnapshot({
    now,
    finnhub: {
      configured: Boolean(env.FINNHUB_API_KEY),
      ok: finnhubOk,
      stale: false,
      fetchedAt: finnhubFetchedAt,
      error: finnhubError,
      events: finnhubEvents,
    },
    alphaVantage: {
      configured: Boolean(env.ALPHA_VANTAGE_API_KEY),
      ok: avOk,
      stale: false,
      fetchedAt: avFetchedAt,
      error: avError,
      events: avEvents,
    },
    quotes: new Map(),
    impliedBySymbol: new Map(),
    optionsAttempted: new Set(),
  });

  const fhInWindow = finnhubEvents.filter((event) =>
    isDateInInclusiveWindow(event.reportDate, window.from, window.to),
  ).length;
  const avInWindow = avEvents.filter((event) =>
    isDateInInclusiveWindow(event.reportDate, window.from, window.to),
  ).length;
  const avOnlyVisible = snapshot.events.filter(
    (event) =>
      event.sources.includes("alphaVantage") && !event.sources.includes("finnhub"),
  ).length;
  const missingMove = snapshot.events.filter((event) => event.impliedMove == null).length;

  console.log(`  finnhub in-window: ${fhInWindow} (raw fetched ${finnhubRaw})`);
  console.log(`  alphaVantage in-window: ${avInWindow} (raw fetched ${avRaw})`);
  console.log(`  merge: ${JSON.stringify(snapshot.meta.merge)}`);
  console.log(`  visible API rows: ${snapshot.events.length}`);
  console.log(`  alphaVantage-only visible: ${avOnlyVisible}`);
  console.log(`  rows without expected move (quotes skipped): ${missingMove}`);
  console.log(`  usingFixtures: ${snapshot.meta.usingFixtures}`);
  console.log(`  serverRowsRemoved: ${snapshot.meta.filtering.serverRowsRemoved}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "verify failed");
  process.exit(1);
});
