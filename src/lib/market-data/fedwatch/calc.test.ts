import { describe, expect, it } from "vitest";
import {
  calculateMeetings,
  classifyBin,
  movesToBins,
  postMeetingRate,
  targetFromBounds,
  targetFromEffr,
} from "@/lib/market-data/fedwatch/calc";
import {
  formatMeetingLabel,
  lastBusinessDayOfMonth,
  meetingToContractCode,
  monthKey,
  parseYahooZqSymbol,
  yahooZqSymbol,
} from "@/lib/market-data/fedwatch/fomc";
import { parseOfficialForecasts } from "@/lib/market-data/fedwatch/sources";

describe("fomc contract mapping", () => {
  it("maps Sep 2026 to ZQU6 and the Yahoo CBT symbol", () => {
    expect(meetingToContractCode("2026-09-16")).toBe("ZQU6");
    expect(yahooZqSymbol(2026, 9)).toBe("ZQU26.CBT");
    expect(parseYahooZqSymbol("ZQU26.CBT")).toEqual({ year: 2026, month: 9 });
    expect(parseYahooZqSymbol("ZQV26")).toEqual({ year: 2026, month: 10 });
    expect(monthKey(2026, 9)).toBe("SEP 26");
    expect(formatMeetingLabel("2026-09-16", 2)).toBe("16 Sep 26");
    expect(lastBusinessDayOfMonth(2026, 9)).toBe("2026-09-30");
  });
});

describe("target range", () => {
  it("snaps EFFR into the published 25bp corridor", () => {
    expect(targetFromEffr(3.63)).toEqual(targetFromBounds(3.5, 3.75));
    expect(targetFromEffr(3.63).label).toBe("350-375");
  });
});

describe("movesToBins", () => {
  it("splits a half-hike between hold and +25bp", () => {
    const bins = movesToBins(3.63, 3.755, 350);
    expect(bins).toEqual([
      {
        lowerBps: 350,
        upperBps: 375,
        label: "350-375",
        probability: 50,
        kind: "hold",
      },
      {
        lowerBps: 375,
        upperBps: 400,
        label: "375-400",
        probability: 50,
        kind: "hike",
      },
    ]);
  });

  it("labels cuts as ease", () => {
    expect(classifyBin(325, 350)).toBe("ease");
    const bins = movesToBins(3.63, 3.38, 350);
    expect(bins.some((bin) => bin.kind === "ease")).toBe(true);
    expect(bins.every((bin) => bin.kind !== "hike")).toBe(true);
  });
});

describe("calculateMeetings", () => {
  it("reproduces a near 50/50 Sep-2026 hike from a 96.3075 mid", () => {
    const meetings = calculateMeetings(
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
      {
        effr: 3.63,
        effrAsOf: "2026-08-10",
        lowerPct: 3.5,
        upperPct: 3.75,
      },
    );
    expect(meetings).toHaveLength(1);
    const next = meetings[0]!;
    expect(next.contract).toBe("ZQU6");
    expect(next.hold).toBeGreaterThan(45);
    expect(next.hike).toBeGreaterThan(45);
    expect(next.ease).toBe(0);
    expect(next.hold + next.hike).toBeCloseTo(100, 1);
    expect(
      next.bins.reduce((sum, bin) => sum + bin.probability, 0),
    ).toBeCloseTo(100, 1);
    expect(postMeetingRate("2026-09-16", 3.6925, 3.63, new Map())).toBeCloseTo(
      3.755,
      3,
    );
  });

  it("accumulates later meetings across 25bp paths instead of isolating the month", () => {
    const meetings = calculateMeetings(
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
      {
        effr: 3.63,
        effrAsOf: "2026-08-10",
        lowerPct: 3.5,
        upperPct: 3.75,
      },
    );
    const october = meetings.find((meeting) => meeting.date === "2026-10-28");
    expect(october).toBeTruthy();
    expect(october!.bins).toEqual([
      {
        lowerBps: 350,
        upperBps: 375,
        label: "350-375",
        probability: 38.4,
        kind: "hold",
      },
      {
        lowerBps: 375,
        upperBps: 400,
        label: "375-400",
        probability: 50,
        kind: "hike",
      },
      {
        lowerBps: 400,
        upperBps: 425,
        label: "400-425",
        probability: 11.6,
        kind: "hike",
      },
    ]);
    expect(october!.ease).toBe(0);
    expect(october!.hold).toBe(38.4);
    expect(october!.hike).toBe(61.6);
    const isolated = calculateMeetings(
      ["2026-10-28"],
      [
        {
          monthKey: "OCT 26",
          year: 2026,
          month: 10,
          price: 96.2375,
          volume: null,
          openInterest: null,
        },
      ],
      {
        effr: 3.63,
        effrAsOf: "2026-08-10",
        lowerPct: 3.5,
        upperPct: 3.75,
      },
    )[0]!;
    expect(october!.hold).not.toEqual(isolated.hold);
  });

  it("uses the following-month contract when that month has no FOMC meeting", () => {
    const meetings = calculateMeetings(
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
        {
          monthKey: "NOV 26",
          year: 2026,
          month: 11,
          price: 96.1795,
          volume: 80000,
          openInterest: null,
        },
      ],
      {
        effr: 3.63,
        effrAsOf: "2026-08-10",
        lowerPct: 3.5,
        upperPct: 3.75,
      },
    );
    const october = meetings.find((meeting) => meeting.date === "2026-10-28");
    expect(october?.bins.map((bin) => bin.label)).toEqual([
      "350-375",
      "375-400",
      "400-425",
    ]);
    expect(october?.hold).toBeGreaterThan(35);
    expect(october?.hold).toBeLessThan(40);
    expect(october?.hike).toBeCloseTo(100 - (october?.hold ?? 0), 1);
    expect(
      october?.bins.reduce((sum, bin) => sum + bin.probability, 0),
    ).toBeCloseTo(100, 1);
  });
});

describe("parseOfficialForecasts", () => {
  it("reads a map-shaped official payload", () => {
    const meetings = parseOfficialForecasts(
      {
        content: [
          {
            meetingDt: "2026-09-16",
            contract: "ZQU6",
            midPrice: 96.3075,
            probabilities: { "350-375": 50.1, "375-400": 49.9 },
          },
        ],
      },
      350,
    );
    expect(meetings).toHaveLength(1);
    expect(meetings[0]?.hold).toBe(50.1);
    expect(meetings[0]?.hike).toBe(49.9);
  });
});
