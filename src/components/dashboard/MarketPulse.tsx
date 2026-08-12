"use client";

import { useMemo, useState } from "react";
import { Activity, AlertTriangle, ChevronDown, Clock3, Database, Gauge } from "lucide-react";
import { CrossAssetTape } from "@/components/dashboard/CrossAssetTape";
import { MarketPulseMethodology } from "@/components/dashboard/market-pulse/MarketPulseMethodology";
import { ProxyBreadth } from "@/components/dashboard/market-pulse/ProxyBreadth";
import { RegimeSpectrum } from "@/components/dashboard/market-pulse/RegimeSpectrum";
import { RiskWatch } from "@/components/dashboard/market-pulse/RiskWatch";
import { SignalDrivers } from "@/components/dashboard/market-pulse/SignalDrivers";
import { Skeleton } from "@/components/ui/Skeleton";
import { calculateMarketPulse, type MarketPulseDriverId } from "@/lib/market-data/market-pulse";
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
};

export function MarketPulseSkeleton() {
  return (
    <section aria-label="Loading Market Pulse" className="overflow-hidden rounded-[8px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-1)]">
      <div className="h-0.5 bg-[var(--ib-border-strong)]" />
      <div className="space-y-5 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-8 w-56" /><Skeleton className="h-3 w-72 max-w-full" /></div>
          <Skeleton className="h-7 w-32" />
        </div>
        <div className="grid gap-4 lg:grid-cols-12"><Skeleton className="h-52 lg:col-span-8" /><Skeleton className="h-52 lg:col-span-4" /></div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
      </div>
    </section>
  );
}

function freshnessTone(freshness: string) {
  if (freshness === "Fresh") return "text-[var(--market-positive)] border-[color-mix(in_oklab,var(--market-positive)_30%,var(--ib-border-subtle))]";
  if (freshness === "Stale") return "text-[var(--market-negative)] border-[color-mix(in_oklab,var(--market-negative)_30%,var(--ib-border-subtle))]";
  return "text-[var(--state-warning)] border-[color-mix(in_oklab,var(--state-warning)_30%,var(--ib-border-subtle))]";
}

export function MarketPulse(props: MarketPulseProps) {
  const [activeDriver, setActiveDriver] = useState<MarketPulseDriverId | null>(null);
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const result = useMemo(
    () => calculateMarketPulse({
      quotes: props.quotes,
      asOf: props.asOf,
      marketSession: props.marketSession,
      latencyClass: props.latencyClass,
      feedCoverage: props.feedCoverage,
      coverageLabel: props.coverageLabel,
      breadthSupported: props.breadthSupported,
    }),
    [props.asOf, props.breadthSupported, props.coverageLabel, props.feedCoverage, props.latencyClass, props.marketSession, props.quotes],
  );

  if (props.loading) return <MarketPulseSkeleton />;
  const degraded = result.freshness !== "Fresh" || result.score == null;

  return (
    <section aria-labelledby="market-pulse-title" className="min-w-0 overflow-hidden rounded-[8px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-1)] shadow-[0_14px_36px_rgb(0_0_0/18%)]">
      <div className={cn("h-0.5", degraded ? result.freshness === "Stale" ? "bg-[var(--market-negative)]" : "bg-[var(--state-warning)]" : "bg-[#500000]")} />
      <header className="border-b border-[var(--ib-border-subtle)] px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Gauge aria-hidden="true" className="size-3.5 text-[var(--ib-maroon-300)]" />
              <p id="market-pulse-title" className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ib-text-muted)]">Market Pulse</p>
            </div>
            <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.025em] text-[var(--ib-text-primary)] sm:text-[30px]">{result.regime}</h2>
            <p className="mt-1.5 max-w-3xl text-[12px] leading-5 text-[var(--ib-text-secondary)]">{result.explanation}</p>
          </div>
          <div className="grid shrink-0 gap-2 sm:grid-cols-2 lg:min-w-[390px]">
            <div className="rounded-[5px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-inset)] px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ib-text-muted)]"><Clock3 className="size-3" /> Updated</span>
                <span className={cn("rounded-full border px-2 py-0.5 font-mono text-[9px] font-semibold uppercase", freshnessTone(result.freshness))}>{result.freshness}</span>
              </div>
              <p className="mt-1.5 font-mono text-[11px] text-[var(--ib-text-primary)]">{formatMarketTime(result.calculatedAt, true)}</p>
            </div>
            <div className="rounded-[5px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-inset)] px-3 py-2">
              <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ib-text-muted)]"><Database className="size-3" /> Data quality</span>
              <p data-testid="tape-feed-label" className="mt-1.5 text-[10px] leading-4 text-[var(--ib-text-secondary)]">{result.dataQualityLabel}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="grid min-w-0 gap-4 border-b border-[var(--ib-border-subtle)] p-4 sm:p-5 lg:grid-cols-12">
        <div className="flex min-h-0 min-w-0 flex-col lg:col-span-8">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ib-text-muted)]">Composite regime instrument</p>
              <p className="mt-1 text-[11px] text-[var(--ib-text-secondary)]">{Math.round(result.coverage * 100)}% weighted signal coverage · {result.session.toUpperCase()} observations only</p>
            </div>
            <div className="relative shrink-0">
              <button
                type="button"
                aria-expanded={methodologyOpen}
                aria-controls="market-pulse-methodology"
                onClick={() => setMethodologyOpen((open) => !open)}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-[4px] border border-[var(--ib-maroon-650)] px-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ib-text-secondary)] transition-colors hover:border-[var(--ib-maroon-500)] hover:text-[var(--ib-text-primary)]"
              >
                Signal methodology
                <ChevronDown
                  aria-hidden="true"
                  className={cn(
                    "size-3.5 transition-transform",
                    methodologyOpen ? "rotate-180" : null,
                  )}
                />
              </button>
              {methodologyOpen ? (
                <div
                  id="market-pulse-methodology"
                  className="absolute right-0 top-full z-30 mt-1"
                >
                  <MarketPulseMethodology
                    result={result}
                    onClose={() => setMethodologyOpen(false)}
                  />
                </div>
              ) : null}
            </div>
          </div>
          <RegimeSpectrum result={result} />
          {result.excludedSessionCount ? <p className="mt-3 flex items-center gap-1.5 text-[10px] text-[var(--state-warning)]"><AlertTriangle className="size-3" /> {result.excludedSessionCount} observation{result.excludedSessionCount === 1 ? " was" : "s were"} excluded because its session did not match.</p> : null}
        </div>
        <div className="min-w-0 lg:col-span-4">
          <SignalDrivers drivers={result.drivers} activeDriver={activeDriver} onActiveDriver={setActiveDriver} />
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ib-text-muted)]">Cross-asset tape</p><p className="mt-1 text-[11px] text-[var(--ib-text-secondary)]">Verified session moves · select a proxy to open it in the primary chart</p></div>
          <Activity aria-hidden="true" className="size-4 text-[var(--ib-text-muted)]" />
        </div>
        <CrossAssetTape quotes={props.quotes} asOf={props.asOf} marketSession={props.marketSession} selectedSymbol={props.selectedSymbol} onSelectSymbol={props.onSelectSymbol} activeDriver={activeDriver} onActiveDriver={setActiveDriver} />
        <ProxyBreadth quotes={props.quotes} result={result} breadthSupported={props.breadthSupported} breadthExplanation={props.breadthExplanation} />
      </div>

      <RiskWatch events={props.calendar ?? []} asOf={props.asOf} result={result} />
    </section>
  );
}
