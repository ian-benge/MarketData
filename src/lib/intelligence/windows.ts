import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { CHICAGO_TZ, NEW_YORK_TZ, isUsEquityTradingDay } from "@/lib/scheduling/chicago-schedule";
import type { MoveWindow } from "./types";

function calendarDate(now: Date, timeZone: string, daysAgo = 0): string {
  const noon = fromZonedTime(
    `${formatInTimeZone(now, timeZone, "yyyy-MM-dd")}T12:00:00`,
    timeZone,
  );
  const target = new Date(noon.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  return formatInTimeZone(target, timeZone, "yyyy-MM-dd");
}

export function chicagoDayStart(now: Date, daysAgo = 0): Date {
  const date = calendarDate(now, CHICAGO_TZ, daysAgo);
  return fromZonedTime(`${date}T00:00:00`, CHICAGO_TZ);
}

export function easternAt(
  now: Date,
  hour: number,
  minute = 0,
  daysAgo = 0,
): Date {
  const date = calendarDate(now, NEW_YORK_TZ, daysAgo);
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return fromZonedTime(`${date}T${hh}:${mm}:00`, NEW_YORK_TZ);
}

/** 4:00 p.m. ET close of the most recent completed regular session. */
export function lastRegularClose(now = new Date()): Date {
  const closeToday = easternAt(now, 16, 0);
  if (isUsEquityTradingDay(now) && now >= closeToday) return closeToday;
  for (let daysAgo = 1; daysAgo <= 7; daysAgo++) {
    const close = easternAt(now, 16, 0, daysAgo);
    if (isUsEquityTradingDay(close)) return close;
  }
  return easternAt(now, 16, 0, 1);
}

export function parseTimeWindow(raw: string, now = new Date()): MoveWindow | null {
  const text = raw.toLowerCase();
  if (/\blast hour|past hour|60 minutes/.test(text)) {
    const start = new Date(now.getTime() - 60 * 60 * 1000);
    return { start: start.toISOString(), end: now.toISOString(), label: "Last hour" };
  }
  if (/\bpremarket|pre-market|before (?:the )?open/.test(text)) {
    const start = easternAt(now, 4, 0);
    return {
      start: start.toISOString(),
      end: now.toISOString(),
      label: "Premarket (4:00 a.m. ET)",
    };
  }
  if (/\bafter[- ]hours|postmarket|after the close/.test(text)) {
    const start = easternAt(now, 16, 0);
    return {
      start: start.toISOString(),
      end: now.toISOString(),
      label: "After-hours (4:00 p.m. ET)",
    };
  }
  if (/\btoday|this session/.test(text)) {
    return {
      start: chicagoDayStart(now).toISOString(),
      end: now.toISOString(),
      label: "Today (America/Chicago)",
    };
  }
  if (/\bthis week|past week|last 7 days/.test(text)) {
    return {
      start: chicagoDayStart(now, 7).toISOString(),
      end: now.toISOString(),
      label: "This week",
    };
  }
  if (/\bthis month|past month/.test(text)) {
    return {
      start: chicagoDayStart(now, 30).toISOString(),
      end: now.toISOString(),
      label: "This month",
    };
  }
  if (/\bovernight|since close/.test(text)) {
    const closeToday = easternAt(now, 16, 0);
    const start = now >= closeToday ? closeToday : easternAt(now, 16, 0, 1);
    return {
      start: start.toISOString(),
      end: now.toISOString(),
      label: "Overnight (since prior close)",
    };
  }
  return null;
}

/**
 * Move-attribution clock. Regular session matches the "today" search chip
 * (America/Chicago calendar day). Premarket/closed/overnight start at the
 * last completed 4:00 p.m. ET regular close — not Saturday 4:00 p.m.
 * The premarket *search chip* is stricter (4:00 a.m. ET → now) and is
 * labeled separately in the UI.
 */
export function newsWindowForSession(
  session: string | null | undefined,
  now = new Date(),
): MoveWindow {
  const end = now.toISOString();
  if (session === "premarket" || session === "overnight") {
    const start = lastRegularClose(now);
    return {
      start: start.toISOString(),
      end,
      label: "Since prior close (overnight + premarket)",
    };
  }
  if (session === "afterhours") {
    const start = lastRegularClose(now);
    return {
      start: start.toISOString(),
      end,
      label: "After-hours (since 4:00 p.m. ET)",
    };
  }
  if (session === "closed") {
    const start = lastRegularClose(now);
    return {
      start: start.toISOString(),
      end,
      label: "Since last regular session",
    };
  }
  return {
    start: chicagoDayStart(now).toISOString(),
    end,
    label: "Today (America/Chicago)",
  };
}
