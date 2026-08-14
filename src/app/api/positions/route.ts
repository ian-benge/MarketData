import { nanoid } from "nanoid";
import {
  fixturesEnabled,
  handleRouteError,
  jsonError,
  jsonOk,
} from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { buildPositionsSnapshot } from "@/lib/positions/service";
import {
  canEditPositionBook,
  UNASSIGNED_OWNER_ID,
} from "@/lib/positions/owners";
import {
  PositionWriteSchema,
  resolveMultiplier,
} from "@/lib/positions/schemas";
import {
  buildSessionPosition,
  insertStoredPosition,
  resolvePersistenceMode,
} from "@/lib/positions/store";
import {
  preparePositionAlert,
  schedulePositionAlert,
} from "@/lib/positions/alerts";

export async function GET(request: Request) {
  try {
    const user = await requirePermission("viewDashboard");
    const url = new URL(request.url);
    const includeClosed = url.searchParams.get("includeClosed") === "1";
    const includeHistory = url.searchParams.get("includeHistory") === "1";
    const ownerId = url.searchParams.get("owner") ?? undefined;
    const bookId = url.searchParams.get("book") ?? undefined;
    const snapshot = await buildPositionsSnapshot({
      user,
      includeClosed,
      includeHistory,
      ownerId,
      bookId,
    });
    return jsonOk(snapshot);
  } catch (error) {
    return handleRouteError(error);
  }
}

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
    const parsed = PositionWriteSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return jsonError("Invalid position", 400, {
        issues: parsed.error.issues.slice(0, 5),
      });
    }

    const {
      ownerId: requestedOwnerId,
      bookId: requestedBookId,
      confirmManualOnBrokerageBook,
      ...parsedInput
    } = parsed.data;
    const ownerId = requestedOwnerId ?? user.id;
    if (!canEditPositionBook(user, ownerId)) {
      return jsonError("You can only add positions to your own book.", 403);
    }

    const input = {
      ...parsedInput,
      multiplier: resolveMultiplier(parsedInput.assetType, parsedInput.multiplier),
      strategy: parsed.data.strategy?.trim() ? parsed.data.strategy.trim() : null,
      notes: parsed.data.notes?.trim() ? parsed.data.notes.trim() : null,
      currency: parsed.data.currency || "USD",
    };

    if (persistence === "fixtures" || fixturesEnabled()) {
      const position = buildSessionPosition(user, input, {
        id: `pos-${nanoid(10)}`,
        createdBy: ownerId === UNASSIGNED_OWNER_ID ? null : ownerId,
        bookId: requestedBookId ?? null,
      });
      return jsonOk({ position, demo: true, ownerId, bookId: requestedBookId ?? null });
    }

    const position = await insertStoredPosition(
      user,
      input,
      ownerId,
      requestedBookId,
      { confirmManualOnBrokerageBook },
    );
    const snapshot = await buildPositionsSnapshot({
      user,
      includeClosed: true,
      ownerId,
      bookId: position.bookId,
    });
    schedulePositionAlert(
      preparePositionAlert(user, "opened", position, {
        bookTitle: snapshot.books.find((book) => book.id === position.bookId)
          ?.title,
      }),
    );
    return jsonOk({ position, snapshot, demo: false });
  } catch (error) {
    return handleRouteError(error);
  }
}
