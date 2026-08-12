/**
 * Safe environment presence check — never prints secret values.
 *
 * Usage: npm run check:env
 * Exit 0 if schema parses; prints present | missing | invalid_format per key.
 * Loads .env.local via process.env only (Next/tsx does not auto-load;
 * set vars in the shell or use dotenv if you prefer — we intentionally
 * read process.env after optional local load below).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { envSchema, resetEnvCache } from "../src/lib/env";

const SECRET_HINTS = [
  "KEY",
  "SECRET",
  "TOKEN",
  "PASSWORD",
  "SERVICE_ROLE",
];

function isSecretKey(key: string): boolean {
  const upper = key.toUpperCase();
  if (upper.startsWith("NEXT_PUBLIC_")) return false;
  return SECRET_HINTS.some((h) => upper.includes(h));
}

/** Minimal .env.local loader — does not log values. */
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
    if (process.env[key] === undefined) {
      process.env[key] = raw;
    }
  }
}

type Status = "present" | "missing" | "invalid_format" | "defaulted";

function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");
  resetEnvCache();

  const shape = envSchema.shape;
  const keys = Object.keys(shape).sort();
  const rows: Array<{ key: string; status: Status; secret: boolean }> = [];

  let invalid = 0;
  for (const key of keys) {
    const raw = process.env[key];
    const secret = isSecretKey(key);
    const field = shape[key as keyof typeof shape];
    if (raw === undefined || raw === "") {
      // Try parse with only defaults — see if optional/defaulted
      const alone = field.safeParse(undefined);
      if (alone.success) {
        rows.push({ key, status: "defaulted", secret });
      } else {
        rows.push({ key, status: "missing", secret });
      }
      continue;
    }
    const parsed = field.safeParse(raw);
    if (!parsed.success) {
      rows.push({ key, status: "invalid_format", secret });
      invalid += 1;
    } else {
      rows.push({ key, status: "present", secret });
    }
  }

  const full = envSchema.safeParse(process.env);
  console.log("Environment check (values never printed)");
  console.log("────────────────────────────────────────");
  for (const row of rows) {
    const tag = row.secret ? "secret" : "public/config";
    console.log(`${row.key.padEnd(36)} ${row.status.padEnd(16)} (${tag})`);
  }
  console.log("────────────────────────────────────────");
  console.log(
    full.success
      ? "Schema parse: OK"
      : `Schema parse: FAIL — ${full.error.issues.length} issue(s)`,
  );

  // Production readiness hints (no values)
  const nodeEnv = process.env.NODE_ENV ?? "development";
  if (nodeEnv === "production") {
    const mocks = process.env.ALLOW_MOCK_PROVIDERS;
    const demo = process.env.DEMO_MODE;
    if (mocks === "true" || mocks === "1") {
      console.log("WARN: ALLOW_MOCK_PROVIDERS is enabled in production");
    }
    if (demo === "true" || demo === "1") {
      console.log("WARN: DEMO_MODE is enabled in production");
    }
    if (!process.env.CRON_SECRET) {
      console.log("WARN: CRON_SECRET missing (cron routes will reject)");
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.log("WARN: NEXT_PUBLIC_SUPABASE_URL missing");
    }
  }

  if (!full.success || invalid > 0) {
    process.exit(1);
  }
}

main();
