/**
 * Live ingest + persist smoke (does not print secrets).
 * Forces DEMO_MODE/ALLOW_MOCK_PROVIDERS off so fixtures cannot masquerade as live.
 *
 * Usage: npx tsx scripts/news-live-ingest.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getEnv, resetEnvCache } from "../src/lib/env";
import { ingestMarketNews } from "../src/lib/intelligence/ingest";
import { persistNewsItems, searchStoredNews } from "../src/lib/intelligence/store";

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

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");
  process.env.DEMO_MODE = "false";
  process.env.ALLOW_MOCK_PROVIDERS = "false";
  resetEnvCache();
  const env = getEnv();

  console.log("live_flags", {
    DEMO_MODE: env.DEMO_MODE,
    ALLOW_MOCK_PROVIDERS: env.ALLOW_MOCK_PROVIDERS,
    FINNHUB: Boolean(env.FINNHUB_API_KEY),
    MASSIVE: Boolean(env.MASSIVE_API_KEY),
  });

  const ingested = await ingestMarketNews(env, {
    priorityTickers: ["NVDA", "AAPL", "MSFT", "IREN"],
  });
  console.log(
    "sources",
    ingested.sources.map((source) => ({
      id: source.id,
      status: source.status,
      itemCount: source.itemCount,
      note: source.note,
    })),
  );
  console.log(
    "gaps",
    ingested.gaps.map((gap) => ({ code: gap.code, message: gap.message })),
  );
  console.log("ingested_items", ingested.items.length);
  console.log(
    "sample_titles",
    ingested.items.slice(0, 3).map((item) => ({
      provider: item.providerName,
      tickers: item.tickers,
      title: item.title.slice(0, 120),
    })),
  );

  const persist = await persistNewsItems(ingested.items);
  console.log("persist", persist);

  const fts = persist.written > 0 ? await searchStoredNews("NVIDIA", 5) : [];
  console.log("fts_nvidia_hits", fts.length);
}

void main();
