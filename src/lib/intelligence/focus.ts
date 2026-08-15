import type { Env } from "@/lib/env";
import type { CoverageQuote } from "@/lib/watchlists/types";
import { assembleEvents } from "./assemble";
import { ingestCompanyNews } from "./ingest";
import { persistNewsItems, searchStoredNews } from "./store";
import { newsWindowForSession } from "./windows";
import type {
  CoverageLink,
  IntelligenceEvent,
  MoveWindow,
  NewsSearchFilters,
  ParsedNewsQuery,
  QuoteContext,
} from "./types";

export function focusTickersFrom(
  parsed: Pick<ParsedNewsQuery, "tickers" | "whyTicker">,
  filters: Pick<NewsSearchFilters, "tickers"> = {},
): string[] {
  return [
    ...new Set(
      [...parsed.tickers, ...(filters.tickers ?? []), parsed.whyTicker]
        .filter((ticker): ticker is string => Boolean(ticker))
        .map((ticker) => ticker.toUpperCase()),
    ),
  ];
}

export function mergeEvents(
  base: IntelligenceEvent[],
  extra: IntelligenceEvent[],
): IntelligenceEvent[] {
  const seen = new Set(base.map((event) => event.id));
  return [...base, ...extra.filter((event) => !seen.has(event.id))];
}

export function mergeQuotes(
  base: QuoteContext[],
  extra: QuoteContext[],
): QuoteContext[] {
  const map = new Map(base.map((quote) => [quote.ticker.toUpperCase(), quote]));
  for (const quote of extra) {
    const ticker = quote.ticker.toUpperCase();
    const current = map.get(ticker);
    if (!current || current.changePercent == null) {
      map.set(ticker, { ...quote, ticker });
    }
  }
  return [...map.values()];
}

export function coverageRowToQuoteContext(
  row: CoverageQuote,
  session?: string | null,
): QuoteContext {
  return {
    ticker: row.ticker.toUpperCase(),
    name: row.name,
    changePercent: row.change1dPercent,
    relativeVolume: row.relativeVolume,
    preMarketChangePercent: row.preMarketChangePercent,
    afterHoursChangePercent: row.afterHoursChangePercent,
    vsGroupPercent: row.vsGroup1dPercent,
    flags: row.flags ?? [],
    session,
  };
}

function inRange(iso: string, start: string, end: string): boolean {
  const at = Date.parse(iso);
  return Number.isFinite(at) && at >= Date.parse(start) && at <= Date.parse(end);
}

export function focusAttributionWindow(input: {
  events: IntelligenceEvent[];
  session?: string | null;
  now?: Date;
  since?: string;
  until?: string;
  parsedRange?: MoveWindow | null;
}): MoveWindow {
  const now = input.now ?? new Date();
  const end = input.until ?? input.parsedRange?.end ?? now.toISOString();
  if (input.since || input.parsedRange) {
    return {
      start: input.since ?? input.parsedRange!.start,
      end,
      label: input.parsedRange?.label ?? "Selected window",
    };
  }
  const sessionWindow = newsWindowForSession(input.session, now);
  if (
    input.events.some((event) =>
      inRange(event.publishedAt, sessionWindow.start, sessionWindow.end),
    )
  ) {
    return sessionWindow;
  }
  if (input.events.length) {
    const start = input.events.reduce(
      (earliest, event) =>
        event.publishedAt < earliest ? event.publishedAt : earliest,
      input.events[0]!.publishedAt,
    );
    return {
      start,
      end: now.toISOString(),
      label: "Matching headlines",
    };
  }
  return sessionWindow;
}

export type FocusHydrateDeps = {
  ingestCompanyNews?: typeof ingestCompanyNews;
  searchStoredNews?: typeof searchStoredNews;
  loadQuotes?: (tickers: string[]) => Promise<QuoteContext[]>;
};

function extrasFrom(events: IntelligenceEvent[]) {
  const map = new Map<
    string,
    {
      eventType?: string;
      themes?: string[];
      novelty?: string;
      materiality?: number;
      resolved?: string[];
    }
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

/**
 * After the 5-minute intelligence cache, pull issuer news + a live quote for
 * the tickers the trader actually typed. Dashboard cache otherwise omits them.
 */
export async function hydrateFocusEvidence(
  env: Env,
  tickers: string[],
  input: {
    events: IntelligenceEvent[];
    quotes: QuoteContext[];
    session?: string | null;
    coverage?: CoverageLink[];
    coverageTickers?: string[];
    ingest?: boolean;
  },
  deps: FocusHydrateDeps = {},
): Promise<{ events: IntelligenceEvent[]; quotes: QuoteContext[] }> {
  const focus = [...new Set(tickers.map((ticker) => ticker.toUpperCase()).filter(Boolean))];
  let events = input.events;
  let quotes = input.quotes;

  if (input.ingest !== false && focus.length) {
    const ingest = deps.ingestCompanyNews ?? ingestCompanyNews;
    const storedSearch = deps.searchStoredNews ?? searchStoredNews;
    const [company, stored] = await Promise.all([
      ingest(env, focus),
      storedSearch(focus.join(" "), 80),
    ]);
    const items = [...company.items, ...stored];
    if (items.length) {
      const extra = assembleEvents({
        items,
        coverage: input.coverage,
        coverageTickers: input.coverageTickers,
        quotes,
      });
      if (company.items.length) {
        void persistNewsItems(company.items, extrasFrom(extra));
      }
      events = mergeEvents(events, extra);
    }
  }

  const missing = focus.filter((ticker) => {
    const quote = quotes.find((row) => row.ticker.toUpperCase() === ticker);
    return !quote || quote.changePercent == null;
  });
  if (missing.length) {
    try {
      const loadQuotes =
        deps.loadQuotes ??
        (async (symbols: string[]) => {
          const { loadCoverageQuotes } = await import("@/lib/watchlists/quotes");
          const live = await loadCoverageQuotes(symbols);
          return live.rows.map((row) =>
            coverageRowToQuoteContext(row, input.session ?? live.marketSession),
          );
        });
      quotes = mergeQuotes(quotes, await loadQuotes(missing));
    } catch {
      // Quote hydrate is best-effort; search still returns headlines.
    }
  }

  return { events, quotes };
}
