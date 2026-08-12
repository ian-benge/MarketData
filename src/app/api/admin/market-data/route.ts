import { handleRouteError, jsonOk, fixturesEnabled } from "@/lib/api/http";
import { assertAdmin } from "@/lib/auth/authorize";
import { getEnv } from "@/lib/env";
import { getMarketDataCache } from "@/lib/market-data/cache";
import { licenseConfigFromEnv } from "@/lib/market-data/licensing";
import {
  getLastRefreshAt,
  inferUsEquitySession,
  refreshCadenceSeconds,
  runMarketDataRefresh,
} from "@/lib/market-data/refresh-service";
import { getUsageStore } from "@/lib/market-data/usage";

function nonSecretConfig(env: ReturnType<typeof getEnv>) {
  return {
    primary: env.MARKET_DATA_PRIMARY,
    fallback: env.MARKET_DATA_FALLBACK,
    stockFeed: env.ALPACA_STOCK_FEED,
    refreshOpenSeconds: env.MARKET_DATA_REFRESH_OPEN_SECONDS,
    refreshExtendedSeconds: env.MARKET_DATA_REFRESH_EXTENDED_SECONDS,
    refreshClosedSeconds: env.MARKET_DATA_REFRESH_CLOSED_SECONDS,
    staleAfterSeconds: env.MARKET_DATA_STALE_AFTER_SECONDS,
    maxUniverseSize: env.MARKET_DATA_MAX_UNIVERSE_SIZE,
    hasAlpacaKeys: Boolean(
      env.ALPACA_DATA_KEY_ID && env.ALPACA_DATA_SECRET_KEY,
    ),
    hasMassiveKey: Boolean(env.MASSIVE_API_KEY),
    hasFinnhubKey: Boolean(env.FINNHUB_API_KEY),
  };
}

/** GET — status / usage / non-secret config (admin). */
export async function GET() {
  try {
    const user = await assertAdmin();
    const env = getEnv();
    const license = licenseConfigFromEnv(env);
    const cache = getMarketDataCache(env);
    const meta = cache.getMeta();
    const session = inferUsEquitySession();

    const licenseWarning =
      license.scope === "single_user_development" || !license.acknowledged
        ? `Licensing warning: scope="${license.scope}", acknowledged=${license.acknowledged}. Acknowledgement is not proof of a license.`
        : null;

    return jsonOk({
      role: user.role,
      fixtures: fixturesEnabled(),
      license: {
        scope: license.scope,
        acknowledged: license.acknowledged,
        licenseScopeId: license.licenseScopeId,
        permittedSurfaces: license.permittedSurfaces,
        warning: licenseWarning,
      },
      feed: {
        coverage: meta.feedCoverage,
        latencyClass: meta.latencyClass,
        latencyCoverageLabel: meta.latencyCoverageLabel,
        providerName: meta.providerName || null,
        marketSession: meta.marketSession ?? session,
      },
      freshness: {
        lastSuccessfulRefreshAt: meta.lastSuccessfulRefreshAt,
        lastAttemptAt: meta.lastAttemptAt,
        lastError: meta.lastError,
        lastRefreshAt: getLastRefreshAt()?.toISOString() ?? null,
        cadenceSeconds: refreshCadenceSeconds(
          env,
          meta.marketSession ?? session,
        ),
      },
      usage: getUsageStore().listSnapshots(),
      config: nonSecretConfig(env),
      universeSize: meta.universeSymbols.length,
      breadth: meta.breadth,
      moversCoverageNotes: meta.moversCoverageNotes,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** POST — force refresh retry (admin only). Members cannot mutate. */
export async function POST() {
  try {
    await assertAdmin();
    const env = getEnv();

    if (fixturesEnabled()) {
      return jsonOk({
        ok: true,
        mode: "demo",
        refresh: {
          status: "skipped",
          skippedReason: "fixtures_enabled",
        },
      });
    }

    const refresh = await runMarketDataRefresh({ env, force: true });
    return jsonOk({
      ok: refresh.status === "completed",
      refresh: {
        status: refresh.status,
        symbolsRequested: refresh.symbolsRequested,
        symbolsReceived: refresh.symbolsReceived,
        feedCoverage: refresh.feedCoverage,
        errorMessage: refresh.errorMessage,
        skippedReason: refresh.skippedReason,
        session: refresh.session,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
