import type { UserRole } from "@/lib/domain/permissions";
import { getEnv } from "@/lib/env";

export const DEMO_ROLE_COOKIE = "demo_role";

export function isDemoAuthEnabled(
  env = getEnv(),
): boolean {
  if (env.NODE_ENV === "production") return false;
  const supabaseConfigured = Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  if (supabaseConfigured) return false;
  return env.DEMO_MODE === true || env.ALLOW_MOCK_PROVIDERS === true;
}

export function parseDemoRole(value: string | undefined | null): UserRole | null {
  if (value === "admin" || value === "member") return value;
  return null;
}
