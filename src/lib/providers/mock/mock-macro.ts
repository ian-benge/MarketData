import type { MacroDataProvider } from "@/lib/providers/interfaces";
import type {
  DateRange,
  MacroSeriesRequest,
  NormalizedCalendarEvent,
  NormalizedMacroPoint,
} from "@/lib/providers/types";
import {
  assertMockProvidersAllowed,
  MOCK_COVERAGE_NOTE,
  mockNowIso,
} from "./assert-mock";

const SERIES: Record<
  string,
  { name: string; units: string; points: Array<{ date: string; value: number }> }
> = {
  DGS10: {
    name: "10-Year Treasury Constant Maturity Rate",
    units: "percent",
    points: [
      { date: "2026-08-03", value: 4.12 },
      { date: "2026-08-04", value: 4.15 },
      { date: "2026-08-05", value: 4.18 },
      { date: "2026-08-06", value: 4.14 },
      { date: "2026-08-07", value: 4.16 },
    ],
  },
  DGS2: {
    name: "2-Year Treasury Constant Maturity Rate",
    units: "percent",
    points: [
      { date: "2026-08-03", value: 3.88 },
      { date: "2026-08-04", value: 3.9 },
      { date: "2026-08-05", value: 3.94 },
      { date: "2026-08-06", value: 3.91 },
      { date: "2026-08-07", value: 3.92 },
    ],
  },
  CPIAUCSL: {
    name: "Consumer Price Index for All Urban Consumers",
    units: "index",
    points: [
      { date: "2026-03-01", value: 319.2 },
      { date: "2026-04-01", value: 320.1 },
      { date: "2026-05-01", value: 320.8 },
      { date: "2026-06-01", value: 321.4 },
      { date: "2026-07-01", value: 322.0 },
    ],
  },
  UNRATE: {
    name: "Unemployment Rate",
    units: "percent",
    points: [
      { date: "2026-03-01", value: 4.1 },
      { date: "2026-04-01", value: 4.1 },
      { date: "2026-05-01", value: 4.2 },
      { date: "2026-06-01", value: 4.2 },
      { date: "2026-07-01", value: 4.2 },
    ],
  },
};

export class MockMacroDataProvider implements MacroDataProvider {
  constructor() {
    assertMockProvidersAllowed("MockMacroDataProvider");
  }

  async getSeries(
    requests: MacroSeriesRequest[],
  ): Promise<NormalizedMacroPoint[]> {
    const now = mockNowIso();
    const out: NormalizedMacroPoint[] = [];
    for (const req of requests) {
      const series = SERIES[req.seriesId];
      if (!series) continue;
      const points = series.points.slice(-(req.limit ?? series.points.length));
      for (const p of points) {
        out.push({
          seriesId: req.seriesId,
          seriesName: series.name,
          observationDate: p.date,
          value: p.value,
          units: series.units,
          providerName: "mock-macro",
          providerTimestamp: now,
          retrievalTimestamp: now,
          delayStatus: "delayed",
          sourceQuality: "mock",
          coverageNotes: MOCK_COVERAGE_NOTE,
        });
      }
    }
    return out;
  }

  async getEconomicCalendar(
    range: DateRange,
  ): Promise<NormalizedCalendarEvent[]> {
    const now = mockNowIso();
    const events: NormalizedCalendarEvent[] = [
      {
        id: "mock-cal-cpi",
        title: "CPI (YoY)",
        category: "economic",
        country: "US",
        importance: "high",
        scheduledAt: `${range.start}T07:30:00-05:00`,
        timeZone: "America/New_York",
        consensus: 2.8,
        previous: 2.7,
        units: "percent",
        providerName: "mock-macro",
        providerTimestamp: now,
        retrievalTimestamp: now,
        sourceQuality: "mock",
        coverageNotes: MOCK_COVERAGE_NOTE,
      },
      {
        id: "mock-cal-jobless",
        title: "Initial Jobless Claims",
        category: "economic",
        country: "US",
        importance: "medium",
        scheduledAt: `${range.start}T07:30:00-05:00`,
        timeZone: "America/New_York",
        consensus: 225,
        previous: 221,
        units: "thousands",
        providerName: "mock-macro",
        providerTimestamp: now,
        retrievalTimestamp: now,
        sourceQuality: "mock",
        coverageNotes: MOCK_COVERAGE_NOTE,
      },
      {
        id: "mock-cal-fomc",
        title: "FOMC Speaker — DEMO",
        category: "central_bank",
        country: "US",
        importance: "medium",
        scheduledAt: `${range.end}T13:00:00-05:00`,
        timeZone: "America/New_York",
        providerName: "mock-macro",
        providerTimestamp: now,
        retrievalTimestamp: now,
        sourceQuality: "mock",
        coverageNotes: MOCK_COVERAGE_NOTE,
      },
    ];
    return events;
  }
}
