import {
  AlertTriangle,
  Check,
  CircleOff,
  Clock3,
  Database,
  LoaderCircle,
  Radio,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type StatusKind =
  | "realtime"
  | "delayed"
  | "stale"
  | "partial"
  | "unavailable"
  | "mock"
  | "healthy"
  | "degraded"
  | "disabled"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "neutral";

const styles: Record<StatusKind, { icon: LucideIcon; className: string }> = {
  realtime: {
    icon: Radio,
    className:
      "border-[color-mix(in_oklab,var(--state-info)_35%,transparent)] bg-[color-mix(in_oklab,var(--state-info)_9%,transparent)] text-[var(--state-info)]",
  },
  delayed: {
    icon: Clock3,
    className:
      "border-[color-mix(in_oklab,var(--state-warning)_35%,transparent)] bg-[color-mix(in_oklab,var(--state-warning)_9%,transparent)] text-[var(--state-warning)]",
  },
  stale: {
    icon: AlertTriangle,
    className:
      "border-[color-mix(in_oklab,var(--state-warning)_45%,transparent)] bg-[color-mix(in_oklab,var(--state-warning)_10%,transparent)] text-[var(--state-warning)]",
  },
  partial: {
    icon: AlertTriangle,
    className:
      "border-[color-mix(in_oklab,var(--state-warning)_35%,transparent)] bg-[color-mix(in_oklab,var(--state-warning)_9%,transparent)] text-[var(--state-warning)]",
  },
  unavailable: {
    icon: CircleOff,
    className:
      "border-[var(--ib-border-control)] bg-[var(--ib-surface-2)] text-[var(--ib-text-secondary)]",
  },
  mock: {
    icon: Database,
    className:
      "border-[color-mix(in_oklab,var(--state-mock)_35%,transparent)] bg-[color-mix(in_oklab,var(--state-mock)_9%,transparent)] text-[var(--state-mock)]",
  },
  healthy: {
    icon: Check,
    className:
      "border-[var(--ib-border-control)] bg-[var(--ib-surface-2)] text-[var(--ib-text-primary)]",
  },
  degraded: {
    icon: AlertTriangle,
    className:
      "border-[color-mix(in_oklab,var(--state-warning)_35%,transparent)] bg-[color-mix(in_oklab,var(--state-warning)_9%,transparent)] text-[var(--state-warning)]",
  },
  disabled: {
    icon: CircleOff,
    className:
      "border-[var(--ib-border-strong)] bg-[var(--ib-surface-2)] text-[var(--ib-text-muted)]",
  },
  queued: {
    icon: Clock3,
    className:
      "border-[color-mix(in_oklab,var(--state-info)_35%,transparent)] bg-[color-mix(in_oklab,var(--state-info)_9%,transparent)] text-[var(--state-info)]",
  },
  running: {
    icon: LoaderCircle,
    className:
      "border-[color-mix(in_oklab,var(--state-info)_35%,transparent)] bg-[color-mix(in_oklab,var(--state-info)_9%,transparent)] text-[var(--state-info)]",
  },
  completed: {
    icon: Check,
    className:
      "border-[var(--ib-border-control)] bg-[var(--ib-surface-2)] text-[var(--ib-text-primary)]",
  },
  failed: {
    icon: CircleOff,
    className:
      "border-[color-mix(in_oklab,var(--market-negative)_38%,transparent)] bg-[color-mix(in_oklab,var(--market-negative)_9%,transparent)] text-[var(--market-negative)]",
  },
  neutral: {
    icon: Database,
    className:
      "border-[var(--ib-border-strong)] bg-[var(--ib-surface-2)] text-[var(--ib-text-secondary)]",
  },
};

export function StatusIndicator({
  kind,
  label,
  className,
}: {
  kind: StatusKind;
  label: string;
  className?: string;
}) {
  const style = styles[kind];
  const Icon = style.icon;
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center gap-1.5 rounded-[3px] border px-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.06em]",
        style.className,
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn("size-3", kind === "running" && "animate-spin")}
      />
      {label}
    </span>
  );
}
