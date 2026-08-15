"use client";

import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { FlagPills, PercentText, ToneIcon } from "@/components/watchlists/display";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils/cn";
import {
  formatCompactCurrency,
  formatPrice,
  formatRelativeVolume,
  formatVolume,
} from "@/lib/utils/format";
import {
  ROLE_LABELS,
  SECURITY_TYPE_LABELS,
  TIER_LABELS,
  isLeveragedProduct,
} from "@/lib/watchlists/taxonomy";
import type {
  CoverageColumnSet,
  CoverageGroupMode,
  CoverageQuote,
} from "@/lib/watchlists/types";
import type { MoveExplanation } from "@/lib/intelligence/types";
import { WhyMovingBadge } from "@/components/news/WhyMovingBadge";

type SortKey =
  | "ticker"
  | "name"
  | "type"
  | "role"
  | "last"
  | "change1d"
  | "changeOpen"
  | "pre"
  | "ah"
  | "change1w"
  | "change1m"
  | "changeYtd"
  | "vsSpy"
  | "vsBench"
  | "vsGroup"
  | "rvol"
  | "marketCap"
  | "volume"
  | "vol";

function numeric(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? Number.NEGATIVE_INFINITY : value;
}

const COLUMNS: Array<{
  key: SortKey;
  label: string;
  align: "left" | "right";
  sets: CoverageColumnSet[];
}> = [
  { key: "ticker", label: "Symbol", align: "left", sets: ["tape", "performance", "identity", "full"] },
  { key: "name", label: "Name", align: "left", sets: ["identity", "full"] },
  { key: "type", label: "Type", align: "left", sets: ["identity", "full"] },
  { key: "role", label: "Role", align: "left", sets: ["identity"] },
  { key: "last", label: "Last", align: "right", sets: ["tape", "performance", "full"] },
  { key: "change1d", label: "1D", align: "right", sets: ["tape", "performance", "full"] },
  { key: "changeOpen", label: "Open", align: "right", sets: ["tape", "full"] },
  { key: "pre", label: "Pre", align: "right", sets: ["tape", "full"] },
  { key: "ah", label: "AH", align: "right", sets: ["tape", "full"] },
  { key: "change1w", label: "1W", align: "right", sets: ["performance", "full"] },
  { key: "change1m", label: "1M", align: "right", sets: ["performance", "full"] },
  { key: "changeYtd", label: "YTD", align: "right", sets: ["performance", "full"] },
  { key: "vsSpy", label: "vs SPY", align: "right", sets: ["performance", "full"] },
  { key: "vsBench", label: "vs bmk", align: "right", sets: ["performance", "full"] },
  { key: "vsGroup", label: "vs grp", align: "right", sets: ["performance", "full"] },
  { key: "rvol", label: "RVOL", align: "right", sets: ["tape", "full"] },
  { key: "vol", label: "Vol %", align: "right", sets: ["full"] },
  { key: "marketCap", label: "Mkt cap", align: "right", sets: ["full"] },
  { key: "volume", label: "Volume", align: "right", sets: ["tape", "full"] },
];

function groupLabel(mode: CoverageGroupMode, row: CoverageQuote) {
  if (mode === "role") return row.role ? ROLE_LABELS[row.role] : "Unassigned role";
  if (mode === "tier") return row.tier ? TIER_LABELS[row.tier] : "Unassigned tier";
  if (mode === "type") return SECURITY_TYPE_LABELS[row.securityType];
  if (mode === "change") {
    if (row.change1dPercent == null) return "Unquoted";
    if (row.change1dPercent > 0) return "Advancers";
    if (row.change1dPercent < 0) return "Decliners";
    return "Unchanged";
  }
  return "";
}

export function CoverageTable({
  rows,
  columnSet,
  groupMode,
  query,
  selectedTicker,
  onSelect,
  explanations,
}: {
  rows: CoverageQuote[];
  columnSet: CoverageColumnSet;
  groupMode: CoverageGroupMode;
  query: string;
  selectedTicker: string | null;
  onSelect: (ticker: string) => void;
  explanations?: MoveExplanation[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("change1d");
  const [descending, setDescending] = useState(true);
  const columns = COLUMNS.filter((column) => column.sets.includes(columnSet));
  const whyByTicker = useMemo(() => {
    const map = new Map<string, MoveExplanation>();
    for (const row of explanations ?? []) map.set(row.ticker.toUpperCase(), row);
    return map;
  }, [explanations]);

  const filtered = useMemo(() => {
    const needle = query.trim().toUpperCase();
    return rows.filter((row) => {
      if (!needle) return true;
      return (
        row.ticker.includes(needle) ||
        (row.name ?? "").toUpperCase().includes(needle) ||
        (row.sectorName ?? "").toUpperCase().includes(needle) ||
        row.tags.some((tag) => tag.toUpperCase().includes(needle))
      );
    });
  }, [query, rows]);

  const sorted = useMemo(() => {
    const next = [...filtered];
    next.sort((a, b) => {
      let result = 0;
      if (sortKey === "ticker") result = a.ticker.localeCompare(b.ticker);
      if (sortKey === "name") result = (a.name ?? "").localeCompare(b.name ?? "");
      if (sortKey === "type") {
        result = a.securityType.localeCompare(b.securityType);
      }
      if (sortKey === "role") result = (a.role ?? "").localeCompare(b.role ?? "");
      if (sortKey === "last") result = numeric(a.last) - numeric(b.last);
      if (sortKey === "change1d") result = numeric(a.change1dPercent) - numeric(b.change1dPercent);
      if (sortKey === "changeOpen") {
        result = numeric(a.changeFromOpenPercent) - numeric(b.changeFromOpenPercent);
      }
      if (sortKey === "pre") {
        result = numeric(a.preMarketChangePercent) - numeric(b.preMarketChangePercent);
      }
      if (sortKey === "ah") {
        result = numeric(a.afterHoursChangePercent) - numeric(b.afterHoursChangePercent);
      }
      if (sortKey === "change1w") result = numeric(a.change1wPercent) - numeric(b.change1wPercent);
      if (sortKey === "change1m") result = numeric(a.change1mPercent) - numeric(b.change1mPercent);
      if (sortKey === "changeYtd") result = numeric(a.changeYtdPercent) - numeric(b.changeYtdPercent);
      if (sortKey === "vsSpy") result = numeric(a.vsSpy1dPercent) - numeric(b.vsSpy1dPercent);
      if (sortKey === "vsBench") {
        result = numeric(a.vsBenchmark1dPercent) - numeric(b.vsBenchmark1dPercent);
      }
      if (sortKey === "vsGroup") result = numeric(a.vsGroup1dPercent) - numeric(b.vsGroup1dPercent);
      if (sortKey === "rvol") result = numeric(a.relativeVolume) - numeric(b.relativeVolume);
      if (sortKey === "marketCap") result = numeric(a.marketCap) - numeric(b.marketCap);
      if (sortKey === "volume") result = numeric(a.volume) - numeric(b.volume);
      if (sortKey === "vol") result = numeric(a.volatility) - numeric(b.volatility);
      return descending ? -result : result;
    });
    return next;
  }, [descending, filtered, sortKey]);

  const grouped = useMemo(() => {
    if (groupMode === "none") return [{ label: "", rows: sorted }];
    const map = new Map<string, CoverageQuote[]>();
    for (const row of sorted) {
      const label = groupLabel(groupMode, row);
      const current = map.get(label) ?? [];
      current.push(row);
      map.set(label, current);
    }
    return [...map.entries()].map(([label, groupRows]) => ({ label, rows: groupRows }));
  }, [groupMode, sorted]);

  function toggleSort(next: SortKey) {
    if (sortKey === next) setDescending((value) => !value);
    else {
      setSortKey(next);
      setDescending(next !== "ticker");
    }
  }

  const SortIcon = descending ? ArrowDown : ArrowUp;

  return (
    <div
      className="w-full min-w-0 overflow-x-auto terminal-scroll"
      tabIndex={0}
      role="region"
      aria-label="Coverage table"
    >
      <table className="w-full min-w-[720px] border-collapse text-left text-[12px]">
        <caption className="sr-only">
          Coverage names with last price, session and multi-horizon performance, relative
          volume, and flags. Select a row to inspect.
        </caption>
        <thead>
          <tr className="border-b border-[var(--ib-border-strong)] bg-[var(--ib-surface-2)] font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
            {columns.map((column) => (
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
                  "h-8 px-2.5 font-medium",
                  column.align === "right" && "text-right",
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleSort(column.key)}
                  aria-pressed={sortKey === column.key}
                  className={cn(
                    "inline-flex items-center gap-1 uppercase tracking-[0.08em]",
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
            <th className="h-8 px-2.5 font-medium">Why</th>
          </tr>
        </thead>
        <tbody>
          {grouped.some((group) => group.rows.length) ? (
            grouped.map((group) => (
              <GroupRows
                key={group.label || "all"}
                label={group.label}
                rows={group.rows}
                columns={columns}
                selectedTicker={selectedTicker}
                onSelect={onSelect}
                colSpan={columns.length + 1}
                whyByTicker={whyByTicker}
              />
            ))
          ) : (
            <tr>
              <td
                colSpan={columns.length + 1}
                className="px-3 py-10 text-center text-[13px] text-[var(--ib-text-muted)]"
              >
                No names match the current coverage filter.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({
  label,
  rows,
  columns,
  selectedTicker,
  onSelect,
  colSpan,
  whyByTicker,
}: {
  label: string;
  rows: CoverageQuote[];
  columns: typeof COLUMNS;
  selectedTicker: string | null;
  onSelect: (ticker: string) => void;
  colSpan: number;
  whyByTicker: Map<string, MoveExplanation>;
}) {
  return (
    <>
      {label ? (
        <tr className="border-b border-[var(--ib-border-subtle)] bg-[var(--ib-surface-2)]">
          <td colSpan={colSpan} className="px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
            {label}
            <span className="ml-2 text-[var(--ib-text-secondary)]">{rows.length}</span>
          </td>
        </tr>
      ) : null}
      {rows.map((row) => (
        <tr
          key={row.ticker}
          className={cn(
            "border-b border-[var(--ib-border-subtle)] last:border-0 hover:bg-[var(--ib-surface-hover)]",
            selectedTicker === row.ticker && "bg-[var(--ib-surface-selected)]",
          )}
        >
          {columns.map((column) => (
            <td
              key={column.key}
              className={cn(
                "h-9 px-2.5",
                column.align === "right" && "text-right",
              )}
            >
              <Cell
                column={column.key}
                row={row}
                selected={selectedTicker === row.ticker}
                onSelect={onSelect}
              />
            </td>
          ))}
          <td className="max-w-[12rem] px-2.5">
            <WhyMovingBadge
              explanation={whyByTicker.get(row.ticker)}
              compact
              href={`/news?q=${encodeURIComponent(`why is ${row.ticker} moving today`)}`}
            />
          </td>
        </tr>
      ))}
    </>
  );
}

function Cell({
  column,
  row,
  selected,
  onSelect,
}: {
  column: SortKey;
  row: CoverageQuote;
  selected: boolean;
  onSelect: (ticker: string) => void;
}) {
  if (column === "ticker") {
    return (
      <button
        type="button"
        onClick={() => onSelect(row.ticker)}
        className="inline-flex max-w-full items-center gap-1.5 font-mono font-medium text-[var(--ib-text-primary)] hover:text-[var(--ib-maroon-300)]"
        aria-expanded={selected}
      >
        <ChevronRight
          aria-hidden="true"
          className={cn("size-3 shrink-0 transition", selected && "rotate-90")}
        />
        {row.ticker}
        {row.last == null ? (
          <Badge tone="neutral" className="font-sans text-[9px] font-normal uppercase">
            Unquoted
          </Badge>
        ) : (
          <ToneIcon value={row.change1dPercent} />
        )}
        {row.securityType !== "common_stock" && row.securityType !== "unknown" ? (
          <Badge tone="info" className="font-sans text-[9px] font-normal uppercase">
            {SECURITY_TYPE_LABELS[row.securityType]}
          </Badge>
        ) : null}
        {isLeveragedProduct(row) ? (
          <Badge tone="warn" className="font-sans text-[9px] font-normal uppercase">
            {row.isInverse ? "Inv" : `${row.leverageMultiple}x`}
          </Badge>
        ) : null}
        {row.role ? (
          <Badge tone="neutral" className="font-sans text-[9px] font-normal uppercase">
            {ROLE_LABELS[row.role]}
          </Badge>
        ) : null}
        <FlagPills flags={row.flags} />
      </button>
    );
  }
  if (column === "name") {
    return (
      <span className="truncate text-[11px] text-[var(--ib-text-secondary)]">
        {row.name ?? "—"}
      </span>
    );
  }
  if (column === "type") {
    return (
      <span className="font-mono text-[10px] uppercase text-[var(--ib-text-muted)]">
        {SECURITY_TYPE_LABELS[row.securityType]}
      </span>
    );
  }
  if (column === "role") {
    return (
      <span className="font-mono text-[10px] uppercase text-[var(--ib-text-muted)]">
        {row.role ? ROLE_LABELS[row.role] : "—"}
      </span>
    );
  }
  if (column === "last") {
    return (
      <span className="font-mono text-[var(--ib-text-primary)]">
        {formatPrice(row.last, row.ticker)}
      </span>
    );
  }
  if (column === "change1d") return <PercentText value={row.change1dPercent} />;
  if (column === "changeOpen") return <PercentText value={row.changeFromOpenPercent} />;
  if (column === "pre") return <PercentText value={row.preMarketChangePercent} />;
  if (column === "ah") return <PercentText value={row.afterHoursChangePercent} />;
  if (column === "change1w") return <PercentText value={row.change1wPercent} />;
  if (column === "change1m") return <PercentText value={row.change1mPercent} />;
  if (column === "changeYtd") return <PercentText value={row.changeYtdPercent} />;
  if (column === "vsSpy") return <PercentText value={row.vsSpy1dPercent} />;
  if (column === "vsBench") return <PercentText value={row.vsBenchmark1dPercent} />;
  if (column === "vsGroup") return <PercentText value={row.vsGroup1dPercent} />;
  if (column === "rvol") {
    return (
      <span className="font-mono text-[var(--ib-text-secondary)]">
        {formatRelativeVolume(row.relativeVolume)}
      </span>
    );
  }
  if (column === "vol") {
    return (
      <span className="font-mono text-[var(--ib-text-secondary)]">
        {row.volatility == null ? "—" : `${row.volatility.toFixed(1)}`}
      </span>
    );
  }
  if (column === "marketCap") {
    return (
      <span className="font-mono text-[var(--ib-text-secondary)]">
        {formatCompactCurrency(row.marketCap)}
      </span>
    );
  }
  if (column === "volume") {
    return (
      <span className="font-mono text-[var(--ib-text-secondary)]">
        {formatVolume(row.volume)}
      </span>
    );
  }
  return <Badge tone="neutral">—</Badge>;
}
