"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { Panel } from "@/components/ui/Panel";
import type { TeamMember } from "@/lib/auth/team-types";

type Feedback = { tone: "success" | "error"; message: string };

function randomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => chars[byte % chars.length]).join("");
}

export function TeamAccessPanel({
  initialMembers,
  demo,
}: {
  initialMembers: TeamMember[];
  demo: boolean;
}) {
  const [members, setMembers] = useState(initialMembers);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const sorted = useMemo(
    () =>
      [...members].sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
        return a.email.localeCompare(b.email);
      }),
    [members],
  );

  function fillGeneratedPassword() {
    const next = randomPassword();
    setPassword(next);
    setConfirm(next);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (password !== confirm) {
      setFeedback({ tone: "error", message: "Passwords do not match." });
      return;
    }
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          displayName: displayName.trim() || undefined,
          role,
          password,
        }),
      });
      const payload = (await response.json()) as {
        member?: TeamMember;
        created?: boolean;
        demo?: boolean;
        error?: string;
      };
      if (!response.ok || !payload.member) {
        throw new Error(payload.error ?? "Unable to add that user.");
      }
      setMembers((current) => {
        const without = current.filter((row) => row.id !== payload.member!.id);
        return [payload.member!, ...without];
      });
      setEmail("");
      setDisplayName("");
      setRole("member");
      setPassword("");
      setConfirm("");
      const saved = payload.demo
        ? "Demo session only — this user was not saved to the live desk."
        : payload.created
          ? "User added. They can sign in with the password you set."
          : "That account already existed and is now on this desk. They should use their current password.";
      setFeedback({ tone: "success", message: saved });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error ? error.message : "Unable to add that user.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <Panel
        title="Add user"
        description="Creates a sign-in for this desk. Admins only. Email alerts still go to every active member."
        actions={<Badge tone="brand">Admin only</Badge>}
        bodyClassName="p-3"
      >
        <form onSubmit={handleSubmit} className="space-y-3" autoComplete="off">
          <div>
            <label
              htmlFor="team-email"
              className="mb-1 block text-xs font-medium text-[var(--ib-text-secondary)]"
            >
              Email
            </label>
            <input
              id="team-email"
              type="email"
              required
              autoComplete="off"
              className="field-control"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={pending}
            />
          </div>
          <div>
            <label
              htmlFor="team-name"
              className="mb-1 block text-xs font-medium text-[var(--ib-text-secondary)]"
            >
              Display name
            </label>
            <input
              id="team-name"
              type="text"
              maxLength={80}
              autoComplete="off"
              className="field-control"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              disabled={pending}
              placeholder="Optional"
            />
          </div>
          <div>
            <label
              htmlFor="team-role"
              className="mb-1 block text-xs font-medium text-[var(--ib-text-secondary)]"
            >
              Role
            </label>
            <select
              id="team-role"
              className="field-control"
              value={role}
              onChange={(event) =>
                setRole(event.target.value as "admin" | "member")
              }
              disabled={pending}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label
                htmlFor="team-password"
                className="text-xs font-medium text-[var(--ib-text-secondary)]"
              >
                Password
              </label>
              <button
                type="button"
                className="text-[11px] text-[var(--ib-maroon-300)] hover:underline"
                onClick={fillGeneratedPassword}
                disabled={pending}
              >
                Generate
              </button>
            </div>
            <input
              id="team-password"
              type="text"
              required
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              className="field-control font-mono"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={pending}
            />
          </div>
          <div>
            <label
              htmlFor="team-confirm"
              className="mb-1 block text-xs font-medium text-[var(--ib-text-secondary)]"
            >
              Confirm password
            </label>
            <input
              id="team-confirm"
              type="text"
              required
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              className="field-control font-mono"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              disabled={pending}
            />
          </div>
          <p className="text-[11px] leading-4 text-[var(--ib-text-muted)]">
            Share the password with them out of band. It is not emailed and is
            not stored in this app after you submit.
          </p>
          <Button
            type="submit"
            variant="primary"
            disabled={pending}
            aria-busy={pending}
            className="w-full"
          >
            {pending ? "Adding user…" : "Add user"}
          </Button>
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
              Demo mode will not create a live login.
            </p>
          ) : null}
        </form>
      </Panel>

      <Panel
        title="Desk members"
        description="People who can sign in to this workspace."
        bodyClassName="p-0"
      >
        <DataTable
          caption="Desk members"
          rows={sorted}
          rowKey={(row) => row.id}
          emptyMessage="No members on this desk yet."
          columns={[
            {
              key: "email",
              header: "Email",
              render: (row) => (
                <span className="text-[var(--ib-text-primary)]">{row.email}</span>
              ),
            },
            {
              key: "name",
              header: "Name",
              priority: "medium",
              render: (row) => row.displayName || "—",
            },
            {
              key: "role",
              header: "Role",
              render: (row) => <Badge tone="brand">{row.role}</Badge>,
            },
            {
              key: "access",
              header: "Access",
              align: "right",
              render: (row) => (
                <Badge tone={row.isActive ? "success" : "neutral"}>
                  {row.isActive ? "Active" : "Inactive"}
                </Badge>
              ),
            },
          ]}
        />
      </Panel>
    </div>
  );
}
