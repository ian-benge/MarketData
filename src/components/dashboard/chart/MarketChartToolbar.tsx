"use client";

import type { FormEvent, ReactNode } from "react";
import {
  Activity,
  BarChart3,
  ChartArea,
  ChartBar,
  ChartCandlestick,
  ChartLine,
  ChartSpline,
  Crosshair,
  Maximize2,
  Minus,
  Scaling,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { IndicatorPanel } from "@/components/dashboard/chart/IndicatorPanel";
import {
  CHART_INTERVALS,
  CHART_RANGES,
  type ChartInterval,
  type ChartRange,
  type ChartStyle,
  type ChartTool,
} from "@/components/dashboard/chart/chart-model";
import type {
  IndicatorInstance,
  IndicatorKind,
} from "@/lib/charts/indicator-catalog";

const STYLES: Array<{ id: ChartStyle; label: string; icon: typeof ChartLine }> =
  [
    { id: "candles", label: "Candles", icon: ChartCandlestick },
    { id: "hollow", label: "Hollow candles", icon: ChartCandlestick },
    { id: "bars", label: "OHLC bars", icon: ChartBar },
    { id: "line", label: "Line", icon: ChartLine },
    { id: "area", label: "Area", icon: ChartArea },
    { id: "heikin", label: "Heikin Ashi", icon: ChartSpline },
  ];

function ToolButton({
  pressed,
  label,
  onClick,
  children,
}: {
  pressed?: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-8 items-center gap-1 rounded-[3px] border px-2 font-mono text-[10px] max-sm:min-h-11",
        pressed
          ? "border-[var(--ib-border-control)] bg-[var(--ib-surface-3)] text-[var(--ib-text-primary)]"
          : "border-[var(--ib-border-subtle)] bg-transparent text-[var(--ib-text-muted)] hover:text-[var(--ib-text-primary)]",
      )}
    >
      {children}
    </button>
  );
}

export function MarketChartToolbar({
  range,
  interval,
  style,
  indicators,
  showVolume,
  logScale,
  extendedHours,
  tool,
  compareSymbol,
  symbolQuery,
  onSymbolQuery,
  onSubmitSymbol,
  onRange,
  onInterval,
  onStyle,
  onAddIndicator,
  onChangeIndicator,
  onRemoveIndicator,
  onToggleVolume,
  onToggleLog,
  onToggleExtended,
  onTool,
  onCompare,
  onFit,
  onFullscreen,
  onClearLines,
}: {
  range: ChartRange;
  interval: ChartInterval;
  style: ChartStyle;
  indicators: IndicatorInstance[];
  showVolume: boolean;
  logScale: boolean;
  extendedHours: boolean;
  tool: ChartTool;
  compareSymbol: string | null;
  symbolQuery: string;
  onSymbolQuery: (value: string) => void;
  onSubmitSymbol: (symbol: string) => void;
  onRange: (range: ChartRange) => void;
  onInterval: (interval: ChartInterval) => void;
  onStyle: (style: ChartStyle) => void;
  onAddIndicator: (kind: IndicatorKind) => void;
  onChangeIndicator: (
    instanceId: string,
    patch: Partial<IndicatorInstance>,
  ) => void;
  onRemoveIndicator: (instanceId: string) => void;
  onToggleVolume: () => void;
  onToggleLog: () => void;
  onToggleExtended: () => void;
  onTool: (tool: ChartTool) => void;
  onCompare: (symbol: string | null) => void;
  onFit: () => void;
  onFullscreen: () => void;
  onClearLines: () => void;
}) {
  function submitSymbol(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = symbolQuery.trim().toUpperCase();
    if (/^[A-Z0-9.-]{1,16}$/.test(next)) onSubmitSymbol(next);
  }

  return (
    <div className="space-y-2 border-t border-[var(--ib-border-subtle)] px-3 py-2 sm:px-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <form onSubmit={submitSymbol} className="flex min-w-[140px] items-center gap-1">
          <Search
            aria-hidden="true"
            className="size-3.5 shrink-0 text-[var(--ib-text-muted)]"
          />
          <input
            value={symbolQuery}
            onChange={(event) => onSymbolQuery(event.target.value.toUpperCase())}
            aria-label="Chart symbol search"
            placeholder="Symbol"
            maxLength={16}
            className="min-h-8 w-24 rounded-[3px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-2)] px-2 font-mono text-[11px] text-[var(--ib-text-primary)] outline-none focus:border-[var(--ib-border-control)] max-sm:min-h-11"
          />
        </form>

        <div aria-label="Chart style" className="flex flex-wrap gap-1">
          {STYLES.map((item) => {
            const Icon = item.icon;
            return (
              <ToolButton
                key={item.id}
                label={item.label}
                pressed={style === item.id}
                onClick={() => onStyle(item.id)}
              >
                <Icon aria-hidden="true" className="size-3.5" />
              </ToolButton>
            );
          })}
        </div>

        <div className="mx-1 hidden h-5 w-px bg-[var(--ib-border-subtle)] sm:block" />

        <div aria-label="Chart interval" className="flex gap-1">
          {CHART_INTERVALS.map((item) => (
            <ToolButton
              key={item}
              label={`${item} resolution`}
              pressed={interval === item}
              onClick={() => onInterval(item)}
            >
              {item === "1d" ? "D" : item}
            </ToolButton>
          ))}
        </div>

        <div className="mx-1 hidden h-5 w-px bg-[var(--ib-border-subtle)] sm:block" />

        <div aria-label="Chart range" className="flex gap-1">
          {(Object.keys(CHART_RANGES) as ChartRange[]).map((item) => (
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

      <div className="flex flex-wrap items-center gap-1.5">
        <IndicatorPanel
          instances={indicators}
          onAdd={onAddIndicator}
          onChange={onChangeIndicator}
          onRemove={onRemoveIndicator}
        />

        <ToolButton label="Volume" pressed={showVolume} onClick={onToggleVolume}>
          <BarChart3 aria-hidden="true" className="size-3.5" />
          Vol
        </ToolButton>
        <ToolButton label="Log scale" pressed={logScale} onClick={onToggleLog}>
          <Scaling aria-hidden="true" className="size-3.5" />
          Log
        </ToolButton>
        <ToolButton
          label="Extended hours"
          pressed={extendedHours}
          onClick={onToggleExtended}
        >
          Ext
        </ToolButton>
        <ToolButton
          label="Crosshair cursor"
          pressed={tool === "cursor"}
          onClick={() => onTool("cursor")}
        >
          <Crosshair aria-hidden="true" className="size-3.5" />
        </ToolButton>
        <ToolButton
          label="Horizontal price line"
          pressed={tool === "hline"}
          onClick={() => onTool("hline")}
        >
          <Minus aria-hidden="true" className="size-3.5" />
        </ToolButton>
        <ToolButton label="Clear price lines" onClick={onClearLines}>
          Clear
        </ToolButton>
        <ToolButton label="Fit content" onClick={onFit}>
          Fit
        </ToolButton>
        <ToolButton label="Fullscreen chart" onClick={onFullscreen}>
          <Maximize2 aria-hidden="true" className="size-3.5" />
        </ToolButton>

        <div className="mx-1 hidden h-5 w-px bg-[var(--ib-border-subtle)] sm:block" />
        <span className="font-mono text-[10px] text-[var(--ib-text-muted)]">
          Compare
        </span>
        {["SPY", "QQQ", "TLT"].map((ticker) => (
          <ToolButton
            key={ticker}
            label={`Compare ${ticker}`}
            pressed={compareSymbol === ticker}
            onClick={() => onCompare(compareSymbol === ticker ? null : ticker)}
          >
            <Activity aria-hidden="true" className="size-3.5" />
            {ticker}
          </ToolButton>
        ))}
      </div>
    </div>
  );
}
