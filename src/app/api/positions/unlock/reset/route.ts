import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { bumpOwnerUnlockEpoch } from "@/lib/positions/owner-unlock";
import { OwnerUnlockResetSchema } from "@/lib/positions/schemas";

export async function POST(request: Request) {
  try {
    const user = await requirePermission("viewDashboard");
    const parsed = OwnerUnlockResetSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return jsonError("Choose whether to lock your book or reset the desk.", 400);
    }

    const { scope } = parsed.data;
    if (scope === "desk" && user.role !== "admin") {
      return jsonError("Only admins can reset every teammate unlock.", 403);
    }

    const epoch = await bumpOwnerUnlockEpoch(user, scope);
    return jsonOk({
      ok: true,
      scope,
      epoch,
      demo: user.isDemo,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
