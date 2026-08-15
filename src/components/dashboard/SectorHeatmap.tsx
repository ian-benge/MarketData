"use client";

import { useState } from "react";
import Link from "next/link";
import { ChipToggle } from "@/components/ui/ChipToggle";
import { Panel } from "@/components/ui/Panel";
import type { HeatmapCell } from "@/lib/market-data/overview-analytics";
import { cn } from "@/lib/utils/cn";
import { formatSignedPercent, marketToneClass } from "@/lib/utils/format";
import type { DashboardCoverageDigest } from "@/lib/watchlists/dashboard-digest";
import {
  KIND_LABELS,
  NAV_GROUP_LABELS,
  NAV_GROUPS,
} from "@/lib/watchlists/taxonomy";

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

function SectorPrint({
  name,
  vsSpy,
  avg,
}: {
  name: string;
  vsSpy: number | null;
  avg: number | null;
}) {
  const tone = vsSpy ?? avg;
  return (
    <>
      <span className="block truncate text-[11px] font-medium leading-4 text-[var(--ib-text-primary)]">
        {name}
      </span>
      <span
        className={cn(
          "mt-0.5 block font-mono text-[11px] font-semibold",
          marketToneClass(tone),
        )}
      >
        {vsSpy != null
          ? `${formatSignedPercent(vsSpy)} vs SPY`
          : formatSignedPercent(avg)}
      </span>
    </>
  );
}

function focusTicker(sector: FirmSector) {
  return sector.benchmarkSymbol ?? sector.leaders[0] ?? null;
}

function sectorHref(sector: FirmSector) {
  const ticker = focusTicker(sector);
  const params = new URLSearchParams({ sectorId: sector.id });
  if (ticker) params.set("ticker", ticker);
  return `/watchlists?${params.toString()}`;
}

export function SectorHeatmap({
  cells,
  deskSectors = [],
  onSelectSymbol,
  selectedSymbol,
}: {
  cells: HeatmapCell[];
  deskSectors?: FirmSector[];
  onSelectSymbol?: (ticker: string) => void;
  selectedSymbol?: string;
}) {
  const [mode, setMode] = useState<HeatmapMode>("etf");
  const showingShared = mode === "shared";
  const grouped = NAV_GROUPS.map((group) => ({
    group,
    rows: deskSectors.filter((sector) => sector.navGroup === group),
  })).filter((entry) => entry.rows.length);

  return (
    <Panel
      title="Sector heatmap"
      description={
        showingShared
          ? "Shared sectors & themes from Watchlists. Click to select; footer opens the basket."
          : "U.S. sector ETF tape (+ SMH). Not a GICS industry map."
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
        grouped.length ? (
          <ul
            aria-label="Shared sector heatmap"
            className="grid max-h-[min(28rem,calc(100dvh-16rem))] grid-cols-2 gap-1 overflow-y-auto sm:grid-cols-3 terminal-scroll"
          >
            {grouped.flatMap((entry) => [
              <li
                key={`g-${entry.group}`}
                className="col-span-full pt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ib-text-muted)] first:pt-0"
              >
                {NAV_GROUP_LABELS[entry.group]}
              </li>,
              ...entry.rows.map((sector) => {
                const ticker = focusTicker(sector);
                const selected =
                  ticker != null &&
                  selectedSymbol?.toUpperCase() === ticker.toUpperCase();
                const tone = sector.vsSpy1dPercent ?? sector.avg1dPercent;
                const meta = `${KIND_LABELS[sector.kind]} · ${sector.quotedCount}/${sector.symbolCount}${ticker ? ` · ${ticker}` : ""}${sector.unusualCount ? ` · ${sector.unusualCount} unu` : ""}`;
                return (
                  <li key={sector.id}>
                    <div
                      className={cn(
                        "flex h-full min-h-14 w-full flex-col justify-between rounded-[4px] border px-1.5 py-1.5 text-left transition-colors hover:border-[var(--ib-border-control)]",
                        cellFill(tone),
                        selected
                          ? "border-[var(--ib-maroon-500)]"
                          : "border-[var(--ib-border-subtle)]",
                      )}
                    >
                      {ticker && onSelectSymbol ? (
                        <button
                          type="button"
                          onClick={() => onSelectSymbol(ticker)}
                          aria-pressed={selected}
                          aria-label={`Select ${ticker}`}
                          className="min-w-0 text-left hover:text-[var(--ib-maroon-300)]"
                        >
                          <SectorPrint
                            name={sector.name}
                            vsSpy={sector.vsSpy1dPercent}
                            avg={sector.avg1dPercent}
                          />
                        </button>
                      ) : (
                        <span>
                          <SectorPrint
                            name={sector.name}
                            vsSpy={sector.vsSpy1dPercent}
                            avg={sector.avg1dPercent}
                          />
                        </span>
                      )}
                      <Link
                        href={sectorHref(sector)}
                        aria-label={`Open ${sector.name} in Watchlists`}
                        className="mt-1 truncate font-mono text-[9px] text-[var(--ib-text-secondary)] hover:text-[var(--ib-maroon-300)] hover:underline"
                      >
                        {meta}
                      </Link>
                    </div>
                  </li>
                );
              }),
            ])}
          </ul>
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
      ) : cells.length ? (
        <ul className="grid grid-cols-3 gap-1 sm:grid-cols-4">
          {cells.map((cell) => {
            const selected = selectedSymbol === cell.key;
            return (
              <li key={cell.key}>
                <button
                  type="button"
                  onClick={() => onSelectSymbol?.(cell.key)}
                  aria-pressed={selected}
                  aria-label={`Select ${cell.key}`}
                  className={cn(
                    "flex h-full min-h-14 w-full flex-col justify-between rounded-[4px] border px-1.5 py-1.5 text-left transition-colors hover:border-[var(--ib-border-control)]",
                    cellFill(cell.changePercent),
                    selected
                      ? "border-[var(--ib-maroon-500)]"
                      : "border-[var(--ib-border-subtle)]",
                  )}
                >
                  <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                    {cell.key}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-[11px] font-semibold",
                      marketToneClass(cell.changePercent),
                    )}
                  >
                    {formatSignedPercent(cell.changePercent)}
                  </span>
                  <span className="truncate text-[9px] text-[var(--ib-text-secondary)]">
                    {cell.label}
                  </span>
                </button>
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
