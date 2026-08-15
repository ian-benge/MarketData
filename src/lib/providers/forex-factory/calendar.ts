import { z } from "zod";
import { fromZonedTime } from "date-fns-tz";
import { persistForexFactoryWeek } from "@/lib/market-data/catalyst-store";
import {
  fetchForexFactoryUpcomingWeeks,
  mergeForexFactoryEvents,
} from "@/lib/providers/forex-factory/site-calendar";
import type { NormalizedCalendarEvent } from "@/lib/providers/types";
import { CHICAGO_TZ, chicagoDateString } from "@/lib/scheduling/chicago-schedule";
import { fetchWithSizeLimit } from "@/lib/providers/rss/ssrf";

export const FF_CALENDAR_URL =
  "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
export const FF_CALENDAR_PAGE = "https://www.forexfactory.com/calendar";
export const CATALYST_MORNING_HOUR_CT = 6;

const COVERAGE =
  "Forex Factory official weekly calendar export. Forecast/actuals are FF prints; verify against the official release.";

const PrintSchema = z.union([z.string(), z.number()]).optional();

const ForexFactoryRawSchema = z.object({
  title: z.string(),
  country: z.string(),
  date: z.string(),
  impact: z.string().optional(),
  forecast: PrintSchema,
  previous: PrintSchema,
  actual: PrintSchema,
});

const ForexFactoryResponseSchema = z.array(ForexFactoryRawSchema);

function isoNow(): string {
  return new Date().toISOString();
}

function printValue(
  value: string | number | undefined,
): string | number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function mapForexFactoryImpact(
  impact: string | undefined,
): NormalizedCalendarEvent["importance"] | undefined {
  const key = impact?.trim().toLowerCase();
  if (key === "high") return "high";
  if (key === "medium") return "medium";
  if (key === "low") return "low";
  return undefined;
}

function categoryOf(
  title: string,
  impact: string | undefined,
): NormalizedCalendarEvent["category"] {
  if (impact?.toLowerCase() === "holiday" || /bank holiday|holiday/i.test(title)) {
    return "other";
  }
  if (/fomc|fed |federal reserve|powell|beige book/i.test(title)) {
    return "central_bank";
  }
  if (/treasury|bond auction|refunding/i.test(title)) return "treasury";
  return "economic";
}

export function lastCatalystMorningAt(now = new Date()): Date {
  const today = chicagoDateString(now);
  const todayMorning = fromZonedTime(
    `${today}T${String(CATALYST_MORNING_HOUR_CT).padStart(2, "0")}:00:00`,
    CHICAGO_TZ,
  );
  if (now.getTime() >= todayMorning.getTime()) return todayMorning;
  const prior = new Date(todayMorning.getTime() - 36 * 60 * 60 * 1000);
  const priorDay = chicagoDateString(prior);
  return fromZonedTime(
    `${priorDay}T${String(CATALYST_MORNING_HOUR_CT).padStart(2, "0")}:00:00`,
    CHICAGO_TZ,
  );
}

export function catalystSnapshotIsFresh(
  fetchedAt: string,
  now = new Date(),
): boolean {
  const at = Date.parse(fetchedAt);
  return Number.isFinite(at) && at >= lastCatalystMorningAt(now).getTime();
}

export function normalizeForexFactoryEvent(
  raw: z.infer<typeof ForexFactoryRawSchema>,
  retrievalTimestamp = isoNow(),
): NormalizedCalendarEvent | null {
  const title = raw.title.trim();
  if (!title) return null;
  const scheduled = new Date(raw.date);
  if (Number.isNaN(scheduled.getTime())) return null;

  return {
    id: `ff-${raw.country}-${raw.date}-${title}`.slice(0, 180),
    title,
    category: categoryOf(title, raw.impact),
    country: raw.country,
    importance: mapForexFactoryImpact(raw.impact),
    scheduledAt: scheduled.toISOString(),
    timeZone: CHICAGO_TZ,
    actual: printValue(raw.actual),
    consensus: printValue(raw.forecast),
    previous: printValue(raw.previous),
    providerName: "forex-factory",
    providerTimestamp: retrievalTimestamp,
    retrievalTimestamp,
    sourceQuality: "secondary",
    coverageNotes: COVERAGE,
    url: FF_CALENDAR_PAGE,
  };
}

export async function fetchForexFactoryCalendar(options?: {
  fetchImpl?: typeof fetch;
  url?: string;
}): Promise<NormalizedCalendarEvent[]> {
  const raw = await fetchWithSizeLimit(options?.url ?? FF_CALENDAR_URL, {
    fetchImpl: options?.fetchImpl,
    maxBytes: 800_000,
    signal: AbortSignal.timeout(12_000),
    headers: {
      accept: "application/json",
      "user-agent":
        "MarketDataFNIP/1.0 (research-desk; Forex Factory weekly calendar export)",
    },
  });
  if (!raw.ok) {
    throw new Error(`Forex Factory calendar failed: HTTP ${raw.status}`);
  }
  const parsed = ForexFactoryResponseSchema.parse(await raw.json());
  const retrieval = isoNow();
  return parsed
    .map((row) => normalizeForexFactoryEvent(row, retrieval))
    .filter((event): event is NormalizedCalendarEvent => event != null)
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
}

type CacheEntry = {
  fetchedAt: string;
  events: NormalizedCalendarEvent[];
};

let cache: CacheEntry | null = null;
let inflight: Promise<NormalizedCalendarEvent[]> | null = null;

export function resetForexFactoryCalendarCache() {
  cache = null;
  inflight = null;
}

export function usdCatalystNeedsMorningRefresh(now = new Date()): boolean {
  if (!cache) return true;
  return !catalystSnapshotIsFresh(cache.fetchedAt, now);
}

export async function getCatalystCalendar(options?: {
  force?: boolean;
  now?: Date;
}): Promise<{ events: NormalizedCalendarEvent[]; fetchedAt: string }> {
  const now = options?.now ?? new Date();
  if (
    !options?.force &&
    cache &&
    catalystSnapshotIsFresh(cache.fetchedAt, now)
  ) {
    return cache;
  }
  if (inflight) {
    const events = await inflight;
    return { events, fetchedAt: cache?.fetchedAt ?? now.toISOString() };
  }

  inflight = (async () => {
    let exportError: unknown;
    const thisWeek = await fetchForexFactoryCalendar().catch((error) => {
      exportError = error;
      return [] as NormalizedCalendarEvent[];
    });
    const last = thisWeek.at(-1);
    const upcoming = await fetchForexFactoryUpcomingWeeks({
      now,
      lastExportDay: last
        ? chicagoDateString(new Date(last.scheduledAt))
        : undefined,
    }).catch(() => [] as NormalizedCalendarEvent[]);
    const events = mergeForexFactoryEvents(thisWeek, upcoming);
    if (events.length === 0 && exportError) {
      if (cache) return cache.events;
      throw exportError;
    }
    cache = { events, fetchedAt: new Date().toISOString() };
    void persistForexFactoryWeek(events);
    return events;
  })().finally(() => {
    inflight = null;
  });

  try {
    const events = await inflight;
    return {
      events,
      fetchedAt: cache?.fetchedAt ?? now.toISOString(),
    };
  } catch {
    return { events: [], fetchedAt: now.toISOString() };
  }
}

/** @deprecated Use getCatalystCalendar — kept for existing cron/research call sites. */
export const getUsdCatalystCalendar = getCatalystCalendar;
