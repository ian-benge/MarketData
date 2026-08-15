"use client";

import { Panel } from "@/components/ui/Panel";

export function DivergenceNotes({ notes }: { notes: string[] }) {
  if (!notes.length) return null;
  return (
    <Panel
      title="Divergence notes"
      description="Rule-based. Cites prints already on the tape. Not a forecast."
      bodyClassName="space-y-2 p-3"
    >
      <ul className="space-y-2">
        {notes.map((note) => (
          <li
            key={note.slice(0, 48)}
            className="border-l-2 border-[var(--ib-maroon-500)] pl-2.5 text-[11px] leading-4 text-[var(--ib-text-secondary)]"
          >
            {note}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
