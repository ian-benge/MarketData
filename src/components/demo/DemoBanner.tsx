export function DemoBanner({ role }: { role?: string | null }) {
  return (
    <div
      role="status"
      className="relative z-40 flex min-h-7 flex-wrap items-center justify-center gap-x-2 border-b border-[color-mix(in_oklab,var(--state-mock)_35%,var(--ib-border-subtle))] bg-[color-mix(in_oklab,var(--state-mock)_8%,var(--ib-surface-1))] px-3 py-1 text-center font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--state-mock)]"
    >
      <span>Mock workspace</span>
      <span aria-hidden="true" className="text-[var(--ib-text-muted)]">
        ·
      </span>
      <span className="normal-case tracking-normal text-[var(--ib-text-secondary)]">
        Fixture data · no live provider calls
      </span>
      {role ? (
        <>
          <span aria-hidden="true" className="text-[var(--ib-text-muted)]">
            ·
          </span>
          <span className="normal-case tracking-normal text-[var(--ib-text-secondary)]">
            {role} role
          </span>
        </>
      ) : null}
    </div>
  );
}
