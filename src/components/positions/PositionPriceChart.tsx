"use client";

import { useEffect, useRef } from "react";
import {
  ColorType,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useTheme } from "@/components/providers/ThemeProvider";
import { formatEntryDate } from "@/components/positions/display";
import { formatPrice } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { DailyClose } from "@/lib/positions/types";

function cssVar(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    fallback
  );
}

export function PositionPriceChart({
  ticker,
  closes,
  entryPrice,
  side,
  className,
}: {
  ticker: string;
  closes: DailyClose[];
  entryPrice: number;
  side: "long" | "short";
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const { resolved } = useTheme();

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const palette = {
      up: cssVar("--market-positive", "#42b883"),
      down: cssVar("--market-negative", "#e06666"),
      text: cssVar("--ib-text-muted", "#7e8790"),
      grid: cssVar("--ib-border-subtle", "#23292f"),
      bg: cssVar("--ib-surface-inset", "#090c0f"),
    };

    const chart = createChart(node, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: palette.bg },
        textColor: palette.text,
        fontFamily: "IBM Plex Mono, ui-monospace, monospace",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: palette.grid },
        horzLines: { color: palette.grid },
      },
      rightPriceScale: { borderColor: palette.grid },
      timeScale: { borderColor: palette.grid, timeVisible: false },
      crosshair: { horzLine: { labelBackgroundColor: palette.bg } },
    });
    const data = closes.flatMap((bar) => {
      if (!Number.isFinite(bar.close) || !bar.date) return [];
      const time = Math.floor(Date.parse(`${bar.date}T20:00:00.000Z`) / 1000) as UTCTimestamp;
      if (!Number.isFinite(time)) return [];
      return [{ time, value: bar.close }];
    });
    const unique = new Map<number, { time: UTCTimestamp; value: number }>();
    for (const point of data) unique.set(point.time, point);
    const seriesData = [...unique.values()].sort((a, b) => a.time - b.time);
    if (seriesData.length < 2) {
      chart.remove();
      return;
    }

    const lastClose = seriesData.at(-1)!.value;
    const profitable =
      side === "short" ? lastClose < entryPrice : lastClose > entryPrice;
    const seriesColor = profitable ? palette.up : palette.down;

    const series = chart.addSeries(LineSeries, {
      color: seriesColor,
      lineWidth: 2,
      priceLineVisible: false,
      autoscaleInfoProvider: () => {
        const values = seriesData.map((point) => point.value);
        const min = Math.min(...values, entryPrice);
        const max = Math.max(...values, entryPrice);
        const pad = Math.max((max - min) * 0.08, Math.abs(max) * 0.004, 0.5);
        return {
          priceRange: { minValue: min - pad, maxValue: max + pad },
        };
      },
    });
    series.setData(seriesData);
    series.createPriceLine({
      price: entryPrice,
      color: side === "short" ? palette.down : palette.up,
      lineStyle: LineStyle.Dashed,
      lineWidth: 1,
      title: "Entry",
      axisLabelVisible: true,
    });
    chart.timeScale().fitContent();
    chartRef.current = chart;

    const observer = new ResizeObserver(() => {
      chart.timeScale().fitContent();
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [closes, entryPrice, side, resolved, ticker]);

  const last = closes.at(-1)?.close ?? null;
  const first = closes[0]?.date ?? null;
  const latest = closes.at(-1)?.date ?? null;

  return (
    <div>
      <div
        ref={containerRef}
        className={cn(
          "h-[220px] w-full rounded-[4px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-inset)]",
          className,
        )}
      />
      <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
        {ticker} daily · {formatEntryDate(first)} → {formatEntryDate(latest)} · last{" "}
        {formatPrice(last, ticker)} · entry {formatPrice(entryPrice, ticker)}
      </p>
    </div>
  );
}
