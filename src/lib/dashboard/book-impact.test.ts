import { describe, expect, it } from "vitest";
import {
  attachMovesToBookImpact,
  compactBookImpact,
  emptyBookImpact,
} from "@/lib/dashboard/book-impact";
import { emptyPositionsSnapshot } from "@/lib/positions/assemble";
import type { EnrichedPosition, PositionsSnapshot } from "@/lib/positions/types";
import type { MoveExplanation } from "@/lib/intelligence/types";

const NOW = "2026-08-16T14:30:00.000Z";

function position(overrides: Partial<EnrichedPosition>): EnrichedPosition {
  return {
    id: "p1",
    firmId: "firm",
    ticker: "NVDA",
    assetType: "equity",
    side: "long",
    quantity: 10,
    multiplier: 1,
    entryPrice: 100,
    entryDate: "2026-01-01",
    currency: "USD",
    strategy: null,
    notes: null,
    status: "open",
    closePrice: null,
    closeDate: null,
    closedAt: null,
    createdBy: "user",
    bookId: "book",
    createdAt: NOW,
    updatedAt: NOW,
    last: 110,
    priorClose: 105,
    mark: 110,
    costBasis: 1000,
    marketValue: 1100,
    signedMarketValue: 1100,
    weight: 0.4,
    unrealizedPnl: 100,
    realizedPnl: 0,
    totalPnl: 100,
    returnPercent: 10,
    dayPnl: 50,
    dayPercent: 4.76,
    change1d: { price: 110, pnl: 50, percent: 4.76 },
    change1w: { price: 110, pnl: 50, percent: 4.76 },
    change1m: { price: 110, pnl: 50, percent: 4.76 },
    sinceEntry: { price: 110, pnl: 100, percent: 10 },
    holdingDays: 20,
    quoteStale: false,
    missing: [],
    sparkline: [],
    relatedRealizedPnl: null,
    relatedRealizedPercent: null,
    fees: 0,
    grossRealizedPnl: null,
    ...overrides,
  };
}

function move(ticker: string, attribution: MoveExplanation["attribution"]): MoveExplanation {
  return {
    ticker,
    significant: true,
    changePercent: 4.76,
    relativeVolume: 2,
    session: "regular",
    flags: ["move"],
    direction: "up",
    attribution,
    confidence: "unknown",
    evidenceNature: "fact",
    causalStatus: attribution === "unknown" ? "unclear" : "reported",
    headline: attribution === "unknown" ? "No verified catalyst" : "Filing",
    detail: "test",
    supportingEvents: [],
    relatedTickers: [],
    themes: [],
    window: { start: NOW, end: NOW, label: "Session" },
    coverageGap: null,
  };
}

describe("compactBookImpact", () => {
  it("ranks open lots by day P&L and flags unexplained tape", () => {
    const snapshot = {
      ...emptyPositionsSnapshot(null),
      asOf: NOW,
      persistence: "fixtures" as const,
      usingFixtures: true,
      stale: false,
      summary: {
        ...emptyPositionsSnapshot(null).summary,
        openCount: 2,
        quotedCount: 2,
        dayPnl: 40,
        dayPercent: 1.2,
        largestWeight: 0.4,
      },
      positions: [
        position({ ticker: "NVDA", dayPnl: 50, dayPercent: 4.76 }),
        position({
          id: "p2",
          ticker: "AMD",
          dayPnl: -12,
          dayPercent: -1.1,
        }),
      ],
    } satisfies PositionsSnapshot;

    const result = compactBookImpact(snapshot, [
      move("AMD", "unknown"),
      move("NVDA", "confirmed_company"),
    ]);
    expect(result.openCount).toBe(2);
    expect(result.dayPnl).toBe(40);
    expect(result.contributors[0]?.ticker).toBe("NVDA");
    expect(result.unexplainedTickers).toEqual(["AMD"]);
    expect(result.openTickers).toEqual(["NVDA", "AMD"]);
    expect(result.contributors.find((row) => row.ticker === "AMD")?.unexplained).toBe(
      true,
    );
  });

  it("keeps unexplained names that are outside the contributor cap", () => {
    const snapshot = {
      ...emptyPositionsSnapshot(null),
      asOf: NOW,
      persistence: "supabase" as const,
      summary: {
        ...emptyPositionsSnapshot(null).summary,
        openCount: 5,
        quotedCount: 5,
        dayPnl: 10,
        dayPercent: 0.2,
      },
      positions: [
        position({ id: "p1", ticker: "AAA", dayPnl: 50, dayPercent: 5 }),
        position({ id: "p2", ticker: "BBB", dayPnl: 40, dayPercent: 4 }),
        position({ id: "p3", ticker: "CCC", dayPnl: 30, dayPercent: 3 }),
        position({ id: "p4", ticker: "DDD", dayPnl: 20, dayPercent: 2 }),
        position({
          id: "p5",
          ticker: "EEE",
          dayPnl: 1,
          dayPercent: 0.1,
        }),
      ],
    } satisfies PositionsSnapshot;
    const compact = compactBookImpact(snapshot, []);
    expect(compact.contributors.map((row) => row.ticker)).toEqual([
      "AAA",
      "BBB",
      "CCC",
      "DDD",
    ]);
    const attached = attachMovesToBookImpact(compact, [move("EEE", "unknown")]);
    expect(attached.unexplainedTickers).toEqual(["EEE"]);
    expect(attached.contributors.some((row) => row.ticker === "EEE")).toBe(false);
  });

  it("redacts P&L when the owner book is locked", () => {
    const snapshot = {
      ...emptyPositionsSnapshot(null),
      ownerLocked: true,
      summary: {
        ...emptyPositionsSnapshot(null).summary,
        openCount: 1,
        dayPnl: 50,
        dayPercent: 4,
      },
      positions: [position({})],
    } satisfies PositionsSnapshot;
    const result = compactBookImpact(snapshot, []);
    expect(result.ownerLocked).toBe(true);
    expect(result.dayPnl).toBeNull();
    expect(result.contributors[0]?.dayPnl).toBeNull();
    expect(result.contributors[0]?.ticker).toBe("NVDA");
  });

  it("empty helper does not invent a zero P&L", () => {
    const empty = emptyBookImpact("not connected");
    expect(empty.dayPnl).toBeNull();
    expect(empty.openCount).toBe(0);
    expect(empty.error).toBe("not connected");
  });
});
