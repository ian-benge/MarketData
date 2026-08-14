"use client";

import { AlertTriangle, BarChart3, ChevronRight, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MarketChartCanvas } from "@/components/dashboard/chart/MarketChartCanvas";
import { MarketChartToolbar } from "@/components/dashboard/chart/MarketChartToolbar";
import {
  CHART_RANGES,
  barsForRange,
  fetchLimitFor,
  hydrateInitialSeries,
  intervalLabel,
  rangeStartIso,
  seriesKey,
  symbolsFromSeries,
  type ChartInterval,
  type ChartRange,
  type ChartStyle,
  type ChartTool,
} from "@/components/dashboard/chart/chart-model";
import {
  StatusIndicator,
  type StatusKind,
} from "@/components/ui/StatusIndicator";
import {
  createIndicatorInstance,
  defaultIndicatorInstances,
  type IndicatorInstance,
} from "@/lib/charts/indicator-catalog";
import type { NormalizedBar } from "@/lib/providers/types";
import {
  formatMarketDateTime,
  formatPrice,
  formatSignedPercent,
  formatVolume,
} from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

type ChartState =
  | "mock"
  | "loading"
  | "realtime"
  | "delayed"
  | "stale"
  | "empty"
  | "unavailable"
  | "rate-limited"
  | "entitlement";

type BarsResponse = {
  bars?: NormalizedBar[];
  source?: string;
  stale?: boolean;
  latencyClass?: string;
  feedCoverage?: string;
  error?: string;
};

function statusKind(state: ChartState): StatusKind {
  if (state === "mock") return "mock";
  if (state === "loading") return "running";
  if (state === "realtime") return "realtime";
  if (state === "delayed") return "delayed";
  if (state === "stale") return "stale";
  return "unavailable";
}

function statusLabel(state: ChartState) {
  const labels: Record<ChartState, string> = {
    mock: "Mock history",
    loading: "Loading history",
    realtime: "Real-time",
    delayed: "Delayed",
    stale: "Stale history",
    empty: "No history",
    unavailable: "Unavailable",
    "rate-limited": "Rate limited",
    entitlement: "Entitlement required",
  };
  return labels[state];
}

function pctChange(first: number | null, last: number | null) {
  if (first == null || last == null || first === 0) return null;
  return ((last - first) / first) * 100;
}

export function MarketChart({
  initialSeries,
  initialSymbol,
  symbol: controlledSymbol,
  onSymbolChange,
  coverageLabel,
  asOf,
  mode,
  initialState,
}: {
  initialSeries: Record<string, NormalizedBar[]>;
  initialSymbol: string;
  symbol?: string;
  onSymbolChange?: (symbol: string) => void;
  coverageLabel: string | null;
  asOf: string;
  mode: "mock" | "provider" | "unavailable";
  initialState?: ChartState;
}) {
  const [internalSymbol, setInternalSymbol] = useState(initialSymbol);
  const symbol = controlledSymbol ?? internalSymbol;
  const [series, setSeries] = useState(() =>
    hydrateInitialSeries(initialSeries),
  );
  const [range, setRange] = useState<ChartRange>(() =>
    mode === "mock" ? "3M" : "1D",
  );
  const [interval, setInterval] = useState<ChartInterval>(() =>
    mode === "mock" ? "1d" : "5m",
  );
  const [style, setStyle] = useState<ChartStyle>("candles");
  const [indicators, setIndicators] = useState<IndicatorInstance[]>(
    defaultIndicatorInstances,
  );
  const [showVolume, setShowVolume] = useState(true);
  const [logScale, setLogScale] = useState(false);
  const [extendedHours, setExtendedHours] = useState(false);
  const [tool, setTool] = useState<ChartTool>("cursor");
  const [priceLines, setPriceLines] = useState<number[]>([]);
  const [compareSymbol, setCompareSymbol] = useState<string | null>(null);
  const [symbolQuery, setSymbolQuery] = useState(initialSymbol);
  const [state, setState] = useState<ChartState>(
    () => initialState ?? (mode === "mock" ? "mock" : "loading"),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [historyLabel, setHistoryLabel] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [fitNonce, setFitNonce] = useState(0);
  const [panelOpen, setPanelOpen] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    if (!mq.matches) setPanelOpen(false);
  }, []);
  const loadedKeys = useRef(
    new Set(Object.keys(hydrateInitialSeries(initialSeries))),
  );
  const retriedThinKeys = useRef(new Set<string>());
  const seriesRef = useRef(series);
  seriesRef.current = series;
  const fitFn = useRef<(() => void) | null>(null);
  const chartMounted = useRef(false);
  const prevSymbolRef = useRef(symbol);
  const spec = CHART_RANGES[range];

  // External symbol picks (pulse / watchlist / earnings) open the panel.
  useEffect(() => {
    if (!chartMounted.current) {
      chartMounted.current = true;
      prevSymbolRef.current = symbol;
      return;
    }
    if (prevSymbolRef.current === symbol) return;
    prevSymbolRef.current = symbol;
    setPanelOpen(true);
    setFitNonce((value) => value + 1);
  }, [symbol]);

  const loadBars = useCallback(
    async (
      ticker: string,
      nextInterval: ChartInterval,
      nextRange: ChartRange,
      signal: AbortSignal,
      options?: { force?: boolean },
    ) => {
      const key = seriesKey(ticker, nextInterval);
      if (!options?.force && loadedKeys.current.has(key)) return;
      const limit = fetchLimitFor(nextInterval, nextRange);
      const start = rangeStartIso(nextRange);
      const response = await fetch(
        `/api/market/bars?symbol=${encodeURIComponent(ticker)}&interval=${nextInterval}&limit=${limit}&start=${encodeURIComponent(start)}&surface=derived_charts`,
        { signal },
      );
      const payload = (await response.json()) as BarsResponse;
      if (!response.ok) {
        const error = new Error(payload.error ?? "Price history could not be loaded.");
        (error as Error & { status?: number }).status = response.status;
        throw error;
      }
      loadedKeys.current.add(key);
      setSeries((current) => ({ ...current, [key]: payload.bars ?? [] }));
      if (payload.feedCoverage && payload.latencyClass) {
        setHistoryLabel(
          `${payload.latencyClass === "realtime" ? "Real-time" : payload.latencyClass} — ${payload.feedCoverage.toUpperCase()}`,
        );
      }
      return payload;
    },
    [],
  );

  useEffect(() => {
    const key = seriesKey(symbol, interval);
    const existing = seriesRef.current[key];
    const thinIntraday =
      interval !== "1d" &&
      existing != null &&
      existing.length > 0 &&
      existing.length < 15;
    if (loadedKeys.current.has(key)) {
      if (thinIntraday && !retriedThinKeys.current.has(key)) {
        retriedThinKeys.current.add(key);
        loadedKeys.current.delete(key);
      } else {
        return;
      }
    }
    const controller = new AbortController();
    setState((current) => (mode === "mock" ? current : "loading"));
    void loadBars(symbol, interval, range, controller.signal)
      .then((payload) => {
        if (!payload) return;
        if (!(payload.bars ?? []).length) setState("empty");
        else if (mode === "mock") setState("mock");
        else if (payload.stale || payload.latencyClass === "stale")
          setState("stale");
        else if (payload.latencyClass === "realtime") setState("realtime");
        else setState("delayed");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        const status = (error as { status?: number }).status;
        if (status === 403) setState("entitlement");
        else if (status === 429) setState("rate-limited");
        else setState("unavailable");
        setMessage(
          error instanceof Error
            ? error.message
            : "Price history is unavailable. Current quote data remains visible.",
        );
      });
    return () => controller.abort();
  }, [interval, loadBars, mode, range, symbol]);

  useEffect(() => {
    if (!compareSymbol || compareSymbol === symbol) return;
    const key = seriesKey(compareSymbol, interval);
    if (loadedKeys.current.has(key)) return;
    const controller = new AbortController();
    void loadBars(compareSymbol, interval, range, controller.signal).catch(
      () => undefined,
    );
    return () => controller.abort();
  }, [compareSymbol, interval, loadBars, range, symbol]);

  useEffect(() => {
    if (
      mode !== "provider" ||
      !panelOpen ||
      (range !== "1D" && range !== "5D")
    ) {
      return;
    }
    const poll = () => {
      if (document.visibilityState === "hidden") return;
      const controller = new AbortController();
      void loadBars(symbol, interval, range, controller.signal, {
        force: true,
      }).catch(() => undefined);
    };
    const id = window.setInterval(poll, 15_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [interval, loadBars, mode, panelOpen, range, symbol]);

  useEffect(() => {
    setActiveIndex(null);
    setMessage(null);
    setSymbolQuery(symbol);
    const nextKey = seriesKey(symbol, interval);
    if (!loadedKeys.current.has(nextKey) && mode !== "mock") {
      setState("loading");
    }
  }, [interval, mode, symbol]);

  const availableSymbols = useMemo(() => {
    const known = symbolsFromSeries(series);
    const priority = [symbol, "SPY", "QQQ", "TLT", "NVDA", "AMD"];
    return [...new Set(priority)].filter(
      (ticker) => ticker === symbol || known.has(ticker),
    );
  }, [series, symbol]);

  const validBars = useMemo(
    () =>
      barsForRange(
        series[seriesKey(symbol, interval)] ?? [],
        range,
        interval,
        extendedHours,
      ),
    [extendedHours, interval, range, series, symbol],
  );
  const compareBars = useMemo(() => {
    if (!compareSymbol || compareSymbol === symbol) return [];
    return barsForRange(
      series[seriesKey(compareSymbol, interval)] ?? [],
      range,
      interval,
      extendedHours,
    );
  }, [compareSymbol, extendedHours, interval, range, series, symbol]);

  const firstBar = validBars[0] ?? null;
  const lastBar = validBars.at(-1) ?? null;
  const change = pctChange(firstBar?.close ?? null, lastBar?.close ?? null);
  const activeBar =
    validBars[
      activeIndex == null
        ? Math.max(validBars.length - 1, 0)
        : Math.min(activeIndex, validBars.length - 1)
    ] ?? null;
  const summary = validBars.length
    ? `${symbol} ${range} ${spec.seriesKind} series. ${formatPrice(firstBar?.close, symbol)} to ${formatPrice(lastBar?.close, symbol)}, ${formatSignedPercent(change)}. High ${formatPrice(Math.max(...validBars.map((bar) => bar.high)), symbol)}; low ${formatPrice(Math.min(...validBars.map((bar) => bar.low)), symbol)}.`
    : `${symbol} has no chart history in the selected range.`;

  function selectSymbol(next: string) {
    const ticker = next.trim().toUpperCase();
    if (!/^[A-Z0-9.-]{1,16}$/.test(ticker)) return;
    setInternalSymbol(ticker);
    setActiveIndex(null);
    setMessage(null);
    setPriceLines([]);
    const nextKey = seriesKey(ticker, interval);
    setState(
      loadedKeys.current.has(nextKey)
        ? mode === "mock"
          ? "mock"
          : "delayed"
        : mode === "mock"
          ? "mock"
          : "loading",
    );
    if (onSymbolChange) onSymbolChange(ticker);
    else {
      const url = new URL(window.location.href);
      url.searchParams.set("symbol", ticker);
      window.history.replaceState({}, "", url);
    }
  }

  function selectRange(next: ChartRange) {
    setRange(next);
    setInterval(CHART_RANGES[next].interval);
    setActiveIndex(null);
    setPriceLines([]);
    const nextKey = seriesKey(symbol, CHART_RANGES[next].interval);
    if (!loadedKeys.current.has(nextKey) && mode !== "mock") setState("loading");
  }

  function selectInterval(next: ChartInterval) {
    setInterval(next);
    setActiveIndex(null);
    const nextKey = seriesKey(symbol, next);
    if (!loadedKeys.current.has(nextKey) && mode !== "mock") setState("loading");
  }

  return (
    <section
      id="primary-market-chart-panel"
      className="min-w-0 rounded-[6px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-1)]"
    >
      <details
        className="group"
        open={panelOpen}
        onToggle={(event) => {
          const next = event.currentTarget.open;
          setPanelOpen(next);
          if (next) setFitNonce((value) => value + 1);
        }}
      >
        <summary className="flex cursor-pointer list-none items-start gap-2 px-3 py-2.5 marker:hidden sm:px-4 [&::-webkit-details-marker]:hidden">
          <ChevronRight
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-[var(--ib-text-muted)] transition-transform group-open:rotate-90"
          />
          <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[13px] font-semibold text-[var(--ib-text-primary)]">
                  Primary market chart
                </h2>
                <StatusIndicator
                  kind={statusKind(state)}
                  label={statusLabel(state)}
                />
              </div>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-mono text-2xl font-medium tracking-[-0.03em] text-[var(--ib-text-primary)]">
                  {symbol}
                </span>
                <span className="font-mono text-lg text-[var(--ib-text-primary)]">
                  {formatPrice(lastBar?.close, symbol)}
                </span>
                <span
                  className={cn(
                    "font-mono text-[13px] font-medium",
                    change == null || change === 0
                      ? "text-[var(--market-unchanged)]"
                      : change > 0
                        ? "text-[var(--market-positive)]"
                        : "text-[var(--market-negative)]",
                  )}
                >
                  {range} {formatSignedPercent(change)}
                </span>
              </div>
            </div>
            <div className="text-right font-mono text-[10px] leading-4 text-[var(--ib-text-muted)]">
              <p>{historyLabel ?? coverageLabel ?? "Coverage unavailable"}</p>
              <p>{intervalLabel(interval)} · America/Chicago</p>
              <p>As of {formatMarketDateTime(asOf, { seconds: true })}</p>
            </div>
          </div>
        </summary>

        <div className="border-t border-[var(--ib-border-subtle)]">
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
            <div
              role="tablist"
              aria-label="Chart symbol"
              className="flex flex-wrap gap-1"
            >
              {availableSymbols.map((ticker) => (
                <button
                  key={ticker}
                  type="button"
                  role="tab"
                  aria-selected={symbol === ticker}
                  onClick={() => selectSymbol(ticker)}
                  className={cn(
                    "min-h-8 rounded-[3px] border px-2 font-mono text-[11px] font-medium transition-colors max-sm:min-h-11",
                    symbol === ticker
                      ? "border-[var(--ib-maroon-500)] bg-[var(--ib-surface-selected)] text-[var(--ib-maroon-300)]"
                      : "border-[var(--ib-border-strong)] bg-[var(--ib-surface-2)] text-[var(--ib-text-secondary)] hover:border-[var(--ib-text-muted)]",
                  )}
                >
                  {ticker}
                </button>
              ))}
            </div>
          </div>

          <MarketChartToolbar
            range={range}
            interval={interval}
            style={style}
            indicators={indicators}
            showVolume={showVolume}
            logScale={logScale}
            extendedHours={extendedHours}
            tool={tool}
            compareSymbol={compareSymbol === symbol ? null : compareSymbol}
            symbolQuery={symbolQuery}
            onSymbolQuery={setSymbolQuery}
            onSubmitSymbol={selectSymbol}
            onRange={selectRange}
            onInterval={selectInterval}
            onStyle={setStyle}
            onAddIndicator={(kind) =>
              setIndicators((current) => [
                ...current,
                createIndicatorInstance(kind),
              ])
            }
            onChangeIndicator={(instanceId, patch) =>
              setIndicators((current) =>
                current.map((item) =>
                  item.instanceId === instanceId ? { ...item, ...patch } : item,
                ),
              )
            }
            onRemoveIndicator={(instanceId) =>
              setIndicators((current) =>
                current.filter((item) => item.instanceId !== instanceId),
              )
            }
            onToggleVolume={() => setShowVolume((value) => !value)}
            onToggleLog={() => setLogScale((value) => !value)}
            onToggleExtended={() => setExtendedHours((value) => !value)}
            onTool={setTool}
            onCompare={(ticker) =>
              setCompareSymbol(ticker === symbol ? null : ticker)
            }
            onFit={() => {
              fitFn.current?.();
              setFitNonce((value) => value + 1);
            }}
            onFullscreen={() => {
              const node = document.getElementById("primary-market-chart-panel");
              if (!node) return;
              if (document.fullscreenElement) void document.exitFullscreen();
              else void node.requestFullscreen();
            }}
            onClearLines={() => setPriceLines([])}
          />

          <div
            className="relative h-[360px] min-w-0 bg-[var(--ib-surface-inset)] sm:h-[420px] xl:h-[480px]"
            tabIndex={0}
            role="img"
            aria-label={summary}
            onKeyDown={(event) => {
              if (!validBars.length) return;
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                setActiveIndex((current) =>
                  Math.max(0, (current ?? validBars.length - 1) - 1),
                );
              }
              if (event.key === "ArrowRight") {
                event.preventDefault();
                setActiveIndex((current) =>
                  Math.min(
                    validBars.length - 1,
                    (current ?? validBars.length - 2) + 1,
                  ),
                );
              }
              if (event.key === "Escape") {
                setActiveIndex(null);
                setTool("cursor");
              }
            }}
          >
            {panelOpen && validBars.length ? (
              <MarketChartCanvas
                symbol={symbol}
                bars={validBars}
                style={style}
                indicators={indicators}
                showVolume={showVolume}
                logScale={logScale}
                compareBars={compareBars}
                compareSymbol={compareSymbol === symbol ? null : compareSymbol}
                priceLines={priceLines}
                tool={tool}
                fitKey={`${symbol}:${interval}:${range}:${fitNonce}`}
                onCrosshair={setActiveIndex}
                onAddPriceLine={(price) =>
                  setPriceLines((current) =>
                    current.includes(price) ? current : [...current, price],
                  )
                }
                onReadyFit={(fit) => {
                  fitFn.current = fit;
                }}
              />
            ) : null}

            {panelOpen && activeBar ? (
              <div className="pointer-events-none absolute left-2 top-2 grid grid-cols-3 gap-x-3 gap-y-0.5 rounded-[4px] border border-[var(--ib-border-control)] bg-[color-mix(in_oklab,var(--ib-surface-3)_96%,transparent)] px-2.5 py-2 font-mono text-[10px] shadow-[var(--shadow-float)] sm:left-3 sm:top-3 sm:grid-cols-6">
                <span className="col-span-3 text-[var(--ib-text-secondary)] sm:col-span-6">
                  {formatMarketDateTime(activeBar.barStart, { date: true })}
                </span>
                <span>
                  <b className="text-[var(--ib-text-muted)]">O</b>{" "}
                  {formatPrice(activeBar.open, symbol)}
                </span>
                <span>
                  <b className="text-[var(--ib-text-muted)]">H</b>{" "}
                  {formatPrice(activeBar.high, symbol)}
                </span>
                <span>
                  <b className="text-[var(--ib-text-muted)]">L</b>{" "}
                  {formatPrice(activeBar.low, symbol)}
                </span>
                <span>
                  <b className="text-[var(--ib-text-muted)]">C</b>{" "}
                  {formatPrice(activeBar.close, symbol)}
                </span>
                <span className="col-span-2">
                  <b className="text-[var(--ib-text-muted)]">VOL</b>{" "}
                  {formatVolume(activeBar.volume)}
                </span>
              </div>
            ) : null}

            {panelOpen &&
            (state === "loading" ||
              state === "empty" ||
              state === "unavailable" ||
              state === "rate-limited" ||
              state === "entitlement") ? (
              <div className="absolute inset-0 grid place-items-center bg-[color-mix(in_oklab,var(--ib-surface-inset)_88%,transparent)] p-5 text-center">
                <div className="max-w-sm">
                  {state === "loading" ? (
                    <RefreshCw
                      aria-hidden="true"
                      className="mx-auto size-5 animate-spin text-[var(--state-info)]"
                    />
                  ) : state === "empty" ? (
                    <BarChart3
                      aria-hidden="true"
                      className="mx-auto size-5 text-[var(--ib-text-muted)]"
                    />
                  ) : (
                    <AlertTriangle
                      aria-hidden="true"
                      className="mx-auto size-5 text-[var(--state-warning)]"
                    />
                  )}
                  <p className="mt-2 text-[13px] font-medium text-[var(--ib-text-primary)]">
                    {statusLabel(state)}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[var(--ib-text-secondary)]">
                    {message ??
                      (state === "empty"
                        ? "No bars are available for this symbol in the selected range. The current quote is not plotted as history."
                        : "Historical chart data is being requested through the configured provider path.")}
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <p className="border-t border-[var(--ib-border-subtle)] px-3 py-1.5 font-mono text-[10px] text-[var(--ib-text-muted)] sm:px-4">
            Scroll to zoom · drag to pan · drag the scale to resize · Shift+scroll
            for time · click with the line tool to pin a price
          </p>

          <details className="border-t border-[var(--ib-border-subtle)] bg-[var(--ib-surface-1)]">
            <summary className="cursor-pointer px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)] hover:text-[var(--ib-text-primary)] sm:px-4">
              Accessible data view · {validBars.length} observations
            </summary>
            <div className="max-h-64 overflow-auto border-t border-[var(--ib-border-subtle)] terminal-scroll">
              <table className="w-full min-w-[560px] text-left font-mono text-[11px]">
                <thead className="sticky top-0 bg-[var(--ib-surface-2)] text-[var(--ib-text-muted)]">
                  <tr>
                    <th className="px-3 py-2 font-medium">
                      {spec.seriesKind === "intraday"
                        ? "Time (CT)"
                        : "Date (CT)"}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">Open</th>
                    <th className="px-3 py-2 text-right font-medium">High</th>
                    <th className="px-3 py-2 text-right font-medium">Low</th>
                    <th className="px-3 py-2 text-right font-medium">Close</th>
                    <th className="px-3 py-2 text-right font-medium">Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {validBars.slice(-15).map((bar) => (
                    <tr
                      key={`${bar.interval}-${bar.barStart}`}
                      className="border-t border-[var(--ib-border-subtle)]"
                    >
                      <td className="px-3 py-2">
                        {formatMarketDateTime(bar.barStart)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatPrice(bar.open, symbol)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatPrice(bar.high, symbol)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatPrice(bar.low, symbol)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatPrice(bar.close, symbol)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatVolume(bar.volume)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      </details>
    </section>
  );
}
