import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { WatchlistPatchSchema } from "@/lib/watchlists/schemas";
import { buildCoverageSnapshot } from "@/lib/watchlists/service";
import {
  deleteStoredWatchlist,
  resolvePersistenceMode,
  updateStoredWatchlist,
} from "@/lib/watchlists/store";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await requirePermission("editWatchlists");
    if (resolvePersistenceMode(user) === "unavailable") {
      return jsonError(
        "Watchlist persistence is not connected in this environment.",
        503,
      );
    }
    const { id } = await context.params;
    const parsed = WatchlistPatchSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) return jsonError("Invalid body", 400);
    if (resolvePersistenceMode(user) === "fixtures") {
      return jsonOk({
        watchlist: { id, ...parsed.data },
        demo: true,
      });
    }
    const watchlist = await updateStoredWatchlist(user, id, parsed.data);
    const snapshot = await buildCoverageSnapshot({
      user,
      selection: { type: "watchlist", id: watchlist.id },
    });
    return jsonOk({ watchlist, snapshot, demo: false });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const user = await requirePermission("editWatchlists");
    if (resolvePersistenceMode(user) === "unavailable") {
      return jsonError(
        "Watchlist persistence is not connected in this environment.",
        503,
      );
    }
    const { id } = await context.params;
    if (resolvePersistenceMode(user) === "fixtures") {
      return jsonOk({ id, demo: true });
    }
    await deleteStoredWatchlist(user, id);
    const snapshot = await buildCoverageSnapshot({ user });
    return jsonOk({ id, snapshot, demo: false });
  } catch (error) {
    return handleRouteError(error);
  }
}
