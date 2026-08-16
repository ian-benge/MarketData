"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import { MoveNarrativeLoader } from "@/components/intel/MoveNarrativeLoader";
import { WhyMovingBadge } from "@/components/news/WhyMovingBadge";
import type { FocusContext } from "@/lib/dashboard/focus-context";
import { cn } from "@/lib/utils/cn";
import {
  formatPrice,
  formatRelativeVolume,
  formatSignedPercent,
  marketToneClass,
} from "@/lib/utils/format";

export function FocusContextPanel({
  focus,
  onSelectSymbol,
}: {
  focus: FocusContext | null;
  onSelectSymbol?: (ticker: string) => void;
}) {
  if (!focus) {
    return (
      <Panel
        title="Name in focus"
        description="Select a ticker from the tape, movers, or coverage to inspect why it is moving."
      >
        <p className="text-[12px] text-[var(--ib-text-muted)]">No symbol selected.</p>
      </Panel>
    );
  }

  const whyHref = `/news?q=${encodeURIComponent(`why is ${focus.ticker} moving today`)}`;
  const askHref = `/news?ask=${encodeURIComponent(`Why is ${focus.ticker} moving, and does it matter for coverage or the book?`)}`;

  return (
    <Panel
      title="Name in focus"
      description="Deterministic quote and attribution first. Desk narrative is grounded in the same evidence pack."
      bodyClassName="space-y-3 p-3"
      actions={
        <div className="flex flex-wrap justify-end gap-1.5">
          <Link
            href={whyHref}
            className="rounded-[3px] border border-[var(--ib-border-subtle)] px-2 py-1 text-[10px] text-[var(--ib-text-secondary)] hover:text-[var(--ib-text-primary)]"
          >
            Why moving
          </Link>
          <Link
            href={`/watchlists?ticker=${encodeURIComponent(focus.ticker)}`}
            className="rounded-[3px] border border-[var(--ib-border-subtle)] px-2 py-1 text-[10px] text-[var(--ib-text-secondary)] hover:text-[var(--ib-text-primary)]"
          >
            Coverage
          </Link>
          <Link
            href="/positions"
            className="rounded-[3px] border border-[var(--ib-border-subtle)] px-2 py-1 text-[10px] text-[var(--ib-text-secondary)] hover:text-[var(--ib-text-primary)]"
          >
            Positions
          </Link>
          <Link
            href={askHref}
            className="rounded-[3px] border border-[var(--ib-border-subtle)] px-2 py-1 text-[10px] text-[var(--ib-maroon-300)] hover:text-[var(--ib-text-primary)]"
          >
            Ask desk
          </Link>
        </div>
      }
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-mono text-xl font-medium tracking-[-0.03em] text-[var(--ib-text-primary)]">
            {focus.ticker}
          </p>
          {focus.name ? (
            <p className="text-[11px] text-[var(--ib-text-muted)]">{focus.name}</p>
          ) : null}
        </div>
        <div className="text-right">
          <p className="font-mono text-[16px] text-[var(--ib-text-primary)]">
            {formatPrice(focus.last, focus.ticker)}
          </p>
          <p className={cn("font-mono text-[12px]", marketToneClass(focus.changePercent))}>
            {formatSignedPercent(focus.changePercent)}
            <span className="ml-2 text-[10px] text-[var(--ib-text-muted)]">
              {formatRelativeVolume(focus.relativeVolume)} rvol
            </span>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {focus.inBook ? <Badge tone="warn">In book</Badge> : null}
        <WhyMovingBadge explanation={focus.explanation} href={whyHref} />
      </div>

      {focus.membership.length ? (
        <ul className="flex flex-wrap gap-1">
          {focus.membership.map((row) => (
            <li key={row.id}>
              <Link
                href={
                  row.kind === "watchlist"
                    ? `/watchlists?listId=${encodeURIComponent(row.id)}`
                    : `/watchlists?sectorId=${encodeURIComponent(row.id)}`
                }
                className="inline-flex rounded-[3px] border border-[var(--ib-border-subtle)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ib-text-secondary)] hover:border-[var(--ib-border-control)] hover:text-[var(--ib-text-primary)]"
              >
                {row.kind} · {row.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <MoveNarrativeLoader ticker={focus.ticker} explanation={focus.explanation ?? undefined} />

      {focus.headlines.length ? (
        <ul className="space-y-1.5 border-t border-[var(--ib-border-subtle)] pt-2">
          {focus.headlines.map((item) => (
            <li key={item.id}>
              <a
                href={item.url || whyHref}
                target={item.url ? "_blank" : undefined}
                rel={item.url ? "noreferrer" : undefined}
                className="block text-[12px] leading-4 text-[var(--ib-text-secondary)] hover:text-[var(--ib-text-primary)]"
              >
                {item.title}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-t border-[var(--ib-border-subtle)] pt-2 text-[11px] text-[var(--ib-text-muted)]">
          No ticker-tagged headline in this snapshot window.
        </p>
      )}

      {focus.relatedTickers.length ? (
        <p className="text-[11px] text-[var(--ib-text-muted)]">
          Related{" "}
          {focus.relatedTickers.map((ticker, index) => (
            <span key={ticker}>
              {index ? " · " : null}
              <button
                type="button"
                className="font-mono text-[var(--ib-maroon-300)] hover:underline"
                onClick={() => onSelectSymbol?.(ticker)}
              >
                {ticker}
              </button>
            </span>
          ))}
        </p>
      ) : null}
    </Panel>
  );
}
