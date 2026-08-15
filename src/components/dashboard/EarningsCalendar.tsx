"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Moon,
  Search,
  Sun,
  X,
} from "lucide-react";
import { EarningsHistoryPanel } from "@/components/dashboard/EarningsHistoryChart";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import { StatusIndicator } from "@/components/ui/StatusIndicator";
import {
  AVG_VOLUME_FILTER_OPTIONS,
  applyEarningsDisplayFilters,
  findEarningsSearchMatches,
  MARKET_CAP_FILTER_OPTIONS,
  pickBestEarningsSearchMatch,
  type AvgVolumeFilter,
  type MarketCapFilter,
} from "@/lib/market-data/earnings/display-filter";
import type { EarningsHistorySnapshot } from "@/lib/market-data/earnings/history-types";
import {
  EARNINGS_REFRESH_MS,
  type EarningsCalendarEvent,
  type EarningsCalendarSnapshot,
  type EarningsSession,
  type EarningsSourceHealth,
} from "@/lib/market-data/earnings/types";
import { addCalendarDays } from "@/lib/market-data/earnings/window";
import { CHICAGO_TZ, chicagoDateString } from "@/lib/scheduling/chicago-schedule";
import { cn } from "@/lib/utils/cn";
import {
  formatCompactCurrency,
  formatMarketDateTime,
  formatPrice,
  formatSignedNumber,
  formatVolume,
} from "@/lib/utils/format";

type SessionFilter = "all" | "bmo" | "amc";

const FILTER_SELECT_CLASS =
  "h-7 max-sm:min-h-11 max-w-[9.5rem] rounded-[3px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-inset)] px-1.5 font-mono text-[10px] text-[var(--ib-text-primary)] outline-none focus:border-[var(--ib-border-control)]";

const SESSION_LABEL: Record<EarningsSession, string> = {
  bmo: "BMO",
  amc: "AMC",
  during: "RTH",
  unknown: "TBD",
};

function addChicagoDays(yyyyMmDd: string, days: number): string {
  return addCalendarDays(yyyyMmDd, days);
}

function mondayWeekStart(seed: Date): string {
  const key = chicagoDateString(seed);
  const weekday = Number(formatInTimeZone(seed, CHICAGO_TZ, "i"));
  return addChicagoDays(key, 1 - weekday);
}

function formatChipDay(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO_TZ,
    weekday: "short",
    day: "numeric",
  }).format(fromZonedTime(`${iso}T12:00:00`, CHICAGO_TZ));
}

function formatLongDay(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO_TZ,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(fromZonedTime(`${iso}T12:00:00`, CHICAGO_TZ));
}

function formatEps(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(2);
}

function impliedTone(percent: number | null | undefined) {
  if (percent == null) return "neutral" as const;
  if (percent >= 8) return "warn" as const;
  if (percent >= 4) return "info" as const;
  return "neutral" as const;
}

function sourceKind(source: EarningsSourceHealth) {
  if (!source.configured) return "disabled" as const;
  if (source.stale) return "stale" as const;
  if (source.ok) return "healthy" as const;
  return "failed" as const;
}

function SourceHealth({ data }: { data: EarningsCalendarSnapshot }) {
  const calendarAsOf =
    [data.meta.sources.finnhub.fetchedAt, data.meta.sources.alphaVantage.fetchedAt]
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? data.asOf;
  const tooltip = [
    `Finnhub: ${data.meta.sources.finnhub.configured ? (data.meta.sources.finnhub.ok ? "ok" : "error") : "not configured"} · ${data.meta.sources.finnhub.eventCount} events`,
    `Alpha Vantage: ${data.meta.sources.alphaVantage.configured ? (data.meta.sources.alphaVantage.ok ? "ok" : "error") : "not configured"} · ${data.meta.sources.alphaVantage.eventCount} events`,
    `Last calendar refresh: ${formatMarketDateTime(calendarAsOf, { seconds: true })}`,
    data.stale || data.meta.sources.finnhub.stale || data.meta.sources.alphaVantage.stale
      ? "Serving last successful calendar snapshot (stale)."
      : "Calendar snapshot is fresh.",
    `${data.events.length} events in ${data.meta.requestedWindow.from} → ${data.meta.requestedWindow.to}`,
  ].join("\n");

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      title={tooltip}
      aria-label="Earnings source health"
    >
      <StatusIndicator
        kind={sourceKind(data.meta.sources.finnhub)}
        label={`FH ${data.meta.sources.finnhub.eventCount}`}
      />
      <StatusIndicator
        kind={sourceKind(data.meta.sources.alphaVantage)}
        label={`AV ${data.meta.sources.alphaVantage.eventCount}`}
      />
      {data.stale || data.meta.sources.finnhub.stale || data.meta.sources.alphaVantage.stale ? (
        <StatusIndicator kind="stale" label="Stale" />
      ) : null}
    </div>
  );
}

function EventRow({
  event,
  selected,
  onOpen,
  onSelectSymbol,
}: {
  event: EarningsCalendarEvent;
  selected: boolean;
  onOpen: () => void;
  onSelectSymbol?: (ticker: string) => void;
}) {
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={selected}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen();
          }
        }}
        className={cn(
          "flex w-full cursor-pointer items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--ib-surface-hover)]",
          selected && "bg-[var(--ib-surface-hover)]",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <button
              type="button"
              className="font-mono text-[12px] font-semibold text-[var(--ib-maroon-300)] hover:underline"
              onClick={(click) => {
                click.stopPropagation();
                onSelectSymbol?.(event.ticker);
              }}
            >
              {event.ticker}
            </button>
            {event.conflicted ? (
              <span
                className="inline-flex text-[var(--state-warning)]"
                title={`Providers disagree on the report date. Showing ${event.reportDate}${event.alternativeReportDate ? `; also ${event.alternativeReportDate}` : ""}.`}
              >
                <AlertTriangle className="size-3" aria-hidden="true" />
                <span className="sr-only">Provider dates conflict</span>
              </span>
            ) : null}
            <span className="truncate text-[12px] text-[var(--ib-text-primary)]">
              {event.companyName ?? "—"}
            </span>
          </span>
          <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] text-[var(--ib-text-muted)]">
            <span>EPS {formatEps(event.epsEstimate)}</span>
            <span>Rev {formatCompactCurrency(event.revenueEstimate)}</span>
            {event.epsActual != null ? <span>Act {formatEps(event.epsActual)}</span> : null}
          </span>
        </span>
        <Badge tone={impliedTone(event.impliedMove?.percent)}>
          {event.impliedMove ? `${event.impliedMove.percent.toFixed(1)}%` : "—"}
        </Badge>
      </div>
    </li>
  );
}

function SessionColumn({
  title,
  icon,
  events,
  selectedId,
  onSelect,
  onSelectSymbol,
}: {
  title: string;
  icon: ReactNode;
  events: EarningsCalendarEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSelectSymbol?: (ticker: string) => void;
}) {
  return (
    <section className="min-w-0 rounded-[4px] border border-[var(--ib-border-subtle)]">
      <header className="flex items-center justify-between gap-2 border-b border-[var(--ib-border-subtle)] bg-[var(--ib-surface-inset)] px-3 py-2">
        <div className="flex items-center gap-2 text-[12px] font-semibold text-[var(--ib-text-primary)]">
          {icon}
          {title}
        </div>
        <span className="font-mono text-[10px] tabular-nums text-[var(--ib-text-muted)]">
          {events.length}
        </span>
      </header>
      {events.length ? (
        <ul className="max-h-[420px] divide-y divide-[var(--ib-border-subtle)] overflow-y-auto">
          {events.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              selected={event.id === selectedId}
              onOpen={() => onSelect(event.id)}
              onSelectSymbol={onSelectSymbol}
            />
          ))}
        </ul>
      ) : (
        <p className="px-3 py-8 text-center text-[12px] text-[var(--ib-text-muted)]">
          None scheduled.
        </p>
      )}
    </section>
  );
}

export function EarningsCalendar({
  onSelectSymbol,
}: {
  onSelectSymbol?: (ticker: string) => void;
}) {
  const [data, setData] = useState<EarningsCalendarSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() => mondayWeekStart(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => chicagoDateString(new Date()));
  const [sessionFilter, setSessionFilter] = useState<SessionFilter>("all");
  const [query, setQuery] = useState("");
  const [marketCapFilter, setMarketCapFilter] = useState<MarketCapFilter>("10b");
  const [avgVolumeFilter, setAvgVolumeFilter] = useState<AvgVolumeFilter>("any");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<EarningsHistorySnapshot | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function pull() {
      if (document.visibilityState === "hidden") return;
      try {
        const response = await fetch("/api/market/earnings", { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const next = (await response.json()) as EarningsCalendarSnapshot;
        if (!cancelled) setData(next);
      } catch {
        /* keep last */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void pull();
    const interval = window.setInterval(pull, EARNINGS_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void pull();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const weekDays = useMemo(
    () => Array.from({ length: 5 }, (_, index) => addChicagoDays(weekStart, index)),
    [weekStart],
  );
  const today = chicagoDateString(new Date());
  const activeDay = weekDays.includes(selectedDay)
    ? selectedDay
    : weekDays.includes(today)
      ? today
      : weekDays[0]!;

  const display = useMemo(
    () =>
      applyEarningsDisplayFilters(data?.events ?? [], {
        weekStart: weekDays[0]!,
        weekEnd: weekDays[4]!,
        session: sessionFilter,
        query,
        marketCap: marketCapFilter,
        avgVolume: avgVolumeFilter,
      }),
    [avgVolumeFilter, data?.events, marketCapFilter, query, sessionFilter, weekDays],
  );
  const filtered = display.visible;
  const sizeFilterActive = marketCapFilter !== "any" || avgVolumeFilter !== "any";
  const searchNeedle = query.trim();
  const searchScope = useMemo(
    () => ({
      session: sessionFilter,
      query,
      marketCap: marketCapFilter,
      avgVolume: avgVolumeFilter,
    }),
    [avgVolumeFilter, marketCapFilter, query, sessionFilter],
  );
  const searchMatches = useMemo(
    () =>
      searchNeedle
        ? findEarningsSearchMatches(data?.events ?? [], searchScope)
        : [],
    [data?.events, searchNeedle, searchScope],
  );

  function jumpToSearchMatch(
    nextQuery: string,
    overrides?: Partial<{
      session: SessionFilter;
      marketCap: MarketCapFilter;
      avgVolume: AvgVolumeFilter;
    }>,
  ) {
    const needle = nextQuery.trim();
    if (!needle || !data?.events.length) return;
    const match = pickBestEarningsSearchMatch(
      data.events,
      {
        session: overrides?.session ?? sessionFilter,
        query: needle,
        marketCap: overrides?.marketCap ?? marketCapFilter,
        avgVolume: overrides?.avgVolume ?? avgVolumeFilter,
      },
      today,
    );
    if (!match) {
      setSelectedId(null);
      return;
    }
    setWeekStart(mondayWeekStart(fromZonedTime(`${match.reportDate}T12:00:00`, CHICAGO_TZ)));
    setSelectedDay(match.reportDate);
    setSelectedId(match.id);
  }

  function onQueryChange(next: string) {
    setQuery(next);
    jumpToSearchMatch(next);
  }

  function onMarketCapChange(value: MarketCapFilter) {
    setMarketCapFilter(value);
    if (searchNeedle) jumpToSearchMatch(searchNeedle, { marketCap: value });
  }

  function onAvgVolumeChange(value: AvgVolumeFilter) {
    setAvgVolumeFilter(value);
    if (searchNeedle) jumpToSearchMatch(searchNeedle, { avgVolume: value });
  }

  function onSessionChange(value: SessionFilter) {
    setSessionFilter(value);
    if (searchNeedle) jumpToSearchMatch(searchNeedle, { session: value });
  }

  const byDay = useMemo(() => {
    const map = new Map<string, EarningsCalendarEvent[]>();
    for (const day of weekDays) map.set(day, []);
    for (const event of filtered) {
      map.get(event.reportDate)?.push(event);
    }
    return map;
  }, [filtered, weekDays]);

  const dayEvents = byDay.get(activeDay) ?? [];
  const beforeOpen = dayEvents.filter((event) => event.session === "bmo" || event.session === "during");
  const afterClose = dayEvents.filter((event) => event.session === "amc");
  const unconfirmed = dayEvents.filter((event) => event.session === "unknown");
  const selected = dayEvents.find((event) => event.id === selectedId) ?? null;
  const selectedTicker = selected?.ticker ?? null;
  const selectedName = selected?.companyName ?? null;

  useEffect(() => {
    if (!selectedTicker) return;
    let cancelled = false;
    void (async () => {
      setHistoryLoading(true);
      try {
        const params = new URLSearchParams({ symbol: selectedTicker });
        if (selectedName) params.set("name", selectedName);
        const response = await fetch(`/api/market/earnings/history?${params}`, {
          cache: "no-store",
        });
        if (cancelled) return;
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          setHistory({
            ticker: selectedTicker,
            companyName: selectedName,
            asOf: new Date().toISOString(),
            stale: false,
            usingFixtures: false,
            quarters: [],
            sources: {
              finnhub: { configured: true, ok: false, stale: false, fetchedAt: null, rowCount: 0, error: null },
              alphaVantage: { configured: true, ok: false, stale: false, fetchedAt: null, rowCount: 0, error: null },
              yahoo: { configured: true, ok: false, stale: false, fetchedAt: null, rowCount: 0, error: null },
            },
            error: body?.error ?? `History request failed (${response.status}).`,
          });
          return;
        }
        setHistory((await response.json()) as EarningsHistorySnapshot);
      } catch {
        if (!cancelled) {
          setHistory({
            ticker: selectedTicker,
            companyName: selectedName,
            asOf: new Date().toISOString(),
            stale: false,
            usingFixtures: false,
            quarters: [],
            sources: {
              finnhub: { configured: true, ok: false, stale: false, fetchedAt: null, rowCount: 0, error: null },
              alphaVantage: { configured: true, ok: false, stale: false, fetchedAt: null, rowCount: 0, error: null },
              yahoo: { configured: true, ok: false, stale: false, fetchedAt: null, rowCount: 0, error: null },
            },
            error: "History request failed.",
          });
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedTicker, selectedName]);

  function selectId(id: string) {
    setSelectedId((current) => (current === id ? null : id));
  }

  return (
    <Panel
      title="Earnings calendar"
      description={`Earnings scheduled · full slate · estimates + expected move · ${data?.sourceLabel ?? "loading"}`}
      bodyClassName="space-y-3 p-3"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {data ? <SourceHealth data={data} /> : null}
          <label className="relative hidden sm:block">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-[var(--ib-text-muted)]"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search ticker or company"
              className="h-7 max-sm:min-h-11 w-44 rounded-[3px] border border-[var(--ib-border-subtle)] bg-transparent pr-2 pl-6 font-mono text-[10px] text-[var(--ib-text-primary)] outline-none placeholder:text-[var(--ib-text-muted)] focus:border-[var(--ib-border-control)]"
            />
          </label>
          <div className="flex rounded-[3px] border border-[var(--ib-border-subtle)]">
            {(["all", "bmo", "amc"] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={sessionFilter === item}
                onClick={() => onSessionChange(item)}
                className={cn(
                  "h-7 max-sm:min-h-11 px-2 font-mono text-[10px] uppercase",
                  sessionFilter === item
                    ? "bg-[var(--ib-surface-3)] text-[var(--ib-text-primary)]"
                    : "text-[var(--ib-text-muted)] hover:text-[var(--ib-text-primary)]",
                )}
              >
                {item === "all" ? "All" : item.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Previous week"
          onClick={() => setWeekStart((current) => addChicagoDays(current, -7))}
          className="shrink-0 rounded-[3px] border border-[var(--ib-border-subtle)] p-1 text-[var(--ib-text-secondary)] hover:text-[var(--ib-text-primary)]"
        >
          <ChevronLeft className="size-3.5" />
        </button>
        <p className="min-w-0 flex-1 text-center text-[13px] font-semibold text-[var(--ib-text-primary)]">
          Earnings scheduled for {formatLongDay(activeDay)}
        </p>
        <button
          type="button"
          aria-label="Next week"
          onClick={() => setWeekStart((current) => addChicagoDays(current, 7))}
          className="shrink-0 rounded-[3px] border border-[var(--ib-border-subtle)] p-1 text-[var(--ib-text-secondary)] hover:text-[var(--ib-text-primary)]"
        >
          <ChevronRight className="size-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-5 gap-1">
        {weekDays.map((day) => {
          const count = byDay.get(day)?.length ?? 0;
          const active = activeDay === day;
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
                "rounded-[4px] border px-2 py-1.5 text-center transition-colors",
                active
                  ? "border-[var(--ib-maroon-500)] bg-[var(--ib-surface-selected)]"
                  : "border-[var(--ib-border-subtle)] bg-[var(--ib-surface-inset)] hover:border-[var(--ib-border-control)]",
              )}
            >
              <span
                className={cn(
                  "block font-mono text-[10px] uppercase tracking-[0.06em]",
                  day === today
                    ? "font-semibold text-[var(--ib-maroon-300)]"
                    : "text-[var(--ib-text-secondary)]",
                )}
              >
                {formatChipDay(day)}
              </span>
              <span className="mt-1 block font-mono text-[12px] tabular-nums text-[var(--ib-text-primary)]">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.07em] text-[var(--ib-text-muted)]">
          {dayEvents.length} compan{dayEvents.length === 1 ? "y" : "ies"} · {beforeOpen.length}{" "}
          before open · {afterClose.length} after close
          {unconfirmed.length ? ` · ${unconfirmed.length} unconfirmed` : ""}
          {` · ${display.visible.length} shown / ${display.inSelectedWindow} this week`}
          {searchNeedle
            ? ` · ${searchMatches.length} search match${searchMatches.length === 1 ? "" : "es"}`
            : ""}
          {display.hiddenByFilters
            ? ` · ${display.hiddenByFilters} hidden by filters`
            : ""}
          {sizeFilterActive && display.hiddenUnknownSize
            ? ` · ${display.hiddenUnknownSize} unknown size`
            : ""}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="sr-only" htmlFor="earnings-market-cap-filter">
            Market cap filter
          </label>
          <select
            id="earnings-market-cap-filter"
            value={marketCapFilter}
            onChange={(event) =>
              onMarketCapChange(event.target.value as MarketCapFilter)
            }
            className={FILTER_SELECT_CLASS}
          >
            {MARKET_CAP_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="earnings-avg-volume-filter">
            Average volume filter
          </label>
          <select
            id="earnings-avg-volume-filter"
            value={avgVolumeFilter}
            onChange={(event) =>
              onAvgVolumeChange(event.target.value as AvgVolumeFilter)
            }
            className={FILTER_SELECT_CLASS}
          >
            {AVG_VOLUME_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="relative sm:hidden">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-[var(--ib-text-muted)]"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search ticker or company"
          className="h-8 w-full rounded-[3px] border border-[var(--ib-border-subtle)] bg-transparent pr-2 pl-6 font-mono text-[11px] text-[var(--ib-text-primary)] outline-none placeholder:text-[var(--ib-text-muted)]"
        />
      </label>

      {loading && !data ? (
        <p className="py-8 text-center text-[13px] text-[var(--ib-text-muted)]">
          Loading earnings calendar…
        </p>
      ) : null}

      {data && !dayEvents.length ? (
        <p className="rounded-[4px] border border-dashed border-[var(--ib-border-subtle)] px-3 py-8 text-center text-[12px] text-[var(--ib-text-muted)]">
          {data.error
            ? data.error
            : searchNeedle && searchMatches.length === 0
              ? `No companies match “${searchNeedle}” with the current filters in the loaded calendar window.`
              : searchNeedle && searchMatches.length > 0
                ? `“${searchNeedle}” is on the calendar, but not on ${formatLongDay(activeDay)} with the current filters.`
                : "No companies on the calendar for this day."}
        </p>
      ) : null}

      {dayEvents.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <SessionColumn
            title="Before the Open"
            icon={<Sun className="size-3.5 text-[var(--state-warning)]" aria-hidden="true" />}
            events={beforeOpen}
            selectedId={selectedId}
            onSelect={selectId}
            onSelectSymbol={onSelectSymbol}
          />
          <SessionColumn
            title="After the Close"
            icon={<Moon className="size-3.5 text-[var(--state-info)]" aria-hidden="true" />}
            events={afterClose}
            selectedId={selectedId}
            onSelect={selectId}
            onSelectSymbol={onSelectSymbol}
          />
        </div>
      ) : null}

      {unconfirmed.length ? (
        <SessionColumn
          title="Time not confirmed"
          icon={<CalendarDays className="size-3.5 text-[var(--ib-text-muted)]" aria-hidden="true" />}
          events={unconfirmed}
          selectedId={selectedId}
          onSelect={selectId}
          onSelectSymbol={onSelectSymbol}
        />
      ) : null}

      {selected ? (
        <div className="rounded-[4px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-inset)] px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                {selected.ticker} · {SESSION_LABEL[selected.session]} ·{" "}
                {selected.fiscalPeriod ?? "Estimates"}
              </p>
              <h3 className="mt-0.5 text-[13px] font-semibold text-[var(--ib-text-primary)]">
                {selected.companyName ?? selected.ticker}
              </h3>
              {selected.conflicted ? (
                <p className="mt-1 text-[11px] text-[var(--state-warning)]">
                  Providers disagree on the report date. Showing {selected.reportDate}
                  {selected.alternativeReportDate
                    ? `; also ${selected.alternativeReportDate}`
                    : ""}
                  .
                </p>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Close earnings detail"
              onClick={() => setSelectedId(null)}
              className="rounded-[3px] p-1 text-[var(--ib-text-muted)] hover:bg-[var(--ib-surface-hover)] hover:text-[var(--ib-text-primary)]"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-2 border-t border-[var(--ib-border-subtle)] pt-2 font-mono text-[10px] sm:grid-cols-4">
            <div>
              <dt className="text-[var(--ib-text-muted)]">EPS est. / act.</dt>
              <dd className="mt-0.5 text-[var(--ib-text-primary)]">
                {formatEps(selected.epsEstimate)} / {formatEps(selected.epsActual)}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--ib-text-muted)]">EPS surprise</dt>
              <dd className="mt-0.5 text-[var(--ib-text-primary)]">
                {formatSignedNumber(selected.epsSurprise)}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--ib-text-muted)]">Rev est. / act.</dt>
              <dd className="mt-0.5 text-[var(--ib-text-primary)]">
                {formatCompactCurrency(selected.revenueEstimate)} /{" "}
                {formatCompactCurrency(selected.revenueActual)}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--ib-text-muted)]">Last / cap / ADV</dt>
              <dd className="mt-0.5 text-[var(--ib-text-primary)]">
                {formatPrice(selected.lastPrice, selected.ticker)} ·{" "}
                {formatCompactCurrency(selected.marketCap)} · {formatVolume(selected.avgVolume)}
              </dd>
            </div>
          </dl>
          {selected.impliedMove ? (
            <dl className="mt-2 grid grid-cols-2 gap-2 border-t border-[var(--ib-border-subtle)] pt-2 font-mono text-[10px] sm:grid-cols-4">
              <div>
                <dt className="text-[var(--ib-text-muted)]">Expected move</dt>
                <dd className="mt-0.5 text-[var(--ib-text-primary)]">
                  {selected.impliedMove.percent.toFixed(1)}% / $
                  {selected.impliedMove.dollars.toFixed(2)}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ib-text-muted)]">ATM strike</dt>
                <dd className="mt-0.5 text-[var(--ib-text-primary)]">
                  {selected.impliedMove.strike.toFixed(1)}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ib-text-muted)]">Call / put mid</dt>
                <dd className="mt-0.5 text-[var(--ib-text-primary)]">
                  {selected.impliedMove.callMid.toFixed(2)} / {selected.impliedMove.putMid.toFixed(2)}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ib-text-muted)]">Expiry used</dt>
                <dd className="mt-0.5 text-[var(--ib-text-primary)]">
                  {selected.impliedMove.expiry}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-2 text-[11px] text-[var(--ib-text-muted)]">
              No usable options chain for an expected move.
            </p>
          )}
          <p className="mt-2 text-[10px] leading-4 text-[var(--ib-text-muted)]">
            {selected.coverageNotes}
          </p>
          <EarningsHistoryPanel
            key={selected.ticker}
            ticker={selected.ticker}
            companyName={selected.companyName}
            data={history?.ticker === selected.ticker ? history : null}
            loading={historyLoading}
          />
        </div>
      ) : null}

      <p className="text-[10px] leading-4 text-[var(--ib-text-muted)]">
        {data?.attribution ??
          "Full earnings calendar with consensus estimates and options-implied expected move."}
        {data?.scanned
          ? ` · ${data.events.length} companies in window (${data.scanned} prints scanned)`
          : ""}
        {data?.meta
          ? ` · ${data.meta.merge.unionCount} union · ${data.meta.merge.finnhubOnly} FH-only · ${data.meta.merge.alphaVantageOnly} AV-only`
          : ""}
        {data?.error ? ` · ${data.error}` : ""}
      </p>
    </Panel>
  );
}
