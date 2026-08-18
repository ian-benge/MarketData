import type { Env } from "@/lib/env";
import { fixturesEnabled } from "@/lib/api/http";
import { fixtureDashboard, stampFixtureHeadlines } from "@/lib/fixtures/dashboard";
import { getMarketDataCache } from "@/lib/market-data/cache";
import { fixtureIntelligenceQuotes } from "@/lib/market-data/watchlist-service";
import type { NormalizedNewsItem } from "@/lib/providers/types";
import { assembleEvents, eventsToHeadlines } from "./assemble";
import { attributeMoves } from "./attribution";
import { coverageLinksFrom, peerMapFrom } from "./coverage-graph";
import { ingestMarketNews } from "./ingest";
import {
  focusAttributionWindow,
  focusTickersFrom,
  hydrateFocusEvidence,
} from "./focus";
import { detectSignificantMove } from "./move-detect";
import { searchEvents } from "./search";
import { parseNewsQuery } from "./search-parse";
import {
  loadPriorHeadlines,
  loadRecentNewsItems,
  persistNewsItems,
  searchStoredNews,
} from "./store";
import type {
  CoverageLink,
  IntelligenceBundle,
  IntelligenceEvent,
  MoveExplanation,
  NewsSearchFilters,
  ParsedNewsQuery,
  QuoteContext,
} from "./types";

const BUNDLE_TTL_MS = 5 * 60 * 1000;
const HEADLINE_LIMIT = 24;

export type IntelligenceLoadOptions = {
  force?: boolean;
  ingest?: boolean;
  coverage?: CoverageLink[];
  coverageTickers?: string[];
  quotes?: QuoteContext[];
  priorityTickers?: string[];
  session?: string | null;
};

let cached: IntelligenceBundle | null = null;
let inflight: Promise<IntelligenceBundle> | null = null;

export function resetIntelligenceCache() {
  cached = null;
  inflight = null;
}

function extrasFrom(events: IntelligenceEvent[]) {
  const map = new Map<
    string,
    { eventType?: string; themes?: string[]; novelty?: string; materiality?: number; resolved?: string[] }
  >();
  for (const event of events) {
    for (const source of event.sources) {
      map.set(source.id, {
        eventType: event.eventType,
        themes: event.themes,
        novelty: event.novelty,
        materiality: event.materialityScore,
        resolved: event.tickers.map((entity) => entity.ticker),
      });
    }
  }
  return map;
}

function quotesFromCache(): QuoteContext[] {
  try {
    const snapshot = getMarketDataCache().getDashboardSnapshot();
    if (!snapshot) return [];
    const session = snapshot.marketSession;
    const byTicker = new Map<string, QuoteContext>();
    for (const quote of snapshot.tape) {
      byTicker.set(quote.ticker.toUpperCase(), {
        ticker: quote.ticker.toUpperCase(),
        changePercent: quote.changePercent ?? null,
        relativeVolume: null,
        preMarketChangePercent: quote.preMarketChangePercent ?? null,
        afterHoursChangePercent: quote.afterHoursChangePercent ?? null,
        flags: [],
        session,
      });
    }
    for (const mover of snapshot.movers) {
      const ticker = mover.ticker.toUpperCase();
      const current = byTicker.get(ticker);
      byTicker.set(ticker, {
        ticker,
        changePercent: mover.changePercent ?? current?.changePercent ?? null,
        relativeVolume: mover.relativeVolume ?? current?.relativeVolume ?? null,
        preMarketChangePercent: current?.preMarketChangePercent ?? null,
        afterHoursChangePercent: current?.afterHoursChangePercent ?? null,
        flags: current?.flags ?? [],
        session,
      });
    }
    return [...byTicker.values()];
  } catch {
    return [];
  }
}

function resolveQuotes(options?: IntelligenceLoadOptions): QuoteContext[] {
  if (options?.quotes?.length) return options.quotes;
  if (fixturesEnabled()) {
    return fixtureIntelligenceQuotes(options?.session ?? "regular");
  }
  return quotesFromCache();
}

export function quotesFromMarketCache(): QuoteContext[] {
  return resolveQuotes();
}

function priorityFromQuotes(quotes: QuoteContext[], extra: string[] = []): string[] {
  const flagged = quotes
    .map((quote) => detectSignificantMove(quote))
    .filter((row) => row.significant)
    .sort(
      (a, b) =>
        Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0),
    )
    .map((row) => row.ticker);
  return [...new Set([...extra, ...flagged])];
}

function withMoves(
  bundle: IntelligenceBundle,
  options?: IntelligenceLoadOptions,
): IntelligenceBundle {
  const quotes = resolveQuotes(options);
  if (!quotes.length) return bundle;
  const links = options?.coverage ?? [];
  return {
    ...bundle,
    moves: attributeMoves(
      quotes.filter((quote) => detectSignificantMove(quote).significant),
      bundle.events,
      options?.session ?? quotes[0]?.session ?? null,
      new Date(),
      peerMapFrom(links),
      new Map(links.map((row) => [row.ticker, [...row.themeNames, ...row.sectorNames]])),
    ),
  };
}

function fixtureBundle(options?: IntelligenceLoadOptions): IntelligenceBundle {
  const now = new Date();
  const items = stampFixtureHeadlines(fixtureDashboard.headlines, now);
  const quotes = resolveQuotes({ ...options, session: options?.session ?? "regular" });
  const events = assembleEvents({
    items,
    coverage: options?.coverage,
    coverageTickers: options?.coverageTickers,
    quotes,
  });
  const links = options?.coverage ?? [];
  const session = options?.session ?? quotes[0]?.session ?? "regular";
  const moveQuotes = quotes.filter((quote) => detectSignificantMove(quote).significant);
  return {
    events,
    headlines: eventsToHeadlines(events, HEADLINE_LIMIT),
    moves: attributeMoves(
      moveQuotes,
      events,
      session,
      now,
      peerMapFrom(links),
      new Map(links.map((row) => [row.ticker, [...row.themeNames, ...row.sectorNames]])),
    ),
    gaps: [
      {
        code: "fixtures",
        message: "Demo fixtures are serving synthetic headlines. They are not live wire copy.",
      },
    ],
    sources: [
      {
        id: "fixtures",
        label: "Demo fixtures",
        status: "ok",
        note: "Synthetic",
        itemCount: items.length,
      },
    ],
    fetchedAt: now.toISOString(),
    stale: false,
  };
}

function assembleFromItems(
  items: NormalizedNewsItem[],
  options?: IntelligenceLoadOptions,
  extraGaps: IntelligenceBundle["gaps"] = [],
  extraSources: IntelligenceBundle["sources"] = [],
): IntelligenceBundle {
  const quotes = resolveQuotes(options);
  const events = assembleEvents({
    items,
    coverage: options?.coverage,
    coverageTickers: options?.coverageTickers,
    quotes,
  });
  const links = options?.coverage ?? [];
  const session = options?.session ?? quotes[0]?.session ?? null;
  return {
    events,
    headlines: eventsToHeadlines(events, HEADLINE_LIMIT),
    moves: attributeMoves(
      quotes.filter((quote) => detectSignificantMove(quote).significant),
      events,
      session,
      new Date(),
      peerMapFrom(links),
      new Map(links.map((row) => [row.ticker, [...row.themeNames, ...row.sectorNames]])),
    ),
    gaps: extraGaps,
    sources: extraSources,
    fetchedAt: new Date().toISOString(),
    stale: extraSources.every((source) => source.status !== "ok") && events.length > 0,
  };
}

async function loadFromStore(options?: IntelligenceLoadOptions): Promise<IntelligenceBundle | null> {
  const stored = await loadRecentNewsItems({ hours: 48, limit: 400 });
  if (!stored.length) return null;
  return assembleFromItems(stored, options, [], [
    {
      id: "store",
      label: "Stored headlines",
      status: "ok",
      note: `${stored.length} items from market_news_items (no live ingest)`,
      itemCount: stored.length,
    },
  ]);
}

async function loadBundle(
  env: Env,
  options?: IntelligenceLoadOptions,
): Promise<IntelligenceBundle> {
  if (fixturesEnabled()) return fixtureBundle(options);

  if (options?.ingest === false) {
    const stored = await loadFromStore(options);
    if (stored) return stored;
    return {
      events: [],
      headlines: [],
      moves: [],
      gaps: [
        {
          code: "news_cache_empty",
          message:
            "Headline search used the last ingested snapshot and none was available. Open Material News to refresh sources.",
        },
      ],
      sources: [],
      fetchedAt: new Date().toISOString(),
      stale: true,
    };
  }

  const quotes = resolveQuotes(options);
  const priority = priorityFromQuotes(quotes, [
    ...(options?.priorityTickers ?? []),
    ...(options?.coverageTickers ?? []).slice(0, 16),
  ]);
  const [ingested, prior, stored] = await Promise.all([
    ingestMarketNews(env, { priorityTickers: priority }),
    loadPriorHeadlines(),
    loadRecentNewsItems({ hours: 48, limit: 400 }),
  ]);

  const events = assembleEvents({
    items: [...ingested.items, ...stored],
    prior,
    coverage: options?.coverage,
    coverageTickers: options?.coverageTickers,
    quotes,
  });
  const persist = await persistNewsItems(ingested.items, extrasFrom(events));
  const gaps = [...ingested.gaps];
  if (persist.skipped === "no_admin_client") {
    gaps.push({
      code: "news_store_unconfigured",
      message:
        "Headline history is not persisting because the service-role store is not configured. Search is limited to this process cache.",
    });
  } else if (persist.error) {
    gaps.push({
      code: "persist_error",
      message: `Headline store write failed: ${persist.error}`,
    });
  }

  const links = options?.coverage ?? [];
  const session = options?.session ?? quotes[0]?.session ?? null;
  const moves = attributeMoves(
    quotes.filter((quote) => detectSignificantMove(quote).significant),
    events,
    session,
    new Date(),
    peerMapFrom(links),
    new Map(links.map((row) => [row.ticker, [...row.themeNames, ...row.sectorNames]])),
  );

  return {
    events,
    headlines: eventsToHeadlines(events, HEADLINE_LIMIT),
    moves,
    gaps,
    sources: ingested.sources,
    fetchedAt: new Date().toISOString(),
    stale: ingested.sources.every((source) => source.status !== "ok") && events.length > 0,
  };
}

export async function getIntelligenceBundle(
  env: Env,
  options?: IntelligenceLoadOptions,
): Promise<IntelligenceBundle> {
  const allowCache = !options?.force && options?.ingest !== false;
  if (
    allowCache &&
    cached &&
    Date.now() - Date.parse(cached.fetchedAt) < BUNDLE_TTL_MS
  ) {
    return withMoves(cached, options);
  }
  if (options?.ingest === false && cached) {
    return withMoves(cached, options);
  }
  if (inflight && !options?.force && options?.ingest !== false) return inflight;

  const pending = loadBundle(env, options)
    .then((bundle) => {
      if (options?.ingest !== false) cached = bundle;
      else if (!cached) cached = bundle;
      return bundle;
    })
    .catch((error) => {
      if (cached) return { ...cached, stale: true };
      throw error;
    });

  if (options?.ingest !== false) {
    inflight = pending.finally(() => {
      inflight = null;
    });
  }

  try {
    return await pending;
  } catch {
    return {
      events: [],
      headlines: [],
      moves: [],
      gaps: [
        {
          code: "intelligence_unavailable",
          message: "Headline intelligence could not be loaded from configured sources.",
        },
      ],
      sources: [],
      fetchedAt: new Date().toISOString(),
      stale: true,
    };
  }
}

export async function searchIntelligence(
  env: Env,
  rawQuery: string,
  filters: NewsSearchFilters = {},
  context?: {
    coverage?: CoverageLink[];
    coverageTickers?: string[];
    quotes?: QuoteContext[];
    session?: string | null;
    ingest?: boolean;
    parsed?: ParsedNewsQuery;
  },
): Promise<{
  parsed: ParsedNewsQuery;
  events: IntelligenceEvent[];
  moves: MoveExplanation[];
  bundle: IntelligenceBundle;
}> {
  const parsed =
    context?.parsed ??
    parseNewsQuery(filters.query ?? rawQuery, new Date(), context?.session);
  const focusTickers = focusTickersFrom(parsed, filters);
  const bundle = await getIntelligenceBundle(env, {
    coverage: context?.coverage,
    coverageTickers: context?.coverageTickers,
    quotes: context?.quotes,
    priorityTickers: focusTickers,
    session: context?.session,
    ingest: context?.ingest,
  });
  let pool = bundle.events;
  if (rawQuery.trim() && context?.ingest !== false) {
    const stored = await searchStoredNews(rawQuery, 80);
    if (stored.length) {
      const extra = assembleEvents({
        items: stored,
        coverage: context?.coverage,
        coverageTickers: context?.coverageTickers,
        quotes: context?.quotes,
      });
      const seen = new Set(pool.map((event) => event.id));
      pool = [...pool, ...extra.filter((event) => !seen.has(event.id))];
    }
  }
  const hydrated = await hydrateFocusEvidence(env, focusTickers, {
    events: pool,
    quotes: resolveQuotes({
      quotes: context?.quotes,
      session: context?.session,
    }),
    session: context?.session,
    coverage: context?.coverage,
    coverageTickers: context?.coverageTickers,
    ingest: context?.ingest,
  });
  pool = hydrated.events;
  const { results } = searchEvents(
    pool,
    rawQuery,
    filters,
    new Date(),
    context?.session,
  );
  let moves = bundle.moves;
  const focusTicker =
    parsed.whyTicker ??
    (filters.tickers?.length === 1 ? filters.tickers[0]!.toUpperCase() : null);
  if (focusTicker && (parsed.intent === "why_moving" || filters.tickers?.length === 1)) {
    const quote =
      hydrated.quotes.find((row) => row.ticker.toUpperCase() === focusTicker) ?? {
        ticker: focusTicker,
        changePercent: null,
        relativeVolume: null,
        flags: [],
        session: context?.session ?? null,
      };
    const links = context?.coverage ?? [];
    const attributionEvents = results.length ? results : pool;
    moves = attributeMoves(
      [quote],
      attributionEvents,
      context?.session ?? quote.session,
      new Date(),
      peerMapFrom(links),
      new Map(
        links.map((row) => [row.ticker, [...row.themeNames, ...row.sectorNames]]),
      ),
      {
        window: focusAttributionWindow({
          events: attributionEvents,
          session: context?.session ?? quote.session,
          since: filters.since,
          until: filters.until,
          parsedRange: parsed.timeRange,
        }),
        matchLowConfidence: true,
      },
    );
  }
  return {
    parsed: {
      ...parsed,
      tickers: focusTickers.length ? focusTickers : parsed.tickers,
      whyTicker: parsed.whyTicker ?? focusTicker,
    },
    events: results,
    moves,
    bundle,
  };
}

export function coverageFromCollections(
  lists: Parameters<typeof coverageLinksFrom>[0],
  sectors: Parameters<typeof coverageLinksFrom>[1],
) {
  return coverageLinksFrom(lists, sectors);
}
