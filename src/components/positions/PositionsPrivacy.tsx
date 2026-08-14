"use client";

import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import {
  BOOK_PNL_WINDOW_LABELS,
  BOOK_PNL_WINDOWS,
} from "@/lib/positions/value-privacy";
import { usePositionsPrivacy } from "@/components/positions/privacy-context";

export function PositionsValuePrivacyToggle() {
  const { hideValues, toggleHideValues } = usePositionsPrivacy();
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      aria-pressed={hideValues}
      aria-label={hideValues ? "Show values" : "Hide values"}
      onClick={toggleHideValues}
    >
      {hideValues ? (
        <Eye aria-hidden="true" className="size-3.5" />
      ) : (
        <EyeOff aria-hidden="true" className="size-3.5" />
      )}
      {hideValues ? "Show values" : "Hide values"}
    </Button>
  );
}

export function BookPnlWindowToggle({
  className,
}: {
  className?: string;
}) {
  const { pnlWindow, setPnlWindow } = usePositionsPrivacy();
  return (
    <div
      role="group"
      aria-label="P&L timeframe"
      className={cn("flex flex-wrap gap-1", className)}
    >
      {BOOK_PNL_WINDOWS.map((item) => (
        <button
          key={item}
          type="button"
          aria-pressed={pnlWindow === item}
          onClick={() => setPnlWindow(item)}
          className={cn(
            "min-h-8 rounded-[3px] border px-2 font-mono text-[10px] uppercase tracking-[0.06em] max-sm:min-h-11",
            pnlWindow === item
              ? "border-[var(--ib-border-control)] bg-[var(--ib-surface-3)] text-[var(--ib-text-primary)]"
              : "border-[var(--ib-border-subtle)] bg-transparent text-[var(--ib-text-muted)] hover:text-[var(--ib-text-primary)]",
          )}
        >
          {BOOK_PNL_WINDOW_LABELS[item]}
        </button>
      ))}
    </div>
  );
}
