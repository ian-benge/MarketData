import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { buildPositionsSnapshot } from "@/lib/positions/service";
import { resolvePersistenceMode } from "@/lib/positions/store";
import { loadBrokerageSnapshot, syncBrokerageHoldings } from "@/lib/brokerage/sync";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const user = await requirePermission("editPositions");
    if (resolvePersistenceMode(user) !== "supabase") {
      return jsonError(
        "Brokerage sync requires a live workspace with saved books.",
        503,
      );
    }
    const url = new URL(request.url);
    const ownerId = url.searchParams.get("owner") ?? user.id;
    if (ownerId !== user.id) {
      return jsonError("You can only sync your own brokerage accounts.", 403);
    }
    const bookId = url.searchParams.get("book");
    const live = url.searchParams.get("live") === "1";
    const result = await syncBrokerageHoldings(
      user,
      live ? { historyLookback: false, live: true } : undefined,
    );
    const snapshot = await buildPositionsSnapshot({
      user,
      includeClosed: !live,
      includeHistory: false,
      ownerId: user.id,
      bookId,
    });
    return jsonOk({
      ...result,
      brokerage: await loadBrokerageSnapshot(user, user.id),
      snapshot,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
