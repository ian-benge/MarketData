"use client";

export function DivergenceNotes({ notes }: { notes: string[] }) {
  if (!notes.length) return null;
  return (
    <section
      aria-label="Divergence notes"
      className="rounded-[6px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-1)] px-3 py-2"
    >
      <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ib-text-muted)]">
        Divergence notes
      </h2>
      <p className="mt-0.5 text-[10px] text-[var(--ib-text-muted)]">
        Rule-based. Cites prints already on the tape. Not a forecast.
      </p>
      <ul className="mt-1.5 space-y-1.5">
        {notes.map((note) => (
          <li
            key={note.slice(0, 48)}
            className="border-l-2 border-[var(--ib-maroon-500)] pl-2.5 text-[11px] leading-4 text-[var(--ib-text-secondary)]"
          >
            {note}
          </li>
        ))}
      </ul>
    </section>
  );
}
