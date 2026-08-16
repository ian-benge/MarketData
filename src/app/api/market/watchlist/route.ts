import { handleRouteError, jsonOk, fixturesEnabled } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import {
  omitSyntheticWatchlistLists,
  toWatchlistSources,
  watchlistSourcesForSelection,
} from "@/lib/dashboard/snapshot";
import { getEnv } from "@/lib/env";
import { getMarketDataCache } from "@/lib/market-data/cache";
import { getWatchlistSnapshot } from "@/lib/market-data/watchlist-service";
import { visibleOverviewLists } from "@/lib/watchlists/dashboard-digest";
import { listStoredSectors, listStoredWatchlists } from "@/lib/watchlists/store";

export async function GET(request: Request) {
  try {
    const user = await requirePermission("viewDashboard");
    const url = new URL(request.url);
    const listId = url.searchParams.get("listId");
    const sectorId = url.searchParams.get("sectorId");
    const env = getEnv();
    const tape = getMarketDataCache(env).getDashboardSnapshot()?.tape ?? [];
    const stored = await listStoredWatchlists(user);
    const visible = visibleOverviewLists(stored.lists, user.id);
    const listSources = toWatchlistSources(visible);
    const storedSectors = sectorId
      ? await listStoredSectors(user)
      : { sectors: [] as Awaited<ReturnType<typeof listStoredSectors>>["sectors"] };
    const { sources, selectedId } = watchlistSourcesForSelection({
      lists: listSources,
      sectors: storedSectors.sectors,
      listId,
      sectorId,
    });
    const useFixtures = fixturesEnabled() || stored.persistence === "fixtures";
    const snapshot = omitSyntheticWatchlistLists(
      await getWatchlistSnapshot(env, tape, selectedId, {
        lists: sources,
        useFixtures,
      }),
      listSources.map((list) => list.id),
    );
    return jsonOk(snapshot, {
      headers: {
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
