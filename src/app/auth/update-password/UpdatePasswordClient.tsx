"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AccessFrame } from "@/components/ui/AccessFrame";
import { Button } from "@/components/ui/Button";
import { canCreateBrowserClient, createClient } from "@/lib/supabase/client";

export default function UpdatePasswordClient() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canCreateBrowserClient()) return;
    const supabase = createClient();
    let cancelled = false;

    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setReady(Boolean(data.session));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setReady(true);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 10) {
      setError("Use a password of at least 10 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (!canCreateBrowserClient()) {
      setError("Supabase is not configured in this browser session.");
      return;
    }
    setPending(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) {
        setError("The password could not be updated. Request a new reset link.");
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("The update service could not be reached.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AccessFrame
      eyebrow="Account recovery"
      title="Set a new password"
      description="Choose a password for your IB Market Data account. Keep this tab on localhost while the local app is running."
      titleId="update-password-title"
    >
      {!canCreateBrowserClient() ? (
        <p className="text-sm text-[var(--down)]" role="alert">
          Credential recovery is not configured.
        </p>
      ) : !ready ? (
        <p className="text-sm text-[var(--muted)]" role="status">
          Waiting for a valid recovery session. Start the app with{" "}
          <code>npm run dev</code>, then open a fresh reset email link.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label
              htmlFor="new-password"
              className="block text-xs font-medium text-[var(--muted)]"
            >
              New password
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-[4px] border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="confirm-password"
              className="block text-xs font-medium text-[var(--muted)]"
            >
              Confirm password
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-[4px] border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
            />
          </div>
          <Button type="submit" variant="primary" disabled={pending} className="h-11 w-full">
            {pending ? "Saving…" : "Save password"}
          </Button>
        </form>
      )}
      {error ? (
        <p className="mt-3 text-sm text-[var(--down)]" role="alert">
          {error}
        </p>
      ) : null}
    </AccessFrame>
  );
}
