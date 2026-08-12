import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  REPORT_EDITIONS,
  SCHEDULE_VERSION,
  buildIdempotencyKey,
  type ReportEdition,
} from "@/lib/reports/editions";
import {
  isNyseEarlyCloseDay,
  type CalendarOverrides,
} from "@/lib/scheduling/nyse-early-close";

export const CHICAGO_TZ = "America/Chicago";
export const NEW_YORK_TZ = "America/New_York";

export type EditionDefinition = {
  edition: ReportEdition;
  /** Publish hour/minute on a normal session (America/Chicago). */
  hour: number;
  minute: number;
};

/**
 * Premarket 07:30, midday 11:30, close/postmarket 16:00 America/Chicago.
 * Close/postmarket collection may begin at 15:00 CT on normal days.
 */
export const EDITION_SCHEDULE: readonly EditionDefinition[] = [
  { edition: "premarket", hour: 7, minute: 30 },
  { edition: "midday", hour: 11, minute: 30 },
  { edition: "close_postmarket", hour: 16, minute: 0 },
] as const;

/**
 * Static NYSE full-day holiday list (observed dates) for 2024–2027.
 * Early-close days are still trading days for isUsEquityTradingDay.
 */
export const NYSE_HOLIDAYS_2024_2027: ReadonlySet<string> = new Set([
  // 2024
  "2024-01-01",
  "2024-01-15",
  "2024-02-19",
  "2024-03-29",
  "2024-05-27",
  "2024-06-19",
  "2024-07-04",
  "2024-09-02",
  "2024-11-28",
  "2024-12-25",
  // 2025
  "2025-01-01",
  "2025-01-20",
  "2025-02-17",
  "2025-04-18",
  "2025-05-26",
  "2025-06-19",
  "2025-07-04",
  "2025-09-01",
  "2025-11-27",
  "2025-12-25",
  // 2026
  "2026-01-01",
  "2026-01-19",
  "2026-02-16",
  "2026-04-03",
  "2026-05-25",
  "2026-06-19",
  "2026-07-03", // Independence Day observed (Sat Jul 4)
  "2026-09-07",
  "2026-11-26",
  "2026-12-25",
  // 2027
  "2027-01-01",
  "2027-01-18",
  "2027-02-15",
  "2027-03-26",
  "2027-05-31",
  "2027-06-18", // Juneteenth observed (Sat Jun 19)
  "2027-07-05", // Independence Day observed (Sun Jul 4)
  "2027-09-06",
  "2027-11-25",
  "2027-12-24", // Christmas observed (Sat Dec 25)
]);

export type CalendarKind = "regular" | "early_close" | "holiday_skip";

export type ScheduleClock = {
  now?: Date;
  overrides?: CalendarOverrides;
};

export function chicagoDateString(date: Date): string {
  return formatInTimeZone(date, CHICAGO_TZ, "yyyy-MM-dd");
}

function chicagoIsoWeekday(date: Date): number {
  return Number(formatInTimeZone(date, CHICAGO_TZ, "i"));
}

export function isUsEquityTradingDay(
  date: Date,
  overrides?: CalendarOverrides,
): boolean {
  const key = chicagoDateString(date);
  if (overrides?.forceOpen?.includes(key)) return true;
  const iso = chicagoIsoWeekday(date);
  if (iso === 6 || iso === 7) return false;
  if (NYSE_HOLIDAYS_2024_2027.has(key)) return false;
  if (overrides?.extraHolidays?.includes(key)) return false;
  return true;
}

export { buildIdempotencyKey, SCHEDULE_VERSION };

export type DuePhase = "collect" | "publish";

export type DueEdition = {
  edition: ReportEdition;
  tradingDate: string;
  scheduledAt: Date;
  collectAt: Date;
  publishAfter: Date;
  sessionCloseAt: Date;
  calendarKind: CalendarKind;
  phase: DuePhase;
  idempotencyKey: string;
  scheduleVersion: string;
};

export function scheduledInstant(
  tradingDate: string,
  hour: number,
  minute: number,
  timeZone: string = CHICAGO_TZ,
): Date {
  const local = `${tradingDate}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
  return fromZonedTime(local, timeZone);
}

export type SessionTiming = {
  calendarKind: CalendarKind;
  sessionCloseAt: Date;
  collectAt: Date;
  publishAfter: Date;
};

/**
 * Official regular-session close and collect/publish instants for an edition.
 * Early-close days: NYSE 1:00 p.m. ET = 12:00 p.m. CT; publish = close + 1 hour.
 */
export function sessionTimingFor(
  tradingDate: string,
  edition: ReportEdition,
  overrides?: CalendarOverrides,
): SessionTiming {
  const early = isNyseEarlyCloseDay(tradingDate, overrides);
  if (edition !== "close_postmarket") {
    const def = EDITION_SCHEDULE.find((d) => d.edition === edition)!;
    const at = scheduledInstant(tradingDate, def.hour, def.minute);
    const sessionCloseAt = scheduledInstant(tradingDate, 15, 0);
    return {
      calendarKind: early ? "early_close" : "regular",
      sessionCloseAt: early
        ? scheduledInstant(tradingDate, 13, 0, NEW_YORK_TZ)
        : sessionCloseAt,
      collectAt: at,
      publishAfter: at,
    };
  }

  if (early) {
    const sessionCloseAt = scheduledInstant(tradingDate, 13, 0, NEW_YORK_TZ);
    const publishAfter = new Date(sessionCloseAt.getTime() + 60 * 60_000);
    return {
      calendarKind: "early_close",
      sessionCloseAt,
      collectAt: sessionCloseAt,
      publishAfter,
    };
  }

  const sessionCloseAt = scheduledInstant(tradingDate, 15, 0);
  return {
    calendarKind: "regular",
    sessionCloseAt,
    collectAt: sessionCloseAt,
    publishAfter: scheduledInstant(tradingDate, 16, 0),
  };
}

function inGrace(now: Date, instant: Date, graceMs: number): boolean {
  const elapsed = now.getTime() - instant.getTime();
  return elapsed >= 0 && elapsed <= graceMs;
}

export type GetDueEditionsOptions = {
  graceMinutes?: number;
  firmId?: string;
  overrides?: CalendarOverrides;
  scheduleVersion?: string;
};

/**
 * Returns collect and/or publish windows that are due for `now`.
 * Duplicate cron ticks are deduped by idempotency key (same key for both phases).
 */
export function getDueEditions(
  now: Date,
  graceMinutesOrOptions: number | GetDueEditionsOptions = 15,
  firmIdArg = "default",
): DueEdition[] {
  const options: GetDueEditionsOptions =
    typeof graceMinutesOrOptions === "number"
      ? { graceMinutes: graceMinutesOrOptions, firmId: firmIdArg }
      : graceMinutesOrOptions;
  const graceMinutes = options.graceMinutes ?? 15;
  const firmId = options.firmId ?? firmIdArg;
  const overrides = options.overrides;
  const scheduleVersion = options.scheduleVersion ?? SCHEDULE_VERSION;

  if (!isUsEquityTradingDay(now, overrides)) {
    return [];
  }

  const tradingDate = chicagoDateString(now);
  const graceMs = graceMinutes * 60_000;
  const due: DueEdition[] = [];

  for (const edition of REPORT_EDITIONS) {
    const timing = sessionTimingFor(tradingDate, edition, overrides);
    const collectDue = inGrace(now, timing.collectAt, graceMs);
    const publishDue = inGrace(now, timing.publishAfter, graceMs);
    if (!collectDue && !publishDue) continue;

    const phase: DuePhase =
      publishDue && now.getTime() >= timing.publishAfter.getTime()
        ? "publish"
        : "collect";

    due.push({
      edition,
      tradingDate,
      scheduledAt: timing.publishAfter,
      collectAt: timing.collectAt,
      publishAfter: timing.publishAfter,
      sessionCloseAt: timing.sessionCloseAt,
      calendarKind: timing.calendarKind,
      phase,
      scheduleVersion,
      idempotencyKey: buildIdempotencyKey(
        tradingDate,
        edition,
        firmId,
        scheduleVersion,
      ),
    });
  }

  return due;
}

export function isEditionDue(
  now: Date,
  edition: ReportEdition,
  graceMinutes = 15,
): boolean {
  return getDueEditions(now, graceMinutes).some((d) => d.edition === edition);
}

export function canPublish(
  now: Date,
  publishAfter: Date | string | null | undefined,
): boolean {
  if (!publishAfter) return true;
  const at =
    publishAfter instanceof Date ? publishAfter : new Date(publishAfter);
  return now.getTime() >= at.getTime();
}

const PUBLISH_GATED_STAGES = new Set([
  "rendering_pdf",
  "archiving",
  "delivering_email",
]);

export function isPublishGatedStage(stage: string): boolean {
  return PUBLISH_GATED_STAGES.has(stage);
}

/**
 * Next scheduled edition label for dashboard chrome (America/Chicago clock).
 */
export function nextEditionLabel(
  now: Date,
  overrides?: CalendarOverrides,
): string {
  const tradingDate = chicagoDateString(now);
  if (!isUsEquityTradingDay(now, overrides)) {
    return "Premarket · 7:30 a.m. CT";
  }
  const premarket = sessionTimingFor(tradingDate, "premarket", overrides);
  const midday = sessionTimingFor(tradingDate, "midday", overrides);
  const close = sessionTimingFor(
    tradingDate,
    "close_postmarket",
    overrides,
  );
  if (now.getTime() < midday.publishAfter.getTime()) {
    return "Midday · 11:30 a.m. CT";
  }
  if (now.getTime() < close.publishAfter.getTime()) {
    if (close.calendarKind === "early_close") {
      const local = formatInTimeZone(
        close.publishAfter,
        CHICAGO_TZ,
        "h:mm a",
      );
      return `Close / Postmarket · ${local} CT (early close)`;
    }
    return "Close / Postmarket · 4:00 p.m. CT";
  }
  if (now.getTime() < premarket.publishAfter.getTime() + 24 * 60 * 60_000) {
    return "Premarket · 7:30 a.m. CT";
  }
  return "Premarket · 7:30 a.m. CT";
}

export { REPORT_EDITIONS };
