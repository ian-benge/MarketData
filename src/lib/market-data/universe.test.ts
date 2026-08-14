import { describe, expect, it } from "vitest";
import {
  AI_INFRASTRUCTURE_TICKERS,
  MAJOR_INDEX_ETFS,
  SECTOR_ETFS,
  buildUniverse,
} from "@/lib/market-data/universe";

describe("buildUniverse", () => {
  it("includes major indices, sector ETFs, and AI infra with audit sources", () => {
    const result = buildUniverse({
      maxSize: 80,
      watchlistSymbols: ["CUSTOM1"],
      reportInProgressSymbols: ["RPT1"],
      now: new Date("2026-08-10T14:00:00.000Z"),
    });

    expect(result.requestedAt).toBe("2026-08-10T14:00:00.000Z");
    for (const t of MAJOR_INDEX_ETFS) {
      expect(result.symbols).toContain(t);
      expect(result.sources.major_index_etfs).toContain(t);
    }
    expect(result.sources.sector_etfs).toEqual(expect.arrayContaining([...SECTOR_ETFS]));
    expect(result.sources.ai_infrastructure.length).toBeGreaterThan(0);
    expect(result.sources.watchlist).toContain("CUSTOM1");
    expect(result.sources.positions).toEqual([]);
    expect(result.sources.report_in_progress).toContain("RPT1");
    expect(result.symbols).toContain("CUSTOM1");
    expect(result.symbols).toContain("TLT");
    expect(result.symbols).toContain("VIXY");
    expect(result.sources.cross_asset_proxies).toEqual(
      expect.arrayContaining(["TLT", "VIXY", "UUP", "HYG", "USO", "LQD", "IBIT", "SHY", "IEF"]),
    );
  });

  it("caps at maxSize prioritizing majors first", () => {
    const result = buildUniverse({ maxSize: 4 });
    expect(result.symbols).toHaveLength(4);
    expect(result.symbols).toEqual([...MAJOR_INDEX_ETFS]);
  });

  it("includes open position symbols ahead of watchlist overflow", () => {
    const result = buildUniverse({
      maxSize: 80,
      positionSymbols: ["BOOK1", "SPY"],
      watchlistSymbols: ["CUSTOM1"],
    });
    expect(result.sources.positions).toEqual(["BOOK1", "SPY"]);
    expect(result.symbols).toContain("BOOK1");
    expect(result.symbols.indexOf("BOOK1")).toBeLessThan(
      result.symbols.indexOf("CUSTOM1"),
    );
  });

  it("dedupes symbols across sources", () => {
    const result = buildUniverse({
      maxSize: 80,
      watchlistSymbols: ["SPY", "NVDA"],
      aiInfrastructureSymbols: [...AI_INFRASTRUCTURE_TICKERS],
    });
    const spyCount = result.symbols.filter((s) => s === "SPY").length;
    expect(spyCount).toBe(1);
  });
});
