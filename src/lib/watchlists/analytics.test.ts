import { describe, expect, it } from "vitest";
import {
  closeSessionsAgo,
  flagsFor,
  mean,
  priorYearClose,
  realizedVolPercent,
  summarizeQuotes,
} from "@/lib/watchlists/analytics";
import { appendUniqueSymbols, parseSymbols, validateSymbols } from "@/lib/watchlists/symbols";
import { emptyCoverageSummary, overlaySessionLists } from "@/lib/watchlists/assemble";
import { fixtureWatchlistRecords } from "@/lib/fixtures/watchlists";
import type { CoverageQuote, CoverageSector, CoverageSnapshot } from "@/lib/watchlists/types";

function coverageSnapshot(overrides: Partial<CoverageSnapshot> = {}): CoverageSnapshot {
  return {
    persistence: "fixtures",
    usingFixtures: true,
    canEditWatchlists: true,
    canEditSectors: true,
    isAdmin: false,
    viewerId: "demo-member",
    asOf: "2026-08-14T18:00:00.000Z",
    stale: false,
    error: null,
    quoteError: null,
    latencyCoverageLabel: null,
    marketSession: "regular",
    selection: null,
    watchlists: [],
    sectors: [],
    quotes: [],
    rows: [],
    summary: emptyCoverageSummary(),
    winners: [],
    losers: [],
    unusual: [],
    sectorBoard: [],
    catalysts: [],
    moveExplanations: [],
    unresolvedCount: 0,
    ...overrides,
  };
}

function sectorRecord(
  overrides: Partial<CoverageSector> & Pick<CoverageSector, "id" | "name" | "symbols">,
): CoverageSector {
  return {
    firmId: "firm",
    slug: overrides.id,
    description: null,
    kind: "theme",
    navGroup: "tactical",
    parentId: null,
    benchmarkSymbol: null,
    lastReviewedAt: null,
    reviewBy: null,
    expiresAt: null,
    sourceUrl: null,
    screenKey: null,
    isSystem: false,
    archivedAt: null,
    sortOrder: 0,
    createdAt: "2026-08-14T18:00:00.000Z",
    updatedAt: "2026-08-14T18:00:00.000Z",
    items: overrides.symbols.map((ticker, index) => ({
      ticker,
      name: null,
      notes: null,
      tags: [],
      sortOrder: (index + 1) * 10,
    })),
    ...overrides,
  };
}

function row(overrides: Partial<CoverageQuote> & Pick<CoverageQuote, "ticker">): CoverageQuote {
  return {
    name: null,
    last: 10,
    change1dPercent: null,
    changeFromOpenPercent: null,
    change1wPercent: null,
    change1mPercent: null,
    changeYtdPercent: null,
    preMarketChangePercent: null,
    afterHoursChangePercent: null,
    vsSpy1dPercent: null,
    vsBenchmark1dPercent: null,
    vsGroup1dPercent: null,
    relativeVolume: null,
    marketCap: null,
    volume: null,
    avgVolume: null,
    dayHigh: null,
    dayLow: null,
    priorClose: null,
    volatility: null,
    sectorId: null,
    sectorName: null,
    notes: null,
    tags: [],
    role: null,
    tier: null,
    rationale: null,
    securityType: "unknown",
    leverageMultiple: null,
    isInverse: false,
    isOtc: false,
    resolutionStatus: "unverified",
    underlyingSymbol: null,
    exchange: null,
    themeCount: 0,
    flags: [],
    missing: [],
    ...overrides,
  };
}

describe("coverage symbols", () => {
  it("parses mixed separators and uppercases", () => {
    expect(parseSymbols("spy, qqq NVDA")).toEqual(["SPY", "QQQ", "NVDA"]);
  });

  it("rejects duplicates and invalid tickers", () => {
    const result = validateSymbols(["SPY", "spy", "1BAD"]);
    expect(result.normalized).toEqual(["SPY", "1BAD"]);
    expect(result.duplicates).toEqual(["SPY"]);
    expect(result.invalid).toEqual(["1BAD"]);
  });

  it("appends unique tickers and skips names already on the list", () => {
    const result = appendUniqueSymbols("SPY, QQQ", "qqq nvda spy SOXL");
    expect(result.next).toEqual(["SPY", "QQQ", "NVDA", "SOXL"]);
    expect(result.added).toEqual(["NVDA", "SOXL"]);
    expect(result.skipped).toEqual(["QQQ", "SPY"]);
    expect(result.invalid).toEqual([]);
  });
});

describe("coverage analytics", () => {
  it("uses five sessions ago for 1w and 21 for 1m", () => {
    const closes = Array.from({ length: 25 }, (_, index) => ({
      date: `2026-07-${String(index + 1).padStart(2, "0")}`,
      close: 100 + index,
    }));
    expect(closeSessionsAgo(closes, 5)).toBe(119);
    expect(closeSessionsAgo(closes, 21)).toBe(103);
  });

  it("uses the last close before Jan 1 as YTD basis", () => {
    const closes = [
      { date: "2025-12-31", close: 90 },
      { date: "2026-01-02", close: 92 },
      { date: "2026-08-14", close: 110 },
    ];
    expect(priorYearClose(closes, new Date("2026-08-14T18:00:00.000Z"))).toBe(90);
  });

  it("does not invent realized vol from a single bar", () => {
    expect(realizedVolPercent([{ date: "2026-08-14", close: 10 }])).toBeNull();
  });

  it("computes breadth without coercing missing prints to zero", () => {
    const summary = summarizeQuotes([
      row({ ticker: "A", change1dPercent: 1 }),
      row({ ticker: "B", change1dPercent: -1 }),
      row({ ticker: "C", change1dPercent: null }),
    ]);
    expect(summary.advancers).toBe(1);
    expect(summary.decliners).toBe(1);
    expect(summary.missing).toBe(1);
    expect(summary.breadth).toBe(50);
    expect(mean([1, null, -1])).toBe(0);
  });

  it("flags unusual rvol, moves, and peer outliers", () => {
    expect(
      flagsFor({
        change1dPercent: 4,
        relativeVolume: 2.2,
        vsGroup1dPercent: 3,
        preMarketChangePercent: 2,
        afterHoursChangePercent: null,
      }),
    ).toEqual(["rvol", "move", "peer", "extended", "leader"]);
  });
});

describe("coverage overlay", () => {
  it("keeps an archived list selected so restore remains inspectable", () => {
    const lists = fixtureWatchlistRecords("demo-member").map((list, index) =>
      index === 0 ? { ...list, archivedAt: "2026-08-14T18:00:00.000Z" } : list,
    );
    const archived = lists[0]!;
    const overlay = overlaySessionLists(
      {
        persistence: "fixtures",
        usingFixtures: true,
        canEditWatchlists: true,
        canEditSectors: true,
        isAdmin: false,
        viewerId: "demo-member",
        asOf: "2026-08-14T18:00:00.000Z",
        stale: false,
        error: null,
        quoteError: null,
        latencyCoverageLabel: null,
        marketSession: "regular",
        selection: { type: "watchlist", id: archived.id },
        watchlists: lists,
        sectors: [],
        quotes: [],
        rows: [],
        summary: emptyCoverageSummary(),
        winners: [],
        losers: [],
        unusual: [],
        sectorBoard: [],
        catalysts: [],
        moveExplanations: [],
        unresolvedCount: 0,
      },
      lists,
      [],
      { type: "watchlist", id: archived.id },
    );
    expect(overlay.selection).toEqual({ type: "watchlist", id: archived.id });
    expect(overlay.rows.map((item) => item.ticker)).toEqual(archived.symbols);
  });

  it("includes session sectors and empty themes on the rotation board", () => {
    const emptyTheme = sectorRecord({
      id: "sec-empty",
      name: "Empty theme",
      symbols: [],
    });
    const quotedTheme = sectorRecord({
      id: "sec-quoted",
      name: "Quoted theme",
      symbols: ["NVDA"],
    });
    const overlay = overlaySessionLists(
      coverageSnapshot({
        quotes: [row({ ticker: "NVDA", change1dPercent: 2 })],
      }),
      [],
      [emptyTheme, quotedTheme],
      { type: "sector", id: quotedTheme.id },
    );
    expect(overlay.sectors.map((sector) => sector.name)).toEqual([
      "Empty theme",
      "Quoted theme",
    ]);
    expect(overlay.sectorBoard.map((item) => item.name)).toEqual([
      "Quoted theme",
      "Empty theme",
    ]);
    expect(overlay.sectorBoard[0]).toMatchObject({
      name: "Quoted theme",
      symbolCount: 1,
      avg1dPercent: 2,
    });
    expect(overlay.sectorBoard[1]).toMatchObject({
      name: "Empty theme",
      symbolCount: 0,
      avg1dPercent: null,
    });
  });
});
