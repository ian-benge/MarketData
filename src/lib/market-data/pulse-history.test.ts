import { describe, expect, it } from "vitest";
import {
  reconstructPulseHistory,
  pulseHistorySpec,
  tradingDateKey,
  type PulseHistoryBar,
} from "@/lib/market-data/pulse-history";

function daily(symbol: string, closes: Array<[string, number]>): PulseHistoryBar[] {
  return closes.map(([date, close]) => ({
    barStart: `${date}T20:00:00.000Z`,
    close,
  }));
}

function session(symbol: string, rows: Array<[string, number]>): PulseHistoryBar[] {
  void symbol;
  return rows.map(([at, close]) => ({ barStart: at, close }));
}

describe("tradingDateKey", () => {
  it("keeps midnight-UTC daily bars on the stated calendar date", () => {
    expect(tradingDateKey("2026-08-11T00:00:00.000Z")).toBe("2026-08-11");
    expect(tradingDateKey("2026-08-11T04:00:00.000Z")).toBe("2026-08-11");
    expect(tradingDateKey("2026-08-11T20:00:00.000Z")).toBe("2026-08-11");
  });
});

describe("reconstructPulseHistory", () => {
  it("builds a daily path from prior-close changes", () => {
    const series = {
      SPY: daily("SPY", [
        ["2026-08-06", 100],
        ["2026-08-07", 101],
        ["2026-08-10", 102],
        ["2026-08-11", 101],
      ]),
      QQQ: daily("QQQ", [
        ["2026-08-06", 200],
        ["2026-08-07", 202],
        ["2026-08-10", 204],
        ["2026-08-11", 203],
      ]),
      VIXY: daily("VIXY", [
        ["2026-08-06", 20],
        ["2026-08-07", 19],
        ["2026-08-10", 18.5],
        ["2026-08-11", 19],
      ]),
      TLT: daily("TLT", [
        ["2026-08-06", 90],
        ["2026-08-07", 90.5],
        ["2026-08-10", 91],
        ["2026-08-11", 91.2],
      ]),
    };
    const points = reconstructPulseHistory(series, {
      range: "5D",
      mode: "daily",
      interval: "1d",
      start: "2026-08-01T00:00:00.000Z",
      limit: 10,
      fromDate: null,
      takeLast: 5,
      through: null,
    });
    expect(points.length).toBeGreaterThanOrEqual(2);
    expect(points.every((point) => point.score != null)).toBe(true);
    expect(points.at(-1)?.comparableCount).toBeGreaterThanOrEqual(3);
  });

  it("reconstructs an RTH intraday path versus the prior close", () => {
    const series = {
      SPY: session("SPY", [
        ["2026-08-10T20:00:00.000Z", 100],
        ["2026-08-11T14:35:00.000Z", 100.4],
        ["2026-08-11T14:40:00.000Z", 100.2],
        ["2026-08-11T14:45:00.000Z", 99.8],
      ]),
      QQQ: session("QQQ", [
        ["2026-08-10T20:00:00.000Z", 200],
        ["2026-08-11T14:35:00.000Z", 201],
        ["2026-08-11T14:40:00.000Z", 200.5],
        ["2026-08-11T14:45:00.000Z", 199.6],
      ]),
      VIXY: session("VIXY", [
        ["2026-08-10T20:00:00.000Z", 15],
        ["2026-08-11T14:35:00.000Z", 14.8],
        ["2026-08-11T14:40:00.000Z", 14.9],
        ["2026-08-11T14:45:00.000Z", 15.2],
      ]),
    };
    const points = reconstructPulseHistory(series, {
      range: "1D",
      mode: "session",
      interval: "5m",
      start: "2026-08-11T13:30:00.000Z",
      limit: 80,
      fromDate: "2026-08-11",
      takeLast: null,
      through: "2026-08-11T14:46:00.000Z",
    });
    expect(points.length).toBe(3);
    expect(points[0]?.score).not.toBeNull();
    expect(points.at(-1)?.score).not.toEqual(points[0]?.score);
  });

  it("builds a WTD path on 15-minute RTH bars versus each session prior close", () => {
    const series = {
      SPY: session("SPY", [
        ["2026-08-07T19:45:00.000Z", 100],
        ["2026-08-10T14:30:00.000Z", 100.4],
        ["2026-08-10T14:45:00.000Z", 100.6],
        ["2026-08-10T19:45:00.000Z", 101],
        ["2026-08-11T14:30:00.000Z", 100.8],
        ["2026-08-11T14:45:00.000Z", 100.5],
      ]),
      QQQ: session("QQQ", [
        ["2026-08-07T19:45:00.000Z", 200],
        ["2026-08-10T14:30:00.000Z", 201],
        ["2026-08-10T14:45:00.000Z", 201.4],
        ["2026-08-10T19:45:00.000Z", 202],
        ["2026-08-11T14:30:00.000Z", 201.6],
        ["2026-08-11T14:45:00.000Z", 201],
      ]),
      VIXY: session("VIXY", [
        ["2026-08-07T19:45:00.000Z", 20],
        ["2026-08-10T14:30:00.000Z", 19.6],
        ["2026-08-10T14:45:00.000Z", 19.4],
        ["2026-08-10T19:45:00.000Z", 19],
        ["2026-08-11T14:30:00.000Z", 19.2],
        ["2026-08-11T14:45:00.000Z", 19.4],
      ]),
    };
    const points = reconstructPulseHistory(
      series,
      pulseHistorySpec("WTD", new Date("2026-08-11T18:00:00.000Z")),
    );
    expect(points.length).toBe(5);
    expect(pulseHistorySpec("WTD", new Date("2026-08-11T18:00:00.000Z")).interval).toBe(
      "15m",
    );
  });

  it("describes WTD and MTD windows in Chicago time", () => {
    const now = new Date("2026-08-11T18:00:00.000Z");
    expect(pulseHistorySpec("WTD", now).fromDate).toBe("2026-08-10");
    expect(pulseHistorySpec("WTD", now).interval).toBe("15m");
    expect(pulseHistorySpec("MTD", now).fromDate).toBe("2026-08-01");
    expect(pulseHistorySpec("MTD", now).interval).toBe("1h");
    expect(pulseHistorySpec("MTD", now).mode).toBe("session");
    expect(pulseHistorySpec("1D", now).interval).toBe("5m");
    expect(pulseHistorySpec("1D", now).fromDate).toBe("2026-08-11");
    expect(Date.parse(pulseHistorySpec("1D", now).start)).toBeLessThan(
      Date.parse("2026-08-11T13:00:00.000Z"),
    );
    expect(pulseHistorySpec("30D", now).takeLast).toBe(30);
  });

  it("uses the prior weekday for 1D before the NY open and on weekends", () => {
    expect(
      pulseHistorySpec("1D", new Date("2026-08-15T11:53:00.000Z")).fromDate,
    ).toBe("2026-08-14");
    expect(
      pulseHistorySpec("1D", new Date("2026-08-14T12:00:00.000Z")).fromDate,
    ).toBe("2026-08-13");
  });

  it("builds an MTD path on 1-hour RTH bars versus each session prior close", () => {
    const series = {
      SPY: session("SPY", [
        ["2026-07-31T19:00:00.000Z", 100],
        ["2026-08-03T14:30:00.000Z", 100.5],
        ["2026-08-03T15:30:00.000Z", 100.8],
        ["2026-08-04T14:30:00.000Z", 101],
        ["2026-08-04T15:30:00.000Z", 100.7],
      ]),
      QQQ: session("QQQ", [
        ["2026-07-31T19:00:00.000Z", 200],
        ["2026-08-03T14:30:00.000Z", 201],
        ["2026-08-03T15:30:00.000Z", 201.5],
        ["2026-08-04T14:30:00.000Z", 202],
        ["2026-08-04T15:30:00.000Z", 201.2],
      ]),
      VIXY: session("VIXY", [
        ["2026-07-31T19:00:00.000Z", 20],
        ["2026-08-03T14:30:00.000Z", 19.5],
        ["2026-08-03T15:30:00.000Z", 19.2],
        ["2026-08-04T14:30:00.000Z", 19],
        ["2026-08-04T15:30:00.000Z", 19.4],
      ]),
    };
    const points = reconstructPulseHistory(
      series,
      pulseHistorySpec("MTD", new Date("2026-08-04T18:00:00.000Z")),
    );
    expect(points.length).toBe(4);
    expect(pulseHistorySpec("MTD", new Date("2026-08-04T18:00:00.000Z")).interval).toBe(
      "1h",
    );
    expect(
      points.every((point) => {
        const day = tradingDateKey(point.at);
        return day >= "2026-08-03" && day <= "2026-08-04";
      }),
    ).toBe(true);
    expect(Date.parse(points[1]!.at) - Date.parse(points[0]!.at)).toBe(3_600_000);
  });

  it("builds one 1D point per 5m RTH slot of the current day", () => {
    const now = new Date("2026-08-11T15:00:00.000Z"); // 11:00 ET
    const spec = pulseHistorySpec("1D", now);
    const series = {
      SPY: session("SPY", [
        ["2026-08-10T19:55:00.000Z", 100],
        ["2026-08-11T13:30:00.000Z", 100.2],
        ["2026-08-11T13:45:00.000Z", 100.5],
      ]),
      QQQ: session("QQQ", [
        ["2026-08-10T19:55:00.000Z", 200],
        ["2026-08-11T13:30:00.000Z", 200.4],
        ["2026-08-11T13:45:00.000Z", 201],
      ]),
      VIXY: session("VIXY", [
        ["2026-08-10T19:55:00.000Z", 20],
        ["2026-08-11T13:30:00.000Z", 19.8],
        ["2026-08-11T13:45:00.000Z", 19.5],
      ]),
    };
    const points = reconstructPulseHistory(series, spec);
    // 09:30–10:55 ET inclusive = 18 five-minute stamps before 11:00 ET
    expect(points.length).toBe(18);
    expect(points.every((point) => tradingDateKey(point.at) === "2026-08-11")).toBe(
      true,
    );
    expect(Date.parse(points[1]!.at) - Date.parse(points[0]!.at)).toBe(5 * 60_000);
  });
});
