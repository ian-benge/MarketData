import { describe, expect, it } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import {
  buildIdempotencyKey,
  CHICAGO_TZ,
  canPublish,
  getDueEditions,
  isUsEquityTradingDay,
  nextEditionLabel,
  sessionTimingFor,
} from "@/lib/scheduling/chicago-schedule";
import { SCHEDULE_VERSION } from "@/lib/reports/editions";
import { MockSchedulerAdapter } from "@/lib/providers/mock";

function chicagoLocal(
  date: string,
  hour: number,
  minute: number,
  second = 0,
): Date {
  const local = `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
  return fromZonedTime(local, CHICAGO_TZ);
}

describe("chicago-schedule", () => {
  it("rejects weekends and NYSE holidays", () => {
    expect(isUsEquityTradingDay(chicagoLocal("2026-08-08", 12, 0))).toBe(
      false,
    );
    expect(isUsEquityTradingDay(chicagoLocal("2026-07-03", 12, 0))).toBe(
      false,
    );
    expect(isUsEquityTradingDay(chicagoLocal("2026-08-10", 12, 0))).toBe(true);
  });

  it("returns due editions within grace window (CDT)", () => {
    const atPremarket = chicagoLocal("2026-08-10", 7, 35);
    const due = getDueEditions(atPremarket, 15, "firm-1");
    expect(due.map((d) => d.edition)).toEqual(["premarket"]);
    expect(due[0]?.idempotencyKey).toBe(
      buildIdempotencyKey("2026-08-10", "premarket", "firm-1"),
    );
    expect(due[0]?.idempotencyKey).toContain(SCHEDULE_VERSION);
  });

  it("does not enqueue a 15:30 close edition", () => {
    const atOldClose = chicagoLocal("2026-08-10", 15, 35);
    expect(getDueEditions(atOldClose, 15).map((d) => d.edition)).toEqual([]);
  });

  it("opens close_postmarket collect window at 15:00 CT", () => {
    const atCollect = chicagoLocal("2026-08-10", 15, 5);
    const due = getDueEditions(atCollect, 15);
    expect(due.map((d) => d.edition)).toEqual(["close_postmarket"]);
    expect(due[0]?.phase).toBe("collect");
  });

  it("publishes close_postmarket at 16:00 CT (CDT)", () => {
    const atPublish = chicagoLocal("2026-08-10", 16, 5);
    const due = getDueEditions(atPublish, 15);
    expect(due.map((d) => d.edition)).toEqual(["close_postmarket"]);
    expect(due[0]?.phase).toBe("publish");
  });

  it("handles CST winter offset via date-fns-tz", () => {
    const atClose = chicagoLocal("2026-01-20", 16, 5);
    expect(isUsEquityTradingDay(atClose)).toBe(true);
    const due = getDueEditions(atClose, 15);
    expect(due.map((d) => d.edition)).toEqual(["close_postmarket"]);
  });

  it("returns nothing outside grace window", () => {
    const late = chicagoLocal("2026-08-10", 8, 0);
    expect(getDueEditions(late, 15)).toHaveLength(0);
  });

  it("publishes one hour after official early close instead of 16:00 CT", () => {
    const day = "2026-11-27";
    const timing = sessionTimingFor(day, "close_postmarket");
    expect(timing.calendarKind).toBe("early_close");
    const atPublish = new Date(timing.publishAfter.getTime() + 60_000);
    const due = getDueEditions(atPublish, 15);
    expect(due.map((d) => d.edition)).toEqual(["close_postmarket"]);
    const atFour = chicagoLocal(day, 16, 5);
    expect(getDueEditions(atFour, 15)).toHaveLength(0);
  });

  it("honors extra holiday overrides", () => {
    const now = chicagoLocal("2026-08-10", 11, 32);
    expect(
      getDueEditions(now, {
        graceMinutes: 15,
        overrides: { extraHolidays: ["2026-08-10"] },
      }),
    ).toHaveLength(0);
  });

  it("canPublish waits until publishAfter", () => {
    const publish = chicagoLocal("2026-08-10", 16, 0);
    expect(canPublish(chicagoLocal("2026-08-10", 15, 30), publish)).toBe(false);
    expect(canPublish(chicagoLocal("2026-08-10", 16, 0), publish)).toBe(true);
  });

  it("nextEditionLabel uses 4:00 p.m. close/postmarket", () => {
    expect(nextEditionLabel(chicagoLocal("2026-08-10", 12, 0))).toContain(
      "Close / Postmarket",
    );
    expect(nextEditionLabel(chicagoLocal("2026-08-10", 12, 0))).toContain(
      "4:00",
    );
  });

  it("idempotency key format includes schedule version", () => {
    expect(buildIdempotencyKey("2026-08-10", "midday", "abc")).toBe(
      `2026-08-10:midday:${SCHEDULE_VERSION}:abc`,
    );
  });
});

describe("MockSchedulerAdapter helpers", () => {
  it("enqueues due editions and skips duplicates on second tick", async () => {
    const adapter = new MockSchedulerAdapter({ firmId: "default" });
    const now = chicagoLocal("2026-08-10", 11, 32);
    const first = await adapter.enqueueDueReports(now);
    expect(first.enqueued).toBe(1);
    expect(first.editions).toEqual(["midday"]);
    const second = await adapter.enqueueDueReports(now);
    expect(second.enqueued).toBe(0);
    expect(second.skipped).toBe(1);
  });
});
