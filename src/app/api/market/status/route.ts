import { handleRouteError, jsonOk, fixturesEnabled } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { getEnv } from "@/lib/env";
import { getMarketDataCache } from "@/lib/market-data/cache";
import { licenseConfigFromEnv } from "@/lib/market-data/licensing";
import {
  breadthSupported,
  inferUsEquitySession,
  refreshCadenceSeconds,
} from "@/lib/market-data/refresh-service";
import { latencyCoverageLabel } from "@/lib/market-data/schemas";
import { getUsageStore } from "@/lib/market-data/usage";

export async function GET() {
  try {
    await requirePermission("viewDashboard");
    const env = getEnv();
    const license = licenseConfigFromEnv(env);
    const session = inferUsEquitySession();

    if (fixturesEnabled()) {
      return jsonOk({
        mode: "demo",
        feedCoverage: "unknown",
        latencyClass: "mock",
        latencyCoverageLabel: "Mock data",
        freshness: {
          asOf: new Date().toISOString(),
          stale: false,
          staleAfterSeconds: env.MARKET_DATA_STALE_AFTER_SECONDS,
        },
        marketSession: "regular",
        cadenceSeconds: refreshCadenceSeconds(env, "regular"),
        breadth: {
          supported: false,
          explanation:
            "Demo mode — breadth is fixture-only and not a live SIP/full-market feed.",
        },
        licenseWarning:
          "DEMO: license acknowledgement is an operational guardrail, not proof of a license.",
        licenseScope: license.scope,
        acknowledged: license.acknowledged,
      });
    }

    const cache = getMarketDataCache(env);
    const meta = cache.getMeta();
    const snap = cache.getDashboardSnapshot();
    const feed = meta.feedCoverage;
    const latency = snap?.latencyClass ?? meta.latencyClass;

    const licenseWarning =
      license.scope === "single_user_development" || !license.acknowledged
        ? `Scope "${license.scope}" (acknowledged=${license.acknowledged}). Shared production surfaces require internal_team or redistributable plus acknowledgement.`
        : null;

    return jsonOk({
      mode: "live",
      feedCoverage: feed,
      latencyClass: latency,
      latencyCoverageLabel: latencyCoverageLabel({
        feedCoverage: feed,
        latencyClass: latency,
      }),
      freshness: {
        asOf: meta.lastSuccessfulRefreshAt,
        lastAttemptAt: meta.lastAttemptAt,
        lastError: meta.lastError,
        stale: snap?.stale ?? true,
        staleAfterSeconds: env.MARKET_DATA_STALE_AFTER_SECONDS,
      },
      marketSession: meta.marketSession ?? session,
      cadenceSeconds: refreshCadenceSeconds(env, meta.marketSession ?? session),
      providerName: meta.providerName || null,
      universeSize: meta.universeSymbols.length,
      breadth: {
        supported: breadthSupported(feed),
        explanation: meta.breadth.explanation,
      },
      moversCoverageNotes: meta.moversCoverageNotes,
      licenseWarning,
      licenseScope: license.scope,
      acknowledged: license.acknowledged,
      permittedSurfaces: license.permittedSurfaces,
      usage: getUsageStore().getSnapshot(env.MARKET_DATA_PRIMARY),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
