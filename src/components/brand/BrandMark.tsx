import { cn } from "@/lib/utils/cn";

export function BrandMark({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex min-w-0 items-center gap-2.5", className)}
      aria-label="IB Market Data"
    >
      <span
        aria-hidden="true"
        className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-[4px] border border-[var(--ib-maroon-500)] bg-[var(--ib-maroon-800)] font-mono text-[12px] font-semibold tracking-[-0.06em] text-white"
      >
        <span className="absolute inset-y-0 left-0 w-[2px] bg-[var(--ib-maroon-300)]" />
        IB
      </span>
      {!compact ? (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[13px] font-semibold tracking-[-0.01em] text-[var(--ib-text-primary)]">
            IB Market Data
          </span>
          <span className="block truncate font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
            Research desk
          </span>
        </span>
      ) : null}
    </span>
  );
}
