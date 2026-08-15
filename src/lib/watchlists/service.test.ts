import { describe, expect, it } from "vitest";
import { quoteUniverse } from "@/lib/watchlists/service";
import type { CoverageSector } from "@/lib/watchlists/types";

function sector(
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

describe("quoteUniverse", () => {
  it("round-robins sector constituents so one large basket cannot starve the rotation board", () => {
    const wide = sector({
      id: "sec-wide",
      name: "Wide",
      symbols: ["A1", "A2", "A3", "A4", "A5", "A6"],
    });
    const thin = sector({
      id: "sec-thin",
      name: "Thin",
      symbols: ["B1", "B2"],
    });
    expect(quoteUniverse([], [wide, thin], [], 6)).toEqual([
      "SPY",
      "XLE",
      "A1",
      "B1",
      "A2",
      "B2",
    ]);
  });

  it("still quotes names that appear after selected-list overlap", () => {
    const theme = sector({
      id: "sec-theme",
      name: "Theme",
      symbols: ["NVDA", "AMD", "CRWD"],
    });
    expect(quoteUniverse(["NVDA", "AMD"], [theme], [], 10)).toEqual([
      "SPY",
      "XLE",
      "NVDA",
      "AMD",
      "CRWD",
    ]);
  });

  it("skips archived baskets and appends extra watchlist names after sectors", () => {
    const live = sector({
      id: "sec-live",
      name: "Live",
      symbols: ["CEG"],
    });
    const archived = sector({
      id: "sec-old",
      name: "Old",
      symbols: ["DEAD"],
      archivedAt: "2026-08-01T00:00:00.000Z",
    });
    expect(quoteUniverse([], [live, archived], ["HOOD"])).toEqual([
      "SPY",
      "XLE",
      "CEG",
      "HOOD",
    ]);
  });
});
