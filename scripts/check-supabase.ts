/**
 * Connectivity check — no secret values printed.
 * Usage: npm run check:supabase
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  let hostOk = false;
  try {
    const host = new URL(url).hostname;
    hostOk = host.endsWith(".supabase.co") && !host.includes("supabase.com");
    console.log(`url_host: ${hostOk ? "ok" : "unexpected"}`);
  } catch {
    console.log("url_host: invalid");
  }

  const probe = await fetch(`${url.replace(/\/$/, "")}/rest/v1/firms?select=id&limit=1`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });
  console.log(`rest_probe_status: ${probe.status}`);

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tables = [
    "firms",
    "profiles",
    "team_memberships",
    "reports",
    "market_observations_latest",
    "provider_license_configs",
  ];

  let failed = false;
  for (const table of tables) {
    const { error, count } = await sb
      .from(table)
      .select("*", { count: "exact", head: true });
    if (error) {
      failed = true;
      console.log(
        `${table}: ERROR ${JSON.stringify({
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        })}`,
      );
    } else {
      console.log(`${table}: ok count=${count ?? 0}`);
    }
  }

  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
