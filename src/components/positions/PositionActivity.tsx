"use client";

import {
  SignedValue,
  SideLabel,
  formatEntryDate,
} from "@/components/positions/display";
import { cn } from "@/lib/utils/cn";
import { formatPrice, formatQuantity } from "@/lib/utils/format";
import type { PositionActivityEvent } from "@/lib/positions/types";

function ActivityKind({ kind }: { kind: PositionActivityEvent["kind"] }) {
  const entry = kind === "entry";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[3px] border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.07em]",
        entry
          ? "border-[color-mix(in_oklab,var(--ib-maroon-500)_48%,transparent)] text-[var(--ib-maroon-300)]"
          : "border-[var(--ib-border-strong)] text-[var(--ib-text-secondary)]",
      )}
    >
      {entry ? "Entry" : "Exit"}
    </span>
  );
}

function ActivityMetric({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 border-b border-[var(--ib-border-subtle)] px-3 py-2 sm:border-b-0 sm:border-r sm:py-2.5 last:border-r-0">
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
        {label}
      </p>
      <div className="mt-1 font-mono text-[13px] leading-5 tabular-nums text-[var(--ib-text-primary)]">
        {children}
      </div>
    </div>
  );
}

export function PositionActivity({
  events,
  selectedId,
  onSelect,
}: {
  events: PositionActivityEvent[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const entries = events.filter((event) => event.kind === "entry").length;
  const exits = events.filter((event) => event.kind === "exit").length;
  const latestEntry = events.find((event) => event.kind === "entry");
  const latestExit = events.find((event) => event.kind === "exit");

  return (
    <div>
      <div className="grid grid-cols-2 border-b border-[var(--ib-border-subtle)] sm:grid-cols-4">
        <ActivityMetric label="Entries">{entries}</ActivityMetric>
        <ActivityMetric label="Exits">{exits}</ActivityMetric>
        <ActivityMetric label="Last entry">
          {formatEntryDate(latestEntry?.date)}
        </ActivityMetric>
        <ActivityMetric label="Last exit">
          {formatEntryDate(latestExit?.date)}
        </ActivityMetric>
      </div>

      <div
        className="w-full min-w-0 overflow-x-auto overscroll-x-contain terminal-scroll"
        tabIndex={0}
        role="region"
        aria-label="Entries and exits"
      >
        <table className="w-full min-w-0 border-collapse text-left text-[12px] tabular-nums md:min-w-[640px]">
          <caption className="sr-only">
            Chronological entries and exits for lots on this book
          </caption>
          <thead>
            <tr className="border-b border-[var(--ib-border-strong)] font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
              <th className="sticky top-0 z-10 h-8 bg-[var(--ib-surface-2)] px-2.5 font-medium">
                Date
              </th>
              <th className="sticky top-0 z-10 h-8 bg-[var(--ib-surface-2)] px-2.5 font-medium">
                Type
              </th>
              <th className="sticky top-0 z-10 h-8 bg-[var(--ib-surface-2)] px-2.5 font-medium">
                Ticker
              </th>
              <th className="sticky top-0 z-10 hidden h-8 bg-[var(--ib-surface-2)] px-2.5 font-medium md:table-cell">
                Side
              </th>
              <th className="sticky top-0 z-10 hidden h-8 bg-[var(--ib-surface-2)] px-2.5 font-medium md:table-cell">
                Qty
              </th>
              <th className="sticky top-0 z-10 h-8 bg-[var(--ib-surface-2)] px-2.5 text-right font-medium">
                Price
              </th>
              <th className="sticky top-0 z-10 h-8 bg-[var(--ib-surface-2)] px-2.5 text-right font-medium">
                P&L
              </th>
              <th className="sticky top-0 z-10 hidden h-8 bg-[var(--ib-surface-2)] px-2.5 text-right font-medium md:table-cell">
                Hold
              </th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-10 text-center text-[13px] text-[var(--ib-text-muted)]"
                >
                  No entries or exits on this book.
                </td>
              </tr>
            ) : (
              events.map((event) => {
                const selected = event.positionId === selectedId;
                return (
                  <tr
                    key={event.id}
                    className={cn(
                      "cursor-pointer border-b border-[var(--ib-border-subtle)] hover:bg-[var(--ib-surface-hover)]",
                      selected && "bg-[var(--ib-surface-selected)]",
                    )}
                    onClick={() =>
                      onSelect(selected ? null : event.positionId)
                    }
                  >
                    <td className="h-[34px] px-2.5 font-mono">
                      {formatEntryDate(event.date)}
                    </td>
                    <td className="px-2.5">
                      <ActivityKind kind={event.kind} />
                    </td>
                    <td className="px-2.5">
                      <button
                        type="button"
                        onClick={(click) => {
                          click.stopPropagation();
                          onSelect(selected ? null : event.positionId);
                        }}
                        className="text-left"
                        aria-pressed={selected}
                      >
                        <span className="block font-mono text-[13px] font-medium text-[var(--ib-text-primary)]">
                          {event.ticker}
                        </span>
                        <span className="block text-[10px] text-[var(--ib-text-muted)]">
                          {event.strategy ?? "—"}
                        </span>
                      </button>
                    </td>
                    <td className="hidden px-2.5 md:table-cell">
                      <SideLabel side={event.side} />
                    </td>
                    <td className="hidden px-2.5 font-mono md:table-cell">
                      {formatQuantity(event.quantity)}
                      {event.multiplier !== 1 ? (
                        <span className="text-[var(--ib-text-muted)]">
                          ×{formatQuantity(event.multiplier)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2.5 text-right font-mono">
                      {formatPrice(event.price, event.ticker)}
                    </td>
                    <td className="px-2.5 text-right">
                      {event.kind === "exit" ? (
                        <>
                          <div>
                            <SignedValue value={event.pnl} compact />
                          </div>
                          <div className="text-[10px]">
                            <SignedValue
                              value={event.returnPercent}
                              kind="percent"
                            />
                          </div>
                        </>
                      ) : (
                        <span className="text-[var(--ib-text-muted)]">—</span>
                      )}
                    </td>
                    <td className="hidden px-2.5 text-right font-mono md:table-cell">
                      {event.holdingDays == null
                        ? "—"
                        : `${event.holdingDays}d`}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
