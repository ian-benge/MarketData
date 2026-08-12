import { handleRouteError, jsonOk } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { getEnv } from "@/lib/env";
import { getMarketDataCache } from "@/lib/market-data/cache";
import { getWatchlistSnapshot } from "@/lib/market-data/watchlist-service";

export async function GET(request: Request) {
  try {
    await requirePermission("viewDashboard");
    const listId = new URL(request.url).searchParams.get("listId");
    const env = getEnv();
    const tape = getMarketDataCache(env).getDashboardSnapshot()?.tape ?? [];
    const snapshot = await getWatchlistSnapshot(env, tape, listId);
    return jsonOk(snapshot, {
      headers: {
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
