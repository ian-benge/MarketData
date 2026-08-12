/**
 * One-time first-admin bootstrap (service role).
 *
 * Creates/finds the auth user for BOOTSTRAP_ADMIN_EMAIL, upserts profile,
 * and attaches an active admin membership to the Research Desk firm
 * (seed firm id, or FIRM_ID override).
 *
 * Safety:
 * - Never prints secrets or password material.
 * - Refuses NODE_ENV=production unless CONFIRM_BOOTSTRAP=YES.
 * - Does not enable public signup.
 *
 * Usage (Local / Preview only by default):
 *   npm run bootstrap:admin
 *
 * Production (explicit confirmation required):
 *   CONFIRM_BOOTSTRAP=YES npm run bootstrap:admin
 *
 * Enter secrets only via .env.local / Vercel — never paste into chat.
 */
import { createClient } from "@supabase/supabase-js";
import { getEnv, resetEnvCache } from "../src/lib/env";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/** Seed firm UUID from supabase/seed.sql */
const SEED_FIRM_ID = "a0000000-0000-4000-8000-000000000001";

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
  const env = getEnv();

  if (env.NODE_ENV === "production" && process.env.CONFIRM_BOOTSTRAP !== "YES") {
    console.error(
      "Refusing production bootstrap without CONFIRM_BOOTSTRAP=YES",
    );
    process.exit(1);
  }

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set in .env.local; do not paste here).",
    );
    process.exit(1);
  }
  if (!env.BOOTSTRAP_ADMIN_EMAIL) {
    console.error("Missing BOOTSTRAP_ADMIN_EMAIL");
    process.exit(1);
  }

  const firmId = env.FIRM_ID ?? SEED_FIRM_ID;
  const email = env.BOOTSTRAP_ADMIN_EMAIL.toLowerCase();

  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  console.log("Bootstrap admin (no secrets printed)");
  console.log(`  email: ${email.replace(/(.{2}).+(@.+)/, "$1…$2")}`);
  console.log(`  firmId: ${firmId}`);
  console.log(`  NODE_ENV: ${env.NODE_ENV}`);

  // Find existing user by email (list + filter; Admin API has no get-by-email in all versions)
  const { data: listed, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listErr) {
    console.error("listUsers failed:", listErr.message);
    process.exit(1);
  }

  let userId = listed.users.find((u) => u.email?.toLowerCase() === email)?.id;

  if (!userId) {
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        // Password unset — owner should use invite/recovery to set credentials.
        user_metadata: { bootstrap: true },
      });
    if (createErr || !created.user) {
      console.error(
        "createUser failed:",
        createErr?.message ?? "no user returned",
      );
      process.exit(1);
    }
    userId = created.user.id;
    console.log("  auth user: created");
  } else {
    console.log("  auth user: already existed");
  }

  const { error: profileErr } = await admin.from("profiles").upsert(
    {
      id: userId,
      email,
      display_name: "Bootstrap Admin",
    },
    { onConflict: "id" },
  );
  if (profileErr) {
    console.error("profiles upsert failed:", profileErr.message);
    process.exit(1);
  }
  console.log("  profile: upserted");

  const { data: existingMem } = await admin
    .from("team_memberships")
    .select("id, role, is_active")
    .eq("user_id", userId)
    .eq("firm_id", firmId)
    .maybeSingle();

  if (existingMem) {
    const { error: updErr } = await admin
      .from("team_memberships")
      .update({ role: "admin", is_active: true })
      .eq("id", existingMem.id);
    if (updErr) {
      console.error("membership update failed:", updErr.message);
      process.exit(1);
    }
    console.log("  membership: upgraded to admin");
  } else {
    const { error: insErr } = await admin.from("team_memberships").insert({
      user_id: userId,
      firm_id: firmId,
      role: "admin",
      is_active: true,
    });
    if (insErr) {
      console.error(
        "membership insert failed:",
        insErr.message,
        "(ensure seed.sql applied so the firm exists)",
      );
      process.exit(1);
    }
    console.log("  membership: created as admin");
  }

  console.log("Done. Set a password via Supabase Auth recovery/invite email.");
  console.log(
    "Then disable public signup in Supabase Auth → Providers → Email.",
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
