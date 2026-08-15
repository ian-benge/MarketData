import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export type ChipToggleProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  pressed?: boolean;
  size?: "sm" | "md";
};

export function ChipToggle({
  pressed = false,
  size = "sm",
  className,
  type = "button",
  ...props
}: ChipToggleProps) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1 rounded-[3px] border font-mono font-medium uppercase tracking-[0.08em] transition-colors touch-manipulation",
        size === "sm" && "h-7 max-sm:min-h-11 px-2 text-[10px]",
        size === "md" && "h-8 max-sm:min-h-11 px-2.5 text-[11px]",
        pressed
          ? "border-[var(--ib-border-control)] bg-[var(--ib-surface-3)] text-[var(--ib-text-primary)]"
          : "border-[var(--ib-border-subtle)] bg-transparent text-[var(--ib-text-muted)] hover:border-[var(--ib-text-muted)] hover:text-[var(--ib-text-primary)]",
        className,
      )}
      {...props}
    />
  );
}
