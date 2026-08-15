"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  pulseAreaPath,
  pulseLinePath,
  shouldOverlayLivePulse,
} from "@/components/dashboard/market-pulse/pulse-path-geometry";
import {
  PULSE_HISTORY_RANGES,
  regularSessionStamps,
  tradingDateKey,
  type PulseHistoryPoint,
  type PulseHistoryRange,
} from "@/lib/market-data/pulse-history";
import { formatMarketDateTime, formatMarketTime } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

const RANGE_COPY: Record<PulseHistoryRange, string> = {
  "1D": "Intraday",
  WTD: "Week to date",
  MTD: "Month to date",
  "5D": "5 sessions",
  "15D": "15 sessions",
  "30D": "30 sessions",
};

const UP = "#42b883";
const DOWN = "#e06666";

type HistoryResponse = {
  points?: PulseHistoryPoint[];
};

function pointX(index: number, count: number, width: number) {
  if (count <= 1) return width;
  return (index / (count - 1)) * width;
}

function sessionPointX(at: string, width: number, axisDay?: string) {
  const day = axisDay ?? tradingDateKey(at);
  const stamps = regularSessionStamps(day, "5m");
  if (stamps.length < 2) return 0;
  const open = Date.parse(stamps[0]!);
  const last = Date.parse(stamps.at(-1)!);
  const span = last - open;
  if (span <= 0) return 0;
  return Math.min(width, Math.max(0, ((Date.parse(at) - open) / span) * width));
}

function pointY(score: number, height: number, min: number, max: number) {
  const span = Math.max(max - min, 1);
  return height - ((score - min) / span) * height;
}

function pulseDomain(scores: number[]) {
  if (!scores.length) return { min: 40, max: 60 };
  const low = Math.min(...scores);
  const high = Math.max(...scores);
  return { min: low - 10, max: high + 10 };
}

export function PulseHistoryChart({
  liveScore,
  liveAt,
}: {
  liveScore: number | null;
  liveAt: string;
}) {
  const [range, setRange] = useState<PulseHistoryRange>("1D");
  const [points, setPoints] = useState<PulseHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [hover, setHover] = useState<number | null>(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  const rangeRef = useRef<HTMLDivElement>(null);
  const gradientId = useId().replaceAll(":", "");

  useEffect(() => {
    if (!rangeOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setRangeOpen(false);
    }
    function onPointer(event: MouseEvent) {
      if (!rangeRef.current?.contains(event.target as Node)) setRangeOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [rangeOpen]);

  useEffect(() => {
    let cancelled = false;
    async function pull(initial: boolean) {
      if (initial) setLoading(true);
      try {
        const response = await fetch(`/api/market/pulse-history?range=${range}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("history unavailable");
        const payload = (await response.json()) as HistoryResponse;
        if (!cancelled) setPoints(payload.points ?? []);
      } catch {
        if (!cancelled && initial) setPoints([]);
      } finally {
        if (!cancelled && initial) setLoading(false);
      }
    }
    void pull(true);
    const interval = window.setInterval(
      () => void pull(false),
      range === "1D" ? 45_000 : 180_000,
    );
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [range]);

  const series = useMemo(() => {
    const next = [...points];
    const last = next.at(-1);
    if (
      liveScore != null &&
      shouldOverlayLivePulse({
        range,
        liveAt,
        lastAt: last?.at ?? null,
        tradingDateKey,
      })
    ) {
      const liveDate = tradingDateKey(liveAt);
      const lastDate = last ? tradingDateKey(last.at) : null;
      const livePoint: PulseHistoryPoint = {
        at: liveAt,
        score: liveScore,
        provisional: false,
        coverage: 1,
        regime: liveScore >= 50 ? "Constructive" : "Defensive",
        positiveCount: 0,
        comparableCount: 0,
      };
      const sameBucket =
        last &&
        lastDate === liveDate &&
        Math.abs(Date.parse(liveAt) - Date.parse(last.at)) < 5 * 60_000;
      if (sameBucket && last) next[next.length - 1] = { ...last, ...livePoint };
      else if (!last || Date.parse(liveAt) > Date.parse(last.at)) next.push(livePoint);
    }
    return next
      .filter((point): point is PulseHistoryPoint & { score: number } => point.score != null)
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  }, [liveAt, liveScore, points, range]);

  const active = hover != null ? series[hover] : series.at(-1);
  const width = 100;
  const height = 36;
  const domain = useMemo(
    () => pulseDomain(series.map((point) => point.score)),
    [series],
  );
  const midY = pointY(50, height, domain.min, domain.max);
  const fiftyVisible = 50 >= domain.min && 50 <= domain.max;
  const axisDay = range === "1D" && series[0] ? tradingDateKey(series[0].at) : null;
  const xs = useMemo(
    () =>
      series.map((point, index) =>
        range === "1D"
          ? sessionPointX(point.at, width, axisDay ?? undefined)
          : pointX(index, series.length, width),
      ),
    [axisDay, range, series],
  );
  const ys = useMemo(
    () => series.map((point) => pointY(point.score, height, domain.min, domain.max)),
    [domain.max, domain.min, series],
  );
  const path = useMemo(() => pulseLinePath(xs, ys), [xs, ys]);
  const area = useMemo(() => pulseAreaPath(xs, ys, midY), [midY, xs, ys]);
  const midOffset = fiftyVisible
    ? `${(((domain.max - 50) / Math.max(domain.max - domain.min, 1)) * 100).toFixed(2)}%`
    : "50%";

  return (
    <div className="mb-4 flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--ib-text-muted)]">
            Pulse path
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-[var(--ib-text-secondary)]">
            {active?.score != null
              ? `${active.score} · ${range === "1D" ? formatMarketTime(active.at) : formatMarketDateTime(active.at, { date: true })}`
              : loading
                ? "Reconstructing verified proxy path…"
                : "No reconstructed path for this window"}
          </p>
        </div>
        <div ref={rangeRef} className="relative">
          <button
            type="button"
            aria-expanded={rangeOpen}
            aria-controls="pulse-path-range"
            aria-haspopup="listbox"
            onClick={() => setRangeOpen((open) => !open)}
            className={cn(
              "inline-flex min-h-8 items-center gap-1.5 rounded-[3px] border px-2 font-mono text-[10px]",
              rangeOpen
                ? "border-[var(--ib-border-control)] bg-[var(--ib-surface-3)] text-[var(--ib-text-primary)]"
                : "border-[var(--ib-border-subtle)] bg-transparent text-[var(--ib-text-muted)] hover:text-[var(--ib-text-primary)]",
            )}
          >
            {range}
            <span className="hidden text-[var(--ib-text-secondary)] sm:inline">
              {RANGE_COPY[range]}
            </span>
            <ChevronDown
              aria-hidden="true"
              className={cn("size-3 transition-transform", rangeOpen && "rotate-180")}
            />
          </button>
          {rangeOpen ? (
            <ul
              id="pulse-path-range"
              role="listbox"
              aria-label="Pulse path range"
              className="absolute right-0 z-20 mt-1 min-w-[168px] overflow-hidden rounded-[5px] border border-[var(--ib-border-strong)] bg-[var(--ib-surface-3)] py-1 shadow-[var(--shadow-float)]"
            >
              {PULSE_HISTORY_RANGES.map((item) => (
                <li key={item}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={range === item}
                    onClick={() => {
                      setRange(item);
                      setRangeOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-2.5 py-1.5 text-left font-mono text-[10px]",
                      range === item
                        ? "bg-[var(--ib-surface-selected)] text-[var(--ib-text-primary)]"
                        : "text-[var(--ib-text-secondary)] hover:bg-[var(--ib-surface-hover)] hover:text-[var(--ib-text-primary)]",
                    )}
                  >
                    <span>{item}</span>
                    <span className="text-[var(--ib-text-muted)]">{RANGE_COPY[item]}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <div
        className="relative min-h-[220px] flex-1 overflow-hidden rounded-[5px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-2)] lg:min-h-[280px]"
        onMouseLeave={() => setHover(null)}
      >
        {series.length ? (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            aria-label={`Market Pulse ${range} path, latest score ${active?.score ?? "unavailable"}`}
            onMouseMove={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              const ratio = (event.clientX - bounds.left) / bounds.width;
              if (range === "1D") {
                let best = 0;
                let bestDist = Number.POSITIVE_INFINITY;
                xs.forEach((x, index) => {
                  const dist = Math.abs(x / width - ratio);
                  if (dist < bestDist) {
                    bestDist = dist;
                    best = index;
                  }
                });
                setHover(best);
                return;
              }
              setHover(
                Math.min(
                  series.length - 1,
                  Math.max(0, Math.round(ratio * Math.max(series.length - 1, 1))),
                ),
              );
            }}
          >
            <defs>
              <linearGradient id={`${gradientId}-stroke`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={UP} />
                <stop offset={midOffset} stopColor={UP} />
                <stop offset={midOffset} stopColor={DOWN} />
                <stop offset="100%" stopColor={DOWN} />
              </linearGradient>
              <clipPath id={`${gradientId}-above`}>
                <rect x="0" y="0" width={width} height={Math.max(midY, 0)} />
              </clipPath>
              <clipPath id={`${gradientId}-below`}>
                <rect x="0" y={Math.min(Math.max(midY, 0), height)} width={width} height={Math.max(height - midY, 0)} />
              </clipPath>
            </defs>
            {area ? (
              <>
                <path
                  d={area}
                  fill="color-mix(in oklab, #42b883 18%, transparent)"
                  clipPath={`url(#${gradientId}-above)`}
                />
                <path
                  d={area}
                  fill="color-mix(in oklab, #e06666 18%, transparent)"
                  clipPath={`url(#${gradientId}-below)`}
                />
              </>
            ) : null}
            {path ? (
              <path
                d={path}
                fill="none"
                stroke={`url(#${gradientId}-stroke)`}
                strokeWidth="1.15"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {fiftyVisible ? (
              <line
                x1={xs[0] ?? 0}
                x2={xs.at(-1) ?? width}
                y1={midY}
                y2={midY}
                stroke="color-mix(in oklab, var(--ib-text-muted) 70%, transparent)"
                strokeWidth="0.4"
                strokeDasharray="1.4 1.1"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {series.map((point, index) => (
              <circle
                key={`${point.at}-${index}`}
                cx={xs[index]}
                cy={ys[index]}
                r={series.length === 1 || index === series.length - 1 ? 0.9 : 0}
                fill={point.score >= 50 ? UP : DOWN}
              />
            ))}
            {active && hover != null && series.length > 1 ? (
              <line
                x1={xs[hover]}
                x2={xs[hover]}
                y1="0"
                y2={height}
                stroke="var(--ib-text-muted)"
                strokeWidth="0.35"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </svg>
        ) : (
          <div className="grid h-full place-items-center px-4 text-center text-[10px] text-[var(--ib-text-muted)]">
            {loading
              ? "Loading reconstructed pulse path…"
              : "No pulse path could be rebuilt from the configured proxies."}
          </div>
        )}
        <div className="pointer-events-none absolute inset-y-2 left-2 font-mono text-[8px] text-[var(--ib-text-muted)]">
          <span className="absolute top-0">{Math.round(domain.max)}</span>
          {fiftyVisible ? (
            <span
              className="absolute -translate-y-1/2"
              style={{ top: `${((domain.max - 50) / Math.max(domain.max - domain.min, 1)) * 100}%` }}
            >
              50
            </span>
          ) : null}
          <span className="absolute bottom-0">{Math.round(domain.min)}</span>
        </div>
      </div>
    </div>
  );
}
