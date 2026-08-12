"use client";

import { useEffect, useRef } from "react";
import {
  AreaSeries,
  BarSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  PriceScaleMode,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type MouseEventParams,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { heikinAshi } from "@/lib/charts/indicators";
import { computeIndicatorPlots } from "@/lib/charts/compute-indicator";
import type {
  IndicatorInstance,
  IndicatorLineStyle,
} from "@/lib/charts/indicator-catalog";
import {
  type ChartStyle,
  type ChartTool,
  type PlotBar,
} from "@/components/dashboard/chart/chart-model";
import { formatMarketDateTime, formatPrice } from "@/lib/utils/format";
import { useTheme } from "@/components/providers/ThemeProvider";

function cssVar(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

function chartPalette() {
  return {
    up: cssVar("--market-positive", "#42b883"),
    down: cssVar("--market-negative", "#e06666"),
    text: cssVar("--ib-text-muted", "#7e8790"),
    grid: cssVar("--ib-border-subtle", "#23292f"),
    bg: cssVar("--ib-surface-inset", "#090c0f"),
    surface: cssVar("--ib-surface-3", "#181d22"),
    crosshair: cssVar("--ib-text-secondary", "#b5bbc1"),
    series: [
      cssVar("--series-1", "#d7a6af"),
      cssVar("--series-2", "#68a4d8"),
      cssVar("--series-3", "#d7a84b"),
      cssVar("--series-4", "#8e83c8"),
      cssVar("--series-5", "#69aaa5"),
    ],
  };
}

function asTime(index: number): UTCTimestamp {
  return index as UTCTimestamp;
}

function lineData(
  values: Array<number | null>,
): Array<{ time: UTCTimestamp; value: number }> {
  return values.flatMap((value, index) =>
    value == null ? [] : [{ time: asTime(index), value }],
  );
}

const LINE_STYLE: Record<IndicatorLineStyle, LineStyle> = {
  solid: LineStyle.Solid,
  dotted: LineStyle.Dotted,
  dashed: LineStyle.Dashed,
  largeDashed: LineStyle.LargeDashed,
  sparseDotted: LineStyle.SparseDotted,
};

function mixTone(hex: string, tone: "primary" | "secondary" | "tertiary") {
  if (tone === "primary") return hex;
  const alpha = tone === "secondary" ? "b3" : "73";
  return hex.length === 7 ? `${hex}${alpha}` : hex;
}

export function MarketChartCanvas({
  symbol,
  bars,
  style,
  indicators,
  showVolume,
  logScale,
  compareBars,
  compareSymbol,
  priceLines,
  tool,
  fitKey,
  onCrosshair,
  onAddPriceLine,
  onReadyFit,
}: {
  symbol: string;
  bars: PlotBar[];
  style: ChartStyle;
  indicators: IndicatorInstance[];
  showVolume: boolean;
  logScale: boolean;
  compareBars: PlotBar[];
  compareSymbol: string | null;
  priceLines: number[];
  tool: ChartTool;
  fitKey: string;
  onCrosshair: (index: number | null) => void;
  onAddPriceLine: (price: number) => void;
  onReadyFit: (fit: () => void) => void;
}) {
  const { resolved: theme } = useTheme();
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType>[]>([]);
  const mainRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);
  const barsRef = useRef(bars);
  const toolRef = useRef(tool);
  const fitKeyRef = useRef(fitKey);
  const onCrosshairRef = useRef(onCrosshair);
  const onAddPriceLineRef = useRef(onAddPriceLine);
  const onReadyFitRef = useRef(onReadyFit);
  barsRef.current = bars;
  toolRef.current = tool;
  onCrosshairRef.current = onCrosshair;
  onAddPriceLineRef.current = onAddPriceLine;
  onReadyFitRef.current = onReadyFit;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const palette = chartPalette();

    const chart = createChart(host, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: palette.bg },
        textColor: palette.text,
        fontFamily: "IBM Plex Mono, ui-monospace, monospace",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: palette.grid },
        horzLines: { color: palette.grid },
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: {
          color: palette.crosshair,
          labelBackgroundColor: palette.surface,
        },
        horzLine: {
          color: palette.crosshair,
          labelBackgroundColor: palette.surface,
        },
      },
      rightPriceScale: {
        borderColor: palette.grid,
        scaleMargins: { top: 0.08, bottom: 0.18 },
      },
      leftPriceScale: {
        visible: false,
        borderColor: palette.grid,
      },
      timeScale: {
        borderColor: palette.grid,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        barSpacing: 8,
        minBarSpacing: 3,
        tickMarkFormatter: (time: Time) => {
          const bar = barsRef.current[Number(time)];
          if (!bar) return "";
          return new Intl.DateTimeFormat("en-US", {
            timeZone: "America/Chicago",
            ...(bar.interval === "1d"
              ? { month: "short", day: "numeric" }
              : { hour: "numeric", minute: "2-digit" }),
          }).format(new Date(bar.barStart));
        },
      },
      localization: {
        timeFormatter: (time: Time) => {
          const bar = barsRef.current[Number(time)];
          return bar ? formatMarketDateTime(bar.barStart) : "";
        },
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,
      },
    });

    chart.subscribeCrosshairMove((param: MouseEventParams<Time>) => {
      if (param.time == null) {
        onCrosshairRef.current(null);
        return;
      }
      onCrosshairRef.current(Number(param.time));
    });

    chart.subscribeClick((param: MouseEventParams<Time>) => {
      if (toolRef.current !== "hline" || !param.point || !mainRef.current) return;
      const price = mainRef.current.coordinateToPrice(param.point.y);
      if (price != null) onAddPriceLineRef.current(Number(price));
    });

    chartRef.current = chart;
    onReadyFitRef.current(() => chart.timeScale().fitContent());

    return () => {
      chart.remove();
      chartRef.current = null;
      mainRef.current = null;
      seriesRef.current = [];
    };
  }, [theme]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const palette = chartPalette();
    const UP = palette.up;
    const DOWN = palette.down;
    const TEXT = palette.text;
    const BG = palette.bg;
    const SERIES = palette.series;

    for (const line of linesRef.current) {
      mainRef.current?.removePriceLine(line);
    }
    linesRef.current = [];
    for (const series of seriesRef.current) {
      chart.removeSeries(series);
    }
    seriesRef.current = [];
    mainRef.current = null;
    while (chart.panes().length > 1) {
      chart.removePane(chart.panes().length - 1);
    }

    if (!bars.length) return;

    chart.applyOptions({
      rightPriceScale: {
        mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
        scaleMargins: {
          top: 0.08,
          bottom: showVolume ? 0.22 : 0.08,
        },
      },
      leftPriceScale: { visible: Boolean(compareSymbol) },
      crosshair: {
        mode: tool === "hline" ? CrosshairMode.Normal : CrosshairMode.Magnet,
      },
    });

    const indexed = bars.map((bar, index) => ({
      time: asTime(index),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    }));

    const ha =
      style === "heikin"
        ? heikinAshi(bars).map((bar, index) => ({
            time: asTime(index),
            ...bar,
          }))
        : indexed;

    let main: ISeriesApi<SeriesType>;
    if (style === "line") {
      main = chart.addSeries(LineSeries, {
        color: SERIES[1],
        lineWidth: 2,
        lastValueVisible: true,
        priceLineVisible: true,
        priceLineColor: TEXT,
      });
      main.setData(indexed.map((bar) => ({ time: bar.time, value: bar.close })));
    } else if (style === "area") {
      main = chart.addSeries(AreaSeries, {
        lineColor: SERIES[1],
        topColor: "rgba(104, 164, 216, 0.28)",
        bottomColor: "rgba(104, 164, 216, 0.02)",
        lineWidth: 2,
        lastValueVisible: true,
        priceLineVisible: true,
      });
      main.setData(indexed.map((bar) => ({ time: bar.time, value: bar.close })));
    } else if (style === "bars") {
      main = chart.addSeries(BarSeries, {
        upColor: UP,
        downColor: DOWN,
        thinBars: false,
        lastValueVisible: true,
        priceLineVisible: true,
      });
      main.setData(indexed);
    } else {
      const hollow = style === "hollow" || style === "heikin";
      main = chart.addSeries(CandlestickSeries, {
        upColor: hollow ? BG : UP,
        downColor: DOWN,
        borderUpColor: UP,
        borderDownColor: DOWN,
        wickUpColor: UP,
        wickDownColor: DOWN,
        lastValueVisible: true,
        priceLineVisible: true,
        priceLineColor: TEXT,
      });
      main.setData(style === "heikin" ? ha : indexed);
    }

    mainRef.current = main;
    seriesRef.current.push(main);

    let nextPane = 1;
    for (const instance of indicators) {
      if (!instance.enabled) continue;
      const plots = computeIndicatorPlots(instance, bars);
      if (!plots.length) continue;
      const oscillator = plots.some((plot) => plot.pane === "oscillator");
      const paneIndex = oscillator ? nextPane : 0;
      if (oscillator) nextPane += 1;
      for (const plot of plots) {
        const color = mixTone(instance.color, plot.tone);
        if (plot.kind === "histogram") {
          const series = chart.addSeries(
            HistogramSeries,
            {
              color,
              priceLineVisible: false,
              lastValueVisible: false,
              title: plot.title,
            },
            paneIndex,
          );
          series.setData(
            plot.values.flatMap((value, index) =>
              value == null
                ? []
                : [
                    {
                      time: asTime(index),
                      value,
                      color:
                        value >= 0
                          ? "rgba(66, 184, 131, 0.55)"
                          : "rgba(224, 102, 102, 0.55)",
                    },
                  ],
            ),
          );
          seriesRef.current.push(series);
          continue;
        }
        const series = chart.addSeries(
          LineSeries,
          {
            color,
            lineWidth: instance.lineWidth,
            lineStyle: LINE_STYLE[instance.lineStyle],
            priceLineVisible: false,
            lastValueVisible: plot.pane === "oscillator",
            title: plot.title,
          },
          paneIndex,
        );
        series.setData(lineData(plot.values));
        if (instance.kind === "rsi" && plot.tone === "primary") {
          series.createPriceLine({
            price: 70,
            color: "rgba(224, 102, 102, 0.45)",
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: false,
          });
          series.createPriceLine({
            price: 30,
            color: "rgba(66, 184, 131, 0.45)",
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: false,
          });
        }
        seriesRef.current.push(series);
      }
      if (oscillator) chart.panes()[paneIndex]?.setHeight(84);
    }

    if (showVolume) {
      const volume = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "",
        lastValueVisible: false,
        priceLineVisible: false,
      });
      volume.priceScale().applyOptions({
        scaleMargins: { top: 0.82, bottom: 0 },
      });
      volume.setData(
        bars.map((bar, index) => ({
          time: asTime(index),
          value: bar.volume,
          color:
            bar.close >= bar.open ? "rgba(66, 184, 131, 0.35)" : "rgba(224, 102, 102, 0.35)",
        })),
      );
      seriesRef.current.push(volume);
    }

    if (compareSymbol && compareBars.length) {
      const base = compareBars[0]?.close || 1;
      const compare = chart.addSeries(LineSeries, {
        color: SERIES[2],
        lineWidth: 1,
        priceScaleId: "left",
        lastValueVisible: true,
        priceLineVisible: false,
        title: compareSymbol,
      });
      const mapped = bars.map((bar, index) => {
        const match =
          compareBars.find((item) => item.barStart === bar.barStart) ??
          compareBars[Math.min(index, compareBars.length - 1)];
        if (!match) return null;
        return {
          time: asTime(index),
          value: ((match.close / base) - 1) * 100,
        };
      });
      compare.setData(
        mapped.filter((point): point is { time: UTCTimestamp; value: number } =>
          Boolean(point),
        ),
      );
      seriesRef.current.push(compare);
    }

    for (const price of priceLines) {
      linesRef.current.push(
        main.createPriceLine({
          price,
          color: SERIES[0]!,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: formatPrice(price, symbol),
        }),
      );
    }

    if (fitKeyRef.current !== fitKey) {
      chart.timeScale().fitContent();
      fitKeyRef.current = fitKey;
    }
  }, [
    bars,
    compareBars,
    compareSymbol,
    fitKey,
    indicators,
    logScale,
    priceLines,
    showVolume,
    style,
    symbol,
    theme,
    tool,
  ]);

  return <div ref={hostRef} className="h-full w-full" />;
}
