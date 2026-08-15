import { clusterNewsItems, type NewsCluster } from "@/lib/domain/news-cluster";
import type { NormalizedNewsItem } from "@/lib/providers/types";
import { classifyHeadline } from "./event-classify";
import { resolveEntities } from "./entity-resolve";
import { detectNovelty } from "./novelty";
import { rankEvent, sortEvents } from "./rank";
import { secondOrderEntities, themesForEvent } from "./second-order";
import type {
  CoverageLink,
  IntelligenceEvent,
  IntelligenceHeadline,
  PriorHeadline,
  QuoteContext,
  ResolvedEntity,
} from "./types";

function toHeadline(item: NormalizedNewsItem): IntelligenceHeadline {
  return {
    id: item.id,
    title: item.title,
    summary: item.summary,
    url: item.url,
    canonicalUrl: item.canonicalUrl,
    publisher: item.publisher,
    publishedAt: item.publishedAt,
    sourceClass: item.sourceClass,
    providerName: item.providerName,
    sourceQuality: item.sourceQuality,
  };
}

function mergeEntities(items: NormalizedNewsItem[]): ResolvedEntity[] {
  const map = new Map<string, ResolvedEntity>();
  for (const item of items) {
    for (const entity of resolveEntities(item)) {
      const current = map.get(entity.ticker);
      if (!current) {
        map.set(entity.ticker, entity);
        continue;
      }
      const rank = (value: ResolvedEntity) =>
        (value.confidence === "high" ? 2 : value.confidence === "medium" ? 1 : 0) +
        (value.method === "provider" ? 2 : 0);
      if (rank(entity) > rank(current)) map.set(entity.ticker, entity);
    }
  }
  return [...map.values()];
}

function eventConfidence(cluster: NewsCluster, tickers: ResolvedEntity[]) {
  if (cluster.representative.sourceClass === "primary" && tickers.some((e) => e.confidence === "high")) {
    return "confirmed" as const;
  }
  if (tickers.some((entity) => entity.confidence === "high")) return "probable" as const;
  if (tickers.some((entity) => entity.confidence === "medium")) return "speculative" as const;
  return "unknown" as const;
}

function coverageNotesFor(cluster: NewsCluster): string | null {
  const notes = cluster.items
    .map((item) => item.coverageNotes)
    .filter((note): note is string => Boolean(note));
  return notes[0] ?? null;
}

export function assembleEvents(input: {
  items: NormalizedNewsItem[];
  prior?: PriorHeadline[];
  coverage?: CoverageLink[];
  coverageTickers?: string[];
  quotes?: QuoteContext[];
  now?: Date;
}): IntelligenceEvent[] {
  const clusters: NewsCluster[] = clusterNewsItems(input.items);
  const coverage = input.coverage ?? [];
  const coverageTickers = new Set(
    (input.coverageTickers ?? coverage.map((row) => row.ticker)).map((ticker) =>
      ticker.toUpperCase(),
    ),
  );
  const quotes = new Map(
    (input.quotes ?? []).map((quote) => [quote.ticker.toUpperCase(), quote]),
  );
  const prior = input.prior ?? [];
  const now = input.now?.getTime() ?? Date.now();

  const events: IntelligenceEvent[] = clusters.map((cluster) => {
    const tickers = mergeEntities(cluster.items);
    const classified = classifyHeadline(
      cluster.representative.title,
      cluster.representative.summary,
    );
    const novelty = detectNovelty(cluster, prior, Date.parse(cluster.representative.publishedAt));
    const tickerSymbols = tickers.map((entity) => entity.ticker);
    const { themes, sectors } = themesForEvent(
      cluster.representative.title,
      cluster.representative.summary,
      tickerSymbols,
      coverage,
    );
    const materialityScore = rankEvent({
      cluster,
      eventTypeScore: classified.score,
      novelty,
      tickers,
      coverageTickers,
      quotes,
      now,
    });
    const reaction = tickerSymbols
      .map((ticker) => {
        const quote = quotes.get(ticker);
        if (!quote) return null;
        return {
          ticker,
          changePercent: quote.changePercent,
          relativeVolume: quote.relativeVolume,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);

    return {
      id: cluster.clusterId,
      clusterId: cluster.clusterId,
      title: cluster.representative.title,
      summary: cluster.representative.summary,
      eventType: classified.eventType,
      eventTypeLabel: classified.eventTypeLabel,
      publishedAt: cluster.representative.publishedAt,
      novelty,
      materialityScore,
      sentiment: classified.sentiment,
      sentimentNote: classified.sentimentNote,
      confidence: eventConfidence(cluster, tickers),
      tickers,
      themes,
      sectors,
      secondOrder: secondOrderEntities(tickerSymbols, themes, coverage),
      sources: cluster.items.map(toHeadline),
      representative: toHeadline(cluster.representative),
      memberCount: cluster.items.length,
      coverageNotes: coverageNotesFor(cluster),
      marketReaction: reaction,
    };
  });

  return sortEvents(events);
}

export function eventsToHeadlines(
  events: IntelligenceEvent[],
  limit = 16,
): NormalizedNewsItem[] {
  return events.slice(0, limit).map((event) => ({
    id: event.representative.id,
    title: event.title,
    summary: event.summary,
    url: event.representative.url,
    canonicalUrl: event.representative.canonicalUrl,
    publisher: event.representative.publisher,
    publishedAt: event.publishedAt,
    retrievedAt: event.publishedAt,
    tickers: event.tickers.map((entity) => entity.ticker),
    sourceClass: event.representative.sourceClass,
    providerName: event.representative.providerName,
    sourceQuality: event.representative.sourceQuality,
    coverageNotes: event.coverageNotes ?? undefined,
    excerpt: event.summary,
  }));
}
