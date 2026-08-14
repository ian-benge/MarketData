"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils/cn";
import { formatSignedCurrency, marketTone } from "@/lib/utils/format";
import { formatEntryDate, SignedValue } from "@/components/positions/display";
import { useHideValues } from "@/components/positions/privacy-context";
import {
  DEFAULT_PORTFOLIO_PNL_RANGE,
  PORTFOLIO_PNL_RANGES,
  slicePortfolioSeries,
  type PortfolioPnlRange,
} from "@/lib/positions/pnl-range";
import type {
  PortfolioEvent,
  PortfolioPoint,
  PositionRecord,
} from "@/lib/positions/types";

const WIDTH = 640;
const HEIGHT = 208;
const TOP = 14;
const BOTTOM = 148;
const RAIL = 168;
const PAD_X = 16;
const TICKER_Y = 192;

type Coord = {
  x: number;
  y: number;
  value: number;
  point: PortfolioPoint;
};

function plotY(value: number, min: number, max: number) {
  const span = Math.max(max - min, 1);
  return TOP + ((max - value) / span) * (BOTTOM - TOP);
}

function labels(events: PortfolioEvent[]) {
  return events.map((event) => event.ticker).join(" · ");
}

function plotX(index: number, count: number) {
  if (count <= 1) return PAD_X;
  return PAD_X + (index / (count - 1)) * (WIDTH - PAD_X * 2);
}

function PnlRangeToggle({
  range,
  onRange,
}: {
  range: PortfolioPnlRange;
  onRange: (range: PortfolioPnlRange) => void;
}) {
  return (
    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
        Cumulative book P&L
      </p>
      <div role="group" aria-label="P&L range" className="flex flex-wrap gap-1">
        {PORTFOLIO_PNL_RANGES.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={range === item}
            onClick={() => onRange(item)}
            className={cn(
              "min-h-8 rounded-[3px] border px-2 font-mono text-[10px] max-sm:min-h-11",
              range === item
                ? "border-[var(--ib-border-control)] bg-[var(--ib-surface-3)] text-[var(--ib-text-primary)]"
                : "border-[var(--ib-border-subtle)] bg-transparent text-[var(--ib-text-muted)] hover:text-[var(--ib-text-primary)]",
            )}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

function layoutSeries(points: PortfolioPoint[]) {
  if (points.length < 2) return null;
  const values = points.map((point) => point.cumulativePnl ?? 0);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const pad = Math.max((rawMax - rawMin) * 0.08, 1);
  const min = rawMin - pad;
  const max = rawMax + pad;
  const coords: Coord[] = values.map((value, index) => ({
    x: plotX(index, values.length),
    y: plotY(value, min, max),
    value,
    point: points[index]!,
  }));
  let peak = 0;
  let bestDay = 0;
  let worstDay = 0;
  for (let index = 1; index < coords.length; index += 1) {
    if (coords[index]!.value > coords[peak]!.value) peak = index;
    const day = coords[index]!.point.dayPnl;
    const best = coords[bestDay]!.point.dayPnl;
    const worst = coords[worstDay]!.point.dayPnl;
    if (day != null && (best == null || day > best)) bestDay = index;
    if (day != null && (worst == null || day < worst)) worstDay = index;
  }
  const last = coords.at(-1)!;
  return {
    coords,
    min,
    max,
    peak,
    bestDay,
    worstDay,
    last,
    drawdown: last.value - coords[peak]!.value,
  };
}

export function PortfolioPnlChart({
  series,
  positions = [],
  asOf,
  className,
}: {
  series: PortfolioPoint[];
  positions?: PositionRecord[];
  asOf?: string;
  className?: string;
}) {
  const gradientId = useId().replaceAll(":", "");
  const hideValues = useHideValues();
  const [hover, setHover] = useState<number | null>(null);
  const [range, setRange] = useState<PortfolioPnlRange>(DEFAULT_PORTFOLIO_PNL_RANGE);
  const windowed = useMemo(
    () => slicePortfolioSeries(series, range, asOf ?? series.at(-1)?.date ?? "", positions),
    [asOf, positions, range, series],
  );
  const points = useMemo(
    () =>
      windowed.filter(
        (point) => point.cumulativePnl != null && Number.isFinite(point.cumulativePnl),
      ),
    [windowed],
  );
  const layout = useMemo(() => layoutSeries(points), [points]);

  if (!layout) {
    return (
      <div className={cn("min-w-0", className)}>
        <PnlRangeToggle
          range={range}
          onRange={(next) => {
            setRange(next);
            setHover(null);
          }}
        />
        <div className="grid h-[208px] place-items-center rounded-[4px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-inset)] text-[12px] text-[var(--ib-text-muted)]">
          Not enough history to plot book P&L.
        </div>
      </div>
    );
  }

  if (hideValues) {
    return (
      <div className={cn("min-w-0", className)}>
        <PnlRangeToggle
          range={range}
          onRange={(next) => {
            setRange(next);
            setHover(null);
          }}
        />
        <div className="grid h-[208px] place-items-center rounded-[4px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-inset)] text-[12px] text-[var(--ib-text-muted)]">
          P&L path hidden
        </div>
      </div>
    );
  }

  const { coords, min, max, peak, last, drawdown, bestDay, worstDay } = layout;
  const active = coords[hover != null && hover < coords.length ? hover : coords.length - 1]!;
  const hovering = hover != null && hover < coords.length;
  const zeroVisible = min <= 0 && max >= 0;
  const tone = marketTone(last.value);
  const stroke =
    tone === "positive"
      ? "var(--market-positive)"
      : tone === "negative"
        ? "var(--market-negative)"
        : "var(--ib-maroon-300)";
  const line = coords.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `${coords[0]!.x},${BOTTOM} ${line} ${last.x},${BOTTOM}`;
  const zeroY = plotY(0, min, max);
  const opened = active.point.events.filter((event) => event.kind === "opened");
  const closed = active.point.events.filter((event) => event.kind === "closed");
  const carried = active.point.carried;
  const hasOpened = coords.some((coord) =>
    coord.point.events.some((event) => event.kind === "opened"),
  );
  const hasClosed = coords.some((coord) =>
    coord.point.events.some((event) => event.kind === "closed"),
  );
  const hasCarried = coords.some((coord) => coord.point.carried.length > 0);
  const hasRail = hasOpened || hasClosed || hasCarried;

  function indexFromPointer(clientX: number, target: Element) {
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0) return coords.length - 1;
    const x = ((clientX - rect.left) / rect.width) * WIDTH;
    const inner = WIDTH - PAD_X * 2;
    const t = inner <= 0 ? 1 : (x - PAD_X) / inner;
    return Math.round(Math.min(1, Math.max(0, t)) * (coords.length - 1));
  }

  function onKey(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const current = hover ?? coords.length - 1;
      const next =
        event.key === "ArrowLeft"
          ? Math.max(0, current - 1)
          : Math.min(coords.length - 1, current + 1);
      setHover(next);
    }
    if (event.key === "Home") {
      event.preventDefault();
      setHover(0);
    }
    if (event.key === "End" || event.key === "Escape") {
      event.preventDefault();
      setHover(event.key === "End" ? coords.length - 1 : null);
    }
  }

  return (
    <figure className={cn("min-w-0", className)}>
      <PnlRangeToggle
        range={range}
        onRange={(next) => {
          setRange(next);
          setHover(null);
        }}
      />
      <div
        aria-live="polite"
        className="mb-1.5 min-h-[34px] font-mono text-[11px] leading-snug text-[var(--ib-text-secondary)]"
      >
        <p>
          <span className="uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
            {formatEntryDate(active.point.date)}
          </span>
          <span className="text-[var(--ib-text-muted)]">
            {" "}
            · {active.point.openCount} open · cum{" "}
          </span>
          <SignedValue value={active.value} />
          <span className="text-[var(--ib-text-muted)]"> · day </span>
          <SignedValue value={active.point.dayPnl} compact />
        </p>
        <p className="truncate text-[10px] tracking-[0.02em] text-[var(--ib-text-muted)]">
          {[
            carried.length ? `Carried in ${labels(carried)}` : null,
            opened.length ? `Opened ${labels(opened)}` : null,
            closed.length ? `Closed ${labels(closed)}` : null,
            active.point.leader
              ? `Led by ${active.point.leader.ticker} ${formatSignedCurrency(active.point.leader.pnl, { compact: true })}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ") || "No lot events this session"}
        </p>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        tabIndex={0}
        aria-label={`${range} cumulative book P&L from ${formatEntryDate(coords[0]!.point.date)} to ${formatEntryDate(last.point.date)}, ending at ${formatSignedCurrency(last.value)}. Use arrow keys to inspect sessions. Markers show when lots were opened or closed.`}
        className="h-[208px] w-full rounded-[4px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-inset)] outline-none focus-visible:ring-1 focus-visible:ring-[var(--ib-border-control)]"
        onPointerLeave={() => setHover(null)}
        onPointerMove={(event) =>
          setHover(indexFromPointer(event.clientX, event.currentTarget))
        }
        onKeyDown={onKey}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line
          x1="0"
          x2={WIDTH}
          y1={zeroY}
          y2={zeroY}
          stroke="var(--ib-border-subtle)"
          strokeDasharray="4 4"
          opacity={zeroVisible ? 1 : 0}
        />
        <polygon fill={`url(#${gradientId})`} points={area} />
        <polyline fill="none" stroke={stroke} strokeWidth="1.75" points={line} />
        {hasRail ? (
          <line
            x1="0"
            x2={WIDTH}
            y1={RAIL}
            y2={RAIL}
            stroke="var(--ib-border-subtle)"
          />
        ) : null}
        {hovering ? (
          <line
            x1={active.x}
            x2={active.x}
            y1={TOP}
            y2={hasRail ? RAIL : BOTTOM}
            stroke="var(--ib-text-muted)"
            strokeDasharray="3 3"
            opacity="0.85"
          />
        ) : null}
        {coords.map((coord) => {
          const opens = coord.point.events.filter((event) => event.kind === "opened");
          const closes = coord.point.events.filter((event) => event.kind === "closed");
          const prior = coord.point.carried;
          if (!opens.length && !closes.length && !prior.length) return null;
          const selected = hovering && coord.point.date === active.point.date;
          const markerLabel = [
            formatEntryDate(coord.point.date),
            prior.length ? `carried in ${labels(prior)}` : null,
            opens.length ? `opened ${labels(opens)}` : null,
            closes.length ? `closed ${labels(closes)}` : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <g
              key={coord.point.date}
              opacity={hovering && !selected ? 0.45 : 1}
              aria-label={markerLabel}
            >
              <circle
                cx={coord.x}
                cy={coord.y}
                r={selected ? 3.25 : 2.4}
                fill={opens.length ? "var(--ib-maroon-300)" : "var(--ib-text-secondary)"}
                stroke="var(--ib-surface-inset)"
                strokeWidth="1.25"
              />
              {prior.length ? (
                <rect
                  x={coord.x - (opens.length || closes.length ? 10 : 3.5)}
                  y={RAIL - 3.5}
                  width="7"
                  height="7"
                  fill="var(--ib-surface-3)"
                  stroke="var(--ib-text-muted)"
                  strokeWidth="1.25"
                />
              ) : null}
              {opens.length ? (
                <polygon
                  points={`${coord.x},${RAIL - 7} ${coord.x - 4.5},${RAIL + 1} ${coord.x + 4.5},${RAIL + 1}`}
                  fill="var(--ib-maroon-300)"
                />
              ) : null}
              {closes.length ? (
                <polygon
                  points={`${coord.x},${RAIL + 7} ${coord.x - 4.5},${RAIL - 1} ${coord.x + 4.5},${RAIL - 1}`}
                  fill="var(--ib-text-secondary)"
                />
              ) : null}
              {opens.length === 1 && !closes.length ? (
                <text
                  x={coord.x}
                  y={TICKER_Y}
                  textAnchor="middle"
                  fill="var(--ib-maroon-300)"
                  fontSize="8"
                  fontFamily="IBM Plex Mono, ui-monospace, monospace"
                >
                  {opens[0]!.ticker}
                </text>
              ) : null}
              {closes.length === 1 && !opens.length ? (
                <text
                  x={coord.x}
                  y={TICKER_Y}
                  textAnchor="middle"
                  fill="var(--ib-text-secondary)"
                  fontSize="8"
                  fontFamily="IBM Plex Mono, ui-monospace, monospace"
                >
                  {closes[0]!.ticker}
                </text>
              ) : null}
              {opens.length + closes.length > 1 ? (
                <text
                  x={coord.x + 8}
                  y={RAIL + 3}
                  fill="var(--ib-text-muted)"
                  fontSize="9"
                  fontFamily="IBM Plex Mono, ui-monospace, monospace"
                >
                  {opens.length + closes.length}
                </text>
              ) : null}
              {prior.length > 1 ? (
                <text
                  x={coord.x + 8}
                  y={RAIL + 3}
                  fill="var(--ib-text-muted)"
                  fontSize="9"
                  fontFamily="IBM Plex Mono, ui-monospace, monospace"
                >
                  {prior.length}
                </text>
              ) : null}
            </g>
          );
        })}
        <polygon
          points={`${coords[peak]!.x},${coords[peak]!.y - 6} ${coords[peak]!.x + 5},${coords[peak]!.y} ${coords[peak]!.x},${coords[peak]!.y + 6} ${coords[peak]!.x - 5},${coords[peak]!.y}`}
          fill="var(--ib-text-primary)"
        />
        <circle cx={last.x} cy={last.y} r="3" fill={stroke} />
        {hovering ? (
          <circle
            cx={active.x}
            cy={active.y}
            r="4"
            fill="var(--ib-surface-inset)"
            stroke={stroke}
            strokeWidth="1.5"
          />
        ) : null}
      </svg>
      <figcaption className="mt-1.5 space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
          <span>{formatEntryDate(coords[0]!.point.date)}</span>
          <span>
            Cumulative P&L <SignedValue value={last.value} />
          </span>
          <span>{formatEntryDate(last.point.date)}</span>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
          <span>
            Peak {formatSignedCurrency(coords[peak]!.value)}
            <span className="ml-1 text-[var(--ib-text-secondary)]">
              {formatEntryDate(coords[peak]!.point.date)}
            </span>
          </span>
          <span>Drawdown {drawdown < 0 ? formatSignedCurrency(drawdown) : "—"}</span>
          <span>
            Best day {formatSignedCurrency(coords[bestDay]!.point.dayPnl, { compact: true })}
          </span>
          <span>
            Worst day {formatSignedCurrency(coords[worstDay]!.point.dayPnl, { compact: true })}
          </span>
        </div>
        <ul
          role="list"
          aria-label="P&L chart legend"
          className="flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]"
        >
          {hasOpened ? (
            <li className="inline-flex items-center gap-1">
              <span aria-hidden="true" className="text-[var(--ib-maroon-300)]">
                ▲
              </span>
              Opened
            </li>
          ) : null}
          {hasClosed ? (
            <li className="inline-flex items-center gap-1">
              <span aria-hidden="true">▼</span>
              Closed
            </li>
          ) : null}
          <li className="inline-flex items-center gap-1">
            <span aria-hidden="true">◆</span>
            Peak
          </li>
          {hasCarried ? (
            <li className="inline-flex items-center gap-1">
              <span
                aria-hidden="true"
                className="inline-block size-2 border border-[var(--ib-text-muted)]"
              />
              Carried in
            </li>
          ) : null}
        </ul>
      </figcaption>
    </figure>
  );
}
