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

function sumFinite(values: Array<number | null | undefined>): number | null {
  let total = 0;
  let seen = false;
  for (const value of values) {
    if (value == null || !Number.isFinite(value)) continue;
    total += value;
    seen = true;
  }
  return seen ? total : null;
}

function redactOpenLot(row: EnrichedPosition): EnrichedPosition {
  return {
    ...row,
    notes: null,
    costBasis: 0,
    marketValue: null,
    signedMarketValue: null,
    weight: null,
    realizedPnl: null,
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
 * Strip account value, closed lots, notes, and book-composition fields from a
 * teammate view. Open-lot day P&L and unrealized P&L stay visible.
 */
export function redactLockedOwnerSnapshot(
  snapshot: PositionsSnapshot,
): PositionsSnapshot {
  const originalOpen = snapshot.positions.filter((row) => row.status === "open");
  const openLots = originalOpen.map(redactOpenLot);
  const longCount = openLots.filter((row) => row.side === "long").length;
  const shortCount = openLots.filter((row) => row.side === "short").length;
  const unrealizedPnl = sumFinite(originalOpen.map((row) => row.unrealizedPnl));
  const dayPnl = sumFinite(originalOpen.map((row) => row.dayPnl));
  const costBasis = sumFinite(originalOpen.map((row) => row.costBasis));
  const invested = sumFinite(originalOpen.map((row) => row.marketValue));

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
