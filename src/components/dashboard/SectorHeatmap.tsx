"use client";

import { useState } from "react";
import Link from "next/link";
import { ChipToggle } from "@/components/ui/ChipToggle";
import { Panel } from "@/components/ui/Panel";
import type { HeatmapCell } from "@/lib/market-data/overview-analytics";
import { cn } from "@/lib/utils/cn";
import { formatSignedPercent, marketToneClass } from "@/lib/utils/format";
import type { DashboardCoverageDigest } from "@/lib/watchlists/dashboard-digest";
import { KIND_LABELS, type SectorKind } from "@/lib/watchlists/taxonomy";

function cellFill(change: number | null) {
  if (change == null || change === 0) return "bg-[var(--ib-surface-2)]";
  const intensity = Math.min(Math.abs(change) / 1.5, 1);
  if (change > 0) {
    return intensity > 0.66
      ? "bg-[color-mix(in_oklab,var(--market-positive)_34%,var(--ib-surface-2))]"
      : intensity > 0.33
        ? "bg-[color-mix(in_oklab,var(--market-positive)_20%,var(--ib-surface-2))]"
        : "bg-[color-mix(in_oklab,var(--market-positive)_10%,var(--ib-surface-2))]";
  }
  return intensity > 0.66
    ? "bg-[color-mix(in_oklab,var(--market-negative)_34%,var(--ib-surface-2))]"
    : intensity > 0.33
      ? "bg-[color-mix(in_oklab,var(--market-negative)_20%,var(--ib-surface-2))]"
      : "bg-[color-mix(in_oklab,var(--market-negative)_10%,var(--ib-surface-2))]";
}

type HeatmapMode = "etf" | "shared";
type FirmSector = DashboardCoverageDigest["deskSectors"][number];

function isOfficialSector(kind: SectorKind) {
  return kind === "sector" || kind === "industry";
}

function focusTicker(sector: FirmSector) {
  return sector.displayTicker ?? sector.benchmarkSymbol ?? sector.leaders[0] ?? null;
}

/** Map a sector-ETF ticker (XLK, SMH, …) onto the shared basket it represents. */
export function deskSectorForHeatmapTicker(
  sectors: readonly FirmSector[],
  ticker: string,
): FirmSector | undefined {
  const key = ticker.trim().toUpperCase();
  if (!key) return undefined;
  const matches = sectors.filter((sector) => {
    return (
      sector.benchmarkSymbol?.toUpperCase() === key ||
      sector.displayTicker?.toUpperCase() === key
    );
  });
  if (!matches.length) return undefined;
  return [...matches].sort((a, b) => {
    const aOfficial = isOfficialSector(a.kind) ? 0 : 1;
    const bOfficial = isOfficialSector(b.kind) ? 0 : 1;
    if (aOfficial !== bOfficial) return aOfficial - bOfficial;
    if (b.symbolCount !== a.symbolCount) return b.symbolCount - a.symbolCount;
    return a.name.localeCompare(b.name);
  })[0];
}

export function heatmapDisplayChange(
  sector: FirmSector,
  tapeChangeByTicker?: ReadonlyMap<string, number | null>,
  spyChange?: number | null,
): number | null {
  if (sector.vsSpy1dPercent != null) return sector.vsSpy1dPercent;
  if (sector.avg1dPercent != null) return sector.avg1dPercent;
  const ticker = focusTicker(sector)?.toUpperCase();
  if (!ticker || !tapeChangeByTicker) return null;
  const raw = tapeChangeByTicker.get(ticker);
  if (raw == null) return null;
  if (spyChange == null) return raw;
  return Math.round((raw - spyChange) * 100) / 100;
}

export function sortDeskSectorsByGain(
  rows: FirmSector[],
  tapeChangeByTicker?: ReadonlyMap<string, number | null>,
  spyChange?: number | null,
): FirmSector[] {
  return [...rows].sort((a, b) => {
    const aChange = heatmapDisplayChange(a, tapeChangeByTicker, spyChange);
    const bChange = heatmapDisplayChange(b, tapeChangeByTicker, spyChange);
    if (aChange == null && bChange == null) return a.name.localeCompare(b.name);
    if (aChange == null) return 1;
    if (bChange == null) return -1;
    if (bChange !== aChange) return bChange - aChange;
    return a.name.localeCompare(b.name);
  });
}

export function partitionDeskHeatmap(rows: FirmSector[]): {
  sectors: FirmSector[];
  themes: FirmSector[];
} {
  const sectors: FirmSector[] = [];
  const themes: FirmSector[] = [];
  for (const row of rows) {
    if (isOfficialSector(row.kind)) sectors.push(row);
    else themes.push(row);
  }
  return { sectors, themes };
}

function sectorHref(sector: FirmSector) {
  const ticker = focusTicker(sector);
  const params = new URLSearchParams({ sectorId: sector.id });
  if (ticker) params.set("ticker", ticker);
  return `/watchlists?${params.toString()}`;
}

function HeatmapTile({
  top,
  change,
  label,
  selected = false,
  onSelect,
  href,
  ariaLabel,
  title,
}: {
  top: string;
  change: number | null;
  label: string;
  selected?: boolean;
  onSelect?: () => void;
  href?: string;
  ariaLabel: string;
  title?: string;
}) {
  const className = cn(
    "flex h-full min-h-16 w-full flex-col justify-between rounded-[4px] border px-1.5 py-1.5 text-left transition-colors hover:border-[var(--ib-border-control)]",
    cellFill(change),
    selected
      ? "border-[var(--ib-maroon-500)] ring-1 ring-[var(--ib-maroon-500)]"
      : "border-[var(--ib-border-subtle)]",
  );
  const body = (
    <>
      <span className="line-clamp-2 text-[10px] font-medium leading-tight text-[var(--ib-text-primary)]">
        {label}
      </span>
      <span className="mt-1 flex items-baseline justify-between gap-1">
        <span className="truncate font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
          {top}
        </span>
        <span
          className={cn(
            "shrink-0 font-mono text-[11px] font-semibold tabular-nums",
            marketToneClass(change),
          )}
        >
          {formatSignedPercent(change)}
        </span>
      </span>
    </>
  );
  if (href && !onSelect) {
    return (
      <Link href={href} aria-label={ariaLabel} title={title} className={className}>
        {body}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={ariaLabel}
      title={title}
      className={className}
    >
      {body}
    </button>
  );
}

export function SectorHeatmap({
  cells,
  deskSectors = [],
  onSelectSymbol,
  onSelectSector,
  selectedSymbol,
  selectedSectorId,
  tapeChangeByTicker,
  spyChange = null,
}: {
  cells: HeatmapCell[];
  deskSectors?: FirmSector[];
  onSelectSymbol?: (ticker: string) => void;
  onSelectSector?: (sectorId: string) => void;
  selectedSymbol?: string;
  selectedSectorId?: string;
  tapeChangeByTicker?: ReadonlyMap<string, number | null>;
  spyChange?: number | null;
}) {
  const [mode, setMode] = useState<HeatmapMode>("etf");

  function selectDeskSector(sector: FirmSector) {
    setMode("shared");
    onSelectSector?.(sector.id);
    const ticker = focusTicker(sector);
    if (ticker) onSelectSymbol?.(ticker);
  }
  const showingShared = mode === "shared";
  const partitioned = partitionDeskHeatmap(deskSectors);
  const sharedSections = [
    {
      key: "sectors",
      title: "Sectors",
      rows: sortDeskSectorsByGain(partitioned.sectors, tapeChangeByTicker, spyChange),
    },
    {
      key: "themes",
      title: "Themes",
      rows: sortDeskSectorsByGain(partitioned.themes, tapeChangeByTicker, spyChange),
    },
  ].filter((section) => section.rows.length);
  const sortedCells = [...cells].sort((a, b) => {
    if (a.changePercent == null && b.changePercent == null) {
      return a.label.localeCompare(b.label);
    }
    if (a.changePercent == null) return 1;
    if (b.changePercent == null) return -1;
    return b.changePercent - a.changePercent;
  });

  return (
    <Panel
      title="Sector heatmap"
      description={
        showingShared
          ? "Shared sectors & themes from Watchlists. Highest 1D vs SPY first."
          : "U.S. sector ETF tape (+ SMH). Highest 1D first. Not a GICS industry map."
      }
      bodyClassName="p-2"
      actions={
        <div className="flex flex-wrap gap-1" role="group" aria-label="Heatmap mode">
          <ChipToggle
            pressed={!showingShared}
            onClick={() => setMode("etf")}
          >
            Market ETFs
          </ChipToggle>
          <ChipToggle
            pressed={showingShared}
            onClick={() => setMode("shared")}
          >
            Shared sectors
          </ChipToggle>
        </div>
      }
    >
      {showingShared ? (
        sharedSections.length ? (
          <div className="space-y-3">
            {sharedSections.map((section) => (
              <section key={section.key} className="space-y-1">
                <h3 className="px-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                  {section.title}
                </h3>
                <ul
                  aria-label={`${section.title} heatmap`}
                  className="grid grid-cols-3 gap-1 sm:grid-cols-4"
                >
                  {section.rows.map((sector) => {
                    const ticker = focusTicker(sector);
                    const leader =
                      sector.leaders[0] ?? ticker ?? KIND_LABELS[sector.kind];
                    const selected = selectedSectorId === sector.id;
                    const change = heatmapDisplayChange(
                      sector,
                      tapeChangeByTicker,
                      spyChange,
                    );
                    const title = [
                      sector.name,
                      KIND_LABELS[sector.kind],
                      change != null ? `${formatSignedPercent(change)} vs SPY` : "No 1D print on this tape",
                      `${sector.quotedCount}/${sector.symbolCount} quoted`,
                      sector.unusualCount ? `${sector.unusualCount} unusual` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    const canSelectOnDashboard = Boolean(onSelectSector);
                    return (
                      <li key={sector.id}>
                        <HeatmapTile
                          top={leader}
                          change={change}
                          label={sector.name}
                          selected={selected}
                          onSelect={
                            canSelectOnDashboard
                              ? () => selectDeskSector(sector)
                              : ticker && onSelectSymbol
                                ? () => onSelectSymbol(ticker)
                                : undefined
                          }
                          href={
                            canSelectOnDashboard || (ticker && onSelectSymbol)
                              ? undefined
                              : sectorHref(sector)
                          }
                          ariaLabel={
                            canSelectOnDashboard
                              ? `Show ${sector.name} in watchlist`
                              : ticker
                                ? `Select ${ticker}`
                                : `Open ${sector.name} in Watchlists`
                          }
                          title={title}
                        />
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <p className="px-1 py-6 text-center text-[12px] text-[var(--ib-text-muted)]">
            No shared sectors —{" "}
            <Link
              href="/watchlists"
              className="text-[var(--ib-maroon-300)] hover:underline"
            >
              manage in Watchlists
            </Link>
            .
          </p>
        )
      ) : sortedCells.length ? (
        <ul className="grid grid-cols-3 gap-1 sm:grid-cols-4">
          {sortedCells.map((cell) => {
            const mapped = deskSectorForHeatmapTicker(deskSectors, cell.key);
            const selected = mapped
              ? selectedSectorId === mapped.id
              : selectedSymbol === cell.key;
            return (
              <li key={cell.key}>
                <HeatmapTile
                  top={cell.key}
                  change={cell.changePercent}
                  label={cell.label}
                  selected={selected}
                  onSelect={() => {
                    if (mapped && onSelectSector) {
                      selectDeskSector(mapped);
                      return;
                    }
                    onSelectSymbol?.(cell.key);
                  }}
                  ariaLabel={
                    mapped && onSelectSector
                      ? `Show ${mapped.name} in watchlist`
                      : `Select ${cell.key}`
                  }
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-1 py-6 text-center text-[12px] text-[var(--ib-text-muted)]">
          Sector ETF prints are not on this tape.
        </p>
      )}
    </Panel>
  );
}
