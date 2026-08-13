import { nanoid } from "nanoid";
import {
  fixturesEnabled,
  handleRouteError,
  jsonError,
  jsonOk,
} from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { normalizeBookTitle } from "@/lib/positions/books";
import { canEditPositionBook, UNASSIGNED_OWNER_ID } from "@/lib/positions/owners";
import { PositionBookWriteSchema } from "@/lib/positions/schemas";
import { buildPositionsSnapshot } from "@/lib/positions/service";
import {
  insertStoredBook,
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

    const parsed = PositionBookWriteSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return jsonError("Invalid book", 400, {
        issues: parsed.error.issues.slice(0, 5),
      });
    }

    const ownerId = parsed.data.ownerId ?? user.id;
    if (ownerId === UNASSIGNED_OWNER_ID) {
      return jsonError("Unassigned lots cannot have named books.", 400);
    }
    if (!canEditPositionBook(user, ownerId)) {
      return jsonError("You can only add books to your own account.", 403);
    }

    const title = normalizeBookTitle(parsed.data.title);

    if (persistence === "fixtures" || fixturesEnabled()) {
      const book = {
        id: `book-${nanoid(10)}`,
        ownerId,
        title,
        accountValue: null as number | null,
        openCount: 0,
        positionCount: 0,
      };
      return jsonOk({ demo: true, book });
    }

    const stored = await insertStoredBook(user, ownerId, title);
    const snapshot = await buildPositionsSnapshot({
      user,
      includeClosed: true,
      ownerId,
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
