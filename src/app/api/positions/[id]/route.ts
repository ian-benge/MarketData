import {
  fixturesEnabled,
  handleRouteError,
  jsonError,
  jsonOk,
} from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import {
  PositionPatchSchema,
  resolveMultiplier,
} from "@/lib/positions/schemas";
import { buildPositionsSnapshot } from "@/lib/positions/service";
import {
  resolvePersistenceMode,
  updateStoredPosition,
} from "@/lib/positions/store";

export async function PATCH(
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

    const parsed = PositionPatchSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return jsonError("Invalid position update", 400, {
        issues: parsed.error.issues.slice(0, 5),
      });
    }

    const patch = {
      ...parsed.data,
      multiplier:
        parsed.data.assetType && parsed.data.multiplier == null
          ? resolveMultiplier(parsed.data.assetType, parsed.data.multiplier)
          : parsed.data.multiplier,
      strategy:
        parsed.data.strategy === undefined
          ? undefined
          : parsed.data.strategy?.trim()
            ? parsed.data.strategy.trim()
            : null,
      notes:
        parsed.data.notes === undefined
          ? undefined
          : parsed.data.notes?.trim()
            ? parsed.data.notes.trim()
            : null,
    };

    if (persistence === "fixtures" || fixturesEnabled()) {
      return jsonOk({
        demo: true,
        id,
        patch,
        updatedAt: new Date().toISOString(),
      });
    }

    const position = await updateStoredPosition(user, id, {
      ticker: patch.ticker,
      assetType: patch.assetType,
      side: patch.side,
      quantity: patch.quantity,
      multiplier: patch.multiplier,
      entryPrice: patch.entryPrice,
      entryDate: patch.entryDate,
      currency: patch.currency,
      strategy: patch.strategy,
      notes: patch.notes,
    });
    const snapshot = await buildPositionsSnapshot({
      user,
      includeClosed: true,
      ownerId: position.createdBy,
      bookId: position.bookId,
    });
    return jsonOk({ position, snapshot, demo: false });
  } catch (error) {
    return handleRouteError(error);
  }
}
