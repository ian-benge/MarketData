"use client";

import { useId, useState, type FormEvent } from "react";
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
    <StatePanel
      kind="forbidden"
      title={`Enter ${ownerName}'s password`}
      description="This blotter stays hidden until that teammate's sign-in password is entered. Email alerts still go out without it."
      actions={
        <form
          onSubmit={handleSubmit}
          className="flex w-full max-w-sm flex-col items-stretch gap-2"
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
          {error ? (
            <p className="text-left text-[12px] text-[var(--danger)]">{error}</p>
          ) : null}
          <Button type="submit" variant="primary" size="sm" disabled={busy}>
            {busy ? "Checking…" : "Unlock blotter"}
          </Button>
        </form>
      }
    />
  );
}
