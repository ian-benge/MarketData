import {
  handleRouteError,
  jsonError,
  jsonOk,
  fixturesEnabled,
} from "@/lib/api/http";
import { assertAdmin } from "@/lib/auth/authorize";
import {
  CreateTeamUserSchema,
  createTeamMember,
  listTeamMembers,
} from "@/lib/auth/team";
import { canCreateAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const user = await assertAdmin();
    const members = await listTeamMembers(user);
    return jsonOk({ members });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await assertAdmin();
    if (!fixturesEnabled() && !user.isDemo && !canCreateAdminClient()) {
      return jsonError(
        "User persistence is not connected in this environment.",
        503,
      );
    }
    const parsed = CreateTeamUserSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return jsonError(issue?.message ?? "Invalid user", 400);
    }
    const result = await createTeamMember(user, parsed.data);
    return jsonOk(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
