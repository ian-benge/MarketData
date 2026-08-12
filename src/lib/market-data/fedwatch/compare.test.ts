import { describe, expect, it } from "vitest";
import { calculateMeetings } from "@/lib/market-data/fedwatch/calc";
import {
  attachMeetingHistory,
  buildCompareRows,
  lookbackTradeDate,
  quotesOnDate,
} from "@/lib/market-data/fedwatch/compare";

const target = {
  effr: 3.63,
  effrAsOf: "2026-08-10",
  lowerPct: 3.5,
  upperPct: 3.75,
};

describe("lookbackTradeDate", () => {
  it("snaps weekend lookbacks to Friday", () => {
    expect(lookbackTradeDate(new Date("2026-08-11T18:00:00.000Z"), 1)).toBe(
      "2026-08-10",
    );
    expect(lookbackTradeDate(new Date("2026-08-11T18:00:00.000Z"), 7)).toBe(
      "2026-08-04",
    );
  });
});

describe("attachMeetingHistory", () => {
  it("builds Now / 1 Day columns from ZQ closes without inventing missing months", () => {
    const nowMeetings = calculateMeetings(
      ["2026-09-16"],
      [
        {
          monthKey: "SEP 26",
          year: 2026,
          month: 9,
          price: 96.3075,
          volume: 21189,
          openInterest: 256475,
        },
      ],
      target,
    );
    const withHistory = attachMeetingHistory(
      nowMeetings,
      [
        {
          year: 2026,
          month: 9,
          monthKey: "SEP 26",
          last: 96.3075,
          volume: 21189,
          daily: [
            { date: "2026-08-04", close: 96.28, volume: 18000 },
            { date: "2026-08-10", close: 96.3, volume: 20000 },
            { date: "2026-08-11", close: 96.3075, volume: 21189 },
          ],
        },
      ],
      target,
      new Date("2026-08-11T18:00:00.000Z"),
    );
    const meeting = withHistory[0]!;
    expect(meeting.lookbacks?.map((item) => item.id)).toEqual(
      expect.arrayContaining(["now", "1d", "1w"]),
    );
    expect(meeting.compareRows?.some((row) => row.current)).toBe(true);
    expect(quotesOnDate([], "2026-08-10")).toEqual([]);
    const rows = buildCompareRows(meeting.lookbacks ?? [], 350);
    expect(rows[0]?.values.now).toBeDefined();
  });

  it("recomputes later-meeting lookbacks through the full upcoming chain", () => {
    const nowMeetings = calculateMeetings(
      ["2026-09-16", "2026-10-28"],
      [
        {
          monthKey: "SEP 26",
          year: 2026,
          month: 9,
          price: 96.3075,
          volume: 21189,
          openInterest: null,
        },
        {
          monthKey: "OCT 26",
          year: 2026,
          month: 10,
          price: 96.2375,
          volume: 107469,
          openInterest: null,
        },
      ],
      target,
    );
    const withHistory = attachMeetingHistory(
      nowMeetings,
      [
        {
          year: 2026,
          month: 9,
          monthKey: "SEP 26",
          last: 96.3075,
          volume: 21189,
          daily: [
            { date: "2026-07-10", close: 96.4, volume: 10000 },
            { date: "2026-08-04", close: 96.28, volume: 18000 },
            { date: "2026-08-10", close: 96.3, volume: 20000 },
            { date: "2026-08-11", close: 96.3075, volume: 21189 },
          ],
        },
        {
          year: 2026,
          month: 10,
          monthKey: "OCT 26",
          last: 96.2375,
          volume: 107469,
          daily: [
            { date: "2026-07-10", close: 96.15, volume: 9000 },
            { date: "2026-08-04", close: 96.2, volume: 80000 },
            { date: "2026-08-10", close: 96.22, volume: 90000 },
            { date: "2026-08-11", close: 96.2375, volume: 107469 },
          ],
        },
      ],
      target,
      new Date("2026-08-11T18:00:00.000Z"),
    );
    const october = withHistory.find((meeting) => meeting.date === "2026-10-28");
    expect(october?.hold).toBe(38.4);
    expect(october?.compareRows?.find((row) => row.label === "350-375")?.values.now).toBe(
      38.4,
    );
    expect(october?.lookbacks?.find((item) => item.id === "1d")?.hold).toBeGreaterThan(20);
    expect(
      (october?.lookbacks?.find((item) => item.id === "1d")?.bins.length ?? 0) >= 2,
    ).toBe(true);
  });
});
