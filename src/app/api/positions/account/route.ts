import {
  fixturesEnabled,
  handleRouteError,
  jsonError,
  jsonOk,
} from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { canEditPositionBook } from "@/lib/positions/owners";
import { PositionAccountValueSchema } from "@/lib/positions/schemas";
import { buildPositionsSnapshot } from "@/lib/positions/service";
import {
  resolvePersistenceMode,
  upsertStoredAccountValue,
} from "@/lib/positions/store";

export async function PUT(request: Request) {
  try {
    const user = await requirePermission("editPositions");
    const persistence = resolvePersistenceMode(user);
    if (persistence === "unavailable") {
      return jsonError(
        "Position persistence is not connected in this environment.",
        503,
      );
    }

    const parsed = PositionAccountValueSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return jsonError("Invalid account value", 400, {
        issues: parsed.error.issues.slice(0, 5),
      });
    }

    const ownerId = parsed.data.ownerId ?? user.id;
    const bookId = parsed.data.bookId;
    if (!canEditPositionBook(user, ownerId)) {
      return jsonError("You can only edit account value on your own book.", 403);
    }
    if (!bookId) {
      return jsonError("Book id required", 400);
    }

    if (persistence === "fixtures" || fixturesEnabled()) {
      const snapshot = await buildPositionsSnapshot({
        user,
        includeClosed: true,
        ownerId,
        bookId,
        accountValue: parsed.data.accountValue,
      });
      return jsonOk({
        demo: true,
        accountValue: parsed.data.accountValue,
        snapshot: {
          ...snapshot,
          accountValue: parsed.data.accountValue,
          bookId,
          books: snapshot.books.map((book) =>
            book.id === bookId
              ? { ...book, accountValue: parsed.data.accountValue }
              : book,
          ),
          summary: {
            ...snapshot.summary,
            accountValue: parsed.data.accountValue,
          },
        },
      });
    }

    const accountValue = await upsertStoredAccountValue(
      user,
      bookId,
      parsed.data.accountValue,
    );
    const snapshot = await buildPositionsSnapshot({
      user,
      includeClosed: true,
      ownerId,
      bookId,
      accountValue,
    });
    return jsonOk({ accountValue, snapshot, demo: false });
  } catch (error) {
    return handleRouteError(error);
  }
}
