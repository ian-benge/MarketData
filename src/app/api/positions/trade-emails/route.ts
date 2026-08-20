import {
  fixturesEnabled,
  handleRouteError,
  jsonError,
  jsonOk,
} from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { PositionBookError } from "@/lib/positions/books";
import { canEditPositionBook, UNASSIGNED_OWNER_ID } from "@/lib/positions/owners";
import { PositionTradeEmailsSchema } from "@/lib/positions/schemas";
import { buildPositionsSnapshot } from "@/lib/positions/service";
import { resolvePersistenceMode } from "@/lib/positions/store";
import { setViewerTradeEmails } from "@/lib/positions/trade-emails";

export async function PATCH(request: Request) {
  try {
    const user = await requirePermission("editPositions");
    const persistence = resolvePersistenceMode(user);
    if (persistence === "unavailable") {
      return jsonError(
        "Position persistence is not connected in this environment.",
        503,
      );
    }

    const parsed = PositionTradeEmailsSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return jsonError("Invalid trade email preference", 400, {
        issues: parsed.error.issues.slice(0, 5),
      });
    }

    const ownerId = parsed.data.ownerId ?? user.id;
    if (ownerId === UNASSIGNED_OWNER_ID || ownerId !== user.id) {
      return jsonError(
        "You can only change trade emails for your own account.",
        403,
      );
    }
    if (!canEditPositionBook(user, ownerId)) {
      return jsonError(
        "You can only change trade emails for your own account.",
        403,
      );
    }

    const tradeEmails = await setViewerTradeEmails(user, parsed.data.enabled);
    const snapshot = await buildPositionsSnapshot({
      user,
      includeClosed: true,
      ownerId,
      bookId: parsed.data.bookId,
    });
    return jsonOk({
      tradeEmails,
      snapshot: { ...snapshot, tradeEmails },
      demo: persistence === "fixtures" || fixturesEnabled(),
    });
  } catch (error) {
    if (error instanceof PositionBookError) {
      return jsonError(error.message, error.status);
    }
    return handleRouteError(error);
  }
}
