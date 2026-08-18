import { describe, expect, it } from "vitest";
import { buildScannerUniverse, SCANNER_THEME_BY_TICKER } from "@/lib/scanner/universe";

describe("scanner universe", () => {
  it("prioritizes positions and coverage over discovery and themes", () => {
    const result = buildScannerUniverse({
      maxSize: 5,
      positionSymbols: ["NVDA"],
      coverageSymbols: ["CEG", "NVDA"],
      discoveredSymbols: ["ABCD", "SMCI"],
      priorAlertSymbols: ["HALT"],
      themeSymbols: ["MSFT", "AAPL", "GOOGL"],
    });
    expect(result.symbols).toEqual(["NVDA", "CEG", "ABCD", "SMCI", "HALT"]);
    expect(result.notes[0]).toMatch(/truncated/i);
  });

  it("maps thematic names used by the desk scanner", () => {
    expect(SCANNER_THEME_BY_TICKER.COHR).toContain("photonics");
    expect(SCANNER_THEME_BY_TICKER.NVDA).toContain("semiconductors");
  });
});
