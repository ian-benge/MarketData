import { nanoid } from "nanoid";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { buildCoverageSnapshot } from "@/lib/watchlists/service";
import {
  buildSessionWatchlist,
  duplicateStoredWatchlist,
  listStoredWatchlists,
  resolvePersistenceMode,
} from "@/lib/watchlists/store";
import { copyName } from "@/lib/watchlists/symbols";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  try {
    const user = await requirePermission("editWatchlists");
    const persistence = resolvePersistenceMode(user);
    if (persistence === "unavailable") {
      return jsonError(
        "Watchlist persistence is not connected in this environment.",
        503,
      );
    }
    const { id } = await context.params;
    if (persistence === "fixtures") {
      const { lists } = await listStoredWatchlists(user);
      const current = lists.find((list) => list.id === id);
      if (!current) return jsonError("Watchlist not found.", 404);
      const watchlist = buildSessionWatchlist(
        user,
        {
          name: copyName(current.name),
          description: current.description,
          symbols: current.symbols,
          visibility: current.visibility,
        },
        { id: `wl-${nanoid(10)}` },
      );
      return jsonOk({ watchlist, demo: true });
    }
    const watchlist = await duplicateStoredWatchlist(user, id);
    const snapshot = await buildCoverageSnapshot({
      user,
      selection: { type: "watchlist", id: watchlist.id },
    });
    return jsonOk({ watchlist, snapshot, demo: false });
  } catch (error) {
    return handleRouteError(error);
  }
}
