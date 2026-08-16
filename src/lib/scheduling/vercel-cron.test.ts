import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import {
  CHICAGO_TZ,
  EDITION_SCHEDULE,
  getDueEditions,
} from "@/lib/scheduling/chicago-schedule";

type CronEntry = { path: string; schedule: string };

function loadVercelCrons(): CronEntry[] {
  const vercel = JSON.parse(
    readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"),
  ) as { crons: CronEntry[] };
  return vercel.crons;
}

function chicagoLocal(date: string, hour: number, minute: number): Date {
  const local = `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
  return fromZonedTime(local, CHICAGO_TZ);
}

describe("vercel cron contract", () => {
  it("keeps tick and worker on Hobby-safe daily UTC schedules", () => {
    const crons = loadVercelCrons();
    const byPath = Object.fromEntries(crons.map((row) => [row.path, row.schedule]));
    expect(byPath["/api/cron/tick"]).toBe("0 14 * * *");
    expect(byPath["/api/cron/worker"]).toBe("5 14 * * *");
    expect(byPath["/api/cron/intel"]).toBeUndefined();
    expect(byPath["/api/cron/brokerage"]).toBeUndefined();
  });

  it("5-minute poll lands inside each Chicago edition grace window, including DST", () => {
    const summer = "2026-08-10";
    const winter = "2026-01-20";
    const samples = [
      { date: summer, hour: 7, minute: 30, edition: "premarket" },
      { date: summer, hour: 11, minute: 30, edition: "midday" },
      { date: summer, hour: 16, minute: 0, edition: "close_postmarket" },
      { date: winter, hour: 7, minute: 30, edition: "premarket" },
      { date: winter, hour: 11, minute: 30, edition: "midday" },
      { date: winter, hour: 16, minute: 0, edition: "close_postmarket" },
    ] as const;

    for (const sample of samples) {
      const justAfter = chicagoLocal(sample.date, sample.hour, sample.minute + 2);
      const due = getDueEditions(justAfter, 15);
      expect(due.map((row) => row.edition)).toContain(sample.edition);
    }

    expect(EDITION_SCHEDULE.map((row) => row.edition)).toEqual([
      "premarket",
      "midday",
      "close_postmarket",
    ]);
  });
});
