"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import type { DashboardBookImpact } from "@/lib/dashboard/book-impact";
import { cn } from "@/lib/utils/cn";
import {
  formatSignedCurrency,
  formatSignedPercent,
  marketToneClass,
} from "@/lib/utils/format";

export function BookImpactStrip({
  book,
  onSelectSymbol,
}: {
  book: DashboardBookImpact;
  onSelectSymbol?: (ticker: string) => void;
}) {
  const empty = book.openCount === 0;
  const unavailable = book.persistence === "unavailable";
  const description = book.ownerLocked
    ? "Open names are listed. Account value and P&L stay locked until the book is unlocked on Positions."
    : unavailable
      ? "Position blotter is not connected in this environment. No P&L was invented."
      : empty
        ? "Active book has no open lots. Session P&L appears when the blotter has marks."
        : "Session P&L from cached marks. Unexplained names use Material News attribution, not a model guess.";

  return (
    <Panel
      id="book-impact"
      title="Book impact"
      description={description}
      bodyClassName="p-3"
      actions={
        <Link
          href="/positions"
          className="text-[11px] font-medium text-[var(--ib-maroon-300)] hover:underline"
        >
          Open Positions
        </Link>
      }
    >
      {book.error ? (
        <p className="mb-2 text-[12px] text-[var(--state-warning)]">{book.error}</p>
      ) : null}
      {empty && !book.error ? (
        <p className="text-[12px] text-[var(--ib-text-muted)]">
          {unavailable
            ? "Book unavailable — open Positions after persistence is connected."
            : "No open lots in the active book."}
        </p>
      ) : empty ? null : (
        <div className="flex flex-wrap items-stretch gap-3">
          <dl className="grid min-w-[12rem] flex-1 grid-cols-3 gap-2 font-mono text-[11px]">
            <div className="rounded-[4px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-inset)] px-2 py-1.5">
              <dt className="text-[9px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                Day P&L
              </dt>
              <dd className={cn("mt-0.5 text-[13px]", marketToneClass(book.dayPnl))}>
                {book.ownerLocked ? "Locked" : formatSignedCurrency(book.dayPnl, { compact: true })}
              </dd>
            </div>
            <div className="rounded-[4px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-inset)] px-2 py-1.5">
              <dt className="text-[9px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                Day %
              </dt>
              <dd className={cn("mt-0.5 text-[13px]", marketToneClass(book.dayPercent))}>
                {book.ownerLocked ? "Locked" : formatSignedPercent(book.dayPercent)}
              </dd>
            </div>
            <div className="rounded-[4px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-inset)] px-2 py-1.5">
              <dt className="text-[9px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                Open
              </dt>
              <dd className="mt-0.5 text-[13px] text-[var(--ib-text-primary)]">
                {book.openCount}
                {book.unexplainedTickers.length ? (
                  <span className="ml-1 text-[10px] text-[var(--state-warning)]">
                    · {book.unexplainedTickers.length} unexplained
                  </span>
                ) : null}
              </dd>
            </div>
          </dl>
          {book.contributors.length ? (
            <ul className="flex min-w-0 flex-[2] flex-wrap gap-1.5">
              {book.contributors.map((row) => (
                <li key={row.ticker}>
                  <button
                    type="button"
                    onClick={() => onSelectSymbol?.(row.ticker)}
                    className="inline-flex items-center gap-1.5 rounded-[3px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-2)] px-2 py-1 hover:border-[var(--ib-border-control)]"
                    aria-label={`Select ${row.ticker}`}
                  >
                    <span className="font-mono text-[11px] font-semibold text-[var(--ib-text-primary)]">
                      {row.ticker}
                    </span>
                    <span className="font-mono text-[10px] uppercase text-[var(--ib-text-muted)]">
                      {row.side}
                    </span>
                    <span className={cn("font-mono text-[11px]", marketToneClass(row.dayPercent))}>
                      {book.ownerLocked ? "—" : formatSignedPercent(row.dayPercent)}
                    </span>
                    {row.unexplained ? <Badge tone="warn">Unexplained</Badge> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-[var(--ib-text-muted)]">
              No open lots in the active book.
            </p>
          )}
        </div>
      )}
      {book.usingFixtures ? (
        <p className="mt-2 text-[10px] text-[var(--ib-text-muted)]">DEMO fixture blotter.</p>
      ) : null}
    </Panel>
  );
}
