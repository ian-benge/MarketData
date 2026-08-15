import {
  AlertTriangle,
  FileQuestion,
  Info,
  LockKeyhole,
  SearchX,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

type StateKind =
  | "empty"
  | "no-results"
  | "error"
  | "forbidden"
  | "unavailable"
  | "entitlement"
  | "info";

const icons: Record<StateKind, LucideIcon> = {
  empty: FileQuestion,
  "no-results": SearchX,
  error: AlertTriangle,
  forbidden: LockKeyhole,
  unavailable: WifiOff,
  entitlement: LockKeyhole,
  info: Info,
};

export function StatePanel({
  kind,
  title,
  description,
  actions,
  className,
}: {
  kind: StateKind;
  title: string;
  description: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  const Icon = icons[kind];
  return (
    <section
      className={cn(
        "rounded-[6px] border border-[var(--ib-border-strong)] bg-[var(--ib-surface-1)] px-4 py-8 text-center",
        className,
      )}
    >
      <span className="mx-auto grid size-10 place-items-center rounded-[6px] border border-[var(--ib-border-strong)] bg-[var(--ib-surface-2)] text-[var(--ib-text-secondary)]">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <h2 className="mt-3 text-base font-semibold text-[var(--ib-text-primary)]">
        {title}
      </h2>
      <p className="mx-auto mt-1 max-w-xl text-[13px] leading-5 text-[var(--ib-text-secondary)]">
        {description}
      </p>
      {actions ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {actions}
        </div>
      ) : null}
    </section>
  );
}

export function EmptyHint({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "px-3 py-8 text-center text-[12px] leading-5 text-[var(--ib-text-muted)]",
        className,
      )}
    >
      {children}
    </p>
  );
}
