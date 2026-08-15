import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { SymbolMoveSchema } from "@/lib/watchlists/schemas";
import { buildCoverageSnapshot } from "@/lib/watchlists/service";
import { moveStoredSymbol, resolvePersistenceMode } from "@/lib/watchlists/store";

export async function POST(request: Request) {
  try {
    const user = await requirePermission("editWatchlists");
    if (resolvePersistenceMode(user) === "unavailable") {
      return jsonError(
        "Watchlist persistence is not connected in this environment.",
        503,
      );
    }
    const parsed = SymbolMoveSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) return jsonError("Invalid body", 400);
    if (resolvePersistenceMode(user) === "fixtures") {
      return jsonOk({ ...parsed.data, demo: true });
    }
    await moveStoredSymbol(user, parsed.data);
    const snapshot = await buildCoverageSnapshot({
      user,
      selection: { type: parsed.data.toType, id: parsed.data.toId },
    });
    return jsonOk({ ...parsed.data, snapshot, demo: false });
  } catch (error) {
    return handleRouteError(error);
  }
}
