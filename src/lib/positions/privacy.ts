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
    notes: null,
    costBasis: 0,
    marketValue: null,
    signedMarketValue: null,
    weight: null,
    unrealizedPnl: null,
    realizedPnl: null,
    totalPnl: null,
    returnPercent: null,
    dayPnl: null,
    dayPercent: null,
    change1d: EMPTY_PERIOD,
    change1w: EMPTY_PERIOD,
    change1m: EMPTY_PERIOD,
    sinceEntry: EMPTY_PERIOD,
    sparkline: [],
    relatedRealizedPnl: null,
    relatedRealizedPercent: null,
    fees: 0,
    grossRealizedPnl: null,
  };
}

/** Strip account value, P&L, closed lots, and other money fields from a teammate view. */
export function redactLockedOwnerSnapshot(
  snapshot: PositionsSnapshot,
): PositionsSnapshot {
  const openLots = snapshot.positions
    .filter((row) => row.status === "open")
    .map(redactOpenLot);
  const longCount = openLots.filter((row) => row.side === "long").length;
  const shortCount = openLots.filter((row) => row.side === "short").length;

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
    },
  };
}
