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
  getMarketDataCache,
  quoteObservationToLegacy,
} from "@/lib/market-data/cache";
import {
  assertSurfaceAllowed,
  licenseConfigFromEnv,
} from "@/lib/market-data/licensing";
import { fixtureQuotes } from "@/lib/fixtures/dashboard";
import { EntitlementError } from "@/lib/market-data/schemas";

const BodySchema = z.object({
  symbols: z.array(z.string().min(1)).min(1).max(80),
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
    const raw = url.searchParams.get("symbols") ?? "";
    const symbols = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (symbols.length === 0) {
      return jsonError("symbols query required (comma-separated)", 400);
    }
    if (symbols.length > 80) {
      return jsonError("Too many symbols (max 80)", 400);
    }

    const env = getEnv();
    const license = licenseConfigFromEnv(env);
    try {
      assertSurfaceAllowed(license, "dashboard_display");
    } catch (err) {
      if (err instanceof EntitlementError) {
        return jsonError(err.message, 403, { code: err.code });
      }
      throw err;
    }

    if (fixturesEnabled()) {
      const set = new Set(symbols.map((s) => s.toUpperCase()));
      return jsonOk({
        source: "fixtures",
        quotes: fixtureQuotes.filter((q) => set.has(q.ticker)),
      });
    }

    const cache = getMarketDataCache(env);
    const entries = cache.getQuotes(symbols);
    return jsonOk({
      source: "cache",
      asOf: cache.getMeta().lastSuccessfulRefreshAt,
      latencyCoverageLabel: cache.getMeta().latencyCoverageLabel,
      quotes: entries.map((e) => ({
        ...quoteObservationToLegacy(e.observation),
        stale: e.stale,
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requirePermission("viewDashboard");
    const body = BodySchema.parse(await request.json());
    const env = getEnv();
    const license = licenseConfigFromEnv(env);
    try {
      assertSurfaceAllowed(license, body.surface);
    } catch (err) {
      if (err instanceof EntitlementError) {
        return jsonError(err.message, 403, { code: err.code });
      }
      throw err;
    }

    if (fixturesEnabled()) {
      const set = new Set(body.symbols.map((s) => s.toUpperCase()));
      return jsonOk({
        source: "fixtures",
        quotes: fixtureQuotes.filter((q) => set.has(q.ticker)),
      });
    }

    const cache = getMarketDataCache(env);
    const entries = cache.getQuotes(body.symbols);
    return jsonOk({
      source: "cache",
      quotes: entries.map((e) => quoteObservationToLegacy(e.observation)),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
