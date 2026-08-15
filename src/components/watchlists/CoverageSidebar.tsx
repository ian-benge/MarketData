"use client";

import { useState, type ReactNode } from "react";
import { Archive, ChevronDown, ChevronUp, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { tabListKeyDown } from "@/components/positions/tablist-keyboard";
import { cn } from "@/lib/utils/cn";
import { formatSignedPercent, marketTone } from "@/lib/utils/format";
import {
  KIND_LABELS,
  NAV_GROUPS,
  NAV_GROUP_LABELS,
  PURPOSE_LABELS,
} from "@/lib/watchlists/taxonomy";
import type {
  CoverageSector,
  CoverageSelection,
  CoverageWatchlist,
  NavGroup,
  SectorBoardRow,
} from "@/lib/watchlists/types";

function ReorderControls({
  name,
  onMove,
}: {
  name: string;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <div className="flex shrink-0 flex-col justify-center pr-1">
      <button
        type="button"
        className="grid size-6 place-items-center text-[var(--ib-text-muted)] hover:text-[var(--ib-text-primary)]"
        aria-label={`Move ${name} up`}
        onClick={() => onMove(-1)}
      >
        <ChevronUp aria-hidden="true" className="size-3" />
      </button>
      <button
        type="button"
        className="grid size-6 place-items-center text-[var(--ib-text-muted)] hover:text-[var(--ib-text-primary)]"
        aria-label={`Move ${name} down`}
        onClick={() => onMove(1)}
      >
        <ChevronDown aria-hidden="true" className="size-3" />
      </button>
    </div>
  );
}

function MiniChange({ value }: { value: number | null | undefined }) {
  const tone = marketTone(value);
  return (
    <span
      className={cn(
        "font-mono text-[10px] tabular-nums",
        tone === "positive"
          ? "text-[var(--market-positive)]"
          : tone === "negative"
            ? "text-[var(--market-negative)]"
            : "text-[var(--ib-text-muted)]",
      )}
    >
      {formatSignedPercent(value)}
    </span>
  );
}

function GroupBlock({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <>
      <li
        role="presentation"
        className="sticky top-0 z-[1] border-b border-[var(--ib-border-subtle)] bg-[var(--ib-surface-2)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]"
      >
        {label}
      </li>
      {children}
    </>
  );
}

function PaneButton({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-[4px] border px-2.5 text-[12px] font-medium",
        pressed
          ? "border-[var(--ib-border-control)] bg-[var(--ib-surface-3)] text-[var(--ib-text-primary)]"
          : "border-transparent text-[var(--ib-text-muted)] hover:text-[var(--ib-text-primary)]",
      )}
    >
      {children}
    </button>
  );
}

export function CoverageSidebar({
  watchlists,
  sectors,
  selection,
  onSelect,
  showArchived,
  onToggleArchived,
  sectorBoard,
  canEditWatchlists,
  canEditSectors,
  onNewWatchlist,
  onNewSector,
  onEditWatchlist,
  canManageWatchlist,
  onEditSector,
  listFilter,
  onListFilter,
  canReorder,
  onMoveWatchlist,
  onMoveSector,
}: {
  watchlists: CoverageWatchlist[];
  sectors: CoverageSector[];
  selection: CoverageSelection | null;
  onSelect: (selection: CoverageSelection) => void;
  showArchived: boolean;
  onToggleArchived: () => void;
  sectorBoard: SectorBoardRow[];
  canEditWatchlists: boolean;
  canEditSectors: boolean;
  onNewWatchlist: () => void;
  onNewSector: () => void;
  onEditWatchlist?: (list: CoverageWatchlist) => void;
  canManageWatchlist?: (list: CoverageWatchlist) => boolean;
  onEditSector?: (sector: CoverageSector) => void;
  listFilter: "all" | "shared" | "personal";
  onListFilter: (value: "all" | "shared" | "personal") => void;
  canReorder?: boolean;
  onMoveWatchlist?: (id: string, direction: -1 | 1) => void;
  onMoveSector?: (id: string, direction: -1 | 1) => void;
}) {
  const [paneOverride, setPaneOverride] = useState<{
    forId: string | null;
    pane: "watchlists" | "sectors";
  } | null>(null);
  const selectedId = selection?.id ?? null;
  const selectedType = selection?.type;
  const pane =
    paneOverride && paneOverride.forId === selectedId
      ? paneOverride.pane
      : selectedType === "sector"
        ? "sectors"
        : "watchlists";

  function showPane(next: "watchlists" | "sectors") {
    setPaneOverride({ forId: selectedId, pane: next });
  }

  const lists = watchlists.filter((list) => {
    if (!showArchived && list.archivedAt) return false;
    if (listFilter === "shared") return list.visibility === "shared";
    if (listFilter === "personal") return list.visibility === "personal";
    return true;
  });
  const groups = sectors.filter((sector) => showArchived || !sector.archivedAt);
  const groupedSectors = NAV_GROUPS.map((group) => {
    const items = groups.filter((sector) => sector.navGroup === group);
    const parents = items.filter(
      (sector) => !sector.parentId || !items.some((row) => row.id === sector.parentId),
    );
    const ordered: CoverageSector[] = [];
    for (const parent of parents) {
      ordered.push(parent);
      ordered.push(...items.filter((child) => child.parentId === parent.id));
    }
    for (const item of items) {
      if (!ordered.includes(item)) ordered.push(item);
    }
    return { group, items: ordered };
  }).filter((entry) => entry.items.length);
  const avgById = new Map(sectorBoard.map((row) => [row.id, row.avg1dPercent]));
  const listIds = lists.map((list) => `watchlist:${list.id}`);
  const sectorIds = groupedSectors.flatMap((entry) =>
    entry.items.map((sector) => `sector:${sector.id}`),
  );
  const showingWatchlists = pane === "watchlists";

  return (
    <Panel bodyClassName="p-0">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--ib-border-subtle)] px-2 py-2">
        <div className="flex min-w-0 flex-wrap gap-1">
          <PaneButton
            pressed={showingWatchlists}
            onClick={() => showPane("watchlists")}
          >
            Watchlists
            <span className="font-mono text-[10px] text-[var(--ib-text-muted)]">
              {lists.length}
            </span>
          </PaneButton>
          <PaneButton
            pressed={!showingWatchlists}
            onClick={() => showPane("sectors")}
          >
            Sectors & themes
            <span className="font-mono text-[10px] text-[var(--ib-text-muted)]">
              {groups.length}
            </span>
          </PaneButton>
        </div>
        {showingWatchlists ? (
          canEditWatchlists ? (
            <Button size="sm" variant="primary" onClick={onNewWatchlist}>
              <Plus aria-hidden="true" className="size-3.5" />
              New
            </Button>
          ) : null
        ) : canEditSectors ? (
          <Button size="sm" onClick={onNewSector}>
            <Plus aria-hidden="true" className="size-3.5" />
            Theme
          </Button>
        ) : null}
      </div>
      <p className="border-b border-[var(--ib-border-subtle)] px-3 py-2 text-[11px] leading-4 text-[var(--ib-text-muted)]">
        {showingWatchlists
          ? "Shared firm coverage and personal desks."
          : "Compare baskets, leadership, and rotation."}
      </p>
      <div className="flex flex-wrap gap-1 border-b border-[var(--ib-border-subtle)] px-2 py-2">
        {showingWatchlists
          ? (["all", "shared", "personal"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onListFilter(value)}
                aria-pressed={listFilter === value}
                className={cn(
                  "h-7 rounded-[3px] border px-2 font-mono text-[10px] uppercase tracking-[0.08em]",
                  listFilter === value
                    ? "border-[var(--ib-border-control)] bg-[var(--ib-surface-3)] text-[var(--ib-text-primary)]"
                    : "border-transparent text-[var(--ib-text-muted)] hover:text-[var(--ib-text-primary)]",
                )}
              >
                {value}
              </button>
            ))
          : null}
        <button
          type="button"
          onClick={onToggleArchived}
          aria-pressed={showArchived}
          className="ml-auto inline-flex h-7 items-center gap-1 px-2 text-[10px] text-[var(--ib-text-muted)] hover:text-[var(--ib-text-primary)]"
        >
          <Archive aria-hidden="true" className="size-3" />
          Archived
        </button>
      </div>

      {showingWatchlists ? (
        <ul
          role="tablist"
          aria-label="Watchlists"
          className="h-72 overflow-y-auto overscroll-contain terminal-scroll"
          onKeyDown={(event) =>
            tabListKeyDown(event, {
              ids: listIds,
              selectedId: selection?.type === "watchlist" ? `watchlist:${selection.id}` : "",
              onSelect: (id) => onSelect({ type: "watchlist", id: id.slice("watchlist:".length) }),
            })
          }
        >
          {lists.length ? (
            lists.map((list) => {
              const selected =
                selection?.type === "watchlist" && selection.id === list.id;
              return (
                <li key={list.id} className="flex items-stretch">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => onSelect({ type: "watchlist", id: list.id })}
                    className={cn(
                      "flex min-w-0 flex-1 items-start justify-between gap-2 px-3 py-2 text-left hover:bg-[var(--ib-surface-hover)]",
                      selected && "bg-[var(--ib-surface-selected)]",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-[var(--ib-text-primary)]">
                        {list.name}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1">
                        {list.isDefault ? <Badge tone="info">Default</Badge> : null}
                        {list.visibility === "personal" ? (
                          <Badge tone="brand">Personal</Badge>
                        ) : (
                          <Badge tone="neutral">Shared</Badge>
                        )}
                        {list.purpose !== "general" ? (
                          <Badge tone="info">{PURPOSE_LABELS[list.purpose]}</Badge>
                        ) : null}
                        {list.archivedAt ? <Badge tone="warn">Archived</Badge> : null}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-[var(--ib-text-muted)]">
                      {list.symbols.length}
                    </span>
                  </button>
                  {onEditWatchlist && canManageWatchlist?.(list) ? (
                    <button
                      type="button"
                      className="grid size-8 shrink-0 place-items-center self-center text-[var(--ib-text-muted)] hover:text-[var(--ib-text-primary)]"
                      aria-label={`Edit ${list.name}`}
                      onClick={() => onEditWatchlist(list)}
                    >
                      <Pencil aria-hidden="true" className="size-3.5" />
                    </button>
                  ) : null}
                  {canReorder && onMoveWatchlist && !list.archivedAt ? (
                    <ReorderControls
                      name={list.name}
                      onMove={(direction) => onMoveWatchlist(list.id, direction)}
                    />
                  ) : null}
                </li>
              );
            })
          ) : (
            <li className="px-3 py-6 text-center text-[12px] text-[var(--ib-text-muted)]">
              No watchlists in this filter.
            </li>
          )}
        </ul>
      ) : (
        <ul
          role="tablist"
          aria-label="Sectors and themes"
          className="h-[min(40rem,70vh)] overflow-y-auto overscroll-contain terminal-scroll"
          onKeyDown={(event) =>
            tabListKeyDown(event, {
              ids: sectorIds,
              selectedId: selection?.type === "sector" ? `sector:${selection.id}` : "",
              onSelect: (id) => onSelect({ type: "sector", id: id.slice("sector:".length) }),
            })
          }
        >
          {groupedSectors.length ? (
            groupedSectors.map((entry) => (
              <GroupBlock
                key={entry.group}
                label={NAV_GROUP_LABELS[entry.group as NavGroup]}
              >
                {entry.items.map((sector) => {
                  const selected =
                    selection?.type === "sector" && selection.id === sector.id;
                  return (
                    <li key={sector.id} className="flex items-stretch">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => onSelect({ type: "sector", id: sector.id })}
                        className={cn(
                          "flex min-w-0 flex-1 items-start justify-between gap-2 px-3 py-2 text-left hover:bg-[var(--ib-surface-hover)]",
                          sector.parentId && "pl-5",
                          selected && "bg-[var(--ib-surface-selected)]",
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-medium text-[var(--ib-text-primary)]">
                            {sector.name}
                          </span>
                          <span className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                            {KIND_LABELS[sector.kind]}
                            {sector.screenKey ? " · live" : ""}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-0.5">
                          <MiniChange value={avgById.get(sector.id)} />
                          <span className="font-mono text-[10px] text-[var(--ib-text-muted)]">
                            {sector.kind === "screen"
                              ? (sectorBoard.find((row) => row.id === sector.id)?.symbolCount ?? 0)
                              : sector.symbols.length}
                          </span>
                        </span>
                      </button>
                      {onEditSector && canEditSectors ? (
                        <button
                          type="button"
                          className="grid size-8 shrink-0 place-items-center self-center text-[var(--ib-text-muted)] hover:text-[var(--ib-text-primary)]"
                          aria-label={`Edit ${sector.name}`}
                          onClick={() => onEditSector(sector)}
                        >
                          <Pencil aria-hidden="true" className="size-3.5" />
                        </button>
                      ) : null}
                      {canReorder && onMoveSector && !sector.archivedAt ? (
                        <ReorderControls
                          name={sector.name}
                          onMove={(direction) => onMoveSector(sector.id, direction)}
                        />
                      ) : null}
                    </li>
                  );
                })}
              </GroupBlock>
            ))
          ) : (
            <li className="px-3 py-6 text-center text-[12px] text-[var(--ib-text-muted)]">
              No sectors or themes configured.
            </li>
          )}
        </ul>
      )}
    </Panel>
  );
}
