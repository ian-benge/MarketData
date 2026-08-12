import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { AccessFrame, EdgeActionLink } from "@/components/ui/AccessFrame";
import { FormSubmitButton } from "@/components/ui/FormSubmitButton";
import { isDemoAuthEnabled } from "@/lib/auth/demo";

export const metadata = {
  title: "Team invitation",
  description: "Accept an invitation to the IB Market Data workspace.",
};

type InviteState = "ready" | "invalid" | "expired" | "accepted";

function resolveState(token: string): InviteState {
  if (!token || token === "invalid") return "invalid";
  if (token === "expired") return "expired";
  if (token === "accepted") return "accepted";
  return "ready";
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const state = resolveState(token);
  const demoAvailable = isDemoAuthEnabled();

  return (
    <AccessFrame
      eyebrow="Team access"
      title="Team invitation"
      description="Complete your invite to join the private IB Market Data workspace."
      titleId="invitation-title"
    >
      <div>
        {state === "ready" ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-[var(--fg)]">
                Create your workspace credentials.
              </p>
              <Badge tone="info">Pending</Badge>
            </div>
            <form
              action={`/api/auth/invite/${encodeURIComponent(token)}`}
              method="post"
              className="space-y-3"
            >
              <div>
                <label
                  htmlFor="invite-display-name"
                  className="block text-xs font-medium text-[var(--muted)]"
                >
                  Display name
                </label>
                <input
                  id="invite-display-name"
                  name="displayName"
                  autoComplete="name"
                  required
                  className="mt-1.5 h-11 w-full rounded-[4px] border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--fg)] focus:border-[var(--accent)]"
                />
              </div>
              <div>
                <label
                  htmlFor="invite-password"
                  className="block text-xs font-medium text-[var(--muted)]"
                >
                  Password
                </label>
                <input
                  id="invite-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  aria-describedby="invite-password-help"
                  className="mt-1.5 h-11 w-full rounded-[4px] border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--fg)] focus:border-[var(--accent)]"
                />
                <p
                  id="invite-password-help"
                  className="mt-1.5 text-xs text-[var(--muted)]"
                >
                  Use at least 8 characters.
                </p>
              </div>
              <FormSubmitButton
                label="Accept invitation"
                pendingLabel="Accepting invitation…"
                className="h-11 w-full"
              />
            </form>
            {demoAvailable ? (
              <p className="border-t border-[var(--border-subtle)] pt-3 text-xs leading-5 text-[var(--muted)]">
                Local demo: invitation acceptance is simulated and continues to
                controlled demo access.
              </p>
            ) : null}
          </div>
        ) : null}
        {state === "invalid" ? (
          <div role="alert" className="space-y-4">
            <Badge tone="down">Invalid</Badge>
            <p className="text-sm leading-6 text-[var(--muted)]">
              This invitation link is invalid. Ask a workspace administrator for
              a new invitation.
            </p>
            <EdgeActionLink href="/login">Return to sign in</EdgeActionLink>
          </div>
        ) : null}
        {state === "expired" ? (
          <div role="status" className="space-y-4">
            <Badge tone="warn">Expired</Badge>
            <p className="text-sm leading-6 text-[var(--muted)]">
              This invitation has expired. Ask a workspace administrator to
              issue a new link.
            </p>
            <EdgeActionLink href="/login">Return to sign in</EdgeActionLink>
          </div>
        ) : null}
        {state === "accepted" ? (
          <div role="status" className="space-y-4">
            <Badge tone="info">Accepted</Badge>
            <p className="text-sm leading-6 text-[var(--muted)]">
              This invitation has already been accepted. Sign in with your
              workspace credentials.
            </p>
            <EdgeActionLink href="/login" variant="primary">
              Continue to sign in
            </EdgeActionLink>
          </div>
        ) : null}
        {state === "ready" ? (
          <p className="mt-4 text-center text-xs text-[var(--muted)]">
            Already have access?{" "}
            <Link
              href="/login"
              className="text-[var(--accent)] hover:underline"
            >
              Sign in
            </Link>
          </p>
        ) : null}
      </div>
    </AccessFrame>
  );
}
