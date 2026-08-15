/**
 * One-shot proof that persistNewsItems can write to hosted market_news_items.
 * Loads .env.local, upserts a tagged canary row, prints the result, then deletes it.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resetEnvCache } from "../src/lib/env";
import { persistNewsItems } from "../src/lib/intelligence/store";
import { canCreateAdminClient, createAdminClient } from "../src/lib/supabase/admin";
import type { NormalizedNewsItem } from "../src/lib/providers/types";

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
  resetEnvCache();

  const flags = {
    DEMO_MODE: process.env.DEMO_MODE ?? "",
    ALLOW_MOCK_PROVIDERS: process.env.ALLOW_MOCK_PROVIDERS ?? "",
    FINNHUB: Boolean(process.env.FINNHUB_API_KEY),
    MASSIVE: Boolean(process.env.MASSIVE_API_KEY),
    adminClient: canCreateAdminClient(),
  };
  console.log("env_presence", flags);

  if (!flags.adminClient) {
    console.log("persist", { skipped: "no_admin_client" });
    process.exitCode = 2;
    return;
  }

  const item: NormalizedNewsItem = {
    id: `canary-persist-${Date.now()}`,
    title: "CANARY persist proof — not a market headline",
    url: "https://demo.news.local/canary-persist",
    publishedAt: new Date().toISOString(),
    retrievedAt: new Date().toISOString(),
    tickers: ["SPY"],
    sourceClass: "wire",
    providerName: "canary-test",
    sourceQuality: "mock",
    coverageNotes: "Temporary persist proof. Safe to delete.",
  };

  const result = await persistNewsItems([item]);
  console.log("persist", result);

  const supabase = createAdminClient();
  const { count, error: countError } = await supabase
    .from("market_news_items")
    .select("external_id", { count: "exact", head: true })
    .eq("provider_name", "canary-test");
  console.log("canary_count", { count, error: countError?.message ?? null });

  const { error: deleteError } = await supabase
    .from("market_news_items")
    .delete()
    .eq("provider_name", "canary-test");
  console.log("cleanup", { error: deleteError?.message ?? null });

  if (result.error || result.written < 1) process.exitCode = 1;
}

void main();
