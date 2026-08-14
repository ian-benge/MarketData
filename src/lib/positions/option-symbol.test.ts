import { describe, expect, it } from "vitest";
import {
  displayPositionTicker,
  formatOccOptionSymbol,
  parseOccOptionSymbol,
} from "./option-symbol";

describe("parseOccOptionSymbol", () => {
  it("parses a stripped OSI call", () => {
    const parsed = parseOccOptionSymbol("MSFT260202C00430000");
    expect(parsed).toMatchObject({
      underlying: "MSFT",
      expiry: "2026-02-02",
      right: "C",
      strike: 430,
    });
    expect(formatOccOptionSymbol(parsed!)).toBe("MSFT  2 Feb 26  430 C");
    expect(displayPositionTicker("MSFT260202C00430000")).toBe(
      "MSFT  2 Feb 26  430 C",
    );
  });

  it("parses a space-padded OSI put", () => {
    const parsed = parseOccOptionSymbol("AAPL  250117C00150000");
    expect(parsed).toMatchObject({
      underlying: "AAPL",
      expiry: "2025-01-17",
      right: "C",
      strike: 150,
    });
    expect(formatOccOptionSymbol(parsed!)).toBe("AAPL  17 Jan 25  150 C");
  });

  it("parses fractional strikes", () => {
    const parsed = parseOccOptionSymbol("SPY260320P00512500");
    expect(parsed?.strike).toBe(512.5);
    expect(formatOccOptionSymbol(parsed!)).toBe("SPY  20 Mar 26  512.5 P");
  });

  it("leaves equities and futures mapping unchanged", () => {
    expect(parseOccOptionSymbol("AAPL")).toBeNull();
    expect(parseOccOptionSymbol("/ES")).toBeNull();
    expect(displayPositionTicker("AAPL")).toBe("AAPL");
    expect(displayPositionTicker("BRK.B")).toBe("BRK.B");
  });
});
