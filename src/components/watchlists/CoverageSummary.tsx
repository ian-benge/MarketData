"use client";

import { type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { FlagPills, PercentText } from "@/components/watchlists/display";
import { cn } from "@/lib/utils/cn";
import { formatRelativeVolume } from "@/lib/utils/format";
import {
  KIND_LABELS,
  PURPOSE_LABELS,
} from "@/lib/watchlists/taxonomy";
import type {
  CoverageMover,
  CoverageSector,
  CoverageSelection,
  CoverageSummary,
  CoverageWatchlist,
} from "@/lib/watchlists/types";

function Stat({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-[13px] text-[var(--ib-text-primary)]">
        {value}
      </div>
    </div>
  );
}

function MoverList({
  title,
  rows,
  onSelect,
}: {
  title: string;
  rows: CoverageMover[];
  onSelect: (ticker: string) => void;
}) {
  return (
    <div className="min-w-0">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
        {title}
      </h3>
      <ul className="mt-1.5 space-y-1">
        {rows.length ? (
          rows.map((row) => (
            <li key={row.ticker}>
              <button
                type="button"
                onClick={() => onSelect(row.ticker)}
                className="flex w-full items-center justify-between gap-2 rounded-[3px] px-1 py-0.5 text-left hover:bg-[var(--ib-surface-hover)]"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="font-mono text-[12px] text-[var(--ib-text-primary)]">
                    {row.ticker}
                  </span>
                  <FlagPills flags={row.flags} />
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-[var(--ib-text-muted)]">
                    {formatRelativeVolume(row.relativeVolume)}
                  </span>
                  <PercentText value={row.changePercent} className="text-[12px]" />
                </span>
              </button>
            </li>
          ))
        ) : (
          <li className="text-[12px] text-[var(--ib-text-muted)]">None</li>
        )}
      </ul>
    </div>
  );
}

function CoverageStepper({
  selection,
  watchlists,
  sectors,
  showArchived,
  onSelect,
}: {
  selection: CoverageSelection | null;
  watchlists: CoverageWatchlist[];
  sectors: CoverageSector[];
  showArchived: boolean;
  onSelect: (selection: CoverageSelection) => void;
}) {
  const lists = watchlists.filter((list) => showArchived || !list.archivedAt);
  const groups = sectors.filter((sector) => showArchived || !sector.archivedAt);
  const pane = selection?.type === "sector" ? "sectors" : "watchlists";
  const items = pane === "sectors" ? groups : lists;
  const current =
    items.find((item) => item.id === selection?.id) ?? items[0] ?? null;
  const canCycle = items.length > 1;

  function showPane(next: "watchlists" | "sectors") {
    if (next === "sectors") {
      const target = groups.find((sector) => sector.id === selection?.id) ?? groups[0];
      if (target) onSelect({ type: "sector", id: target.id });
      return;
    }
    const target = lists.find((list) => list.id === selection?.id) ?? lists[0];
    if (target) onSelect({ type: "watchlist", id: target.id });
  }

  function cycle(direction: -1 | 1) {
    if (!items.length) return;
    const index = Math.max(0, items.findIndex((item) => item.id === selection?.id));
    const next = items[(index + direction + items.length) % items.length];
    if (!next) return;
    onSelect(
      pane === "sectors"
        ? { type: "sector", id: next.id }
        : { type: "watchlist", id: next.id },
    );
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-[var(--ib-border-subtle)] pb-3">
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          aria-pressed={pane === "watchlists"}
          onClick={() => showPane("watchlists")}
          className={cn(
            "inline-flex h-8 items-center rounded-[4px] border px-2.5 text-[12px] font-medium",
            pane === "watchlists"
              ? "border-[var(--ib-border-control)] bg-[var(--ib-surface-3)] text-[var(--ib-text-primary)]"
              : "border-transparent text-[var(--ib-text-muted)] hover:text-[var(--ib-text-primary)]",
          )}
        >
          Watchlists
        </button>
        <button
          type="button"
          aria-pressed={pane === "sectors"}
          onClick={() => showPane("sectors")}
          className={cn(
            "inline-flex h-8 items-center rounded-[4px] border px-2.5 text-[12px] font-medium",
            pane === "sectors"
              ? "border-[var(--ib-border-control)] bg-[var(--ib-surface-3)] text-[var(--ib-text-primary)]"
              : "border-transparent text-[var(--ib-text-muted)] hover:text-[var(--ib-text-primary)]",
          )}
        >
          Sectors & themes
        </button>
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-1">
        <button
          type="button"
          className="grid size-8 shrink-0 place-items-center rounded-[4px] text-[var(--ib-text-muted)] hover:bg-[var(--ib-surface-hover)] hover:text-[var(--ib-text-primary)] disabled:opacity-40"
          aria-label={pane === "sectors" ? "Previous sector or theme" : "Previous watchlist"}
          disabled={!canCycle}
          onClick={() => cycle(-1)}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </button>
        <span className="max-w-[14rem] truncate text-center text-[13px] font-medium text-[var(--ib-text-primary)]">
          {current?.name ?? (pane === "sectors" ? "No sectors" : "No watchlists")}
        </span>
        <button
          type="button"
          className="grid size-8 shrink-0 place-items-center rounded-[4px] text-[var(--ib-text-muted)] hover:bg-[var(--ib-surface-hover)] hover:text-[var(--ib-text-primary)] disabled:opacity-40"
          aria-label={pane === "sectors" ? "Next sector or theme" : "Next watchlist"}
          disabled={!canCycle}
          onClick={() => cycle(1)}
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function CoverageSummary({
  summary,
  winners,
  losers,
  unusual,
  onSelectTicker,
  selection,
  watchlists,
  sectors,
  showArchived,
  onSelectCoverage,
}: {
  summary: CoverageSummary;
  winners: CoverageMover[];
  losers: CoverageMover[];
  unusual: CoverageMover[];
  onSelectTicker: (ticker: string) => void;
  selection: CoverageSelection | null;
  watchlists: CoverageWatchlist[];
  sectors: CoverageSector[];
  showArchived: boolean;
  onSelectCoverage: (selection: CoverageSelection) => void;
}) {
  const selected =
    selection?.type === "sector"
      ? sectors.find((sector) => sector.id === selection.id) ?? null
      : watchlists.find((list) => list.id === selection?.id) ?? null;
  const kind =
    selected && "kind" in selected
      ? KIND_LABELS[selected.kind]
      : selected && "purpose" in selected
        ? PURPOSE_LABELS[selected.purpose]
        : null;
  const qualityTone =
    summary.dataQuality === "ok"
      ? "text-[var(--market-positive)]"
      : summary.dataQuality === "partial"
        ? "text-[var(--ib-text-secondary)]"
        : "text-[var(--market-negative)]";

  return (
    <Panel
      title="Universe snapshot"
      description="Equal-weight breadth for the selected coverage set. Missing prints stay out of averages."
    >
      <CoverageStepper
        selection={selection}
        watchlists={watchlists}
        sectors={sectors}
        showArchived={showArchived}
        onSelect={onSelectCoverage}
      />
      {selected ? (
        <div className="mb-3 space-y-1 border-b border-[var(--ib-border-subtle)] pb-3">
          <div className="flex flex-wrap items-center gap-2">
            {kind ? (
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                {kind}
              </span>
            ) : null}
            {"benchmarkSymbol" in selected && selected.benchmarkSymbol ? (
              <span className="font-mono text-[10px] text-[var(--ib-text-secondary)]">
                vs {selected.benchmarkSymbol}
              </span>
            ) : null}
            {"lastReviewedAt" in selected && selected.lastReviewedAt ? (
              <span className="font-mono text-[10px] text-[var(--ib-text-muted)]">
                Reviewed {selected.lastReviewedAt.slice(0, 10)}
              </span>
            ) : null}
          </div>
          {selected.description ? (
            <p className="text-[12px] leading-5 text-[var(--ib-text-secondary)]">
              {selected.description}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-12">
        <Stat label="Names" value={summary.nameCount} />
        <Stat label="Quoted" value={summary.quotedCount} />
        <Stat label="Adv / Dec" value={`${summary.advancers} / ${summary.decliners}`} />
        <Stat
          label="Breadth"
          value={summary.breadth == null ? "—" : `${summary.breadth.toFixed(0)}%`}
        />
        <Stat label="Avg 1D" value={<PercentText value={summary.avg1dPercent} />} />
        <Stat label="Cap-wt 1D" value={<PercentText value={summary.capWeight1dPercent} />} />
        <Stat
          label={summary.benchmarkSymbol ? `vs ${summary.benchmarkSymbol}` : "vs bmk"}
          value={<PercentText value={summary.vsBenchmark1dPercent} />}
        />
        <Stat label="Avg 1W" value={<PercentText value={summary.avg1wPercent} />} />
        <Stat label="Avg YTD" value={<PercentText value={summary.avgYtdPercent} />} />
        <Stat label="Unusual" value={summary.unusualCount} />
        <Stat label="Unresolved" value={summary.quarantinedCount} />
        <Stat
          label="Quality"
          value={
            <span className={qualityTone}>
              {summary.dataQuality === "ok"
                ? "OK"
                : summary.dataQuality === "partial"
                  ? "Partial"
                  : "Poor"}
            </span>
          }
        />
      </div>
      <div className="mt-4 grid gap-4 border-t border-[var(--ib-border-subtle)] pt-3 md:grid-cols-3">
        <MoverList title="Winners" rows={winners} onSelect={onSelectTicker} />
        <MoverList title="Losers" rows={losers} onSelect={onSelectTicker} />
        <MoverList title="Unusual activity" rows={unusual} onSelect={onSelectTicker} />
      </div>
    </Panel>
  );
}
