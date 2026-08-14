import { describe, expect, it } from "vitest";
import { assemblePositionsSnapshot } from "./assemble";
import { redactLockedOwnerSnapshot } from "./privacy";
import type { PositionQuote, PositionRecord } from "./types";

function lot(
  ticker: string,
  extra: Partial<PositionRecord> = {},
): PositionRecord {
  return {
    id: `pos-${ticker}`,
    firmId: "firm-1",
    ticker,
    assetType: "equity",
    side: "long",
    quantity: 10,
    multiplier: 1,
    entryPrice: 100,
    entryDate: "2026-07-01",
    currency: "USD",
    strategy: "core",
    notes: "desk thesis",
    status: "open",
    closePrice: null,
    closeDate: null,
    closedAt: null,
    createdBy: "user-2",
    bookId: "book-1",
    createdAt: "2026-07-01T14:00:00.000Z",
    updatedAt: "2026-07-01T14:00:00.000Z",
    ...extra,
  };
}

const quotes = new Map<string, PositionQuote>([
  [
    "AAPL",
    {
      ticker: "AAPL",
      last: 190,
      priorClose: 185,
      open: 186,
      changeAbsolute: 5,
      changePercent: 2.7,
      currency: "USD",
      stale: false,
    },
  ],
  [
    "MSFT",
    {
      ticker: "MSFT",
      last: 400,
      priorClose: 390,
      open: 392,
      changeAbsolute: 10,
      changePercent: 2.56,
      currency: "USD",
      stale: false,
    },
  ],
]);

describe("redactLockedOwnerSnapshot", () => {
  it("keeps open tape fields and strips money, closed lots, and notes", () => {
    const snapshot = assemblePositionsSnapshot({
      positions: [
        lot("AAPL"),
        lot("MSFT", {
          id: "pos-MSFT",
          status: "closed",
          closePrice: 410,
          closeDate: "2026-08-01",
          closedAt: "2026-08-01T15:00:00.000Z",
        }),
      ],
      quotes,
      closes: new Map([
        [
          "AAPL",
          [
            { date: "2026-08-12", close: 185 },
            { date: "2026-08-13", close: 190 },
          ],
        ],
      ]),
      asOf: "2026-08-13T15:00:00.000Z",
      persistence: "supabase",
      usingFixtures: false,
      latencyCoverageLabel: "Live",
      ownerId: "user-2",
      viewerId: "user-1",
      canEdit: true,
      ownerLocked: false,
      accountValue: 250_000,
      books: [
        {
          id: "book-1",
          ownerId: "user-2",
          title: "IRA",
          accountValue: 250_000,
          openCount: 1,
          positionCount: 2,
          fees: 12.5,
        },
      ],
      bookId: "book-1",
    });

    expect(snapshot.positions).toHaveLength(2);
    expect(snapshot.summary.totalPnl).not.toBeNull();
    expect(snapshot.accountValue).toBe(250_000);

    const redacted = redactLockedOwnerSnapshot(snapshot);

    expect(redacted.ownerLocked).toBe(true);
    expect(redacted.canEdit).toBe(false);
    expect(redacted.accountValue).toBeNull();
    expect(redacted.positions).toHaveLength(1);

    const open = redacted.positions[0]!;
    expect(open.ticker).toBe("AAPL");
    expect(open.quantity).toBe(10);
    expect(open.entryPrice).toBe(100);
    expect(open.last).toBe(190);
    expect(open.notes).toBeNull();
    expect(open.marketValue).toBeNull();
    expect(open.weight).toBeNull();
    expect(open.unrealizedPnl).toBeNull();
    expect(open.dayPnl).toBeNull();
    expect(open.totalPnl).toBeNull();
    expect(open.sparkline).toEqual([]);
    expect(open.costBasis).toBe(0);

    expect(redacted.summary.openCount).toBe(1);
    expect(redacted.summary.longCount).toBe(1);
    expect(redacted.summary.shortCount).toBe(0);
    expect(redacted.summary.totalPnl).toBeNull();
    expect(redacted.summary.accountValue).toBeNull();
    expect(redacted.summary.portfolioValue).toBeNull();
    expect(redacted.summary.dayPnl).toBeNull();
    expect(redacted.series).toEqual([]);
    expect(redacted.history).toEqual({});
    expect(redacted.brokerage?.connections).toEqual([]);
    expect(redacted.books[0]).toMatchObject({
      title: "IRA",
      accountValue: null,
      fees: 0,
    });
  });

  it("does not change an already-unlocked snapshot when not called", () => {
    const snapshot = assemblePositionsSnapshot({
      positions: [lot("AAPL")],
      quotes,
      closes: new Map(),
      asOf: "2026-08-13T15:00:00.000Z",
      persistence: "supabase",
      usingFixtures: false,
      latencyCoverageLabel: "Live",
      accountValue: 250_000,
    });
    expect(snapshot.ownerLocked).toBe(false);
    expect(snapshot.accountValue).toBe(250_000);
    expect(snapshot.positions[0]?.totalPnl).not.toBeNull();
  });
});
