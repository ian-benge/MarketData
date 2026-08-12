import { cookies } from "next/headers";
import type { UserRole } from "@/lib/domain/permissions";
import {
  DEMO_ROLE_COOKIE,
  isDemoAuthEnabled,
  parseDemoRole,
} from "@/lib/auth/demo";
import { getEnv } from "@/lib/env";
import {
  canCreateServerClient,
  createClient,
} from "@/lib/supabase/server";

export type SessionUser = {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  firmId: string | null;
  isDemo: boolean;
};

const DEMO_FIRM_ID = "a0000000-0000-4000-8000-000000000001";

export async function getSessionUser(): Promise<SessionUser | null> {
  const env = getEnv();

  if (canCreateServerClient()) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;

      const { data: membership } = await supabase
        .from("team_memberships")
        .select("role, firm_id, is_active")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (!membership) return null;

      const { data: profile } = await supabase
        .from("profiles")
        .select("email, display_name")
        .eq("id", user.id)
        .maybeSingle();

      return {
        id: user.id,
        email: profile?.email ?? user.email ?? "",
        displayName: profile?.display_name ?? null,
        role: membership.role as UserRole,
        firmId: membership.firm_id as string,
        isDemo: false,
      };
    } catch {
      // Fall through to demo when Supabase misconfigured locally.
    }
  }

  if (isDemoAuthEnabled(env)) {
    const cookieStore = await cookies();
    const role = parseDemoRole(cookieStore.get(DEMO_ROLE_COOKIE)?.value);
    if (!role) return null;
    return {
      id: `demo-${role}`,
      email: role === "admin" ? "admin@demo.local" : "member@demo.local",
      displayName: role === "admin" ? "Demo Admin" : "Demo Member",
      role,
      firmId: DEMO_FIRM_ID,
      isDemo: true,
    };
  }

  return null;
}

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new AuthError("Unauthorized", 401);
  }
  return user;
}

export class AuthError extends Error {
  readonly status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}
