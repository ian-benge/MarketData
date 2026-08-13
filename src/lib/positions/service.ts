import type { SessionUser } from "@/lib/auth/session";
import { assemblePositionsSnapshot, emptyPositionsSnapshot } from "./assemble";
import {
  booksForOwner,
  decorateBooks,
  overlayBookPositions,
  positionsForBook,
  resolveBookId,
} from "./books";
import { loadPositionMarketContext } from "./market";
import {
  UNASSIGNED_OWNER_ID,
  buildOwnerList,
  canEditPositionBook,
  ownerKey,
  positionsForOwner,
  resolveOwnerId,
} from "./owners";
import {
  ensureMainBook,
  listPositionOwners,
  listStoredBooks,
  listStoredPositions,
  getStoredAccountValue,
  resolvePersistenceMode,
} from "./store";
import type { PositionBook, PositionRecord, PositionsSnapshot } from "./types";

export async function buildPositionsSnapshot(options: {
  user: SessionUser;
  positions?: PositionRecord[];
  includeClosed?: boolean;
  ownerId?: string | null;
  bookId?: string | null;
  books?: Array<{
    id: string;
    ownerId: string;
    title: string;
    accountValue?: number | null;
    openCount?: number;
    positionCount?: number;
  }>;
  accountValue?: number | null;
}): Promise<PositionsSnapshot> {
  const persistence = resolvePersistenceMode(options.user);
  let records = options.positions;
  let storePersistence = persistence;
  let allPositions: PositionRecord[] = options.positions ?? [];

  if (!records) {
    const stored = await listStoredPositions(options.user);
    records = stored.positions;
    allPositions = stored.positions;
    storePersistence = stored.persistence;
  } else {
    const stored = await listStoredPositions(options.user).catch(() => ({
      positions: [] as PositionRecord[],
      persistence,
    }));
    allPositions = stored.positions.length ? stored.positions : records;
  }

  if (storePersistence === "unavailable" && !options.positions) {
    return emptyPositionsSnapshot(
      "A live position blotter is not connected in this environment. Demo books are hidden outside demo mode.",
      { viewerId: options.user.id },
    );
  }

  const team = await listPositionOwners(options.user);
  const countSource = overlayBookPositions(
    allPositions,
    options.bookId ?? undefined,
    options.positions,
  );
  const owners = buildOwnerList(team, countSource, options.user.id);
  const inferredOwner =
    options.ownerId ??
    (options.positions?.[0] ? ownerKey(options.positions[0].createdBy) : null);
  const ownerId = resolveOwnerId(inferredOwner, options.user.id, owners);

  const storedBooks: Array<{
    id: string;
    ownerId: string;
    title: string;
    accountValue: number | null;
  }> = options.books?.length
    ? options.books.map((book) => ({
        id: book.id,
        ownerId: book.ownerId,
        title: book.title,
        accountValue: book.accountValue ?? null,
      }))
    : [...(await listStoredBooks(options.user, ownerId))];

  if (
    !storedBooks.length &&
    ownerId !== UNASSIGNED_OWNER_ID &&
    !options.books?.length
  ) {
    const main = await ensureMainBook(options.user, ownerId);
    if (main) storedBooks.push(main);
  }

  const scopedBooks = booksForOwner(storedBooks, ownerId);
  const ownerBooks = decorateBooks(
    scopedBooks.length ? scopedBooks : storedBooks,
    countSource,
  );
  const bookId = resolveBookId(options.bookId, ownerBooks);

  const ownerLots = options.positions
    ? options.positions
    : positionsForOwner(records, ownerId);
  const matchedBookLots = bookId
    ? positionsForBook(ownerLots, bookId)
    : ownerLots;
  const bookLots =
    bookId && options.positions && matchedBookLots.length === 0
      ? ownerLots
      : matchedBookLots;

  const visible =
    options.includeClosed === false
      ? bookLots.filter((row) => row.status === "open")
      : bookLots;

  const market = await loadPositionMarketContext(visible.map((row) => row.ticker));
  const activeBook = ownerBooks.find((book) => book.id === bookId) ?? null;
  const accountValue =
    options.accountValue !== undefined
      ? options.accountValue
      : bookId
        ? (activeBook?.accountValue ??
          (await getStoredAccountValue(options.user, bookId)))
        : null;

  const books: PositionBook[] = ownerBooks.map((book) =>
    book.id === bookId
      ? { ...book, accountValue: accountValue ?? book.accountValue }
      : book,
  );

  return assemblePositionsSnapshot({
    positions: visible,
    quotes: market.quotes,
    closes: market.closes,
    asOf: market.asOf,
    persistence: storePersistence,
    usingFixtures: storePersistence === "fixtures",
    stale: market.stale,
    latencyCoverageLabel: market.latencyCoverageLabel,
    feedCoverage: market.feedCoverage,
    latencyClass: market.latencyClass,
    marketSession: market.marketSession,
    licenseWarning: market.licenseWarning,
    error: market.error,
    owners,
    ownerId,
    books,
    bookId,
    viewerId: options.user.id,
    canEdit: canEditPositionBook(options.user, ownerId),
    accountValue,
  });
}
