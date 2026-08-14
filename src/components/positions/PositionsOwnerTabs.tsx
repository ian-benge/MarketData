"use client";

import { LockKeyhole } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils/cn";
import type { PositionBookOwner } from "@/lib/positions/types";

export function PositionsOwnerTabs({
  owners,
  ownerId,
  onSelect,
}: {
  owners: PositionBookOwner[];
  ownerId: string;
  onSelect: (id: string) => void;
}) {
  if (owners.length === 0) return null;

  return (
    <div
      role="tablist"
      aria-label="Position owners"
      className="flex min-w-0 gap-1 overflow-x-auto overscroll-x-contain terminal-scroll pb-0.5"
    >
      {owners.map((owner) => {
        const selected = owner.id === ownerId;
        return (
          <button
            key={owner.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(owner.id)}
            className={cn(
              "inline-flex min-h-9 shrink-0 items-center gap-2 rounded-[4px] border px-2.5 text-left text-[12px] transition-colors max-sm:min-h-11",
              selected
                ? "border-[var(--ib-maroon-500)] bg-[var(--ib-surface-selected)] text-[var(--ib-text-primary)]"
                : "border-[var(--ib-border-strong)] bg-[var(--ib-surface-2)] text-[var(--ib-text-secondary)] hover:border-[var(--ib-text-muted)]",
            )}
          >
            <span className="font-medium">{owner.displayName}</span>
            {owner.isViewer ? (
              <Badge tone="brand" className="normal-case tracking-normal">
                You
              </Badge>
            ) : null}
            <span className="font-mono text-[10px] text-[var(--ib-text-muted)]">
              {owner.openCount}
            </span>
            {owner.needsUnlock ? (
              <LockKeyhole
                aria-label="Account value and P&L locked"
                className="size-3 text-[var(--ib-text-muted)]"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
