import {
  fixturesEnabled,
  handleRouteError,
  jsonError,
  jsonOk,
} from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { canEditPositionBook, UNASSIGNED_OWNER_ID } from "@/lib/positions/owners";
import { PositionBookReorderSchema } from "@/lib/positions/schemas";
import { buildPositionsSnapshot } from "@/lib/positions/service";
import {
  reorderStoredBooks,
  resolvePersistenceMode,
} from "@/lib/positions/store";

export async function POST(request: Request) {
  try {
    const user = await requirePermission("editPositions");
    const persistence = resolvePersistenceMode(user);
    if (persistence === "unavailable") {
      return jsonError(
        "Position persistence is not connected in this environment.",
        503,
      );
    }

    const parsed = PositionBookReorderSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return jsonError("Invalid book order", 400, {
        issues: parsed.error.issues.slice(0, 5),
      });
    }

    const ownerId = parsed.data.ownerId ?? user.id;
    if (ownerId === UNASSIGNED_OWNER_ID) {
      return jsonError("Unassigned lots cannot have named books.", 400);
    }
    if (!canEditPositionBook(user, ownerId)) {
      return jsonError("You can only reorder your own books.", 403);
    }

    if (persistence === "fixtures" || fixturesEnabled()) {
      return jsonOk({ demo: true, bookIds: parsed.data.bookIds });
    }

    await reorderStoredBooks(user, ownerId, parsed.data.bookIds);
    const snapshot = await buildPositionsSnapshot({
      user,
      includeClosed: true,
      ownerId,
      bookId: parsed.data.bookId,
    });
    return jsonOk({ snapshot, demo: false });
  } catch (error) {
    return handleRouteError(error);
  }
}
