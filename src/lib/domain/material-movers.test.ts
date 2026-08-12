import { describe, expect, it } from "vitest";
import {
  DEFAULT_MATERIALITY_THRESHOLDS,
  detectMaterialMovers,
  type MaterialMoverInput,
} from "@/lib/domain/material-movers";

function base(overrides: Partial<MaterialMoverInput> = {}): MaterialMoverInput {
  return {
    ticker: "NVDA",
    company: "NVIDIA",
    price: 130,
    priorClose: 100,
    volume: 200_000,
    averageVolume: 150_000,
    marketCapCategory: "mega",
    session: "regular",
    asOf: "2026-08-10T15:00:00Z",
    ...overrides,
  };
}

describe("material-movers", () => {
  it("includes movers above mega-cap threshold", () => {
    const result = detectMaterialMovers([base({ price: 102, priorClose: 100 })]);
    // 2% > 1.5% mega threshold
    expect(result).toHaveLength(1);
    expect(result[0]?.ticker).toBe("NVDA");
  });

  it("applies higher small-cap threshold", () => {
    const small = base({
      ticker: "SMALL",
      marketCapCategory: "small",
      price: 104,
      priorClose: 100,
    });
    expect(detectMaterialMovers([small])).toHaveLength(0);
    const bigger = { ...small, price: 106 };
    expect(detectMaterialMovers([bigger])).toHaveLength(1);
  });

  it("boosts watchlist names (lower threshold)", () => {
    const input = base({
      price: 101.2,
      priorClose: 100,
      isWatchlist: true,
      marketCapCategory: "mega",
    });
    // 1.2% with watchlist factor 0.7 → threshold 1.05
    expect(detectMaterialMovers([input])).toHaveLength(1);
  });

  it("filters bad ticks and illiquid names", () => {
    const illiquid = base({ volume: 100, averageVolume: 1_000_000 });
    const missingPrior = base({ priorClose: null });
    const wideSpread = base({
      bid: 100,
      ask: 120,
      price: 110,
      priorClose: 100,
    });
    expect(
      detectMaterialMovers([illiquid, missingPrior, wideSpread], {
        ...DEFAULT_MATERIALITY_THRESHOLDS,
        minVolume: 50_000,
      }),
    ).toHaveLength(0);
  });

  it("raises bar for extended hours", () => {
    const input = base({
      session: "premarket",
      price: 102,
      priorClose: 100,
    });
    // 2% vs mega 1.5 * 1.5 = 2.25 → filtered
    expect(detectMaterialMovers([input])).toHaveLength(0);
  });
});
