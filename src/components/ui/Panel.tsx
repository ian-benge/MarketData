import { cn } from "@/lib/utils/cn";

export type PanelProps = {
  id?: string;
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  variant?: "default" | "inset" | "flat" | "critical";
};

export function Panel({
  id,
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  variant = "default",
}: PanelProps) {
  return (
    <section
      id={id}
      className={cn(
        "min-w-0 overflow-hidden rounded-[6px] border",
        variant === "default" &&
          "border-[var(--ib-border-subtle)] bg-[var(--ib-surface-1)]",
        variant === "inset" &&
          "border-[var(--ib-border-subtle)] bg-[var(--ib-surface-inset)]",
        variant === "flat" &&
          "rounded-none border-x-0 border-[var(--ib-border-subtle)] bg-transparent",
        variant === "critical" &&
          "border-[color-mix(in_oklab,var(--state-warning)_45%,var(--ib-border-strong))] bg-[color-mix(in_oklab,var(--state-warning)_5%,var(--ib-surface-1))]",
        className,
      )}
    >
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--ib-border-subtle)] px-3 py-2">
          <div className="min-w-[10rem] flex-1">
            {title ? (
              <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-[var(--ib-text-primary)]">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-0.5 text-[11px] leading-4 text-[var(--ib-text-muted)]">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex min-w-0 flex-[1_1_12rem] justify-end">
              {actions}
            </div>
          ) : null}
        </div>
      )}
      <div className={cn("p-3", bodyClassName)}>{children}</div>
    </section>
  );
}
