/**
 * FOMC announcement dates from the Federal Reserve calendar
 * (https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm).
 * Finite on purpose — scheduleStatus() warns before the list runs out.
 */
export const FOMC_MEETING_DATES = [
  "2025-01-29",
  "2025-03-19",
  "2025-05-07",
  "2025-06-18",
  "2025-07-30",
  "2025-09-17",
  "2025-10-29",
  "2025-12-10",
  "2026-01-28",
  "2026-03-18",
  "2026-04-29",
  "2026-06-17",
  "2026-07-29",
  "2026-09-16",
  "2026-10-28",
  "2026-12-09",
  "2027-01-27",
  "2027-03-17",
  "2027-04-28",
  "2027-06-09",
  "2027-07-28",
  "2027-09-15",
  "2027-10-27",
  "2027-12-08",
  "2028-01-26",
] as const;

export const ZQ_MONTH_CODES: Record<number, string> = {
  1: "F",
  2: "G",
  3: "H",
  4: "J",
  5: "K",
  6: "M",
  7: "N",
  8: "Q",
  9: "U",
  10: "V",
  11: "X",
  12: "Z",
};

export const MONTH_KEYS: Record<number, string> = {
  1: "JAN",
  2: "FEB",
  3: "MAR",
  4: "APR",
  5: "MAY",
  6: "JUN",
  7: "JUL",
  8: "AUG",
  9: "SEP",
  10: "OCT",
  11: "NOV",
  12: "DEC",
};

export function isoDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
}

export function upcomingFomcMeetings(from = new Date()): string[] {
  const today = isoDateOnly(from);
  return FOMC_MEETING_DATES.filter((date) => date >= today);
}

export function hasFomcMeetingInMonth(year: number, month: number): boolean {
  return FOMC_MEETING_DATES.some((iso) => {
    const date = parseIsoDate(iso);
    return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month;
  });
}

export function scheduleStatus(from = new Date()) {
  const remaining = upcomingFomcMeetings(from).length;
  return {
    state:
      remaining === 0 ? "expired" : remaining <= 3 ? "expiring" : "ok",
    remaining,
    lastKnown: FOMC_MEETING_DATES[FOMC_MEETING_DATES.length - 1] ?? null,
  };
}

export function monthKey(year: number, month: number): string {
  return `${MONTH_KEYS[month]} ${String(year % 100).padStart(2, "0")}`;
}

export function prevMonth(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

export function nextMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

export function meetingToContractCode(iso: string): string {
  const date = parseIsoDate(iso);
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  return `ZQ${ZQ_MONTH_CODES[month]}${year % 10}`;
}

export function meetingToSettlementMonth(iso: string): string {
  const date = parseIsoDate(iso);
  return monthKey(date.getUTCFullYear(), date.getUTCMonth() + 1);
}

export function yahooZqSymbol(year: number, month: number): string {
  return `ZQ${ZQ_MONTH_CODES[month]}${String(year % 100).padStart(2, "0")}.CBT`;
}

const MONTH_FROM_CODE: Record<string, number> = Object.fromEntries(
  Object.entries(ZQ_MONTH_CODES).map(([month, code]) => [code, Number(month)]),
);

export function parseYahooZqSymbol(
  symbol: string,
): { year: number; month: number } | null {
  const match = /^ZQ([FGHJKMNQUVXZ])(\d{2})(?:\.CBT)?$/i.exec(symbol.trim());
  if (!match) return null;
  const month = MONTH_FROM_CODE[match[1]!.toUpperCase()];
  if (!month) return null;
  const yy = Number(match[2]);
  return { year: yy >= 70 ? 1900 + yy : 2000 + yy, month };
}

export function daysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function lastBusinessDayOfMonth(year: number, month: number): string {
  const date = new Date(Date.UTC(year, month, 0));
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return isoDateOnly(date);
}

export function formatMeetingLabel(iso: string, yearDigits: 2 | 4 = 4): string {
  const date = parseIsoDate(iso);
  const day = date.getUTCDate();
  const mon = MONTH_KEYS[date.getUTCMonth() + 1] ?? "";
  const title = mon.slice(0, 1) + mon.slice(1).toLowerCase();
  const year =
    yearDigits === 2
      ? String(date.getUTCFullYear()).slice(-2)
      : String(date.getUTCFullYear());
  return `${day} ${title} ${year}`;
}

export function monthsForMeetings(meetingIsos: string[]) {
  const keys = new Map<string, { year: number; month: number }>();
  const add = (year: number, month: number) => {
    keys.set(`${year}-${month}`, { year, month });
  };
  for (const iso of meetingIsos) {
    const date = parseIsoDate(iso);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const prior = prevMonth(year, month);
    const following = nextMonth(year, month);
    add(prior.year, prior.month);
    add(year, month);
    add(following.year, following.month);
  }
  return [...keys.values()];
}
