import { cn } from "@/lib/utils/cn";

export function PageHeader({
  title,
  description,
  actions,
  className,
  eyebrow,
  compact = false,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
  eyebrow?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-3 border-b border-[var(--ib-border-subtle)]",
        compact ? "mb-0 pb-2.5" : "mb-4 pb-3.5",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--ib-maroon-300)]">
            {eyebrow}
          </p>
        ) : null}
        <h1
          className={cn(
            "font-semibold tracking-[-0.025em] text-[var(--ib-text-primary)]",
            compact ? "text-xl" : "text-2xl",
          )}
        >
          {title}
        </h1>
        {description ? (
          <p
            className={cn(
              "mt-1 max-w-3xl text-[var(--ib-text-secondary)]",
              compact ? "text-[12px] leading-4" : "text-[13px] leading-5",
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
