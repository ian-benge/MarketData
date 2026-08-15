import { nanoid } from "nanoid";
import {
  fixturesEnabled,
  handleRouteError,
  jsonError,
  jsonOk,
} from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { WatchlistWriteSchema } from "@/lib/watchlists/schemas";
import { buildCoverageSnapshot } from "@/lib/watchlists/service";
import {
  buildSessionWatchlist,
  createStoredWatchlist,
  resolvePersistenceMode,
} from "@/lib/watchlists/store";
import type { CoverageSelection } from "@/lib/watchlists/types";

export const maxDuration = 60;

export async function GET(request?: Request) {
  try {
    const user = await requirePermission("viewDashboard");
    const url = new URL(request?.url ?? "http://localhost/api/watchlists");
    const listId = url.searchParams.get("listId");
    const sectorId = url.searchParams.get("sectorId");
    const includeArchived = url.searchParams.get("includeArchived") === "1";
    const selection: CoverageSelection | null = sectorId
      ? { type: "sector", id: sectorId }
      : listId
        ? { type: "watchlist", id: listId }
        : null;
    const snapshot = await buildCoverageSnapshot({
      user,
      selection,
      includeArchived,
    });
    return jsonOk(snapshot, {
      headers: { "Cache-Control": "private, max-age=0, must-revalidate" },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission("editWatchlists");
    const persistence = resolvePersistenceMode(user);
    if (persistence === "unavailable") {
      return jsonError(
        "Watchlist persistence is not connected in this environment.",
        503,
      );
    }
    const parsed = WatchlistWriteSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) return jsonError("Invalid body", 400);

    if (persistence === "fixtures" || fixturesEnabled()) {
      const watchlist = buildSessionWatchlist(user, parsed.data, {
        id: `wl-${nanoid(10)}`,
      });
      return jsonOk({
        id: watchlist.id,
        name: watchlist.name,
        description: watchlist.description,
        symbols: watchlist.symbols,
        isDefault: watchlist.isDefault,
        demo: true,
        watchlist,
      });
    }

    const watchlist = await createStoredWatchlist(user, parsed.data);
    const snapshot = await buildCoverageSnapshot({
      user,
      selection: { type: "watchlist", id: watchlist.id },
    });
    return jsonOk({ watchlist, snapshot, demo: false });
  } catch (error) {
    return handleRouteError(error);
  }
}
