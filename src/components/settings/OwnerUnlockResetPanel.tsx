"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";

type Feedback = { tone: "success" | "error"; message: string };

export function OwnerUnlockResetPanel({
  isAdmin,
  demo,
}: {
  isAdmin: boolean;
  demo: boolean;
}) {
  const [pending, setPending] = useState<"self" | "desk" | null>(null);
  const [confirmDesk, setConfirmDesk] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  async function reset(scope: "self" | "desk") {
    if (pending) return;
    if (scope === "desk" && !confirmDesk) {
      setConfirmDesk(true);
      setFeedback(null);
      return;
    }
    if (scope === "self") setConfirmDesk(false);
    setPending(scope);
    setFeedback(null);
    try {
      const response = await fetch("/api/positions/unlock/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        demo?: boolean;
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Unable to reset teammate access.");
      }
      setConfirmDesk(false);
      setFeedback({
        tone: "success",
        message:
          scope === "desk"
            ? payload.demo
              ? "Demo session only — this browser’s teammate unlocks were cleared."
              : "Every teammate unlock on this desk is revoked. The desk unlock secret must be entered again."
            : payload.demo
              ? "Demo session only — this browser’s teammate unlocks were cleared."
              : "Your book is locked again. Teammates must re-enter your password to see account value and closed lots.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to reset teammate access.",
      });
    } finally {
      setPending(null);
    }
  }

  return (
    <Panel
      title="Teammate book access"
      description="Entering the desk unlock secret unlocks a teammate’s account value and closed lots for eight hours on that browser. Never share a sign-in password. Use this to drop those grants immediately."
      actions={isAdmin ? <Badge tone="brand">Admin can reset all</Badge> : undefined}
      bodyClassName="space-y-3 p-3"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-[var(--ib-text-primary)]">
            Lock my book
          </p>
          <p className="mt-0.5 text-[12px] leading-5 text-[var(--ib-text-secondary)]">
            Anyone who previously unlocked your blotter will need your password
            again. Your own view is unchanged.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={pending !== null}
          aria-busy={pending === "self"}
          onClick={() => {
            void reset("self");
          }}
        >
          {pending === "self" ? "Locking…" : "Lock my book"}
        </Button>
      </div>

      {isAdmin ? (
        <div className="flex flex-col gap-3 border-t border-[var(--ib-border-subtle)] pt-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-[var(--ib-text-primary)]">
              Reset all unlocks
            </p>
            <p className="mt-0.5 text-[12px] leading-5 text-[var(--ib-text-secondary)]">
              Revokes every previously granted teammate unlock on this desk.
              Open lots stay visible; account value and closed lots lock until
              each password is entered again.
            </p>
          </div>
          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={pending !== null}
            aria-busy={pending === "desk"}
            onClick={() => {
              void reset("desk");
            }}
          >
            {pending === "desk"
              ? "Resetting…"
              : confirmDesk
                ? "Confirm reset"
                : "Reset all unlocks"}
          </Button>
        </div>
      ) : null}

      {feedback ? (
        <div
          role={feedback.tone === "error" ? "alert" : "status"}
          className={
            feedback.tone === "error"
              ? "border border-[color-mix(in_oklab,var(--market-negative)_45%,var(--ib-border-strong))] bg-[color-mix(in_oklab,var(--market-negative)_8%,transparent)] px-3 py-2.5 text-xs leading-5 text-[var(--market-negative)]"
              : "border border-[var(--ib-border-strong)] bg-[var(--ib-surface-2)] px-3 py-2.5 text-xs leading-5 text-[var(--ib-text-primary)]"
          }
        >
          {feedback.message}
        </div>
      ) : null}

      {demo ? (
        <p className="text-[11px] text-[var(--ib-text-muted)]">
          Demo mode only clears unlocks in this browser.
        </p>
      ) : null}
    </Panel>
  );
}
