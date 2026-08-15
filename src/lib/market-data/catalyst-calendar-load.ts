import {
  catalystFillWindows,
  mergePreferredCalendarEvents,
} from "@/lib/market-data/catalyst-calendar";
import { loadStoredCatalystEvents } from "@/lib/market-data/catalyst-store";
import { fetchFinnhubEconomicCalendar } from "@/lib/providers/finnhub/calendar";
import { getCatalystCalendar } from "@/lib/providers/forex-factory/calendar";
import type { NormalizedCalendarEvent } from "@/lib/providers/types";

const FILL_TTL_MS = 60 * 60 * 1000;

let fillCache: {
  apiKey: string;
  fetchedAt: number;
  events: NormalizedCalendarEvent[];
} | null = null;

export async function fetchFinnhubCatalystFill(
  apiKey: string,
  now = new Date(),
): Promise<NormalizedCalendarEvent[]> {
  if (
    fillCache &&
    fillCache.apiKey === apiKey &&
    now.getTime() - fillCache.fetchedAt < FILL_TTL_MS
  ) {
    return fillCache.events;
  }

  const pages = await Promise.all(
    catalystFillWindows(now).map((range) =>
      fetchFinnhubEconomicCalendar({
        apiKey,
        range: { start: range.start, end: range.end },
      }).catch(() => [] as NormalizedCalendarEvent[]),
    ),
  );
  const byId = new Map<string, NormalizedCalendarEvent>();
  for (const event of pages.flat()) byId.set(event.id, event);
  const events = [...byId.values()].sort(
    (a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt),
  );
  fillCache = { apiKey, fetchedAt: now.getTime(), events };
  return events;
}

export async function loadDashboardCatalystCalendar(env: {
  FINNHUB_API_KEY?: string;
}): Promise<NormalizedCalendarEvent[]> {
  const [ffResult, storedResult, finnhubResult] = await Promise.allSettled([
    getCatalystCalendar(),
    loadStoredCatalystEvents(),
    env.FINNHUB_API_KEY
      ? fetchFinnhubCatalystFill(env.FINNHUB_API_KEY)
      : Promise.resolve([] as NormalizedCalendarEvent[]),
  ]);
  const live = ffResult.status === "fulfilled" ? ffResult.value.events : [];
  const stored = storedResult.status === "fulfilled" ? storedResult.value : [];
  const finnhub = finnhubResult.status === "fulfilled" ? finnhubResult.value : [];
  return mergePreferredCalendarEvents(
    live,
    mergePreferredCalendarEvents(stored, finnhub),
  );
}
