import * as React from "react";
import { cn } from "@/lib/utils/cn";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-[var(--ib-maroon-800)] text-white hover:bg-[var(--ib-maroon-650)] border-[var(--ib-maroon-650)]",
  secondary:
    "bg-[var(--ib-surface-2)] text-[var(--ib-text-primary)] border-[var(--ib-border-control)] hover:bg-[var(--ib-surface-hover)] hover:border-[var(--ib-text-muted)]",
  ghost:
    "bg-transparent text-[var(--ib-text-secondary)] border-transparent hover:text-[var(--ib-text-primary)] hover:bg-[var(--ib-surface-hover)]",
  danger:
    "bg-[var(--danger)] text-white border-[color-mix(in_oklab,var(--danger)_70%,white)] hover:bg-[color-mix(in_oklab,var(--danger)_85%,white)]",
};

const sizes: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-8 px-2.5 text-xs max-sm:min-h-11",
  md: "h-9 px-3 text-sm max-sm:min-h-11",
};

export function buttonStyles({
  variant = "secondary",
  size = "md",
  className,
}: {
  variant?: NonNullable<ButtonProps["variant"]>;
  size?: NonNullable<ButtonProps["size"]>;
  className?: string;
} = {}) {
  return cn(
    "inline-flex items-center justify-center gap-1.5 rounded-[4px] border font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 touch-manipulation",
    variants[variant],
    sizes[size],
    className,
  );
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      variant = "secondary",
      size = "md",
      type = "button",
      ...props
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={buttonStyles({ variant, size, className })}
        {...props}
      />
    );
  },
);
