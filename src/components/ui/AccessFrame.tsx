import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

const actionBase =
  "inline-flex h-11 items-center justify-center rounded-[4px] border px-4 text-sm font-medium transition-colors";

export function ProductIdentity({
  context = "Private market intelligence",
}: {
  context?: string;
}) {
  return (
    <div className="flex items-center gap-3" aria-label="IB Market Data">
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[4px] border border-[color-mix(in_oklab,var(--accent)_72%,white)] bg-[var(--accent)] font-mono text-sm font-semibold tracking-[-0.04em] text-[var(--accent-fg)]"
      >
        IB
      </span>
      <span className="min-w-0">
        <span className="block text-base font-semibold tracking-[-0.01em] text-[var(--fg)]">
          IB Market Data
        </span>
        <span className="block text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">
          {context}
        </span>
      </span>
    </div>
  );
}

export function AccessFrame({
  eyebrow,
  title,
  description,
  children,
  footer = "Invite-only access · Authorized team members",
  titleId,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: string;
  titleId: string;
}) {
  return (
    <main className="flex min-h-[100svh] w-full items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-[460px]">
        <ProductIdentity />

        <section
          aria-labelledby={titleId}
          className="mt-7 overflow-hidden rounded-[4px] border border-[var(--border)] bg-[var(--surface)]"
        >
          <div aria-hidden="true" className="h-px bg-[var(--accent)]" />
          <header className="border-b border-[var(--border-subtle)] px-4 py-4 sm:px-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--accent)]">
              {eyebrow}
            </p>
            <h1
              id={titleId}
              className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[var(--fg)]"
            >
              {title}
            </h1>
            <p className="mt-1.5 text-sm leading-5 text-[var(--muted)]">
              {description}
            </p>
          </header>
          <div className="px-4 py-4 sm:px-5 sm:py-5">{children}</div>
        </section>

        <p className="mt-4 text-center text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">
          {footer}
        </p>
      </div>
    </main>
  );
}

export function EdgeActionLink({
  href,
  children,
  variant = "secondary",
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        actionBase,
        variant === "primary"
          ? "border-transparent bg-[var(--accent)] text-[var(--accent-fg)] hover:bg-[var(--accent-hover)]"
          : "border-[var(--border)] bg-transparent text-[var(--fg)] hover:bg-[var(--surface-2)]",
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function StateScreen({
  code,
  eyebrow = "System state",
  title,
  description,
  children,
  actions,
}: {
  code: string;
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const titleId = `state-${code.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <main className="flex min-h-[100svh] w-full items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-2xl">
        <ProductIdentity context="Private research system" />

        <section
          aria-labelledby={titleId}
          className="mt-7 rounded-[4px] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6"
        >
          <div className="flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
              {eyebrow}
            </p>
            <span className="font-mono text-xs text-[var(--accent)]">
              {code}
            </span>
          </div>
          <h1
            id={titleId}
            className="mt-5 text-2xl font-semibold tracking-[-0.025em] text-[var(--fg)]"
          >
            {title}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">
            {description}
          </p>
          {children ? <div className="mt-4">{children}</div> : null}
          {actions ? (
            <div className="mt-6 flex flex-wrap items-center gap-2">
              {actions}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

export function LoadingScreen({
  label = "Loading workspace",
}: {
  label?: string;
}) {
  return (
    <main
      className="flex min-h-[100svh] w-full items-center justify-center px-4 py-10 sm:px-6"
      aria-busy="true"
    >
      <div className="w-full max-w-[460px]">
        <ProductIdentity />
        <section className="mt-7 rounded-[4px] border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="flex items-center justify-between gap-4">
            <p
              className="text-sm font-medium text-[var(--fg)]"
              role="status"
              aria-live="polite"
            >
              {label}
            </p>
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">
              Please wait
            </span>
          </div>
          <div aria-hidden="true" className="mt-5 space-y-2">
            <div className="h-2 w-2/3 rounded-[2px] bg-[var(--surface-2)]" />
            <div className="h-2 w-full rounded-[2px] bg-[var(--surface-2)]" />
            <div className="h-2 w-4/5 rounded-[2px] bg-[var(--surface-2)]" />
          </div>
        </section>
      </div>
    </main>
  );
}
