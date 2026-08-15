import { handleRouteError, jsonOk, fixturesEnabled } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { toWatchlistSources } from "@/lib/dashboard/snapshot";
import { getEnv } from "@/lib/env";
import { getMarketDataCache } from "@/lib/market-data/cache";
import { getWatchlistSnapshot } from "@/lib/market-data/watchlist-service";
import { visibleOverviewLists } from "@/lib/watchlists/dashboard-digest";
import { listStoredWatchlists } from "@/lib/watchlists/store";

export async function GET(request: Request) {
  try {
    const user = await requirePermission("viewDashboard");
    const listId = new URL(request.url).searchParams.get("listId");
    const env = getEnv();
    const tape = getMarketDataCache(env).getDashboardSnapshot()?.tape ?? [];
    const stored = await listStoredWatchlists(user);
    const visible = visibleOverviewLists(stored.lists, user.id);
    const sources = toWatchlistSources(visible);
    const useFixtures = fixturesEnabled() || stored.persistence === "fixtures";
    const snapshot = await getWatchlistSnapshot(env, tape, listId, {
      lists: sources,
      useFixtures,
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
