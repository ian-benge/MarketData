import { nanoid } from "nanoid";
import {
  fixturesEnabled,
  handleRouteError,
  jsonError,
  jsonOk,
} from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { PositionCloseError } from "@/lib/positions/close";
import { PositionCloseSchema } from "@/lib/positions/schemas";
import { buildPositionsSnapshot } from "@/lib/positions/service";
import {
  closeStoredPosition,
  resolvePersistenceMode,
} from "@/lib/positions/store";
import {
  preparePositionAlert,
  schedulePositionAlert,
} from "@/lib/positions/alerts";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("editPositions");
    const { id } = await context.params;
    if (!id) return jsonError("Position id required", 400);

    const persistence = resolvePersistenceMode(user);
    if (persistence === "unavailable") {
      return jsonError(
        "Position persistence is not connected in this environment.",
        503,
      );
    }

    const parsed = PositionCloseSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return jsonError("Invalid close request", 400, {
        issues: parsed.error.issues.slice(0, 5),
      });
    }

    const closeDate =
      parsed.data.closeDate ?? new Date().toISOString().slice(0, 10);
    const notes =
      parsed.data.notes === undefined
        ? undefined
        : parsed.data.notes?.trim()
          ? parsed.data.notes.trim()
          : null;

    if (persistence === "fixtures" || fixturesEnabled()) {
      return jsonOk({
        demo: true,
        id,
        closePrice: parsed.data.closePrice,
        closeDate,
        quantity: parsed.data.quantity ?? null,
        closedLotId: `pos-${nanoid(10)}`,
        closedAt: new Date().toISOString(),
        notes,
      });
    }

    const result = await closeStoredPosition(user, id, {
      closePrice: parsed.data.closePrice,
      closeDate,
      quantity: parsed.data.quantity,
      notes,
    });
    const snapshot = await buildPositionsSnapshot({
      user,
      includeClosed: true,
      ownerId: result.closed.createdBy,
      bookId: result.closed.bookId,
    });
    schedulePositionAlert(
      preparePositionAlert(user, "closed", result.closed, {
        partial: Boolean(result.remaining),
        bookTitle: snapshot.books.find(
          (book) => book.id === result.closed.bookId,
        )?.title,
      }),
    );
    return jsonOk({
      position: result.remaining ?? result.closed,
      remaining: result.remaining,
      closed: result.closed,
      snapshot,
      demo: false,
    });
  } catch (error) {
    if (error instanceof PositionCloseError) {
      return jsonError(error.message, error.status);
    }
    return handleRouteError(error);
  }
}
