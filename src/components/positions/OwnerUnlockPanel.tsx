"use client";

import { useId, useState, type FormEvent } from "react";
import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StatePanel } from "@/components/ui/StatePanel";
import { UNASSIGNED_OWNER_ID } from "@/lib/positions/owners";

export function OwnerUnlockPanel({
  ownerId,
  ownerName,
  busy,
  error,
  onUnlock,
}: {
  ownerId: string;
  ownerName: string;
  busy: boolean;
  error: string | null;
  onUnlock: (password: string) => Promise<void>;
}) {
  const passwordId = useId();
  const [password, setPassword] = useState("");

  if (ownerId === UNASSIGNED_OWNER_ID) {
    return (
      <StatePanel
        kind="forbidden"
        title="Unassigned book is locked"
        description="Lots with no owner cannot be opened with a password."
      />
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onUnlock(password);
  }

  return (
    <section className="flex flex-col gap-3 rounded-[6px] border border-[var(--ib-border-strong)] bg-[var(--ib-surface-1)] px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-[6px] border border-[var(--ib-border-strong)] bg-[var(--ib-surface-2)] text-[var(--ib-text-secondary)]">
          <LockKeyhole aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold text-[var(--ib-text-primary)]">
            Account value is locked
          </h2>
          <p className="mt-0.5 text-[12px] leading-5 text-[var(--ib-text-secondary)]">
            Day P&L and open P&L stay on the tape. Enter {ownerName}&apos;s
            IB Market Data sign-in password to see account value, cash, and
            closed lots. Revoke from Settings.
          </p>
          {error ? (
            <p role="alert" className="mt-1 text-[12px] text-[var(--danger)]">
              {error}
            </p>
          ) : null}
        </div>
      </div>
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm shrink-0 flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center"
      >
        <label htmlFor={passwordId} className="sr-only">
          Password for {ownerName}
        </label>
        <input
          id={passwordId}
          type="password"
          autoComplete="off"
          className="field-control"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Teammate password"
          disabled={busy}
          required
        />
        <Button type="submit" variant="primary" size="sm" disabled={busy}>
          {busy ? "Checking…" : "Unlock book"}
        </Button>
      </form>
    </section>
  );
}
