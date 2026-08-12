import { z } from "zod";
import type { DateRange, NormalizedCalendarEvent } from "@/lib/providers/types";

const FinnhubEconomicRawSchema = z.object({
  country: z.string().optional(),
  event: z.string().optional(),
  impact: z.union([z.string(), z.number()]).optional(),
  time: z.string().optional(),
  actual: z.number().nullable().optional(),
  estimate: z.number().nullable().optional(),
  prev: z.number().nullable().optional(),
  unit: z.string().optional(),
});

const FinnhubEconomicResponseSchema = z.object({
  economicCalendar: z.array(FinnhubEconomicRawSchema).default([]),
});

function isoNow(): string {
  return new Date().toISOString();
}

function impactOf(
  value: string | number | undefined,
): NormalizedCalendarEvent["importance"] {
  if (value === 3 || value === "high" || value === "High") return "high";
  if (value === 2 || value === "medium" || value === "Medium") return "medium";
  return "low";
}

function categoryOf(title: string): NormalizedCalendarEvent["category"] {
  if (/fomc|fed |federal reserve|powell|beige book/i.test(title)) {
    return "central_bank";
  }
  if (/treasury|auction|refunding/i.test(title)) return "treasury";
  return "economic";
}

export function normalizeFinnhubEconomicEvent(
  raw: z.infer<typeof FinnhubEconomicRawSchema>,
  retrievalTimestamp = isoNow(),
): NormalizedCalendarEvent | null {
  const title = raw.event?.trim();
  const when = raw.time?.trim();
  if (!title || !when) return null;
  const scheduled = new Date(when.includes("T") ? when : when.replace(" ", "T") + "Z");
  if (Number.isNaN(scheduled.getTime())) return null;

  return {
    id: `finnhub-econ-${raw.country ?? "xx"}-${when}-${title}`.slice(0, 180),
    title,
    category: categoryOf(title),
    country: raw.country,
    importance: impactOf(raw.impact),
    scheduledAt: scheduled.toISOString(),
    timeZone: "America/Chicago",
    actual: raw.actual ?? null,
    consensus: raw.estimate ?? null,
    previous: raw.prev ?? null,
    units: raw.unit,
    providerName: "finnhub",
    providerTimestamp: retrievalTimestamp,
    retrievalTimestamp,
    sourceQuality: "secondary",
    coverageNotes:
      "Finnhub economic calendar — consensus/actuals are vendor-sourced; verify against the official release.",
  };
}

export async function fetchFinnhubEconomicCalendar(options: {
  apiKey: string;
  range: DateRange;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  countries?: string[];
}): Promise<NormalizedCalendarEvent[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl ?? "https://finnhub.io/api/v1";
  const url = new URL(`${baseUrl}/calendar/economic`);
  url.searchParams.set("from", options.range.start.slice(0, 10));
  url.searchParams.set("to", options.range.end.slice(0, 10));
  url.searchParams.set("token", options.apiKey);
  const response = await fetchImpl(url.toString(), {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Finnhub economic calendar failed: HTTP ${response.status}`);
  }
  const parsed = FinnhubEconomicResponseSchema.parse(await response.json());
  const retrieval = isoNow();
  const allow = options.countries?.map((country) => country.toUpperCase());
  return parsed.economicCalendar
    .map((row) => normalizeFinnhubEconomicEvent(row, retrieval))
    .filter((event): event is NormalizedCalendarEvent => event != null)
    .filter((event) =>
      allow?.length
        ? allow.includes((event.country ?? "").toUpperCase())
        : true,
    );
}
