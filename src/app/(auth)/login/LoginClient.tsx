"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { AccessFrame } from "@/components/ui/AccessFrame";
import { canCreateBrowserClient, createClient } from "@/lib/supabase/client";

type Message = {
  tone: "error" | "info";
  text: string;
};

type PendingAction = "password" | "admin" | "member" | null;

const ALLOWED_DESTINATIONS = [
  "/dashboard",
  "/archive",
  "/reports",
  "/watchlists",
  "/positions",
  "/proposals",
  "/admin",
] as const;

function sanitizeNextPath(value: string | null): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return "/dashboard";
  }

  try {
    const base = "https://ib-market-data.invalid";
    const parsed = new URL(value, base);
    const allowed = ALLOWED_DESTINATIONS.some(
      (path) =>
        parsed.pathname === path || parsed.pathname.startsWith(`${path}/`),
    );

    if (parsed.origin !== base || !allowed) return "/dashboard";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/dashboard";
  }
}

const inputClassName =
  "mt-1.5 h-11 w-full rounded-[4px] border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus:border-[var(--accent)]";

export default function LoginClient({
  demoAvailable,
}: {
  demoAvailable: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = sanitizeNextPath(searchParams.get("next"));
  const invited = searchParams.has("invited");
  const passwordAvailable = canCreateBrowserClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<Message | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setPendingAction("password");
    setMessage(null);
    try {
      if (!passwordAvailable) {
        setMessage({
          tone: "info",
          text: demoAvailable
            ? "Credential sign-in is unavailable in this local demo. Choose a demo role below."
            : "Credential sign-in is not configured. Contact a workspace administrator.",
        });
        return;
      }
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setMessage({
          tone: "error",
          text: "Sign-in failed. Check your credentials and try again.",
        });
        return;
      }
      router.replace(nextPath);
      router.refresh();
    } catch {
      setMessage({
        tone: "error",
        text: "The sign-in service could not be reached. Your session was not changed.",
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function startDemo(role: "admin" | "member") {
    if (!demoAvailable) return;

    setPendingAction(role);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setMessage({
          tone: "error",
          text: data.error ?? "The demo session could not be started.",
        });
        return;
      }
      router.replace(nextPath);
      router.refresh();
    } catch {
      setMessage({
        tone: "error",
        text: "The demo session could not be started. Check the local server and try again.",
      });
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <AccessFrame
      eyebrow="Secure workspace"
      title="Sign in"
      description="Invite-only access for authorized IB Market Data team members."
      titleId="sign-in-title"
    >
      <div className="space-y-4">
        {invited ? (
          <div
            role="status"
            className="border border-[color-mix(in_oklab,var(--accent)_48%,var(--border))] bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] px-3 py-2.5 text-sm text-[var(--fg)]"
          >
            Invitation accepted. Sign in to enter the workspace.
          </div>
        ) : null}

        {passwordAvailable ? (
          <form onSubmit={signIn} aria-describedby="sign-in-support">
            <p
              id="sign-in-support"
              className="mb-3 text-xs leading-5 text-[var(--muted)]"
            >
              Use the credentials associated with your team invitation.
            </p>
            <fieldset disabled={pendingAction !== null} className="space-y-3">
              <legend className="sr-only">Workspace credentials</legend>
              <div>
                <label
                  htmlFor="sign-in-email"
                  className="block text-xs font-medium text-[var(--muted)]"
                >
                  Email address
                </label>
                <input
                  id="sign-in-email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClassName}
                />
              </div>
              <div>
                <label
                  htmlFor="sign-in-password"
                  className="block text-xs font-medium text-[var(--muted)]"
                >
                  Password
                </label>
                <input
                  id="sign-in-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClassName}
                />
              </div>
              <Button
                type="submit"
                variant="primary"
                disabled={pendingAction !== null}
                aria-busy={pendingAction === "password"}
                className="h-11 w-full"
              >
                {pendingAction === "password" ? "Signing in…" : "Sign in"}
              </Button>
            </fieldset>
          </form>
        ) : (
          <div className="border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-3">
            <p className="text-sm text-[var(--fg)]">
              Credential sign-in is unavailable.
            </p>
            <p
              id="sign-in-support"
              className="mt-1 text-xs leading-5 text-[var(--muted)]"
            >
              {demoAvailable
                ? "This local environment uses controlled demo sessions."
                : "Contact a workspace administrator to verify access configuration."}
            </p>
          </div>
        )}

        {message ? (
          <p
            id="sign-in-message"
            className={
              message.tone === "error"
                ? "text-sm text-[var(--down)]"
                : "text-sm text-[var(--muted)]"
            }
            role={message.tone === "error" ? "alert" : "status"}
            aria-live={message.tone === "error" ? "assertive" : "polite"}
          >
            {message.text}
          </p>
        ) : null}

        {demoAvailable ? (
          <section
            aria-labelledby="demo-access-title"
            className="border-t border-[var(--border-subtle)] pt-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="demo-access-title"
                  className="text-sm font-semibold text-[var(--fg)]"
                >
                  Local demo access
                </h2>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                  Simulated team roles and mock market data. No live account or
                  provider session is used.
                </p>
              </div>
              <span className="shrink-0 border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
                Mock
              </span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Button
                variant="secondary"
                disabled={pendingAction !== null}
                aria-busy={pendingAction === "member"}
                className="h-11 w-full"
                onClick={() => startDemo("member")}
              >
                {pendingAction === "member" ? "Starting…" : "Enter as member"}
              </Button>
              <Button
                variant="secondary"
                disabled={pendingAction !== null}
                aria-busy={pendingAction === "admin"}
                className="h-11 w-full"
                onClick={() => startDemo("admin")}
              >
                {pendingAction === "admin" ? "Starting…" : "Enter as admin"}
              </Button>
            </div>
          </section>
        ) : null}
      </div>
    </AccessFrame>
  );
}
