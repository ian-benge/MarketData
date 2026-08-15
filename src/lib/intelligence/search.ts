import type { IntelligenceEvent, NewsSearchFilters, ParsedNewsQuery } from "./types";
import { parseNewsQuery } from "./search-parse";

function inRange(iso: string, start?: string, until?: string): boolean {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return false;
  if (start && at < Date.parse(start)) return false;
  if (until && at > Date.parse(until)) return false;
  return true;
}

function haystack(event: IntelligenceEvent): string {
  return [
    event.title,
    event.summary ?? "",
    event.eventType,
    event.eventTypeLabel,
    event.themes.join(" "),
    event.sectors.join(" "),
    event.tickers.map((entity) => `${entity.ticker} ${entity.name ?? ""}`).join(" "),
    event.sources.map((source) => `${source.publisher ?? ""} ${source.providerName}`).join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

function tickerSet(event: IntelligenceEvent): Set<string> {
  return new Set(event.tickers.map((entity) => entity.ticker));
}

function secondOrderSet(event: IntelligenceEvent): Set<string> {
  return new Set(event.secondOrder.map((entity) => entity.ticker));
}

export function eventTermHits(event: IntelligenceEvent, terms: string[]): number {
  if (!terms.length) return 0;
  const text = haystack(event);
  return terms.filter((term) => text.includes(term)).length;
}

export function eventMatchesQuery(
  event: IntelligenceEvent,
  parsed: ParsedNewsQuery,
  filters: NewsSearchFilters = {},
): boolean {
  const since = filters.since ?? parsed.timeRange?.start;
  const until = filters.until ?? parsed.timeRange?.end;
  if (!inRange(event.publishedAt, since, until)) return false;

  const tickers = [
    ...new Set([...(filters.tickers ?? []), ...parsed.tickers].map((t) => t.toUpperCase())),
  ];
  if (tickers.length) {
    const primary = tickerSet(event);
    if (!tickers.some((ticker) => primary.has(ticker))) return false;
  }

  const chipTypes = filters.eventTypes ?? [];
  const parsedTypes = parsed.eventTypes;
  const types = [...new Set([...chipTypes, ...parsedTypes])];
  if (chipTypes.length && !chipTypes.includes(event.eventType)) return false;
  if (!chipTypes.length && parsedTypes.length && !parsedTypes.includes(event.eventType)) {
    return false;
  }

  const chipThemes = filters.themes ?? [];
  const parsedThemes = parsed.themes;
  if (chipThemes.length && !chipThemes.some((theme) => event.themes.includes(theme))) {
    return false;
  }
  if (
    !chipThemes.length &&
    parsedThemes.length &&
    !tickers.length &&
    !parsedThemes.some((theme) => event.themes.includes(theme))
  ) {
    return false;
  }

  const sources = [
    ...new Set([...(filters.sources ?? []), ...parsed.sources].map((s) => s.toLowerCase())),
  ];
  if (sources.length) {
    const blob = event.sources
      .map((source) => `${source.publisher ?? ""} ${source.providerName}`.toLowerCase())
      .join(" ");
    if (!sources.some((source) => blob.includes(source))) return false;
  }

  if ((filters.materialOnly || parsed.materialOnly) && event.materialityScore < 45) {
    return false;
  }

  if (filters.novelty?.length && !filters.novelty.includes(event.novelty)) return false;

  if (parsed.textTerms.length) {
    const hits = eventTermHits(event, parsed.textTerms);
    const structured =
      tickers.length > 0 || types.length > 0 || chipThemes.length > 0 || parsedThemes.length > 0;
    if (structured) {
      if (hits === 0 && parsed.textTerms.length >= 3) return false;
    } else if (hits === 0) {
      return false;
    } else if (
      parsed.textTerms.length >= 3 &&
      hits < Math.ceil(parsed.textTerms.length * 0.5)
    ) {
      return false;
    }
  }

  return true;
}

function rankScore(event: IntelligenceEvent, parsed: ParsedNewsQuery): number {
  let score = event.materialityScore;
  if (parsed.tickers.length) {
    const primary = tickerSet(event);
    const related = secondOrderSet(event);
    if (parsed.tickers.some((ticker) => primary.has(ticker))) score += 40;
    else if (parsed.tickers.some((ticker) => related.has(ticker))) score += 8;
  }
  if (parsed.eventTypes.length && parsed.eventTypes.includes(event.eventType)) {
    score += 12;
  }
  if (parsed.themes.length && parsed.themes.some((theme) => event.themes.includes(theme))) {
    score += 10;
  }
  if (parsed.textTerms.length) {
    score += eventTermHits(event, parsed.textTerms) * 6;
  }
  return score;
}

export function searchEvents(
  events: IntelligenceEvent[],
  rawQuery: string,
  filters: NewsSearchFilters = {},
  now = new Date(),
  session?: string | null,
): { parsed: ParsedNewsQuery; results: IntelligenceEvent[] } {
  const parsed = parseNewsQuery(filters.query ?? rawQuery, now, session);
  const matched = events.filter((event) => eventMatchesQuery(event, parsed, filters));
  matched.sort((a, b) => {
    const delta = rankScore(b, parsed) - rankScore(a, parsed);
    if (delta !== 0) return delta;
    return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
  });
  const limit = filters.limit ?? 60;
  return { parsed, results: matched.slice(0, limit) };
}
