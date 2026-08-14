import { z } from "zod";
import { nanoid } from "nanoid";
import { isDemoAuthEnabled } from "@/lib/auth/demo";
import type { SessionUser } from "@/lib/auth/session";
import type { UserRole } from "@/lib/domain/permissions";
import { fixtureAdmin } from "@/lib/fixtures/admin";
import {
  canCreateAdminClient,
  createAdminClient,
} from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { TeamMember } from "./team-types";
import { TeamAccessError } from "./team-error";

export type { TeamMember } from "./team-types";
export { TeamAccessError } from "./team-error";

export const CreateTeamUserSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  displayName: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((value) => (value ? value : undefined)),
  role: z.enum(["admin", "member"]).default("member"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(72, "Password must be 72 characters or fewer."),
});

export type CreateTeamUserInput = z.infer<typeof CreateTeamUserSchema>;

export type CreateTeamMemberResult = {
  member: TeamMember;
  created: boolean;
  demo: boolean;
};

function asRole(value: string | null | undefined): UserRole {
  return value === "admin" ? "admin" : "member";
}

export async function listTeamMembers(user: SessionUser): Promise<TeamMember[]> {
  if (isDemoAuthEnabled() || user.isDemo) {
    return fixtureAdmin.team.map((member) => ({
      id: member.id,
      email: member.email,
      displayName: member.displayName,
      role: member.role,
      isActive: member.isActive,
    }));
  }
  if (!user.firmId) return [];

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("team_memberships")
      .select("user_id, role, is_active, profiles(email, display_name)")
      .eq("firm_id", user.firmId)
      .order("created_at", { ascending: true });
    if (error || !data) return [];
    const members: TeamMember[] = [];
    for (const row of data as Array<{
      user_id: string;
      role: string;
      is_active: boolean;
      profiles:
        | { email?: string; display_name?: string | null }
        | Array<{ email?: string; display_name?: string | null }>
        | null;
    }>) {
      const profile = Array.isArray(row.profiles)
        ? row.profiles[0]
        : row.profiles;
      members.push({
        id: row.user_id,
        email: profile?.email ?? "",
        displayName: profile?.display_name ?? null,
        role: asRole(row.role),
        isActive: row.is_active,
      });
    }
    return members;
  } catch {
    return [];
  }
}

async function findAuthUserIdByEmail(
  email: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .limit(1)
    .maybeSingle();
  if (profile?.id) return profile.id as string;

  for (let page = 1; page <= 10; page += 1) {
    const { data: listed, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) {
      throw new TeamAccessError("Unable to look up that email.", 500);
    }
    const match = listed.users.find(
      (entry) => entry.email?.toLowerCase() === email,
    );
    if (match) return match.id;
    if (listed.users.length < 200) return null;
  }
  return null;
}

async function upsertProfile(
  userId: string,
  email: string,
  displayName: string | null,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").upsert(
    {
      id: userId,
      email,
      display_name: displayName,
    },
    { onConflict: "id" },
  );
  if (error) {
    throw new TeamAccessError("Unable to save the user profile.", 500);
  }
}

async function upsertMembership(
  firmId: string,
  userId: string,
  role: UserRole,
): Promise<{ created: boolean }> {
  const admin = createAdminClient();
  const { data: existing, error: lookupError } = await admin
    .from("team_memberships")
    .select("id, role, is_active")
    .eq("firm_id", firmId)
    .eq("user_id", userId)
    .maybeSingle();
  if (lookupError) {
    throw new TeamAccessError("Unable to check desk membership.", 500);
  }
  if (existing?.is_active) {
    throw new TeamAccessError("That email is already on this desk.", 409);
  }
  if (existing) {
    const { error } = await admin
      .from("team_memberships")
      .update({ role, is_active: true })
      .eq("id", existing.id);
    if (error) {
      throw new TeamAccessError("Unable to restore that user's access.", 500);
    }
    return { created: false };
  }
  const { error } = await admin.from("team_memberships").insert({
    firm_id: firmId,
    user_id: userId,
    role,
    is_active: true,
  });
  if (error) {
    throw new TeamAccessError("Unable to add that user to the desk.", 500);
  }
  return { created: true };
}

async function recordAudit(
  actor: SessionUser,
  member: TeamMember,
  created: boolean,
): Promise<void> {
  if (!actor.firmId) return;
  try {
    const admin = createAdminClient();
    await admin.from("audit_logs").insert({
      firm_id: actor.firmId,
      actor_user_id: actor.id,
      action: created ? "user.created" : "user.added",
      entity_type: "profile",
      entity_id: member.id,
      metadata: {
        email: member.email,
        role: member.role,
      },
    });
  } catch {
    /* user write already succeeded */
  }
}

export async function createTeamMember(
  actor: SessionUser,
  input: CreateTeamUserInput,
): Promise<CreateTeamMemberResult> {
  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName?.trim() || null;
  const role = input.role;

  if (isDemoAuthEnabled() || actor.isDemo) {
    return {
      member: {
        id: `demo-user-${nanoid(8)}`,
        email,
        displayName,
        role,
        isActive: true,
      },
      created: true,
      demo: true,
    };
  }

  if (!actor.firmId) {
    throw new TeamAccessError("No firm is associated with this session.", 400);
  }
  if (!canCreateAdminClient()) {
    throw new TeamAccessError(
      "User persistence is not connected in this environment.",
      503,
    );
  }

  const admin = createAdminClient();
  let userId: string | null = null;
  let createdAuthUser = false;

  const created = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: displayName ? { display_name: displayName } : undefined,
  });

  if (created.data.user?.id) {
    userId = created.data.user.id;
    createdAuthUser = true;
  } else {
    const message = created.error?.message ?? "";
    const already =
      /already been registered|already exists|duplicate/i.test(message);
    if (!already) {
      throw new TeamAccessError(
        created.error?.message || "Unable to create that user.",
        400,
      );
    }
    userId = await findAuthUserIdByEmail(email);
    if (!userId) {
      throw new TeamAccessError("That email already exists, but could not be linked.", 409);
    }
  }

  await upsertProfile(userId, email, displayName);
  const membership = await upsertMembership(actor.firmId, userId, role);
  const member: TeamMember = {
    id: userId,
    email,
    displayName,
    role,
    isActive: true,
  };
  await recordAudit(actor, member, createdAuthUser && membership.created);
  return {
    member,
    created: createdAuthUser,
    demo: false,
  };
}
