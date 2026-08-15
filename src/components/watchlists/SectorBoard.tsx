"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { PercentText } from "@/components/watchlists/display";
import { cn } from "@/lib/utils/cn";
import { KIND_LABELS, NAV_GROUPS, NAV_GROUP_LABELS } from "@/lib/watchlists/taxonomy";
import type { NavGroup, SectorBoardRow } from "@/lib/watchlists/types";

type SortKey =
  | "name"
  | "kind"
  | "change1d"
  | "change1w"
  | "change1m"
  | "changeYtd"
  | "vsSpy"
  | "breadth";

const COLUMNS: Array<{
  key: SortKey;
  label: string;
  align: "left" | "right";
}> = [
  { key: "name", label: "Basket", align: "left" },
  { key: "kind", label: "Kind", align: "left" },
  { key: "change1d", label: "1D", align: "right" },
  { key: "change1w", label: "1W", align: "right" },
  { key: "change1m", label: "1M", align: "right" },
  { key: "changeYtd", label: "YTD", align: "right" },
  { key: "vsSpy", label: "vs SPY", align: "right" },
  { key: "breadth", label: "Breadth", align: "right" },
];

function numeric(row: SectorBoardRow, key: SortKey): number | null {
  if (key === "change1d") return row.avg1dPercent;
  if (key === "change1w") return row.avg1wPercent;
  if (key === "change1m") return row.avg1mPercent;
  if (key === "changeYtd") return row.avgYtdPercent;
  if (key === "vsSpy") return row.vsSpy1dPercent;
  if (key === "breadth") return row.breadth;
  return null;
}

function compareRows(
  a: SectorBoardRow,
  b: SectorBoardRow,
  sortKey: SortKey,
  descending: boolean,
): number {
  if (sortKey === "name" || sortKey === "kind") {
    const result = (sortKey === "name" ? a.name : a.kind).localeCompare(
      sortKey === "name" ? b.name : b.kind,
    );
    return descending ? -result : result;
  }
  const left = numeric(a, sortKey);
  const right = numeric(b, sortKey);
  if (left == null && right == null) return a.name.localeCompare(b.name);
  if (left == null) return 1;
  if (right == null) return -1;
  const result = left - right;
  if (result !== 0) return descending ? -result : result;
  return a.name.localeCompare(b.name);
}

export function SectorBoard({
  rows,
  selectedId,
  onSelect,
}: {
  rows: SectorBoardRow[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("change1d");
  const [descending, setDescending] = useState(true);
  const [navFilter, setNavFilter] = useState<NavGroup | "all">("all");

  const visible = useMemo(
    () =>
      rows.filter((row) => {
        if (navFilter !== "all" && row.navGroup !== navFilter) return false;
        if (row.kind === "screen" && row.quotedCount === 0 && row.id !== selectedId) {
          return false;
        }
        return true;
      }),
    [navFilter, rows, selectedId],
  );

  const sorted = useMemo(() => {
    return [...visible].sort((a, b) => compareRows(a, b, sortKey, descending));
  }, [descending, sortKey, visible]);

  function toggleSort(next: SortKey) {
    if (sortKey === next) setDescending((value) => !value);
    else {
      setSortKey(next);
      setDescending(next !== "name" && next !== "kind");
    }
  }

  const SortIcon = descending ? ArrowDown : ArrowUp;

  return (
    <Panel
      title="Rotation board"
      description="Equal-weight constituent performance. Leaders/laggards are the extremes inside each basket."
      bodyClassName="p-0"
    >
      <div className="flex flex-wrap gap-1 border-b border-[var(--ib-border-subtle)] px-2 py-2">
        <button
          type="button"
          aria-pressed={navFilter === "all"}
          onClick={() => setNavFilter("all")}
          className={cn(
            "h-7 rounded-[3px] border px-2 font-mono text-[10px] uppercase tracking-[0.08em]",
            navFilter === "all"
              ? "border-[var(--ib-border-control)] bg-[var(--ib-surface-3)] text-[var(--ib-text-primary)]"
              : "border-transparent text-[var(--ib-text-muted)] hover:text-[var(--ib-text-primary)]",
          )}
        >
          All
        </button>
        {NAV_GROUPS.filter((group) => rows.some((row) => row.navGroup === group)).map(
          (group) => (
            <button
              key={group}
              type="button"
              aria-pressed={navFilter === group}
              onClick={() => setNavFilter(group)}
              className={cn(
                "h-7 rounded-[3px] border px-2 font-mono text-[10px] uppercase tracking-[0.08em]",
                navFilter === group
                  ? "border-[var(--ib-border-control)] bg-[var(--ib-surface-3)] text-[var(--ib-text-primary)]"
                  : "border-transparent text-[var(--ib-text-muted)] hover:text-[var(--ib-text-primary)]",
              )}
            >
              {NAV_GROUP_LABELS[group]}
            </button>
          ),
        )}
      </div>
      <div className="overflow-x-auto terminal-scroll">
        <table
          aria-label="Rotation board"
          className="w-full min-w-[640px] border-collapse text-left text-[12px]"
        >
          <thead>
            <tr className="border-b border-[var(--ib-border-strong)] bg-[var(--ib-surface-2)] font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={
                    sortKey === column.key
                      ? descending
                        ? "descending"
                        : "ascending"
                      : "none"
                  }
                  className={cn(
                    "h-8 px-3 font-medium",
                    column.align === "right" && "text-right",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    aria-pressed={sortKey === column.key}
                    className={cn(
                      "inline-flex items-center gap-1 uppercase tracking-[0.08em] hover:text-[var(--ib-text-primary)]",
                      column.align === "right" && "ml-auto",
                    )}
                  >
                    {column.label}
                    {sortKey === column.key ? (
                      <SortIcon aria-hidden="true" className="size-3" />
                    ) : null}
                  </button>
                </th>
              ))}
              <th className="px-3 font-medium">Leaders</th>
              <th className="px-3 font-medium">Laggards</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length ? (
              sorted.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    "cursor-pointer border-b border-[var(--ib-border-subtle)] hover:bg-[var(--ib-surface-hover)]",
                    selectedId === row.id && "bg-[var(--ib-surface-selected)]",
                  )}
                  onClick={() => onSelect(row.id)}
                >
                  <td className="h-9 px-3 font-medium text-[var(--ib-text-primary)]">{row.name}</td>
                  <td className="px-3 font-mono text-[10px] uppercase text-[var(--ib-text-muted)]">
                    {KIND_LABELS[row.kind]}
                  </td>
                  <td className="px-3 text-right"><PercentText value={row.avg1dPercent} /></td>
                  <td className="px-3 text-right"><PercentText value={row.avg1wPercent} /></td>
                  <td className="px-3 text-right"><PercentText value={row.avg1mPercent} /></td>
                  <td className="px-3 text-right"><PercentText value={row.avgYtdPercent} /></td>
                  <td className="px-3 text-right"><PercentText value={row.vsSpy1dPercent} /></td>
                  <td className="px-3 text-right font-mono text-[var(--ib-text-secondary)]">
                    {row.breadth == null ? "—" : `${row.breadth.toFixed(0)}%`}
                  </td>
                  <td className="px-3 font-mono text-[11px] text-[var(--ib-text-secondary)]">
                    {row.leaders.join(" · ") || "—"}
                  </td>
                  <td className="px-3 font-mono text-[11px] text-[var(--ib-text-secondary)]">
                    {row.laggards.join(" · ") || "—"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-[var(--ib-text-muted)]">
                  No sector or theme baskets to compare.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
