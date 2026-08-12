import { handleRouteError, jsonOk, fixturesEnabled } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { fixtureMovers } from "@/lib/fixtures/dashboard";
import { getEnv } from "@/lib/env";
import {
  getMarketDataCache,
  moverObservationToLegacy,
} from "@/lib/market-data/cache";
import { iexMoversCoverageNote } from "@/lib/market-data/refresh-service";

export async function GET() {
  try {
    await requirePermission("viewDashboard");

    if (fixturesEnabled()) {
      return jsonOk({
        source: "fixtures",
        movers: fixtureMovers,
        coverageNotes:
          "DEMO movers — synthetic fixtures; not live IEX/SIP tape.",
      });
    }

    const env = getEnv();
    const cache = getMarketDataCache(env);
    const meta = cache.getMeta();
    const movers = meta.movers.map(moverObservationToLegacy);
    const coverageNotes =
      meta.moversCoverageNotes ??
      iexMoversCoverageNote(meta.feedCoverage) ??
      "Movers restricted to the configured tracked universe.";

    return jsonOk({
      source: "cache",
      asOf: meta.lastSuccessfulRefreshAt,
      feedCoverage: meta.feedCoverage,
      latencyCoverageLabel: meta.latencyCoverageLabel,
      coverageNotes,
      movers,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
