import { handleRouteError, jsonOk } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { getEnv } from "@/lib/env";
import { interpretNewsQuery } from "@/lib/desk-intel/service";
import { EVENT_TYPES, type EventType } from "@/lib/intelligence/types";
import {
  coverageFromCollections,
  quotesFromMarketCache,
  searchIntelligence,
} from "@/lib/intelligence/service";
import { parseTimeWindow } from "@/lib/intelligence/search-parse";
import { inferUsEquitySession } from "@/lib/market-data/us-session";
import { listStoredSectors, listStoredWatchlists } from "@/lib/watchlists/store";

export const maxDuration = 60;

function asEventType(value: string | null): EventType | null {
  if (!value) return null;
  return (EVENT_TYPES as readonly string[]).includes(value) ? (value as EventType) : null;
}

export async function GET(request: Request) {
  try {
    const user = await requirePermission("viewDashboard");
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? url.searchParams.get("query") ?? "";
    const ticker = url.searchParams.get("ticker");
    const tickersFromParam = (ticker ?? "")
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean);
    const eventType = asEventType(url.searchParams.get("type"));
    const theme = url.searchParams.get("theme");
    const source = url.searchParams.get("source");
    const material = url.searchParams.get("material") === "1";
    const since = url.searchParams.get("since") ?? undefined;
    const until = url.searchParams.get("until") ?? undefined;
    const freshness = url.searchParams.get("freshness");
    const ingest = freshness !== "cached";
    const windowLabel = url.searchParams.get("window");
    const windowRange = windowLabel ? parseTimeWindow(windowLabel) : null;
    const limit = Number(url.searchParams.get("limit") ?? "60");

    const [lists, sectors] = await Promise.all([
      listStoredWatchlists(user).catch(() => ({ lists: [] })),
      listStoredSectors(user).catch(() => ({ sectors: [] })),
    ]);
    const coverage = coverageFromCollections(lists.lists, sectors.sectors);
    const session = inferUsEquitySession();
    const env = getEnv();
    const interpreted = q.trim()
      ? await interpretNewsQuery(user, q, env).catch(() => null)
      : null;
    const tickers = [
      ...new Set([
        ...tickersFromParam,
        ...(interpreted?.tickers ?? []),
      ]),
    ];

    const result = await searchIntelligence(
      env,
      q,
      {
        query: q,
        tickers: tickers.length ? tickers : undefined,
        eventTypes: eventType
          ? [eventType]
          : interpreted?.eventTypes.length
            ? interpreted.eventTypes
            : undefined,
        themes: theme ? [theme] : interpreted?.themes.length ? interpreted.themes : undefined,
        sources: source ? [source] : undefined,
        materialOnly: material || Boolean(interpreted?.materialOnly),
        since: since ?? windowRange?.start,
        until: until ?? windowRange?.end,
        limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 60,
      },
      {
        coverage,
        coverageTickers: coverage.map((row) => row.ticker),
        quotes: quotesFromMarketCache(),
        session,
        ingest,
        parsed: interpreted ?? undefined,
      },
    );

    return jsonOk(
      {
        query: q,
        parsed: result.parsed,
        events: result.events,
        moves: result.moves,
        gaps: result.bundle.gaps,
        sources: result.bundle.sources,
        coverageTickers: [...new Set(coverage.map((row) => row.ticker))],
        fetchedAt: result.bundle.fetchedAt,
        stale: result.bundle.stale,
      },
      { headers: { "Cache-Control": "private, max-age=0, must-revalidate" } },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
