"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { CalendarClock, ChevronDown, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import type { NormalizedCalendarEvent } from "@/lib/providers/types";
import { CHICAGO_TZ, chicagoDateString } from "@/lib/scheduling/chicago-schedule";
import { formatMarketTime } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

const MARKETS = [
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "AUD",
  "CAD",
  "CHF",
  "NZD",
  "CNY",
  "ALL",
] as const;

type Market = (typeof MARKETS)[number];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function displayPrint(value: string | number | null | undefined) {
  if (value == null || value === "") return "—";
  return String(value);
}

function impactTone(event: NormalizedCalendarEvent) {
  if (event.category === "other" && /holiday/i.test(event.title)) {
    return "holiday" as const;
  }
  if (event.importance === "high") return "high" as const;
  if (event.importance === "medium") return "medium" as const;
  if (event.importance === "low") return "low" as const;
  return "unrated" as const;
}

const IMPACT_DOT: Record<ReturnType<typeof impactTone>, string> = {
  high: "bg-[var(--market-negative)]",
  medium: "bg-[color-mix(in_oklab,var(--state-warning)_85%,white)]",
  low: "bg-[#d4b84a]",
  holiday: "bg-[var(--ib-text-muted)]",
  unrated: "bg-[var(--ib-border-control)]",
};

function addChicagoDays(yyyyMmDd: string, days: number): string {
  const noon = fromZonedTime(`${yyyyMmDd}T12:00:00`, CHICAGO_TZ);
  noon.setUTCDate(noon.getUTCDate() + days);
  return formatInTimeZone(noon, CHICAGO_TZ, "yyyy-MM-dd");
}

function sundayWeekStart(seed: Date): string {
  const key = chicagoDateString(seed);
  const isoWeekday = Number(formatInTimeZone(seed, CHICAGO_TZ, "i"));
  const sundayOffset = isoWeekday === 7 ? 0 : -isoWeekday;
  return addChicagoDays(key, sundayOffset);
}

function dayNumber(iso: string) {
  return Number(iso.slice(8, 10));
}

function matchesMarket(event: NormalizedCalendarEvent, market: Market) {
  if (market === "ALL") return true;
  const country = (event.country ?? "").toUpperCase();
  if (market === "USD") return country === "USD" || country === "US";
  return country === market;
}

function impactBadge(impact: ReturnType<typeof impactTone>) {
  if (impact === "high") return "warn" as const;
  if (impact === "medium") return "info" as const;
  return "neutral" as const;
}

export function CatalystCalendar({
  events,
}: {
  events: NormalizedCalendarEvent[];
}) {
  const [market, setMarket] = useState<Market>("USD");
  const [marketOpen, setMarketOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const marketRef = useRef<HTMLDivElement>(null);
  const today = chicagoDateString(new Date());

  const filtered = useMemo(
    () => events.filter((event) => matchesMarket(event, market)),
    [events, market],
  );

  const week = useMemo(() => {
    const seed = filtered[0]
      ? new Date(filtered[0].scheduledAt)
      : new Date();
    const start = sundayWeekStart(seed);
    return Array.from({ length: 7 }, (_, index) => addChicagoDays(start, index));
  }, [filtered]);

  const byDay = useMemo(() => {
    const map = new Map<string, NormalizedCalendarEvent[]>();
    for (const day of week) map.set(day, []);
    for (const event of filtered) {
      const key = chicagoDateString(new Date(event.scheduledAt));
      const list = map.get(key);
      if (list) list.push(event);
    }
    return map;
  }, [filtered, week]);

  useEffect(() => {
    setSelectedDay((current) => {
      if (current && week.includes(current)) return current;
      return (
        (byDay.get(today)?.length ? today : null) ??
        week.find((day) => (byDay.get(day)?.length ?? 0) > 0) ??
        week[0] ??
        null
      );
    });
  }, [byDay, today, week]);

  useEffect(() => {
    setSelectedId(null);
  }, [market]);

  useEffect(() => {
    if (!marketOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMarketOpen(false);
    }
    function onPointer(event: MouseEvent) {
      if (!marketRef.current?.contains(event.target as Node)) {
        setMarketOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [marketOpen]);

  const dayEvents = selectedDay ? (byDay.get(selectedDay) ?? []) : [];
  const selected =
    dayEvents.find((event) => event.id === selectedId) ?? null;

  return (
    <Panel
      title="Catalyst radar"
      description={`${market === "ALL" ? "All markets" : `${market} market`} · Forex Factory · morning refresh`}
      bodyClassName="space-y-3 p-3"
      actions={
        <div className="flex items-center gap-2">
          <div ref={marketRef} className="relative">
            <button
              type="button"
              aria-expanded={marketOpen}
              aria-haspopup="listbox"
              aria-label="Catalyst market"
              onClick={() => setMarketOpen((open) => !open)}
              className={cn(
                "inline-flex min-h-8 items-center gap-1.5 rounded-[3px] border px-2 font-mono text-[10px]",
                marketOpen
                  ? "border-[var(--ib-border-control)] bg-[var(--ib-surface-3)] text-[var(--ib-text-primary)]"
                  : "border-[var(--ib-border-subtle)] bg-transparent text-[var(--ib-text-secondary)] hover:text-[var(--ib-text-primary)]",
              )}
            >
              {market}
              <ChevronDown
                aria-hidden="true"
                className={cn("size-3 transition-transform", marketOpen && "rotate-180")}
              />
            </button>
            {marketOpen ? (
              <ul
                role="listbox"
                aria-label="Markets"
                className="absolute right-0 z-20 mt-1 max-h-64 min-w-[88px] overflow-auto rounded-[5px] border border-[var(--ib-border-strong)] bg-[var(--ib-surface-3)] py-1 shadow-[var(--shadow-float)]"
              >
                {MARKETS.map((item) => (
                  <li key={item}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={market === item}
                      onClick={() => {
                        setMarket(item);
                        setMarketOpen(false);
                      }}
                      className={cn(
                        "flex w-full px-2.5 py-1.5 text-left font-mono text-[10px]",
                        market === item
                          ? "bg-[var(--ib-surface-selected)] text-[var(--ib-text-primary)]"
                          : "text-[var(--ib-text-secondary)] hover:bg-[var(--ib-surface-hover)] hover:text-[var(--ib-text-primary)]",
                      )}
                    >
                      {item}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <CalendarClock
            aria-hidden="true"
            className="size-4 text-[var(--ib-text-muted)]"
          />
        </div>
      }
    >
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((label) => (
          <div
            key={label}
            className="px-0.5 text-center font-mono text-[8px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]"
          >
            {label}
          </div>
        ))}
        {week.map((day) => {
          const dayList = byDay.get(day) ?? [];
          const active = day === selectedDay;
          const isToday = day === today;
          const high = dayList.some((event) => impactTone(event) === "high");
          return (
            <button
              key={day}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setSelectedDay(day);
                setSelectedId(null);
              }}
              className={cn(
                "flex min-h-[72px] flex-col rounded-[4px] border px-1 py-1 text-left transition-colors",
                active
                  ? "border-[var(--ib-maroon-500)] bg-[var(--ib-surface-selected)]"
                  : "border-[var(--ib-border-subtle)] bg-[var(--ib-surface-inset)] hover:border-[var(--ib-border-control)]",
              )}
            >
              <span
                className={cn(
                  "font-mono text-[10px] tabular-nums",
                  isToday
                    ? "font-semibold text-[var(--ib-maroon-300)]"
                    : "text-[var(--ib-text-secondary)]",
                )}
              >
                {dayNumber(day)}
              </span>
              <span className="mt-1 flex flex-wrap gap-0.5">
                {dayList.slice(0, 4).map((event) => (
                  <span
                    key={event.id}
                    className={cn("size-1.5 rounded-full", IMPACT_DOT[impactTone(event)])}
                  />
                ))}
              </span>
              {dayList.length ? (
                <span
                  className={cn(
                    "mt-auto font-mono text-[8px] tabular-nums",
                    high ? "text-[var(--state-warning)]" : "text-[var(--ib-text-muted)]",
                  )}
                >
                  {dayList.length}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div>
        <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ib-maroon-300)]">
          {selectedDay
            ? new Intl.DateTimeFormat("en-US", {
                timeZone: CHICAGO_TZ,
                weekday: "long",
                month: "short",
                day: "numeric",
              }).format(fromZonedTime(`${selectedDay}T12:00:00`, CHICAGO_TZ))
            : "Select a day"}
        </p>
        {dayEvents.length ? (
          <ul className="divide-y divide-[var(--ib-border-subtle)] rounded-[4px] border border-[var(--ib-border-subtle)]">
            {dayEvents.map((event) => {
              const impact = impactTone(event);
              const open = event.id === selectedId;
              return (
                <li key={event.id}>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() =>
                      setSelectedId((current) =>
                        current === event.id ? null : event.id,
                      )
                    }
                    className={cn(
                      "flex w-full items-start gap-2 px-2.5 py-2 text-left hover:bg-[var(--ib-surface-hover)]",
                      open && "bg-[var(--ib-surface-hover)]",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn("mt-1.5 size-2 shrink-0 rounded-full", IMPACT_DOT[impact])}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 font-mono text-[10px] text-[var(--ib-text-muted)]">
                        <time dateTime={event.scheduledAt}>
                          {formatMarketTime(event.scheduledAt)}
                        </time>
                        <span>{event.country ?? market}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] font-medium text-[var(--ib-text-primary)]">
                        {event.title}
                      </span>
                    </span>
                    <Badge tone={impactBadge(impact)}>
                      {impact === "holiday" ? "Holiday" : impact}
                    </Badge>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-[4px] border border-dashed border-[var(--ib-border-subtle)] px-3 py-6 text-center text-[12px] text-[var(--ib-text-muted)]">
            No {market === "ALL" ? "" : `${market} `}catalysts this day.
          </p>
        )}
      </div>

      {selected ? (
        <div className="rounded-[4px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-inset)] px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                Event detail
              </p>
              <h3 className="mt-0.5 text-[13px] font-semibold text-[var(--ib-text-primary)]">
                {selected.title}
              </h3>
            </div>
            <button
              type="button"
              aria-label="Close event detail"
              onClick={() => setSelectedId(null)}
              className="rounded-[3px] p-1 text-[var(--ib-text-muted)] hover:bg-[var(--ib-surface-hover)] hover:text-[var(--ib-text-primary)]"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <p className="mt-1 font-mono text-[10px] text-[var(--ib-text-secondary)]">
            {formatMarketTime(selected.scheduledAt)} · {selected.country ?? "—"} ·{" "}
            {selected.category.replaceAll("_", " ")}
          </p>
          <dl className="mt-2 grid grid-cols-3 gap-2 border-t border-[var(--ib-border-subtle)] pt-2 font-mono text-[10px]">
            <div>
              <dt className="text-[var(--ib-text-muted)]">Actual</dt>
              <dd className="mt-0.5 text-[var(--ib-text-primary)]">
                {displayPrint(selected.actual)}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--ib-text-muted)]">Forecast</dt>
              <dd className="mt-0.5 text-[var(--ib-text-primary)]">
                {displayPrint(selected.consensus)}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--ib-text-muted)]">Previous</dt>
              <dd className="mt-0.5 text-[var(--ib-text-secondary)]">
                {displayPrint(selected.previous)}
              </dd>
            </div>
          </dl>
          {selected.coverageNotes ? (
            <p className="mt-2 text-[10px] leading-4 text-[var(--ib-text-muted)]">
              {selected.coverageNotes}
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="text-[10px] leading-4 text-[var(--ib-text-muted)]">
        Source:{" "}
        <a
          href="https://www.forexfactory.com/calendar"
          className="text-[var(--ib-maroon-300)] underline-offset-2 hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          Forex Factory calendar
        </a>
        {" · "}
        USD default · snapshot updates each morning (6:00 a.m. CT)
      </p>
    </Panel>
  );
}
