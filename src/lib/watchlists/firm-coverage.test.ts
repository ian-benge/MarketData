import { describe, expect, it } from "vitest";
import {
  prioritizeCoverageSymbols,
} from "@/lib/watchlists/firm-coverage";
import type { CoverageSector, CoverageWatchlist } from "@/lib/watchlists/types";

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

describe("prioritizeCoverageSymbols", () => {
  it("orders default → tape → sectors → themes → other shared and skips personal + screens", () => {
    const symbols = prioritizeCoverageSymbols(
      [
        list({
          id: "wl-other",
          name: "Other",
          symbols: ["OTHER1"],
        }),
        list({
          id: "wl-default",
          name: "Default",
          isDefault: true,
          purpose: "tape",
          symbols: ["DEF1", "SPY"],
        }),
        list({
          id: "wl-tape",
          name: "Tape extra",
          purpose: "tape",
          symbols: ["TAPE1"],
        }),
        list({
          id: "wl-personal",
          name: "Desk",
          visibility: "personal",
          ownerId: "user-1",
          symbols: ["PERS1"],
        }),
      ],
      [
        sector({
          id: "sec-fat",
          name: "Fat theme",
          kind: "theme",
          symbols: ["TH1", "TH2", "TH3"],
        }),
        sector({
          id: "sec-chip",
          name: "Chips",
          kind: "sector",
          symbols: ["SEC1", "SEC2"],
        }),
        sector({
          id: "sec-screen",
          name: "RVOL",
          kind: "screen",
          symbols: ["SCR1"],
        }),
      ],
    );

    expect(symbols.slice(0, 6)).toEqual([
      "DEF1",
      "SPY",
      "TAPE1",
      "SEC1",
      "SEC2",
      "TH1",
    ]);
    expect(symbols).toContain("TH2");
    expect(symbols).toContain("OTHER1");
    expect(symbols).not.toContain("PERS1");
    expect(symbols).not.toContain("SCR1");
  });

  it("round-robins sector constituents so one fat basket cannot starve others", () => {
    const symbols = prioritizeCoverageSymbols(
      [],
      [
        sector({
          id: "sec-wide",
          name: "Wide",
          kind: "sector",
          symbols: ["A1", "A2", "A3"],
        }),
        sector({
          id: "sec-thin",
          name: "Thin",
          kind: "sector",
          symbols: ["B1"],
        }),
      ],
    );
    expect(symbols.slice(0, 4)).toEqual(["A1", "B1", "A2", "A3"]);
  });

  it("includes personal lists only when opted in (fixtures)", () => {
    const personal = list({
      id: "wl-personal",
      name: "Desk",
      visibility: "personal",
      ownerId: "user-1",
      symbols: ["PERS1"],
    });
    expect(prioritizeCoverageSymbols([personal], [])).toEqual([]);
    expect(
      prioritizeCoverageSymbols([personal], [], { includePersonal: true }),
    ).toEqual(["PERS1"]);
  });
});
