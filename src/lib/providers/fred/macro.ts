import { z } from "zod";
import type { MacroDataProvider } from "@/lib/providers/interfaces";
import type {
  DateRange,
  MacroSeriesRequest,
  NormalizedCalendarEvent,
  NormalizedMacroPoint,
} from "@/lib/providers/types";
import { NormalizedMacroPointSchema } from "@/lib/providers/types";

const FredObservationSchema = z.object({
  date: z.string(),
  value: z.string(),
});

const FredObservationsResponseSchema = z.object({
  observations: z.array(FredObservationSchema).default([]),
});

const FredReleaseDateSchema = z.object({
  release_id: z.number(),
  release_name: z.string().optional(),
  date: z.string(),
});

const FredReleaseDatesResponseSchema = z.object({
  release_dates: z.array(FredReleaseDateSchema).default([]),
});

const FRED_WATCHED_RELEASES = new Map<
  number,
  {
    importance: NonNullable<NormalizedCalendarEvent["importance"]>;
    category: NormalizedCalendarEvent["category"];
  }
>([
  [10, { importance: "high", category: "economic" }],
  [11, { importance: "medium", category: "economic" }],
  [13, { importance: "medium", category: "economic" }],
  [18, { importance: "high", category: "economic" }],
  [20, { importance: "medium", category: "central_bank" }],
  [22, { importance: "medium", category: "economic" }],
  [46, { importance: "medium", category: "economic" }],
  [50, { importance: "high", category: "economic" }],
  [53, { importance: "medium", category: "economic" }],
  [86, { importance: "medium", category: "central_bank" }],
  [103, { importance: "high", category: "economic" }],
]);

function classifyFredRelease(name: string, releaseId: number) {
  const watched = FRED_WATCHED_RELEASES.get(releaseId);
  if (watched) return watched;
  if (/fomc|federal open market|beige book/i.test(name)) {
    return { importance: "high" as const, category: "central_bank" as const };
  }
  if (/cpi|payroll|employment situation|pce|gdp/i.test(name)) {
    return { importance: "high" as const, category: "economic" as const };
  }
  return null;
}

const COVERAGE =
  "FRED official series observations — publication lag applies; not a realtime print.";

function isoNow(): string {
  return new Date().toISOString();
}

export function normalizeFredObservation(
  seriesId: string,
  observation: { date: string; value: string },
  retrievalTimestamp = isoNow(),
  seriesName?: string,
): NormalizedMacroPoint | null {
  if (observation.value === "." || observation.value.trim() === "") {
    return null;
  }
  const value = Number(observation.value);
  if (!Number.isFinite(value)) return null;

  const point: NormalizedMacroPoint = {
    seriesId,
    seriesName,
    observationDate: observation.date,
    value,
    units: undefined,
    providerName: "fred",
    providerTimestamp: `${observation.date}T00:00:00.000Z`,
    retrievalTimestamp,
    delayStatus: "delayed",
    sourceQuality: "primary",
    coverageNotes: COVERAGE,
  };
  return NormalizedMacroPointSchema.parse(point);
}

export type FredMacroOptions = {
  apiKey: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
};

export class FredMacroDataProvider implements MacroDataProvider {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(options: FredMacroOptions) {
    if (!options.apiKey) {
      throw new Error("FredMacroDataProvider requires apiKey");
    }
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = options.baseUrl ?? "https://api.stlouisfed.org/fred";
  }

  private async getJson(path: string, params: Record<string, string>): Promise<unknown> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    url.searchParams.set("api_key", this.apiKey);
    url.searchParams.set("file_type", "json");
    const res = await this.fetchImpl(url.toString(), {
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`FRED ${path} failed: HTTP ${res.status}`);
    }
    return res.json();
  }

  async getSeries(
    requests: MacroSeriesRequest[],
  ): Promise<NormalizedMacroPoint[]> {
    const retrieval = isoNow();
    const out: NormalizedMacroPoint[] = [];

    for (const req of requests) {
      const params: Record<string, string> = {
        series_id: req.seriesId,
        sort_order: "desc",
      };
      if (req.range?.start) params.observation_start = req.range.start.slice(0, 10);
      if (req.range?.end) params.observation_end = req.range.end.slice(0, 10);
      if (req.limit) params.limit = String(req.limit);

      const raw = await this.getJson("/series/observations", params);
      const parsed = FredObservationsResponseSchema.parse(raw);
      for (const obs of parsed.observations) {
        const point = normalizeFredObservation(
          req.seriesId,
          obs,
          retrieval,
        );
        if (point) out.push(point);
      }
    }

    return out;
  }

  async getEconomicCalendar(
    range: DateRange,
  ): Promise<NormalizedCalendarEvent[]> {
    const retrieval = isoNow();
    const raw = await this.getJson("/releases/dates", {
      realtime_start: range.start.slice(0, 10),
      realtime_end: range.end.slice(0, 10),
      include_release_dates_with_no_data: "true",
      order_by: "release_date",
      sort_order: "asc",
      limit: "400",
    });
    const parsed = FredReleaseDatesResponseSchema.parse(raw);
    const events: NormalizedCalendarEvent[] = [];
    for (const row of parsed.release_dates) {
      const title = row.release_name?.trim();
      if (!title) continue;
      const classified = classifyFredRelease(title, row.release_id);
      if (!classified) continue;
      const isFed = classified.category === "central_bank";
      events.push({
        id: `fred-release-${row.release_id}-${row.date}`,
        title,
        category: classified.category,
        country: "US",
        importance: classified.importance,
        scheduledAt: `${row.date}T${isFed ? "18:00:00.000Z" : "12:30:00.000Z"}`,
        timeZone: "America/Chicago",
        providerName: "fred",
        providerTimestamp: retrieval,
        retrievalTimestamp: retrieval,
        sourceQuality: "primary",
        coverageNotes:
          "FRED release date. Consensus/actuals are not provided on the free FRED calendar.",
      });
    }
    return events;
  }
}
