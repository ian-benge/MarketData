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
import { marketSymbolsForPositions } from "./coverage";
import {
  UNASSIGNED_OWNER_ID,
  buildOwnerList,
  canEditPositionBook,
  ownerKey,
  positionsForOwner,
  resolveOwnerId,
} from "./owners";
import {
  applyOwnerUnlockFlags,
  listUnlockedOwnerIds,
  ownerViewRequiresUnlock,
} from "./owner-unlock";
import { redactLockedOwnerSnapshot } from "./privacy";
import {
  ensureMainBook,
  listPositionOwners,
  listStoredBooks,
  listStoredBooksForOwner,
  listStoredPositions,
  listStoredPositionsForOwner,
  getStoredAccountValue,
  resolvePersistenceMode,
} from "./store";
import { loadBrokerageSnapshot } from "@/lib/brokerage/sync";
import { EMPTY_BROKERAGE_SNAPSHOT } from "@/lib/brokerage/types";
import { ownerTradeEmailsEnabled } from "./trade-emails";
import type { PositionBook, PositionRecord, PositionsSnapshot } from "./types";

export async function buildPositionsSnapshot(options: {
  user: SessionUser;
  positions?: PositionRecord[];
  includeClosed?: boolean;
  includeHistory?: boolean;
  ownerId?: string | null;
  bookId?: string | null;
  books?: Array<{
    id: string;
    ownerId: string;
    title: string;
    accountValue?: number | null;
    openCount?: number;
    positionCount?: number;
    source?: "manual" | "snaptrade";
    brokerageName?: string | null;
    sortOrder?: number;
  }>;
  accountValue?: number | null;
  unlockedOwnerIds?: ReadonlySet<string>;
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

  const skipUnlock =
    storePersistence === "fixtures" || options.user.isDemo;
  const unlockedOwnerIds = skipUnlock
    ? new Set<string>()
    : (options.unlockedOwnerIds ??
      (await listUnlockedOwnerIds(options.user)));

  const team = await listPositionOwners(options.user);
  const countSource = overlayBookPositions(
    allPositions,
    options.bookId ?? undefined,
    options.positions,
  );
  const ownersRaw = buildOwnerList(team, countSource, options.user.id);
  const inferredOwner =
    options.ownerId ??
    (options.positions?.[0] ? ownerKey(options.positions[0].createdBy) : null);
  const ownerId = resolveOwnerId(inferredOwner, options.user.id, ownersRaw);
  const owners = skipUnlock
    ? ownersRaw
    : applyOwnerUnlockFlags(ownersRaw, options.user.id, unlockedOwnerIds);

  const metricsLocked =
    !skipUnlock &&
    ownerViewRequiresUnlock(options.user.id, ownerId, unlockedOwnerIds);

  if (metricsLocked && ownerId === UNASSIGNED_OWNER_ID) {
    return emptyPositionsSnapshot(null, {
      persistence: storePersistence,
      usingFixtures: false,
      owners,
      ownerId,
      viewerId: options.user.id,
      canEdit: false,
      ownerLocked: true,
      books: [],
      bookId: "",
      brokerage: EMPTY_BROKERAGE_SNAPSHOT,
    });
  }

  const viewingOther =
    !skipUnlock &&
    ownerId !== options.user.id &&
    ownerId !== UNASSIGNED_OWNER_ID;

  if (viewingOther && !options.positions) {
    records = await listStoredPositionsForOwner(options.user, ownerId);
    allPositions = records;
  }

  const storedBooks: Array<{
    id: string;
    ownerId: string;
    title: string;
    accountValue: number | null;
    source?: "manual" | "snaptrade";
    brokerageName?: string | null;
    sortOrder?: number;
  }> = options.books?.length
    ? options.books.map((book, index) => ({
        id: book.id,
        ownerId: book.ownerId,
        title: book.title,
        accountValue: book.accountValue ?? null,
        source: book.source,
        brokerageName: book.brokerageName,
        sortOrder: book.sortOrder ?? index,
      }))
    : [
        ...(viewingOther
          ? await listStoredBooksForOwner(options.user, ownerId)
          : await listStoredBooks(options.user, ownerId)),
      ];

  if (
    !storedBooks.length &&
    ownerId !== UNASSIGNED_OWNER_ID &&
    !options.books?.length
  ) {
    const main = await ensureMainBook(options.user, ownerId);
    if (main) storedBooks.push(main);
  }

  const lotSource = viewingOther && !options.positions ? records : allPositions;
  const scopedBooks = booksForOwner(storedBooks, ownerId);
  const ownerBooks = decorateBooks(
    scopedBooks.length ? scopedBooks : storedBooks,
    overlayBookPositions(
      lotSource,
      options.bookId ?? undefined,
      options.positions,
    ),
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

  const openLots = bookLots.filter((row) => row.status === "open");
  const assembleLots = metricsLocked ? openLots : bookLots;
  const includeClosed = options.includeClosed !== false && !metricsLocked;
  const includeHistory = options.includeHistory === true;

  const market = await loadPositionMarketContext(
    marketSymbolsForPositions(openLots),
    { includeBars: includeHistory },
  );
  const brokerage =
    metricsLocked || ownerId !== options.user.id
      ? EMPTY_BROKERAGE_SNAPSHOT
      : await loadBrokerageSnapshot(options.user, ownerId).catch(
          () => EMPTY_BROKERAGE_SNAPSHOT,
        );
  const accountByBook = new Map(
    brokerage.connections.flatMap((connection) =>
      connection.accounts
        .filter((account) => account.bookId)
        .map((account) => [
          account.bookId as string,
          {
            brokerageName: connection.brokerageName,
            connectionStatus: connection.status,
            lastSyncAt: account.lastSyncAt ?? connection.lastSyncAt,
          },
        ] as const),
    ),
  );
  const activeBook = ownerBooks.find((book) => book.id === bookId) ?? null;
  const accountValueKind: PositionsSnapshot["accountValueKind"] = metricsLocked
    ? null
    : activeBook?.source === "snaptrade"
      ? "broker"
      : "manual";
  const accountValue = metricsLocked
    ? null
    : options.accountValue !== undefined
      ? options.accountValue
      : bookId
        ? (activeBook?.accountValue ??
          (ownerId === options.user.id
            ? await getStoredAccountValue(options.user, bookId)
            : null))
        : null;

  const books: PositionBook[] = ownerBooks.map((book) => {
    const linked = accountByBook.get(book.id);
    const next = {
      ...book,
      source: linked ? ("snaptrade" as const) : (book.source ?? "manual"),
      brokerageName: linked?.brokerageName ?? book.brokerageName ?? null,
      connectionStatus: linked?.connectionStatus ?? null,
      lastSyncAt: linked?.lastSyncAt ?? null,
    };
    return book.id === bookId
      ? { ...next, accountValue: accountValue ?? book.accountValue }
      : next;
  });

  const snapshot = assemblePositionsSnapshot({
    positions: assembleLots,
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
    tradeEmails: await ownerTradeEmailsEnabled(options.user, ownerId),
    canEdit: metricsLocked ? false : canEditPositionBook(options.user, ownerId),
    ownerLocked: metricsLocked,
    brokerage,
    accountValue,
    includeHistory,
    closedIncluded: includeClosed,
    accountValueKind,
  });
  const redacted = metricsLocked ? redactLockedOwnerSnapshot(snapshot) : snapshot;
  if (includeClosed || redacted.ownerLocked) return redacted;
  return {
    ...redacted,
    positions: redacted.positions.filter((row) => row.status === "open"),
    closedIncluded: false,
  };
}
