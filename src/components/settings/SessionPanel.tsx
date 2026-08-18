"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import type { UserRole } from "@/lib/domain/permissions";
import {
  canCreateBrowserClient,
  createClient,
} from "@/lib/supabase/client";

type SessionPanelProps = {
  email: string;
  role: UserRole;
  isDemo: boolean;
  timeZone: string;
};

function signOutErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message
  ) {
    return error.message;
  }
  return fallback;
}

export function SessionPanel({
  email,
  role,
  isDemo,
  timeZone,
}: SessionPanelProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      if (isDemo) {
        const response = await fetch("/api/auth/demo", { method: "DELETE" });
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        if (!response.ok) {
          throw new Error(
            payload?.error ?? `Unable to sign out (${response.status}).`,
          );
        }
        router.replace("/login");
        return;
      }

      if (!canCreateBrowserClient()) {
        setError(
          "Credential sign-out is unavailable in this environment. Your session is still active.",
        );
        return;
      }

      const { error: signOutError } = await createClient().auth.signOut();
      if (signOutError) {
        setError(
          signOutErrorMessage(
            signOutError,
            "Unable to sign out. Your session is still active.",
          ),
        );
        return;
      }
      router.replace("/login");
    } catch (caught) {
      setError(
        signOutErrorMessage(
          caught,
          "Unable to sign out. Your session is still active.",
        ),
      );
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <Panel
      title="Session"
      description="Signed-in account for this workspace. Signing out ends this browser session."
      bodyClassName="space-y-3 p-3"
    >
      <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-[11px] text-[var(--ib-text-muted)]">Email</dt>
          <dd className="min-w-0 truncate text-[13px] text-[var(--ib-text-primary)]">
            {email}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] text-[var(--ib-text-muted)]">Role</dt>
          <dd className="text-[13px] text-[var(--ib-text-primary)]">{role}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] text-[var(--ib-text-muted)]">Session</dt>
          <dd className="text-[13px] text-[var(--ib-text-primary)]">
            {isDemo ? "demo" : "live"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] text-[var(--ib-text-muted)]">
            Working timezone
          </dt>
          <dd className="text-[13px] text-[var(--ib-text-primary)]">{timeZone}</dd>
        </div>
      </dl>
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        aria-busy={pending}
        onClick={() => {
          void signOut();
        }}
      >
        Sign out
      </Button>
      {error ? (
        <div
          role="alert"
          className="border border-[color-mix(in_oklab,var(--market-negative)_45%,var(--ib-border-strong))] bg-[color-mix(in_oklab,var(--market-negative)_8%,transparent)] px-3 py-2.5 text-xs leading-5 text-[var(--market-negative)]"
        >
          {error}
        </div>
      ) : null}
    </Panel>
  );
}
