import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { UNASSIGNED_OWNER_ID } from "@/lib/positions/owners";
import {
  listUnlockedOwnerIds,
  persistOwnerUnlock,
  verifyOwnerUnlockSecret,
} from "@/lib/positions/owner-unlock";
import { OwnerUnlockSchema } from "@/lib/positions/schemas";
import { buildPositionsSnapshot } from "@/lib/positions/service";
import { listPositionOwners } from "@/lib/positions/store";
import {
  clearUnlockFailures,
  recordUnlockFailure,
  unlockAttemptsBlocked,
} from "@/lib/positions/unlock-rate-limit";

export async function POST(request: Request) {
  try {
    const user = await requirePermission("viewDashboard");
    const parsed = OwnerUnlockSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return jsonError("Owner and desk unlock secret are required.", 400);
    }

    const { ownerId, password } = parsed.data;
    if (ownerId === user.id) {
      const snapshot = await buildPositionsSnapshot({
        user,
        includeClosed: true,
        ownerId,
      });
      return jsonOk(snapshot);
    }
    if (ownerId === UNASSIGNED_OWNER_ID) {
      return jsonError("Unassigned lots cannot be unlocked with a secret.", 403);
    }

    const team = await listPositionOwners(user);
    const owner = team.find((member) => member.id === ownerId);
    if (!owner) {
      return jsonError("That teammate is not on this desk.", 404);
    }

    if (unlockAttemptsBlocked(user.id, ownerId)) {
      return jsonError("Too many unlock attempts. Try again later.", 429);
    }

    const accepted = verifyOwnerUnlockSecret(password);
    if (!accepted) {
      recordUnlockFailure(user.id, ownerId);
      return jsonError("Incorrect desk unlock secret.", 401);
    }

    clearUnlockFailures(user.id, ownerId);
    await persistOwnerUnlock(user, ownerId);
    const unlockedOwnerIds = await listUnlockedOwnerIds(user);
    unlockedOwnerIds.add(ownerId);
    const snapshot = await buildPositionsSnapshot({
      user,
      includeClosed: true,
      ownerId,
      unlockedOwnerIds,
    });
    return jsonOk(snapshot);
  } catch (error) {
    return handleRouteError(error);
  }
}
