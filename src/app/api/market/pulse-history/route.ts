import { z } from "zod";
import {
  fixturesEnabled,
  handleRouteError,
  jsonError,
  jsonOk,
} from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { getEnv } from "@/lib/env";
import {
  PULSE_HISTORY_RANGES,
  PULSE_HISTORY_SYMBOLS,
  pulseHistorySpec,
  reconstructPulseHistory,
  type PulseHistoryBar,
  type PulseHistoryRange,
} from "@/lib/market-data/pulse-history";
import { createMarketDataRouter } from "@/lib/market-data/router";
import { MockMarketDataProvider } from "@/lib/providers/mock/mock-market-data";

const QuerySchema = z.object({
  range: z.enum(PULSE_HISTORY_RANGES).default("1D"),
});

type CacheEntry = {
  expiresAt: number;
  payload: unknown;
};

const cache = new Map<string, CacheEntry>();

function cacheTtlMs(range: PulseHistoryRange) {
  return range === "1D" || range === "WTD" ? 45_000 : 180_000;
}

export async function GET(request: Request) {
  try {
    await requirePermission("viewDashboard");
    const parsed = QuerySchema.safeParse({
      range: new URL(request.url).searchParams.get("range") ?? undefined,
    });
    if (!parsed.success) return jsonError("Invalid range", 400);
    const range = parsed.data.range;
    const hit = cache.get(range);
    if (hit && hit.expiresAt > Date.now()) return jsonOk(hit.payload);

    const spec = pulseHistorySpec(range);
    const series: Record<string, PulseHistoryBar[]> = {};

    if (fixturesEnabled()) {
      const provider = new MockMarketDataProvider();
      await Promise.all(
        PULSE_HISTORY_SYMBOLS.map(async (symbol) => {
          const bars = await provider.getTimeSeries({
            symbol,
            interval: spec.interval,
            limit: spec.limit,
          });
          series[symbol] = bars.map((bar) => ({
            barStart: bar.barStart,
            close: bar.close,
          }));
        }),
      );
    } else {
      const env = getEnv();
      const router = createMarketDataRouter(env);
      if (!router) return jsonError("No market-data provider configured", 503);
      await Promise.all(
        PULSE_HISTORY_SYMBOLS.map(async (symbol) => {
          try {
            const batch = await router.fetchBars({
              symbol,
              interval: spec.interval,
              limit: spec.limit,
              start: spec.start,
              surface: "derived_charts",
            });
            series[symbol] = batch.bars.map((bar) => ({
              barStart: bar.barStart,
              close: bar.close,
            }));
          } catch {
            series[symbol] = [];
          }
        }),
      );
    }

    const points = reconstructPulseHistory(series, spec);
    const payload = {
      range,
      interval: spec.interval,
      mode: spec.mode,
      points,
      source: fixturesEnabled() ? "fixtures" : "provider",
      asOf: new Date().toISOString(),
    };
    cache.set(range, {
      expiresAt: Date.now() + cacheTtlMs(range),
      payload,
    });
    return jsonOk(payload);
  } catch (error) {
    return handleRouteError(error);
  }
}
