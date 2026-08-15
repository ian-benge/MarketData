import { createHash } from "node:crypto";
import {
  buildEvidenceNumberTokens,
} from "@/lib/reports/quality-gate";
import type {
  IntelligenceBundle,
  IntelligenceEvent,
  MoveExplanation,
  QuoteContext,
} from "@/lib/intelligence/types";
import type { NormalizedCalendarEvent } from "@/lib/providers/types";
import { sanitizeUntrusted } from "./sanitize";
import type {
  EvidenceCalendarItem,
  EvidenceEvent,
  EvidenceMove,
  EvidencePack,
  EvidencePosition,
  EvidenceQuote,
  EvidenceSource,
} from "./types";

function stable(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stable).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => a.localeCompare(b),
    );
    return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function evidenceHash(identity: unknown): string {
  return createHash("sha256").update(stable(identity)).digest("hex").slice(0, 32);
}

function roundPct(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function compactEvent(
  event: IntelligenceEvent,
  coverage: Set<string>,
): EvidenceEvent {
  return {
    id: event.id,
    title: sanitizeUntrusted(event.title, 280),
    summary: event.summary ? sanitizeUntrusted(event.summary, 420) : undefined,
    eventType: event.eventType,
    publishedAt: event.publishedAt,
    materialityScore: Math.round(event.materialityScore),
    novelty: event.novelty,
    tickers: event.tickers.map((row) => row.ticker),
    themes: event.themes,
    sourceIds: event.sources.map((source) => source.id),
    coverageHit: event.tickers.some((row) => coverage.has(row.ticker)),
  };
}

function sourceIdsForMove(
  move: MoveExplanation,
  events: IntelligenceEvent[],
): string[] {
  const byId = new Map(events.map((event) => [event.id, event]));
  const ids: string[] = [];
  for (const supporting of move.supportingEvents) {
    const event = byId.get(supporting.id);
    if (event) {
      ids.push(...event.sources.map((source) => source.id));
    }
  }
  return [...new Set(ids)].slice(0, 6);
}

function compactMove(
  move: MoveExplanation,
  inBook: Set<string>,
  coverage: Set<string>,
  events: IntelligenceEvent[],
): EvidenceMove {
  return {
    ticker: move.ticker,
    significant: move.significant,
    changePercent: roundPct(move.changePercent),
    relativeVolume: roundPct(move.relativeVolume),
    attribution: move.attribution,
    confidence: move.confidence,
    evidenceNature: move.evidenceNature,
    headline: sanitizeUntrusted(move.headline, 240),
    detail: sanitizeUntrusted(move.detail, 480),
    sourceIds: sourceIdsForMove(move, events),
    relatedTickers: move.relatedTickers,
    inBook: inBook.has(move.ticker),
    onCoverage: coverage.has(move.ticker),
  };
}

export function buildEvidencePack(input: {
  bundle: IntelligenceBundle;
  quotes?: QuoteContext[];
  coverageTickers?: string[];
  inBookTickers?: string[];
  positions?: EvidencePosition[];
  calendar?: NormalizedCalendarEvent[] | EvidenceCalendarItem[];
  session?: string | null;
  eventLimit?: number;
  ownerLocked?: boolean;
  focusTickers?: string[];
}): EvidencePack {
  const coverage = new Set(
    (input.coverageTickers ?? []).map((ticker) => ticker.toUpperCase()),
  );
  const inBook = new Set(
    (input.inBookTickers ?? []).map((ticker) => ticker.toUpperCase()),
  );
  const focus = new Set(
    (input.focusTickers ?? []).map((ticker) => ticker.toUpperCase()),
  );
  const limit = input.eventLimit ?? 24;
  const focusedEvents = input.bundle.events.filter((event) =>
    event.tickers.some((entity) => focus.has(entity.ticker)),
  );
  const rankedRest = input.bundle.events
    .filter((event) => !focusedEvents.some((row) => row.id === event.id))
    .slice()
    .sort((a, b) => b.materialityScore - a.materialityScore);
  const selectedEvents = [...focusedEvents, ...rankedRest].slice(
    0,
    Math.max(limit, focusedEvents.length),
  );
  const events = selectedEvents.map((event) => compactEvent(event, coverage));
  const focusedMoves = input.bundle.moves.filter((move) => focus.has(move.ticker));
  const significantRest = input.bundle.moves.filter(
    (move) => move.significant && !focus.has(move.ticker),
  );
  const moves = [...focusedMoves, ...significantRest]
    .slice(0, 24)
    .map((move) => compactMove(move, inBook, coverage, input.bundle.events));
  const packEvents = focusedEvents.length
    ? [...focusedEvents, ...input.bundle.events.filter((event) => !focusedEvents.includes(event))]
    : input.bundle.events;
  const sourceMap = new Map<string, EvidenceSource>();
  for (const event of packEvents.slice(0, Math.max(40, focusedEvents.length))) {
    for (const source of event.sources) {
      if (sourceMap.has(source.id)) continue;
      sourceMap.set(source.id, {
        id: source.id,
        title: sanitizeUntrusted(source.title, 280),
        url: source.url,
        publisher: source.publisher,
        publishedAt: source.publishedAt,
        sourceClass: source.sourceClass,
        tickers: event.tickers.map((row) => row.ticker),
      });
    }
  }
  const quoteRows = input.quotes ?? [];
  const focusedQuotes = quoteRows.filter((quote) => focus.has(quote.ticker.toUpperCase()));
  const otherQuotes = quoteRows.filter((quote) => !focus.has(quote.ticker.toUpperCase()));
  const quotes: EvidenceQuote[] = [...focusedQuotes, ...otherQuotes]
    .slice(0, 60)
    .map((quote) => ({
      ticker: quote.ticker.toUpperCase(),
      name: quote.name ?? null,
      changePercent: roundPct(quote.changePercent),
      relativeVolume: roundPct(quote.relativeVolume),
    }));
  const calendar: EvidenceCalendarItem[] = (input.calendar ?? [])
    .slice(0, 12)
    .map((row) => ({
      id: row.id,
      title: sanitizeUntrusted(row.title, 160),
      scheduledAt: "scheduledAt" in row ? row.scheduledAt : "",
      importance: "importance" in row ? (row.importance ?? null) : null,
    }));
  const positions = (input.positions ?? []).slice(0, 40).map((row) => ({
    ...row,
    ticker: row.ticker.toUpperCase(),
    dayPnl: roundPct(row.dayPnl),
    dayPercent: roundPct(row.dayPercent),
    weight: roundPct(row.weight),
    unrealizedPnl: roundPct(row.unrealizedPnl),
  }));
  const numbers: Array<number | null | undefined> = [
    ...quotes.flatMap((row) => [row.changePercent, row.relativeVolume, row.last]),
    ...moves.flatMap((row) => [row.changePercent, row.relativeVolume]),
    ...events.map((row) => row.materialityScore),
    ...positions.flatMap((row) => [
      row.dayPnl,
      row.dayPercent,
      row.weight,
      row.unrealizedPnl,
    ]),
    events.length,
    moves.length,
    positions.length,
    quotes.length,
  ];
  const allowedTickers = [
    ...new Set([
      ...events.flatMap((row) => row.tickers),
      ...moves.map((row) => row.ticker),
      ...quotes.map((row) => row.ticker),
      ...positions.map((row) => row.ticker),
      ...coverage,
      ...inBook,
    ]),
  ];
  const attributionByTicker: EvidencePack["attributionByTicker"] = {};
  for (const move of moves) {
    attributionByTicker[move.ticker] = move.attribution;
  }
  const identity = {
    session: input.session ?? input.bundle.sources[0]?.id ?? null,
    events: events.map((row) => [
      row.id,
      row.eventType,
      row.materialityScore,
      row.tickers,
    ]),
    moves: moves.map((row) => [
      row.ticker,
      row.attribution,
      row.changePercent,
      row.sourceIds,
    ]),
    quotes: quotes.map((row) => [row.ticker, row.changePercent, row.relativeVolume]),
    inBook: [...inBook].sort(),
    coverage: [...coverage].sort(),
    positions: positions.map((row) => [
      row.ticker,
      row.side,
      row.dayPercent,
      row.weight,
    ]),
    calendar: calendar.map((row) => [row.id, row.scheduledAt, row.importance]),
    ownerLocked: input.ownerLocked === true,
    gaps: input.bundle.gaps.map((gap) => gap.code).sort(),
  };
  return {
    asOf: input.bundle.fetchedAt,
    session: input.session ?? null,
    sources: [...sourceMap.values()],
    allowedTickers,
    inBookTickers: [...inBook],
    coverageTickers: [...coverage],
    events,
    moves,
    quotes,
    positions,
    calendar,
    gaps: input.bundle.gaps.map((gap) => gap.message),
    numberTokens: buildEvidenceNumberTokens(numbers),
    attributionByTicker,
    identity,
    ownerLocked: input.ownerLocked === true,
  };
}

export function modelEvidenceView(pack: EvidencePack) {
  return {
    asOf: pack.asOf,
    session: pack.session,
    allowedTickers: pack.allowedTickers,
    inBookTickers: pack.inBookTickers,
    coverageTickers: pack.coverageTickers,
    gaps: pack.gaps,
    sources: pack.sources.map((source) => ({
      id: source.id,
      title: source.title,
      url: source.url,
      publisher: source.publisher,
      publishedAt: source.publishedAt,
      sourceClass: source.sourceClass,
      tickers: source.tickers,
    })),
    events: pack.events,
    moves: pack.moves,
    quotes: pack.quotes,
    positions: pack.positions,
    calendar: pack.calendar,
    attributionByTicker: pack.attributionByTicker,
  };
}
