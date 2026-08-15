import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { WatchlistReorderSchema } from "@/lib/watchlists/schemas";
import { reorderStoredWatchlists, resolvePersistenceMode } from "@/lib/watchlists/store";

export async function POST(request: Request) {
  try {
    const user = await requirePermission("editWatchlists");
    if (resolvePersistenceMode(user) === "unavailable") {
      return jsonError(
        "Watchlist persistence is not connected in this environment.",
        503,
      );
    }
    const parsed = WatchlistReorderSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) return jsonError("Invalid body", 400);
    if (resolvePersistenceMode(user) === "fixtures") {
      return jsonOk({ ids: parsed.data.ids, demo: true });
    }
    await reorderStoredWatchlists(user, parsed.data.ids);
    return jsonOk({ ids: parsed.data.ids, demo: false });
  } catch (error) {
    return handleRouteError(error);
  }
}
