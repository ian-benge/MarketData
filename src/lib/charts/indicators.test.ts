import { describe, expect, it } from "vitest";
import {
  bollinger,
  ema,
  heikinAshi,
  macd,
  rsi,
  sessionVwap,
  sma,
  wma,
} from "@/lib/charts/indicators";

describe("indicators", () => {
  it("computes a simple moving average", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it("computes EMA after the SMA seed", () => {
    const values = [10, 11, 12, 13, 14, 15];
    const result = ema(values, 3);
    expect(result[2]).toBeCloseTo(11);
    expect(result[5]).not.toBeNull();
    expect(result[5] as number).toBeGreaterThan(result[2] as number);
  });

  it("builds Bollinger bands around the SMA", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const bands = bollinger(values, 5, 2);
    expect(bands.mid[4]).toBe(3);
    expect(bands.upper[4]).toBeGreaterThan(3);
    expect(bands.lower[4]).toBeLessThan(3);
  });

  it("keeps RSI in 0–100 and resets VWAP by session", () => {
    const closes = [10, 11, 12, 11, 13, 14, 13, 15, 16, 15, 17, 18, 17, 19, 20];
    const rsiValues = rsi(closes, 5);
    const last = rsiValues.at(-1);
    expect(last).not.toBeNull();
    expect(last as number).toBeGreaterThan(50);
    expect(last as number).toBeLessThanOrEqual(100);

    const vwap = sessionVwap([
      { barStart: "a", high: 10, low: 10, close: 10, volume: 10, sessionKey: "d1" },
      { barStart: "b", high: 20, low: 20, close: 20, volume: 10, sessionKey: "d1" },
      { barStart: "c", high: 30, low: 30, close: 30, volume: 10, sessionKey: "d2" },
    ]);
    expect(vwap[1]).toBeCloseTo(15);
    expect(vwap[2]).toBeCloseTo(30);
  });

  it("weights recent values more in WMA and splits MACD", () => {
    expect(wma([1, 2, 3], 3)[2]).toBeCloseTo((1 + 4 + 9) / 6);
    const values = macd([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20], 3, 6, 3);
    expect(values.macd.some((value) => value != null)).toBe(true);
    expect(values.signal.some((value) => value != null)).toBe(true);
  });

  it("smooths Heikin-Ashi opens from prior HA candles", () => {
    const ha = heikinAshi([
      { open: 10, high: 12, low: 9, close: 11 },
      { open: 11, high: 14, low: 10, close: 13 },
    ]);
    expect(ha[0]!.close).toBeCloseTo(10.5);
    expect(ha[1]!.open).toBeCloseTo((ha[0]!.open + ha[0]!.close) / 2);
  });
});
