import { describe, expect, it } from "vitest";
import { emptyPositionsSnapshot } from "./assemble";
import {
  marketSymbolsForPositions,
  mergePolledSnapshot,
  positionsCoverageCopy,
} from "./coverage";
import { emptySummary } from "./math";
import type { EnrichedPosition, PositionRecord, PositionsSnapshot } from "./types";

function lot(
  ticker: string,
  status: "open" | "closed" = "open",
): PositionRecord {
  return {
    id: `pos-${ticker}-${status}`,
    firmId: "firm-1",
    ticker,
    assetType: ticker.length > 6 ? "option" : "equity",
    side: "long",
    quantity: 1,
    multiplier: ticker.length > 6 ? 100 : 1,
    entryPrice: 1,
    entryDate: "2026-02-02",
    currency: "USD",
    strategy: null,
    notes: null,
    status,
    closePrice: status === "closed" ? 1.2 : null,
    closeDate: status === "closed" ? "2026-02-02" : null,
    closedAt: status === "closed" ? "2026-02-02T21:00:00.000Z" : null,
    createdBy: "user-1",
    bookId: "book-1",
    createdAt: "2026-02-02T14:00:00.000Z",
    updatedAt: "2026-02-02T14:00:00.000Z",
  };
}

describe("marketSymbolsForPositions", () => {
  it("quotes open lots only", () => {
    expect(
      marketSymbolsForPositions([
        lot("AAPL"),
        lot("MSFT260202C00430000", "closed"),
        lot("MSFT260202C00430000", "closed"),
        lot("GLD"),
      ]),
    ).toEqual(["AAPL", "GLD"]);
  });

  it("returns no symbols for a closed-only book", () => {
    expect(
      marketSymbolsForPositions([
        lot("MSFT260202C00430000", "closed"),
        lot("NVDA260202P00100000", "closed"),
      ]),
    ).toEqual([]);
  });
});

describe("positionsCoverageCopy", () => {
  it("does not say Unavailable or 0/n when nothing is open", () => {
    const copy = positionsCoverageCopy({
      quotesRequested: 0,
      quotesCovered: 0,
      latencyCoverageLabel: "Real-time — IEX",
      usingFixtures: false,
      ownerLocked: false,
      summary: { ...emptySummary(), openCount: 0, closedCount: 12 },
    });
    expect(copy.label).toBe("Flat · no live marks required");
    expect(copy.detail).toBe("");
    expect(copy.label).not.toMatch(/Unavailable|Real-time|0\/14|0\/154/i);
  });

  it("does not say Unavailable on a locked empty teammate book", () => {
    const copy = positionsCoverageCopy({
      quotesRequested: 0,
      quotesCovered: 0,
      latencyCoverageLabel: "Unavailable",
      usingFixtures: false,
      ownerLocked: true,
      summary: emptySummary(),
    });
    expect(copy.label).toBe("No open lots to mark");
    expect(copy.label).not.toMatch(/Unavailable|Real-time/i);
  });

  it("reports open coverage as k/n open marked", () => {
    const copy = positionsCoverageCopy({
      quotesRequested: 12,
      quotesCovered: 12,
      latencyCoverageLabel: "Real-time — IEX",
      usingFixtures: false,
      ownerLocked: false,
      summary: { ...emptySummary(), openCount: 12 },
    });
    expect(copy.detail).toBe("12/12 open marked");
    expect(copy.label).toBe("Real-time — IEX");
  });
});

describe("mergePolledSnapshot", () => {
  it("keeps previously loaded closed lots when the poll omitted them", () => {
    const closed = {
      ...lot("MSFT260202C00430000", "closed"),
      last: null,
      priorClose: null,
      mark: 1.2,
      currency: "USD",
      costBasis: 100,
      marketValue: null,
      signedMarketValue: null,
      weight: null,
      unrealizedPnl: null,
      realizedPnl: -20,
      totalPnl: -20,
      returnPercent: -20,
      dayPnl: null,
      dayPercent: null,
      change1d: { price: null, pnl: null, percent: null },
      change1w: { price: null, pnl: null, percent: null },
      change1m: { price: null, pnl: null, percent: null },
      sinceEntry: { price: 1, pnl: -20, percent: -20 },
      holdingDays: 0,
      quoteStale: false,
      missing: [],
      sparkline: [0, -20],
      relatedRealizedPnl: -20,
      relatedRealizedPercent: -20,
      fees: 1.3,
      grossRealizedPnl: -18.7,
    } as EnrichedPosition;
    const previous = {
      ...emptyPositionsSnapshot(null),
      bookId: "book-1",
      ownerId: "user-1",
      closedIncluded: true,
      positions: [closed],
      summary: { ...emptySummary(), closedCount: 1 },
    } as PositionsSnapshot;
    const polled = {
      ...previous,
      closedIncluded: false,
      positions: [],
      summary: { ...emptySummary(), closedCount: 1, totalPnl: -20 },
    };
    const merged = mergePolledSnapshot(previous, polled);
    expect(merged.positions).toHaveLength(1);
    expect(merged.positions[0]?.id).toBe(closed.id);
    expect(merged.summary.totalPnl).toBe(-20);
  });
});
