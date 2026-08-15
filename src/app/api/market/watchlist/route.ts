import { handleRouteError, jsonOk, fixturesEnabled } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { getEnv } from "@/lib/env";
import { getMarketDataCache } from "@/lib/market-data/cache";
import { getWatchlistSnapshot } from "@/lib/market-data/watchlist-service";
import { listStoredWatchlists } from "@/lib/watchlists/store";

export async function GET(request: Request) {
  try {
    const user = await requirePermission("viewDashboard");
    const listId = new URL(request.url).searchParams.get("listId");
    const env = getEnv();
    const tape = getMarketDataCache(env).getDashboardSnapshot()?.tape ?? [];
    const stored = fixturesEnabled()
      ? { lists: [] as Awaited<ReturnType<typeof listStoredWatchlists>>["lists"] }
      : await listStoredWatchlists(user);
    const lists = stored.lists
      .filter((list) => list.visibility === "shared" && !list.archivedAt)
      .map((list) => ({
        id: list.id,
        name: list.name,
        isDefault: list.isDefault,
        symbols: list.symbols,
      }));
    const snapshot = await getWatchlistSnapshot(env, tape, listId, {
      lists: lists.length ? lists : undefined,
    });
    return jsonOk(snapshot, {
      headers: {
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
