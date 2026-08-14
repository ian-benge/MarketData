"use client";

import { Clock3 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ClientMarketTime } from "@/components/ui/ClientMarketTime";

export function StaleBanner({
  asOf,
  className,
}: {
  asOf?: string | null;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2 rounded-[4px] border border-[color-mix(in_oklab,var(--state-warning)_45%,var(--ib-border-strong))] bg-[color-mix(in_oklab,var(--state-warning)_8%,var(--ib-surface-1))] px-3 py-2 text-xs text-[var(--state-warning)]",
        className,
      )}
    >
      <Clock3 aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <span>
        <strong className="font-medium">Stale market data.</strong>{" "}
        <span className="text-[var(--ib-text-secondary)]">
          Last valid update <ClientMarketTime value={asOf} seconds />.
          Current values remain visible while the next safe refresh is
          attempted.
        </span>
      </span>
    </div>
  );
}
