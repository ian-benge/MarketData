"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, Gauge } from "lucide-react";
import { FactorTape } from "@/components/dashboard/FactorTape";
import { MarketPulseMethodology } from "@/components/dashboard/market-pulse/MarketPulseMethodology";
import { RegimeSpectrum } from "@/components/dashboard/market-pulse/RegimeSpectrum";
import { RiskWatch } from "@/components/dashboard/market-pulse/RiskWatch";
import { ChipToggle } from "@/components/ui/ChipToggle";
import { Skeleton } from "@/components/ui/Skeleton";
import { calculateMarketPulse, filterPulseQuotes, type MarketPulseResult } from "@/lib/market-data/market-pulse";
import type { TapeRow } from "@/lib/market-data/overview-analytics";
import type { NormalizedCalendarEvent, NormalizedQuote } from "@/lib/providers/types";
import { cn } from "@/lib/utils/cn";
import { formatMarketTime } from "@/lib/utils/format";

export type MarketPulseProps = {
  quotes: NormalizedQuote[];
  asOf: string;
  marketSession?: string | null;
  latencyClass?: string | null;
  feedCoverage?: string | null;
  coverageLabel?: string | null;
  breadthSupported?: boolean;
  breadthExplanation?: string | null;
  calendar?: NormalizedCalendarEvent[];
  selectedSymbol?: string;
  onSelectSymbol?: (ticker: string) => void;
  loading?: boolean;
  pulse?: MarketPulseResult;
  compact?: boolean;
  factors?: TapeRow[];
};

export function MarketPulseSkeleton() {
  return (
    <section aria-label="Loading Market Pulse" className="rounded-[6px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-1)]">
      <div className="h-0.5 bg-[var(--ib-border-strong)]" />
      <div className="space-y-4 p-3 sm:p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-7 w-56" /><Skeleton className="h-3 w-72 max-w-full" /></div>
          <Skeleton className="h-7 w-32" />
        </div>
        <div className="grid gap-3 lg:grid-cols-12"><Skeleton className="h-44 lg:col-span-8" /><Skeleton className="h-44 lg:col-span-4" /></div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
      </div>
    </section>
  );
}

function freshnessTone(freshness: string) {
  if (freshness === "Fresh") {
    return "text-[var(--state-info)] border-[color-mix(in_oklab,var(--state-info)_30%,var(--ib-border-subtle))]";
  }
  if (freshness === "Stale") {
    return "text-[var(--state-warning)] border-[color-mix(in_oklab,var(--state-warning)_30%,var(--ib-border-subtle))]";
  }
  return "text-[var(--state-warning)] border-[color-mix(in_oklab,var(--state-warning)_30%,var(--ib-border-subtle))]";
}

export function MarketPulse(props: MarketPulseProps) {
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const methodologyRef = useRef<HTMLDivElement>(null);
  const pulseQuotes = useMemo(
    () => filterPulseQuotes(props.quotes),
    [props.quotes],
  );
  const computed = useMemo(
    () =>
      props.pulse ??
      calculateMarketPulse({
        quotes: pulseQuotes,
        asOf: props.asOf,
        marketSession: props.marketSession,
        latencyClass: props.latencyClass,
        feedCoverage: props.feedCoverage,
        coverageLabel: props.coverageLabel,
        breadthSupported: props.breadthSupported,
      }),
    [
      props.asOf,
      props.breadthSupported,
      props.coverageLabel,
      props.feedCoverage,
      props.latencyClass,
      props.marketSession,
      props.pulse,
      pulseQuotes,
    ],
  );
  const result = computed;

  useEffect(() => {
    if (!methodologyOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMethodologyOpen(false);
    }
    function onPointer(event: MouseEvent) {
      if (!methodologyRef.current?.contains(event.target as Node)) {
        setMethodologyOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [methodologyOpen]);

  if (props.loading) return <MarketPulseSkeleton />;
  const degraded = result.freshness !== "Fresh" || result.score == null;

  return (
    <section id="market-pulse" aria-labelledby="market-pulse-title" className="min-w-0 scroll-mt-[11.5rem] rounded-[6px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-1)]">
      <div
        className={cn(
          "h-0.5 rounded-t-[6px]",
          degraded ? "bg-[var(--state-warning)]" : "bg-[var(--ib-maroon-800)]",
        )}
      />
      <div className="border-b border-[var(--ib-border-subtle)] px-3 py-2 sm:px-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Gauge aria-hidden="true" className="size-3.5 text-[var(--ib-maroon-300)]" />
              <p id="market-pulse-title" className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ib-text-muted)]">Market Pulse</p>
              <span className={cn("rounded-[3px] border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase", freshnessTone(result.freshness))}>{result.freshness}</span>
              <span className="font-mono text-[11px] tabular-nums text-[var(--ib-text-secondary)]">{result.score == null ? "Score withheld" : `${result.score} / 100`}</span>
            </div>
            <h2 className="mt-1 text-[18px] font-semibold tracking-[-0.025em] text-[var(--ib-text-primary)] sm:text-[20px]">{result.regime}</h2>
            <p className={cn("mt-1 max-w-3xl text-[12px] leading-4 text-[var(--ib-text-secondary)]", props.compact && "line-clamp-2")}>{result.explanation}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <p data-testid="tape-feed-label" className="max-w-xs text-right font-mono text-[10px] leading-4 text-[var(--ib-text-muted)]">
              {result.dataQualityLabel}
              <span className="mt-0.5 block">{formatMarketTime(result.calculatedAt, true)}</span>
            </p>
            <div className="relative" ref={methodologyRef}>
              <ChipToggle
                pressed={methodologyOpen}
                aria-expanded={methodologyOpen}
                aria-controls="market-pulse-methodology"
                onClick={() => setMethodologyOpen((open) => !open)}
                className="normal-case tracking-[0.08em]"
              >
                Signal methodology
                <ChevronDown
                  aria-hidden="true"
                  className={cn(
                    "size-3.5 transition-transform",
                    methodologyOpen ? "rotate-180" : null,
                  )}
                />
              </ChipToggle>
              {methodologyOpen ? (
                <div
                  id="market-pulse-methodology"
                  className="absolute right-0 top-full z-30 mt-1 max-sm:fixed max-sm:left-3 max-sm:right-3 max-sm:top-28 max-sm:mt-0"
                >
                  <MarketPulseMethodology
                    result={result}
                    onClose={() => setMethodologyOpen(false)}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="min-w-0 border-b border-[var(--ib-border-subtle)] p-3 sm:p-4">
        <div className="mb-2.5">
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ib-text-muted)]">
            Composite regime instrument
          </p>
          <p className="mt-1 text-[11px] text-[var(--ib-text-secondary)]">
            {Math.round(result.coverage * 100)}% weighted signal coverage · {result.session.toUpperCase()} observations only
          </p>
        </div>
        <RegimeSpectrum result={result} />
        {result.excludedSessionCount ? (
          <p className="mt-2.5 flex items-center gap-1.5 text-[10px] text-[var(--state-warning)]">
            <AlertTriangle className="size-3" /> {result.excludedSessionCount} observation
            {result.excludedSessionCount === 1 ? " was" : "s were"} excluded because its session did not match.
          </p>
        ) : null}
      </div>

      {props.factors ? (
        <FactorTape tiles={props.factors} onSelectSymbol={props.onSelectSymbol} inline />
      ) : null}

      <RiskWatch events={props.calendar ?? []} asOf={props.asOf} result={result} />
    </section>
  );
}
