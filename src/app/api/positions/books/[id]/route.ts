import {
  fixturesEnabled,
  handleRouteError,
  jsonError,
  jsonOk,
} from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { normalizeBookTitle } from "@/lib/positions/books";
import { PositionBookPatchSchema } from "@/lib/positions/schemas";
import { buildPositionsSnapshot } from "@/lib/positions/service";
import {
  deleteStoredBook,
  renameStoredBook,
  resolvePersistenceMode,
} from "@/lib/positions/store";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("editPositions");
    const { id } = await context.params;
    if (!id) return jsonError("Book id required", 400);

    const persistence = resolvePersistenceMode(user);
    if (persistence === "unavailable") {
      return jsonError(
        "Position persistence is not connected in this environment.",
        503,
      );
    }

    const parsed = PositionBookPatchSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return jsonError("Invalid book update", 400, {
        issues: parsed.error.issues.slice(0, 5),
      });
    }

    const title = normalizeBookTitle(parsed.data.title);

    if (persistence === "fixtures" || fixturesEnabled()) {
      return jsonOk({
        demo: true,
        id,
        title,
      });
    }

    const stored = await renameStoredBook(user, id, title);
    const snapshot = await buildPositionsSnapshot({
      user,
      includeClosed: true,
      ownerId: stored.ownerId,
      bookId: stored.id,
    });
    return jsonOk({
      book: {
        id: stored.id,
        ownerId: stored.ownerId,
        title: stored.title,
        accountValue: stored.accountValue,
        openCount: 0,
        positionCount: 0,
      },
      snapshot,
      demo: false,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("editPositions");
    const { id } = await context.params;
    if (!id) return jsonError("Book id required", 400);

    const persistence = resolvePersistenceMode(user);
    if (persistence === "unavailable") {
      return jsonError(
        "Position persistence is not connected in this environment.",
        503,
      );
    }

    if (persistence === "fixtures" || fixturesEnabled()) {
      return jsonOk({ demo: true, id });
    }

    const { ownerId } = await deleteStoredBook(user, id);
    const snapshot = await buildPositionsSnapshot({
      user,
      includeClosed: true,
      ownerId,
    });
    return jsonOk({ demo: false, snapshot });
  } catch (error) {
    return handleRouteError(error);
  }
}
