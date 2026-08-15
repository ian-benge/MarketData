import { describe, expect, it } from "vitest";
import {
  buildDashboardCoverageDigest,
  visibleOverviewLists,
} from "@/lib/watchlists/dashboard-digest";
import type { CoverageSector, CoverageWatchlist } from "@/lib/watchlists/types";
import type { NormalizedQuote } from "@/lib/providers/types";

function list(
  overrides: Partial<CoverageWatchlist> &
    Pick<CoverageWatchlist, "id" | "name" | "symbols">,
): CoverageWatchlist {
  return {
    firmId: "firm",
    description: null,
    isDefault: false,
    visibility: "shared",
    purpose: "general",
    navGroup: "tactical",
    ownerId: null,
    archivedAt: null,
    sortOrder: 0,
    createdBy: null,
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

function sector(
  overrides: Partial<CoverageSector> &
    Pick<CoverageSector, "id" | "name" | "symbols">,
): CoverageSector {
  return {
    firmId: "firm",
    slug: overrides.id,
    description: null,
    kind: "sector",
    navGroup: "official_sectors",
    parentId: null,
    benchmarkSymbol: "XLK",
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

function quote(ticker: string, changePercent: number): NormalizedQuote {
  return {
    instrumentId: `test:${ticker}`,
    ticker,
    last: 100 + changePercent,
    priorClose: 100,
    changeAbsolute: changePercent,
    changePercent,
    volume: 1_000_000,
    marketSession: "regular",
    providerName: "test",
    providerTimestamp: "2026-08-14T18:00:00.000Z",
    retrievalTimestamp: "2026-08-14T18:00:00.000Z",
    delayStatus: "delayed",
    currency: "USD",
    sourceQuality: "secondary",
    value: 100 + changePercent,
    units: "price",
  };
}

describe("visibleOverviewLists", () => {
  it("includes personal lists for the owner and excludes other owners", () => {
    const shared = list({ id: "wl-shared", name: "Shared", symbols: ["SPY"] });
    const mine = list({
      id: "wl-mine",
      name: "Mine",
      visibility: "personal",
      ownerId: "user-a",
      symbols: ["NVDA"],
    });
    const theirs = list({
      id: "wl-theirs",
      name: "Theirs",
      visibility: "personal",
      ownerId: "user-b",
      symbols: ["SECRET"],
    });
    const archived = list({
      id: "wl-old",
      name: "Old",
      archivedAt: "2026-08-01T00:00:00.000Z",
      symbols: ["OLD"],
    });
    expect(
      visibleOverviewLists([shared, mine, theirs, archived], "user-a").map(
        (row) => row.id,
      ),
    ).toEqual(["wl-shared", "wl-mine"]);
  });
});

describe("buildDashboardCoverageDigest", () => {
  it("builds exceptions and desk sectors from tape without embedding full coverage rows", () => {
    const digest = buildDashboardCoverageDigest({
      user: { id: "user-a" },
      tape: [
        quote("SPY", 0.4),
        quote("NVDA", 4.2),
        quote("AMD", 1.1),
        quote("XLK", 2.8),
      ],
      lists: [
        list({
          id: "wl-core",
          name: "Tape",
          isDefault: true,
          symbols: ["SPY", "NVDA"],
        }),
        list({
          id: "wl-desk",
          name: "My desk",
          visibility: "personal",
          ownerId: "user-a",
          symbols: ["NVDA", "AMD"],
        }),
      ],
      sectors: [
        sector({
          id: "sec-chips",
          name: "Chips",
          symbols: ["NVDA", "AMD"],
          benchmarkSymbol: "XLK",
        }),
        sector({
          id: "sec-screen",
          name: "Screen",
          kind: "screen",
          symbols: ["NVDA"],
        }),
        sector({
          id: "sec-theme",
          name: "AI Software",
          kind: "theme",
          navGroup: "ai_compute",
          symbols: ["NVDA"],
        }),
        sector({
          id: "sec-archived",
          name: "Old",
          archivedAt: "2026-08-01T00:00:00.000Z",
          symbols: ["AMD"],
        }),
      ],
      selectedListId: "wl-desk",
      inBookTickers: ["nvda"],
    });

    expect(digest.lists.map((row) => row.id)).toEqual(["wl-core", "wl-desk"]);
    expect(digest.selectedListId).toBe("wl-desk");
    expect(digest.coverageSymbolSet).toEqual(
      expect.arrayContaining(["NVDA", "AMD", "SPY"]),
    );
    expect(digest.exceptions.some((row) => row.ticker === "NVDA")).toBe(true);
    expect(digest.deskSectors.map((row) => row.id)).toEqual(
      expect.arrayContaining(["sec-chips", "sec-screen", "sec-theme"]),
    );
    expect(digest.deskSectors.every((row) => row.id !== "sec-archived")).toBe(
      true,
    );
    expect(digest.deskSectors.find((row) => row.id === "sec-chips")?.kind).toBe(
      "sector",
    );
    expect(digest.inBookTickers).toEqual(["NVDA"]);
  });
});
