import { cn } from "@/lib/utils/cn";

export type BadgeProps = {
  children: React.ReactNode;
  tone?:
    | "neutral"
    | "positive"
    | "negative"
    | "success"
    | "error"
    | "up"
    | "down"
    | "warn"
    | "info"
    | "brand"
    | "mock";
  className?: string;
};

const tones: Record<NonNullable<BadgeProps["tone"]>, string> = {
  neutral:
    "bg-[var(--ib-surface-2)] text-[var(--ib-text-secondary)] border-[var(--ib-border-strong)]",
  positive:
    "bg-[color-mix(in_oklab,var(--market-positive)_12%,transparent)] text-[var(--market-positive)] border-[color-mix(in_oklab,var(--market-positive)_38%,transparent)]",
  negative:
    "bg-[color-mix(in_oklab,var(--market-negative)_12%,transparent)] text-[var(--market-negative)] border-[color-mix(in_oklab,var(--market-negative)_38%,transparent)]",
  success:
    "bg-[var(--ib-surface-2)] text-[var(--ib-text-primary)] border-[var(--ib-border-control)]",
  error:
    "bg-[color-mix(in_oklab,var(--market-negative)_12%,transparent)] text-[var(--market-negative)] border-[color-mix(in_oklab,var(--market-negative)_38%,transparent)]",
  up: "bg-[color-mix(in_oklab,var(--market-positive)_12%,transparent)] text-[var(--market-positive)] border-[color-mix(in_oklab,var(--market-positive)_38%,transparent)]",
  down: "bg-[color-mix(in_oklab,var(--market-negative)_12%,transparent)] text-[var(--market-negative)] border-[color-mix(in_oklab,var(--market-negative)_38%,transparent)]",
  warn: "bg-[color-mix(in_oklab,var(--state-warning)_12%,transparent)] text-[var(--state-warning)] border-[color-mix(in_oklab,var(--state-warning)_38%,transparent)]",
  info: "bg-[color-mix(in_oklab,var(--state-info)_12%,transparent)] text-[var(--state-info)] border-[color-mix(in_oklab,var(--state-info)_38%,transparent)]",
  brand:
    "bg-[color-mix(in_oklab,var(--ib-maroon-500)_16%,transparent)] text-[var(--ib-maroon-300)] border-[color-mix(in_oklab,var(--ib-maroon-500)_48%,transparent)]",
  mock: "bg-[color-mix(in_oklab,var(--state-mock)_12%,transparent)] text-[var(--state-mock)] border-[color-mix(in_oklab,var(--state-mock)_38%,transparent)]",
};

export function Badge({ children, tone = "neutral", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[3px] border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.07em] tabular-nums",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
