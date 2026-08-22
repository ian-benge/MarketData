"use client";

import { cn } from "@/lib/utils/cn";

const JUMPS = [
  { href: "#market-pulse", label: "Pulse" },
  { href: "#book-impact", label: "Book" },
  { href: "#name-in-focus", label: "Focus" },
  { href: "#watchlist", label: "Coverage" },
  { href: "#earnings-calendar", label: "Earnings" },
  { href: "#fedwatch", label: "FedWatch" },
  { href: "#catalyst-calendar", label: "Catalysts" },
] as const;

export function OverviewJumpRail({ className }: { className?: string }) {
  return (
    <nav
      aria-label="Overview sections"
      className={cn(
        "flex min-h-8 min-w-0 items-center overflow-x-auto terminal-scroll rounded-[6px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-1)] px-1.5",
        className,
      )}
    >
      <span className="hidden shrink-0 px-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ib-text-muted)] sm:inline">
        Jump
      </span>
      <ul className="flex min-w-0 flex-1 items-center gap-0.5">
        {JUMPS.map((jump) => (
          <li key={jump.href}>
            <a
              href={jump.href}
              className="inline-flex h-7 items-center rounded-[3px] px-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-secondary)] hover:bg-[var(--ib-surface-hover)] hover:text-[var(--ib-text-primary)]"
            >
              {jump.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
