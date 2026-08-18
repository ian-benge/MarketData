import { z } from "zod";
import {
  handleRouteError,
  jsonError,
  jsonOk,
  fixturesEnabled,
} from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { getEnv } from "@/lib/env";
import {
  assertSurfaceAllowed,
  licenseConfigFromEnv,
} from "@/lib/market-data/licensing";
import { createMarketDataRouter } from "@/lib/market-data/router";
import { EntitlementError } from "@/lib/market-data/schemas";
import { getUsageStore } from "@/lib/market-data/usage";
import { MockMarketDataProvider } from "@/lib/providers/mock/mock-market-data";
import { fetchYahooIntradayBars } from "@/lib/market-data/earnings/yahoo";
import {
  barIntervalMs,
  mergeBarSeries,
  yahooIntradayToNormalizedBars,
} from "@/lib/market-data/extended-hours";

const QuerySchema = z.object({
  symbol: z.string().min(1).max(16),
  interval: z.enum(["1m", "5m", "15m", "1h", "1d"]).default("1m"),
  limit: z.coerce.number().int().positive().max(2000).default(100),
  start: z.string().datetime().optional(),
  surface: z
    .enum([
      "dashboard_display",
      "server_calculations",
      "archived_normalized",
      "derived_charts",
      "in_app_reports",
      "pdf_inclusion",
      "email_attachment",
      "ai_analysis_input",
    ])
    .default("dashboard_display"),
});

export async function GET(request: Request) {
  try {
    await requirePermission("viewDashboard");
    const url = new URL(request.url);
    const parsed = QuerySchema.safeParse({
      symbol: url.searchParams.get("symbol") ?? undefined,
      interval: url.searchParams.get("interval") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      start: url.searchParams.get("start") ?? undefined,
      surface: url.searchParams.get("surface") ?? undefined,
    });
    if (!parsed.success) {
      return jsonError("Invalid query", 400, {
        issues: parsed.error.issues.slice(0, 3),
      });
    }
    const req = parsed.data;
    const env = getEnv();
    const license = licenseConfigFromEnv(env);
    try {
      assertSurfaceAllowed(license, req.surface);
    } catch (err) {
      if (err instanceof EntitlementError) {
        return jsonError(err.message, 403, { code: err.code });
      }
      throw err;
    }

    if (fixturesEnabled()) {
      const provider = new MockMarketDataProvider();
      const bars = await provider.getTimeSeries({
        symbol: req.symbol,
        interval: req.interval,
        limit: req.limit,
      });
      return jsonOk({
        source: "fixtures",
        symbol: req.symbol.toUpperCase(),
        interval: req.interval,
        feedCoverage: "iex",
        latencyClass: "delayed",
        bars,
        note: "DEMO mock data — not live market data.",
      });
    }

    // Snapshot refresh only keeps a short 1m ring (often one forming bar).
    // Chart history must come from the provider, not that tape cache.
    const router = createMarketDataRouter(env);
    if (!router) {
      return jsonError("No market-data provider configured", 503);
    }

    const usage = getUsageStore();
    if (usage.isCircuitOpen(env.MARKET_DATA_PRIMARY)) {
      return jsonError("Provider circuit open — try later", 429, {
        backoffMs: usage.backoffMs(env.MARKET_DATA_PRIMARY),
      });
    }

    const batch = await router.fetchBars({
      symbol: req.symbol,
      interval: req.interval,
      limit: req.limit,
      start: req.start,
      surface: req.surface,
    });
    let bars = batch.bars;
    let extendedHoursSource: "primary" | "primary+yahoo" = "primary";
    const interval = req.interval;
    if (interval !== "1d" && env.NODE_ENV !== "test") {
      try {
        const yahoo = await fetchYahooIntradayBars(
          req.symbol,
          interval,
          req.start,
        );
        if (yahoo.length) {
          bars = mergeBarSeries(
            bars,
            yahooIntradayToNormalizedBars(req.symbol, interval, yahoo),
            barIntervalMs(interval),
          );
          extendedHoursSource = "primary+yahoo";
        }
      } catch {
        // Keep the primary series when Yahoo chart history is unavailable.
      }
    }
    usage.record({
      providerKey: batch.providerName,
      requests: 1,
      symbols: 1,
      records: bars.length,
    });
    return jsonOk({
      source: "provider",
      symbol: req.symbol.toUpperCase(),
      interval: req.interval,
      feedCoverage: batch.feedCoverage,
      latencyClass: batch.latencyClass,
      bars,
      extendedHoursSource,
    });
  } catch (error) {
    if (error instanceof EntitlementError) {
      return jsonError(error.message, 403, { code: error.code });
    }
    return handleRouteError(error);
  }
}
