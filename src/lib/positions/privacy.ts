import { EMPTY_BROKERAGE_SNAPSHOT } from "@/lib/brokerage/types";
import { emptySummary } from "./math";
import type {
  EnrichedPosition,
  PeriodMetrics,
  PositionsSnapshot,
} from "./types";

const EMPTY_PERIOD: PeriodMetrics = {
  price: null,
  pnl: null,
  percent: null,
};

function redactOpenLot(row: EnrichedPosition): EnrichedPosition {
  return {
    ...row,
    quantity: 0,
    entryPrice: 0,
    last: null,
    priorClose: null,
    notes: null,
    costBasis: 0,
    marketValue: null,
    signedMarketValue: null,
    weight: null,
    realizedPnl: null,
    unrealizedPnl: null,
    totalPnl: null,
    returnPercent: null,
    dayPnl: null,
    dayPercent: null,
    change1d: EMPTY_PERIOD,
    change1w: EMPTY_PERIOD,
    change1m: EMPTY_PERIOD,
    sparkline: [],
    relatedRealizedPnl: null,
    relatedRealizedPercent: null,
    fees: 0,
    grossRealizedPnl: null,
  };
}

/**
 * Strip account value, closed lots, size, marks, and P&L from a locked
 * teammate view. Tickers remain so the desk can see that a book exists.
 */
export function redactLockedOwnerSnapshot(
  snapshot: PositionsSnapshot,
): PositionsSnapshot {
  const originalOpen = snapshot.positions.filter((row) => row.status === "open");
  const openLots = originalOpen.map(redactOpenLot);
  const longCount = openLots.filter((row) => row.side === "long").length;
  const shortCount = openLots.filter((row) => row.side === "short").length;
  const unrealizedPnl = null;
  const dayPnl = null;
  const costBasis = null;
  const invested = null;

  return {
    ...snapshot,
    accountValue: null,
    canEdit: false,
    ownerLocked: true,
    positions: openLots,
    series: [],
    history: {},
    brokerage: EMPTY_BROKERAGE_SNAPSHOT,
    books: snapshot.books.map((book) => ({
      ...book,
      accountValue: null,
      fees: 0,
      brokerageName: null,
      connectionStatus: null,
      lastSyncAt: null,
    })),
    summary: {
      ...emptySummary(),
      openCount: openLots.length,
      longCount,
      shortCount,
      quotedCount: originalOpen.filter((row) => row.last != null).length,
      unrealizedPnl,
      totalPnl: unrealizedPnl,
      dayPnl,
      bookReturnPercent:
        costBasis != null && costBasis > 0 && unrealizedPnl != null
          ? (unrealizedPnl / costBasis) * 100
          : null,
      dayPercent:
        invested != null && invested > 0 && dayPnl != null
          ? (dayPnl / invested) * 100
          : null,
    },
  };
}
