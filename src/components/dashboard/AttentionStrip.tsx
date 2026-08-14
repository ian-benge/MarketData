"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import type { AttentionItem } from "@/lib/market-data/overview-attention";

function ToneIcon({ print }: { print: string }) {
  if (print.includes("−")) {
    return <ArrowDownRight aria-hidden="true" className="size-3 text-[var(--market-negative)]" />;
  }
  if (print.includes("+")) {
    return <ArrowUpRight aria-hidden="true" className="size-3 text-[var(--market-positive)]" />;
  }
  return <ArrowRight aria-hidden="true" className="size-3 text-[var(--market-unchanged)]" />;
}

export function AttentionStrip({
  items,
  onSelectSymbol,
}: {
  items: AttentionItem[];
  onSelectSymbol?: (ticker: string) => void;
}) {
  if (!items.length) return null;
  return (
    <section
      aria-label="Attention"
      className="overflow-hidden rounded-[6px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-1)]"
    >
      <ol className="flex divide-x divide-[var(--ib-border-subtle)] overflow-x-auto terminal-scroll">
        {items.map((item) => {
          const clickable = Boolean(item.ticker && onSelectSymbol);
          const inner = (
            <>
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ib-text-muted)]">
                {item.kicker}
              </p>
              <p className="mt-1 flex items-start gap-1 text-[12px] leading-4 text-[var(--ib-text-primary)]">
                <ToneIcon print={item.print} />
                <span className="min-w-0 truncate">{item.print}</span>
              </p>
            </>
          );
          return (
            <li key={item.id} className="min-w-[11.5rem] flex-1">
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onSelectSymbol?.(item.ticker!)}
                  className="h-full w-full px-3 py-2 text-left hover:bg-[var(--ib-surface-hover)]"
                  aria-label={`Open ${item.ticker} in primary chart`}
                >
                  {inner}
                </button>
              ) : (
                <div className="px-3 py-2">{inner}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
