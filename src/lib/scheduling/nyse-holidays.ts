import { fromZonedTime } from "date-fns-tz";
import {
  CHICAGO_TZ,
  NYSE_HOLIDAYS_2024_2027,
} from "@/lib/scheduling/chicago-schedule";
import type { NormalizedCalendarEvent } from "@/lib/providers/types";

export function nyseHolidayName(isoDate: string): string {
  const month = Number(isoDate.slice(5, 7));
  const day = Number(isoDate.slice(8, 10));
  if (month === 1 && day === 1) return "New Year's Day";
  if (month === 1 && day >= 15 && day <= 21) return "Martin Luther King Jr. Day";
  if (month === 2 && day >= 15 && day <= 21) return "Presidents' Day";
  if (month === 3 || month === 4) return "Good Friday";
  if (month === 5 && day >= 25) return "Memorial Day";
  if (month === 6 && day >= 18 && day <= 20) return "Juneteenth";
  if (month === 7 && day >= 3 && day <= 5) return "Independence Day";
  if (month === 9 && day <= 7) return "Labor Day";
  if (month === 11 && day >= 22) return "Thanksgiving";
  if (month === 12 && day >= 24) return "Christmas";
  return "NYSE full-day holiday";
}

export function nyseHolidayEvents(
  startIso: string,
  endIso: string,
  now = new Date(),
): NormalizedCalendarEvent[] {
  const start = startIso.slice(0, 10);
  const end = endIso.slice(0, 10);
  const retrieval = now.toISOString();
  const events: NormalizedCalendarEvent[] = [];
  for (const date of NYSE_HOLIDAYS_2024_2027) {
    if (date < start || date > end) continue;
    events.push({
      id: `nyse-holiday-${date}`,
      title: `NYSE closed — ${nyseHolidayName(date)}`,
      category: "other",
      country: "US",
      importance: "medium",
      scheduledAt: fromZonedTime(`${date}T08:30:00`, CHICAGO_TZ).toISOString(),
      timeZone: CHICAGO_TZ,
      providerName: "nyse-calendar",
      providerTimestamp: retrieval,
      retrievalTimestamp: retrieval,
      sourceQuality: "primary",
      coverageNotes: "Static NYSE full-day holiday calendar (observed dates).",
    });
  }
  return events;
}
