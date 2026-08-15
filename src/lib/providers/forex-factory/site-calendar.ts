import { z } from "zod";
import { sundayOfChicagoDate } from "@/lib/market-data/catalyst-calendar";
import { addCalendarDays } from "@/lib/market-data/earnings/window";
import { normalizeForexFactoryEvent } from "@/lib/providers/forex-factory/calendar";
import type { NormalizedCalendarEvent } from "@/lib/providers/types";
import { fetchWithSizeLimit } from "@/lib/providers/rss/ssrf";
import { chicagoDateString } from "@/lib/scheduling/chicago-schedule";

export const FF_SITE_ORIGIN = "https://www.forexfactory.com";
export const FF_APPLY_SETTINGS_URL =
  "https://www.forexfactory.com/calendar/apply-settings/1?navigation=0";
export const FF_UPCOMING_WEEKS = 8;
export const FF_SITE_COVERAGE =
  "Forex Factory calendar week view. Forecast/actuals are FF prints; verify against the official release.";

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const;

const PrintSchema = z.union([z.string(), z.number()]).optional();

const SiteEventSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  name: z.string().optional(),
  title: z.string().optional(),
  dateline: z.number().optional(),
  country: z.string().optional(),
  currency: z.string().optional(),
  impactClass: z.string().optional(),
  impactTitle: z.string().optional(),
  actual: PrintSchema,
  previous: PrintSchema,
  forecast: PrintSchema,
  date: z.string().optional(),
  url: z.string().optional(),
});

const SiteDaySchema = z.object({
  date: z.string().optional(),
  events: z.array(SiteEventSchema).optional(),
});

const SiteResponseSchema = z
  .object({
    days: z
      .union([z.array(SiteDaySchema), z.record(z.string(), SiteDaySchema)])
      .optional(),
  })
  .passthrough();

const BROWSER_HEADERS = {
  accept: "application/json, text/html;q=0.9",
  "content-type": "application/json",
  origin: FF_SITE_ORIGIN,
  referer: `${FF_SITE_ORIGIN}/calendar?week=next`,
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "x-requested-with": "XMLHttpRequest",
};

function isoNow(): string {
  return new Date().toISOString();
}

function wait(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function toForexFactoryWeekSlug(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return `${MONTHS[month - 1]}${day}.${year}`;
}

export function toForexFactoryLongDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  const label = new Date(Date.UTC(year, month - 1, day, 17));
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(label);
}

export function forexFactoryUpcomingWindow(
  now = new Date(),
  lastExportDay?: string,
): { from: string; to: string } | null {
  const today = chicagoDateString(now);
  const thisSunday = sundayOfChicagoDate(today);
  const horizonEnd = addCalendarDays(thisSunday, 7 * (FF_UPCOMING_WEEKS + 1) - 1);
  const from = lastExportDay ? addCalendarDays(lastExportDay, 1) : thisSunday;
  if (from > horizonEnd) return null;
  return { from, to: horizonEnd };
}

export function mapForexFactoryImpactClass(
  impactClass: string | undefined,
  impactTitle: string | undefined,
): string | undefined {
  const title = impactTitle?.toLowerCase() ?? "";
  if (title.includes("high")) return "High";
  if (title.includes("med")) return "Medium";
  if (title.includes("low")) return "Low";
  if (title.includes("holiday") || title.includes("non-economic")) return "Holiday";
  const cls = impactClass?.toLowerCase() ?? "";
  if (cls.includes("impact-red")) return "High";
  if (cls.includes("impact-ora")) return "Medium";
  if (cls.includes("impact-yel")) return "Low";
  if (cls.includes("impact-gra")) return "Holiday";
  return undefined;
}

export function extractJsonAfterKey(html: string, key: string): unknown {
  const needle = `"${key}"`;
  const keyAt = html.indexOf(needle);
  if (keyAt < 0) return null;
  const colon = html.indexOf(":", keyAt + needle.length);
  if (colon < 0) return null;
  let start = -1;
  for (let i = colon + 1; i < html.length && i < colon + 80; i += 1) {
    const ch = html[i];
    if (ch === "[" || ch === "{") {
      start = i;
      break;
    }
    if (ch && !/\s/.test(ch)) break;
  }
  if (start < 0) return null;
  const open = html[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < html.length && i - start < 2_000_000; i += 1) {
    const ch = html[i]!;
    if (inStr) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function siteDays(payload: unknown): z.infer<typeof SiteDaySchema>[] {
  const parsed = SiteResponseSchema.safeParse(payload);
  const days = parsed.success ? parsed.data.days : undefined;
  if (Array.isArray(days)) return days;
  if (days && typeof days === "object") return Object.values(days);
  if (Array.isArray(payload)) {
    return [{ events: payload as z.infer<typeof SiteEventSchema>[] }];
  }
  return [];
}

export function normalizeForexFactorySiteEvent(
  raw: z.infer<typeof SiteEventSchema>,
  retrievalTimestamp = isoNow(),
): NormalizedCalendarEvent | null {
  const title = (raw.name ?? raw.title ?? "").trim();
  if (!title) return null;
  const scheduled =
    raw.dateline != null && Number.isFinite(raw.dateline)
      ? new Date(raw.dateline * 1000)
      : raw.date
        ? new Date(raw.date)
        : null;
  if (!scheduled || Number.isNaN(scheduled.getTime())) return null;
  const country = (raw.currency ?? raw.country ?? "").trim();
  const impact = mapForexFactoryImpactClass(raw.impactClass, raw.impactTitle);
  const path = raw.url?.startsWith("http")
    ? raw.url
    : raw.url
      ? `${FF_SITE_ORIGIN}${raw.url}`
      : `${FF_SITE_ORIGIN}/calendar`;
  const event = normalizeForexFactoryEvent(
    {
      title,
      country,
      date: scheduled.toISOString(),
      impact,
      forecast: raw.forecast,
      previous: raw.previous,
      actual: raw.actual,
    },
    retrievalTimestamp,
  );
  if (!event) return null;
  return {
    ...event,
    url: path,
    coverageNotes: FF_SITE_COVERAGE,
  };
}

export function parseForexFactorySitePayload(
  payload: unknown,
  retrievalTimestamp = isoNow(),
): NormalizedCalendarEvent[] {
  const events: NormalizedCalendarEvent[] = [];
  for (const day of siteDays(payload)) {
    for (const row of day.events ?? []) {
      const parsed = SiteEventSchema.safeParse(row);
      if (!parsed.success) continue;
      const event = normalizeForexFactorySiteEvent(parsed.data, retrievalTimestamp);
      if (event) events.push(event);
    }
  }
  return events.sort(
    (a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt),
  );
}

function looksLikeCloudflareBlock(body: string): boolean {
  return /just a moment|cf-challenge|attention required/i.test(body);
}

export async function fetchForexFactorySiteRange(options: {
  from: string;
  to: string;
  fetchImpl?: typeof fetch;
}): Promise<NormalizedCalendarEvent[]> {
  const body = JSON.stringify({
    default_view: "this_week",
    impacts: [3, 2, 1, 0],
    event_types: [1, 2, 3, 4, 5, 7, 8, 9, 10, 11],
    currencies: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    begin_date: toForexFactoryLongDate(options.from),
    end_date: toForexFactoryLongDate(options.to),
  });

  const response = await fetchWithSizeLimit(FF_APPLY_SETTINGS_URL, {
    fetchImpl: options.fetchImpl,
    method: "POST",
    maxBytes: 2_500_000,
    signal: AbortSignal.timeout(15_000),
    headers: BROWSER_HEADERS,
    body,
  });
  const text = await response.text();
  if (!response.ok || looksLikeCloudflareBlock(text)) {
    throw new Error(`Forex Factory site calendar failed: HTTP ${response.status}`);
  }
  try {
    return parseForexFactorySitePayload(JSON.parse(text));
  } catch {
    const days = extractJsonAfterKey(text, "days");
    if (days == null) {
      throw new Error("Forex Factory site calendar did not return event JSON.");
    }
    return parseForexFactorySitePayload({ days });
  }
}

export async function fetchForexFactorySiteWeek(options: {
  week: string;
  fetchImpl?: typeof fetch;
}): Promise<NormalizedCalendarEvent[]> {
  const url = `${FF_SITE_ORIGIN}/calendar?week=${encodeURIComponent(options.week)}`;
  const response = await fetchWithSizeLimit(url, {
    fetchImpl: options.fetchImpl,
    maxBytes: 2_500_000,
    signal: AbortSignal.timeout(15_000),
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": BROWSER_HEADERS["user-agent"],
      referer: `${FF_SITE_ORIGIN}/calendar`,
    },
  });
  const text = await response.text();
  if (!response.ok || looksLikeCloudflareBlock(text)) {
    throw new Error(`Forex Factory week page failed: HTTP ${response.status}`);
  }
  const days = extractJsonAfterKey(text, "days");
  if (days == null) {
    throw new Error("Forex Factory week page did not embed event JSON.");
  }
  return parseForexFactorySitePayload({ days });
}

function weekSlugsInWindow(from: string, to: string): string[] {
  const slugs: string[] = [];
  const lastSunday = sundayOfChicagoDate(to);
  for (
    let day = sundayOfChicagoDate(from);
    day <= lastSunday;
    day = addCalendarDays(day, 7)
  ) {
    slugs.push(toForexFactoryWeekSlug(day));
  }
  return slugs;
}

export async function fetchForexFactoryUpcomingWeeks(options?: {
  now?: Date;
  lastExportDay?: string;
  fetchImpl?: typeof fetch;
  delayMs?: number;
}): Promise<NormalizedCalendarEvent[]> {
  const window = forexFactoryUpcomingWindow(options?.now, options?.lastExportDay);
  if (!window) return [];
  try {
    const posted = await fetchForexFactorySiteRange({
      from: window.from,
      to: window.to,
      fetchImpl: options?.fetchImpl,
    });
    if (posted.length > 0) return posted;
  } catch {
    /* Cloudflare often blocks POST; fall back to week HTML pages. */
  }

  const collected: NormalizedCalendarEvent[] = [];
  const delayMs = options?.delayMs ?? 250;
  const slugs = weekSlugsInWindow(window.from, window.to);
  for (let index = 0; index < slugs.length; index += 1) {
    try {
      collected.push(
        ...(await fetchForexFactorySiteWeek({
          week: slugs[index]!,
          fetchImpl: options?.fetchImpl,
        })),
      );
    } catch {
      break;
    }
    if (index < slugs.length - 1) await wait(delayMs);
  }
  return mergeForexFactoryEvents(collected, []);
}

export function mergeForexFactoryEvents(
  preferred: readonly NormalizedCalendarEvent[],
  extra: readonly NormalizedCalendarEvent[],
): NormalizedCalendarEvent[] {
  const byKey = new Map<string, NormalizedCalendarEvent>();
  const keyOf = (event: NormalizedCalendarEvent) =>
    `${chicagoDateString(new Date(event.scheduledAt))}|${(event.country ?? "").toUpperCase()}|${event.title}`;
  for (const event of extra) byKey.set(keyOf(event), event);
  for (const event of preferred) byKey.set(keyOf(event), event);
  return [...byKey.values()].sort(
    (a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt),
  );
}
