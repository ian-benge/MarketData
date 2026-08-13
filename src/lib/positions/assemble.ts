import {
  applyWeights,
  attachRelatedRealized,
  buildPortfolioSeries,
  emptySummary,
  enrichPosition,
  summarizePositions,
} from "./math";
import type {
  DailyClose,
  PositionBook,
  PositionBookOwner,
  PositionQuote,
  PositionRecord,
  PositionsSnapshot,
  EnrichedPosition,
} from "./types";

export function toPositionRecord(row: EnrichedPosition): PositionRecord {
  return {
    id: row.id,
    firmId: row.firmId,
    ticker: row.ticker,
    assetType: row.assetType,
    side: row.side,
    quantity: row.quantity,
    multiplier: row.multiplier,
    entryPrice: row.entryPrice,
    entryDate: row.entryDate,
    currency: row.currency || "USD",
    strategy: row.strategy,
    notes: row.notes,
    status: row.status,
    closePrice: row.closePrice,
    closeDate: row.closeDate,
    closedAt: row.closedAt,
    createdBy: row.createdBy,
    bookId: row.bookId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export type AssemblePositionsInput = {
  positions: PositionRecord[];
  quotes: Map<string, PositionQuote>;
  closes: Map<string, DailyClose[]>;
  asOf: string;
  persistence: PositionsSnapshot["persistence"];
  usingFixtures: boolean;
  stale?: boolean;
  latencyCoverageLabel: string;
  feedCoverage?: string;
  latencyClass?: string;
  marketSession?: string | null;
  licenseWarning?: string | null;
  error?: string | null;
  owners?: PositionBookOwner[];
  ownerId?: string;
  books?: PositionBook[];
  bookId?: string;
  viewerId?: string;
  canEdit?: boolean;
  accountValue?: number | null;
};

export function assemblePositionsSnapshot(
  input: AssemblePositionsInput,
): PositionsSnapshot {
  const requested = new Set(
    input.positions.map((position) => position.ticker.toUpperCase()),
  );
  const quotesRequested = requested.size;
  const quotesCovered = [...requested].filter((ticker) => {
    const quote = input.quotes.get(ticker);
    return quote?.last != null;
  }).length;
  const accountValue =
    input.accountValue != null &&
    Number.isFinite(input.accountValue) &&
    input.accountValue > 0
      ? input.accountValue
      : null;

  const enriched = applyWeights(
    attachRelatedRealized(
      input.positions.map((position) =>
        enrichPosition(
          position,
          input.quotes.get(position.ticker.toUpperCase()),
          input.closes.get(position.ticker.toUpperCase()),
          input.asOf,
        ),
      ),
    ),
    accountValue,
  );

  const stale =
    input.stale === true ||
    enriched.some((row) => row.status === "open" && row.quoteStale);

  return {
    asOf: input.asOf,
    stale,
    usingFixtures: input.usingFixtures,
    persistence: input.persistence,
    latencyCoverageLabel: input.latencyCoverageLabel,
    feedCoverage: input.feedCoverage ?? "unknown",
    latencyClass: input.latencyClass ?? (input.usingFixtures ? "mock" : "unavailable"),
    marketSession: input.marketSession ?? null,
    licenseWarning: input.licenseWarning ?? null,
    quotesRequested,
    quotesCovered,
    accountValue,
    summary: enriched.length
      ? summarizePositions(enriched, input.asOf, accountValue)
      : emptySummary(),
    positions: enriched,
    series: buildPortfolioSeries(input.positions, input.closes),
    history: Object.fromEntries(input.closes.entries()),
    owners: input.owners ?? [],
    ownerId: input.ownerId ?? "",
    books: input.books ?? [],
    bookId: input.bookId ?? "",
    viewerId: input.viewerId ?? "",
    canEdit: input.canEdit ?? false,
    error: input.error ?? null,
  };
}

export function emptyPositionsSnapshot(
  error: string | null,
  extra?: Partial<PositionsSnapshot>,
): PositionsSnapshot {
  const now = new Date().toISOString();
  return {
    asOf: now,
    stale: true,
    usingFixtures: false,
    persistence: "unavailable",
    latencyCoverageLabel: "Unavailable",
    feedCoverage: "unknown",
    latencyClass: "unavailable",
    marketSession: null,
    licenseWarning: extra?.licenseWarning ?? null,
    quotesRequested: 0,
    quotesCovered: 0,
    accountValue: null,
    summary: emptySummary(),
    positions: [],
    series: [],
    history: {},
    owners: extra?.owners ?? [],
    ownerId: extra?.ownerId ?? "",
    books: extra?.books ?? [],
    bookId: extra?.bookId ?? "",
    viewerId: extra?.viewerId ?? "",
    canEdit: extra?.canEdit ?? false,
    error,
    ...extra,
  };
}

/** Recompute weights and portfolio/cash metrics for a loaded snapshot. */
export function applyAccountValueToSnapshot(
  snapshot: PositionsSnapshot,
  accountValue: number | null | undefined,
): PositionsSnapshot {
  const normalized =
    accountValue != null && Number.isFinite(accountValue) && accountValue > 0
      ? accountValue
      : null;
  if (normalized === (snapshot.accountValue ?? null)) {
    return snapshot;
  }
  const positions = applyWeights(snapshot.positions, normalized);
  return {
    ...snapshot,
    accountValue: normalized,
    books: snapshot.books.map((book) =>
      book.id === snapshot.bookId
        ? { ...book, accountValue: normalized }
        : book,
    ),
    positions,
    summary: summarizePositions(positions, snapshot.asOf, normalized),
  };
}
