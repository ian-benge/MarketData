import { formatInTimeZone } from "date-fns-tz";
import { addCalendarDays } from "@/lib/market-data/earnings/window";
import {
  NormalizedCalendarEventSchema,
  type NormalizedCalendarEvent,
} from "@/lib/providers/types";
import { CHICAGO_TZ, chicagoDateString } from "@/lib/scheduling/chicago-schedule";
import {
  canCreateAdminClient,
  createAdminClient,
} from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

const STORED_LOOKBACK_DAYS = 800;

function printText(value: string | number | null | undefined): string | null {
  if (value == null || value === "") return null;
  return String(value);
}

function toRow(event: NormalizedCalendarEvent) {
  const scheduled = new Date(event.scheduledAt);
  const eventDate = chicagoDateString(scheduled);
  return {
    event_date: eventDate,
    event_time: Number.isNaN(scheduled.getTime())
      ? null
      : formatInTimeZone(scheduled, CHICAGO_TZ, "HH:mm:ss"),
    country: event.country ?? "US",
    title: event.title,
    importance: event.importance ?? null,
    actual: printText(event.actual),
    forecast: printText(event.consensus),
    previous: printText(event.previous),
    provider_name: event.providerName,
    raw: event,
  };
}

export async function persistForexFactoryWeek(
  events: readonly NormalizedCalendarEvent[],
): Promise<void> {
  try {
    if (!canCreateAdminClient() || events.length === 0) return;
    const days = events.map((event) => chicagoDateString(new Date(event.scheduledAt))).sort();
    const from = days[0];
    const to = days.at(-1);
    if (!from || !to) return;

    const supabase = createAdminClient();
    const { error: deleteError } = await supabase
      .from("economic_events")
      .delete()
      .eq("provider_name", "forex-factory")
      .gte("event_date", from)
      .lte("event_date", to);
    if (deleteError) return;

    const { error: insertError } = await supabase
      .from("economic_events")
      .insert(events.map(toRow));
    if (insertError) return;
  } catch {
    /* persistence is best-effort */
  }
}

export async function loadStoredCatalystEvents(
  now = new Date(),
): Promise<NormalizedCalendarEvent[]> {
  if (!canCreateAdminClient()) return [];
  const supabase = createAdminClient();
  const from = addCalendarDays(chicagoDateString(now), -STORED_LOOKBACK_DAYS);

  try {
    const rows = await fetchAllRows(async (start, end) => {
      const { data, error } = await supabase
        .from("economic_events")
        .select("raw")
        .gte("event_date", from)
        .order("event_date", { ascending: true })
        .order("id", { ascending: true })
        .range(start, end);
      if (error) throw error;
      return (data ?? []) as Array<{ raw: unknown }>;
    });

    const events: NormalizedCalendarEvent[] = [];
    for (const row of rows) {
      const parsed = NormalizedCalendarEventSchema.safeParse(row.raw);
      if (parsed.success) events.push(parsed.data);
    }
    return events;
  } catch {
    return [];
  }
}
