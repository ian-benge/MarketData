import { describe, expect, it } from "vitest";
import {
  asSectorKind,
  defaultNavGroupForKind,
  isLeveragedProduct,
  kindLabel,
} from "@/lib/watchlists/taxonomy";
import { classifyInstrument, isQuarantineSymbol } from "@/lib/watchlists/instrument-catalog";

describe("coverage taxonomy", () => {
  it("coerces unknown kinds to custom and labels known kinds", () => {
    expect(asSectorKind("theme")).toBe("theme");
    expect(asSectorKind("not-a-kind")).toBe("custom");
    expect(kindLabel("leveraged_product")).toBe("Leveraged");
  });

  it("places catalysts and screens on the tactical nav group", () => {
    expect(defaultNavGroupForKind("sector")).toBe("official_sectors");
    expect(defaultNavGroupForKind("macro")).toBe("market_tape");
    expect(defaultNavGroupForKind("catalyst")).toBe("tactical");
    expect(defaultNavGroupForKind("screen")).toBe("tactical");
  });

  it("treats inverse or >1x products as leveraged", () => {
    expect(isLeveragedProduct({ leverageMultiple: 3 })).toBe(true);
    expect(isLeveragedProduct({ isInverse: true, leverageMultiple: 1 })).toBe(true);
    expect(isLeveragedProduct({ leverageMultiple: 1 })).toBe(false);
  });
});

describe("instrument catalog", () => {
  it("classifies known special cases without guessing quarantined names", () => {
    expect(classifyInstrument("SKHY")?.securityType).toBe("adr");
    expect(classifyInstrument("NCLD")?.securityType).toBe("etf");
    expect(classifyInstrument("RAM")?.leverageMultiple).toBe(2);
    expect(classifyInstrument("RAM")?.underlyingSymbol).toBe("DRAM");
    expect(isQuarantineSymbol("BRUN")).toBe(true);
    expect(classifyInstrument("BRUN")?.securityType).toBe("unknown");
  });
});
