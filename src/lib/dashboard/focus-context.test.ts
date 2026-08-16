import { describe, expect, it } from "vitest";
import { buildFocusContext } from "@/lib/dashboard/focus-context";
import type { JoinedMover } from "@/lib/market-data/overview-movers";
import type { NormalizedNewsItem, NormalizedQuote } from "@/lib/providers/types";

const NOW = "2026-08-16T14:30:00.000Z";

const tape: NormalizedQuote[] = [
  {
    instrumentId: "mock:NVDA",
    ticker: "NVDA",
    last: 131.4,
    priorClose: 128.9,
    changeAbsolute: 2.5,
    changePercent: 1.94,
    volume: 1,
    marketSession: "regular",
    providerName: "test",
    providerTimestamp: NOW,
    retrievalTimestamp: NOW,
    delayStatus: "delayed",
    currency: "USD",
    sourceQuality: "mock",
    value: 131.4,
    units: "price",
  },
];

const headlines: NormalizedNewsItem[] = [
  {
    id: "news-1",
    title: "NVIDIA 8-K on data-center outlook",
    url: "https://example.com/nvda",
    publishedAt: NOW,
    retrievedAt: NOW,
    tickers: ["NVDA", "AMD"],
    sourceClass: "primary",
    providerName: "test",
    sourceQuality: "mock",
  },
];

const mover: JoinedMover = {
  ticker: "NVDA",
  name: "NVIDIA",
  last: 131.4,
  changePercent: 1.94,
  volume: 1,
  relativeVolume: 2.1,
  direction: "up",
  causalStatus: "reported",
  attribution: "confirmed_company",
  confidence: "confirmed",
  evidenceNature: "fact",
  headlineTitle: "NVIDIA 8-K on data-center outlook",
  headlineId: "news-1",
  coverageNotes: null,
};

describe("buildFocusContext", () => {
  it("joins quote, membership, headlines, and related names", () => {
    const focus = buildFocusContext({
      ticker: "nvda",
      tape,
      watchlist: {
        listId: "wl-core",
        listName: "Market Tape",
        symbols: ["NVDA", "SPY"],
        rows: [
          {
            ticker: "NVDA",
            name: "NVIDIA Corporation",
            last: 131.4,
            change1dPercent: 1.94,
            changeFromOpenPercent: 1,
            change1wPercent: 3,
            relativeVolume: 2.1,
            marketCap: 3e12,
            volume: 1,
            missing: [],
          },
        ],
        lists: [],
        asOf: NOW,
        stale: false,
        usingFixtures: true,
        error: null,
      },
      coverage: {
        lists: [{ id: "wl-core", name: "Market Tape", visibility: "shared", isDefault: true, symbolCount: 2 }],
        selectedListId: "wl-core",
        exceptions: [],
        deskSectors: [
          {
            id: "sec-chips",
            name: "Chips",
            kind: "theme",
            navGroup: "ai_compute",
            vsSpy1dPercent: 1.2,
            avg1dPercent: 1.5,
            breadth: 80,
            unusualCount: 1,
            leaders: ["NVDA"],
            benchmarkSymbol: "SMH",
            displayTicker: "SMH",
            symbolCount: 4,
            quotedCount: 4,
          },
        ],
        coverageSymbolSet: ["NVDA"],
        inBookTickers: ["NVDA"],
      },
      movers: [mover],
      headlines,
      explanations: [],
    });
    expect(focus?.ticker).toBe("NVDA");
    expect(focus?.inBook).toBe(true);
    expect(focus?.headlines[0]?.title).toMatch(/8-K/);
    expect(focus?.relatedTickers).toContain("AMD");
    expect(focus?.membership.some((row) => row.kind === "theme")).toBe(true);
    expect(focus?.membership.some((row) => row.kind === "watchlist")).toBe(true);
  });

  it("marks in-book from the blotter digest when coverage lags", () => {
    const focus = buildFocusContext({
      ticker: "NVDA",
      tape,
      movers: [mover],
      headlines,
      book: {
        asOf: NOW,
        openCount: 1,
        quotedCount: 1,
        ownerLocked: false,
        persistence: "supabase",
        dayPnl: 10,
        dayPercent: 1,
        largestWeight: 0.2,
        openTickers: ["NVDA"],
        contributors: [
          {
            ticker: "NVDA",
            side: "long",
            dayPnl: 10,
            dayPercent: 1,
            unexplained: false,
          },
        ],
        unexplainedTickers: [],
        error: null,
        stale: false,
        usingFixtures: false,
      },
    });
    expect(focus?.inBook).toBe(true);
  });

  it("returns null for a blank ticker", () => {
    expect(
      buildFocusContext({
        ticker: "  ",
        tape,
        movers: [],
        headlines: [],
      }),
    ).toBeNull();
  });
});
