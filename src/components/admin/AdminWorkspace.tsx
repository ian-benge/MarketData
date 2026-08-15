"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AdminSectionNav,
  normalizeAdminSection,
  type AdminSectionKey,
} from "@/components/admin/AdminSectionNav";
import { Badge, type BadgeProps } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { StatePanel } from "@/components/ui/StatePanel";
import { fixtureAdmin } from "@/lib/fixtures/admin";
import { editionLabel } from "@/lib/reports/editions";
import type { UsageSnapshot } from "@/lib/market-data/usage";
import type { InstrumentResolutionRow } from "@/lib/watchlists/types";

type Feedback = {
  tone: "success" | "error" | "info";
  message: string;
};

type InvitationRecord = {
  id: string;
  email: string;
  role: "admin" | "member";
  status: string;
  expiresAt: string;
};

type MarketAdminStatus = {
  role?: string;
  fixtures?: boolean;
  license?: {
    warning?: string | null;
    scope?: string;
    acknowledged?: boolean;
    permittedSurfaces?: string[];
  };
  feed?: {
    latencyCoverageLabel?: string;
    latencyClass?: string;
    coverage?: string;
    providerName?: string | null;
    marketSession?: string | null;
  };
  freshness?: {
    lastSuccessfulRefreshAt?: string | null;
    lastAttemptAt?: string | null;
    lastError?: string | null;
    lastRefreshAt?: string | null;
    cadenceSeconds?: number;
  };
  usage?: UsageSnapshot[];
  config?: {
    primary?: string;
    fallback?: string;
    stockFeed?: string;
    refreshOpenSeconds?: number;
    refreshExtendedSeconds?: number;
    refreshClosedSeconds?: number;
    staleAfterSeconds?: number;
    maxUniverseSize?: number;
    hasAlpacaKeys?: boolean;
    hasMassiveKey?: boolean;
    hasFinnhubKey?: boolean;
  };
  universeSize?: number;
  breadth?: { supported?: boolean; explanation?: string | null };
  moversCoverageNotes?: string | null;
};

type MarketRefreshResponse = {
  ok?: boolean;
  mode?: string;
  error?: string;
  refresh?: {
    status?: string;
    skippedReason?: string;
    errorMessage?: string;
    symbolsRequested?: number;
    symbolsReceived?: number;
    feedCoverage?: string;
    session?: string;
  };
};

type DeliveryActionState = {
  phase: "pending" | "success" | "error";
  message: string;
};

const SECTION_META: Record<
  AdminSectionKey,
  { group: string; title: string; description: string }
> = {
  team: {
    group: "Access",
    title: "Team access",
    description: "Review workspace membership and issue member invitations.",
  },
  schedule: {
    group: "Configuration",
    title: "Report schedule",
    description:
      "Inspect firm-wide edition timing and the active grace window.",
  },
  sources: {
    group: "Configuration",
    title: "Source registry",
    description:
      "Inspect configured state and health without exposing credentials.",
  },
  "market-data": {
    group: "Configuration",
    title: "Market data",
    description:
      "Inspect feed coverage, freshness, licensing, quota, and provider state.",
  },
  "ai-routing": {
    group: "Configuration",
    title: "AI routing",
    description: "Review the current provider order and prompt version.",
  },
  jobs: {
    group: "Operations",
    title: "Report jobs",
    description:
      "Track report status, processing stage, and the latest update.",
  },
  deliveries: {
    group: "Operations",
    title: "Deliveries",
    description:
      "Inspect report delivery attempts and safely requeue failures.",
  },
  audit: {
    group: "Operations",
    title: "Audit history",
    description: "Review recent administrative actions and their targets.",
  },
  instruments: {
    group: "Operations",
    title: "Instrument resolution",
    description:
      "Quarantined and unverified tickers stay in coverage. Resolve identity here without guessing replacements.",
  },
};

const CT_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

function formatCt(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return CT_FORMATTER.format(date).replace(/\bC[DS]T\b/, "CT");
}

function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function workflowTone(value: string | null | undefined): BadgeProps["tone"] {
  const status = value?.toLowerCase() ?? "";
  if (["failed", "down", "error"].includes(status)) return "error";
  if (["partial", "pending", "degraded", "expired"].includes(status)) {
    return "warn";
  }
  if (
    [
      "queued",
      "running",
      "collecting_sources",
      "normalizing",
      "analyzing",
      "rendering",
      "delivering",
    ].includes(status)
  ) {
    return "info";
  }
  if (["completed", "delivered", "healthy", "active"].includes(status)) {
    return "success";
  }
  return "neutral";
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json().catch(() => ({}))) as T;
}

function FeedbackBanner({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) return null;

  return (
    <div
      role={feedback.tone === "error" ? "alert" : "status"}
      aria-live={feedback.tone === "error" ? "assertive" : "polite"}
      className={
        feedback.tone === "error"
          ? "border border-[color-mix(in_oklab,var(--market-negative)_45%,var(--ib-border-strong))] bg-[color-mix(in_oklab,var(--market-negative)_8%,transparent)] px-3 py-2.5 text-xs leading-5 text-[var(--market-negative)]"
          : feedback.tone === "info"
            ? "border border-[color-mix(in_oklab,var(--state-info)_40%,var(--ib-border-strong))] bg-[color-mix(in_oklab,var(--state-info)_7%,transparent)] px-3 py-2.5 text-xs leading-5 text-[var(--ib-text-secondary)]"
            : "border border-[var(--ib-border-strong)] bg-[var(--ib-surface-2)] px-3 py-2.5 text-xs leading-5 text-[var(--ib-text-primary)]"
      }
    >
      {feedback.message}
    </div>
  );
}

function StatusCell({
  label,
  value,
  detail,
  mono = false,
  testId,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  mono?: boolean;
  testId?: string;
}) {
  return (
    <div className="min-w-0 border-b border-[var(--ib-border-subtle)] px-3 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <dt className="font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-[var(--ib-text-muted)]">
        {label}
      </dt>
      <dd
        data-testid={testId}
        className={
          mono
            ? "mt-1 font-mono text-xs text-[var(--ib-text-primary)]"
            : "mt-1 text-[13px] font-medium text-[var(--ib-text-primary)]"
        }
      >
        {value}
      </dd>
      {detail ? (
        <p className="mt-0.5 text-[10px] leading-4 text-[var(--ib-text-muted)]">
          {detail}
        </p>
      ) : null}
    </div>
  );
}

function SectionIntro({ section }: { section: AdminSectionKey }) {
  const meta = SECTION_META[section];

  return (
    <header className="border-b border-[var(--ib-border-subtle)] pb-3">
      <p className="font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--ib-maroon-300)]">
        {meta.group}
      </p>
      <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-[var(--ib-text-primary)]">
        {meta.title}
      </h2>
      <p className="mt-1 text-xs leading-5 text-[var(--ib-text-secondary)]">
        {meta.description}
      </p>
    </header>
  );
}

function InstrumentQueuePanel() {
  const [items, setItems] = useState<InstrumentResolutionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/instruments", { cache: "no-store" });
      const data = await readJson<{ items?: InstrumentResolutionRow[]; error?: string }>(
        response,
      );
      if (!response.ok) throw new Error(data.error ?? "Queue could not be loaded.");
      setItems(data.items ?? []);
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Queue could not be loaded.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, action: "dismiss" | "resolve" | "scan") {
    setLoading(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/instruments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action === "scan" ? { action } : { id, action }),
      });
      const data = await readJson<{ error?: string; scanned?: number }>(response);
      if (!response.ok) throw new Error(data.error ?? "The queue could not be updated.");
      await load();
      setFeedback({
        tone: "success",
        message:
          action === "scan"
            ? `Scan complete${data.scanned != null ? ` · ${data.scanned} names checked` : ""}.`
            : action === "dismiss"
              ? "Item dismissed. Membership was kept."
              : "Marked resolved.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "The queue could not be updated.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <FeedbackBanner feedback={feedback} />
      <Panel
        title="Unresolved instruments"
        description="Do not guess replacements. Quarantined names stay on coverage lists until an admin confirms identity."
        actions={
          <Button size="sm" onClick={() => void act("", "scan")} disabled={loading}>
            {loading ? "Working…" : "Run resolver"}
          </Button>
        }
        bodyClassName="p-0"
      >
        <DataTable
          caption="Instrument resolution queue"
          rows={items}
          rowKey={(row) => row.id}
          emptyMessage="No open identity issues."
          columns={[
            {
              key: "symbol",
              header: "Symbol",
              mono: true,
              render: (row) => row.symbol,
            },
            {
              key: "status",
              header: "Status",
              render: (row) => humanize(row.status),
            },
            {
              key: "reason",
              header: "Reason",
              render: (row) => row.reason ?? "—",
            },
            {
              key: "suggested",
              header: "Suggested",
              mono: true,
              render: (row) => row.suggestedSymbol ?? "—",
            },
            {
              key: "actions",
              header: "Actions",
              align: "right",
              render: (row) => (
                <div className="flex justify-end gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={loading}
                    onClick={() => void act(row.id, "dismiss")}
                  >
                    Dismiss
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={loading}
                    onClick={() => void act(row.id, "resolve")}
                  >
                    Resolve
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </Panel>
    </div>
  );
}

function DemoAdminWorkspace() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const section = normalizeAdminSection(searchParams.get("tab"));

  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePending, setInvitePending] = useState(false);
  const [inviteFeedback, setInviteFeedback] = useState<Feedback | null>(null);
  const [createdInvitations, setCreatedInvitations] = useState<
    InvitationRecord[]
  >([]);

  const [marketStatus, setMarketStatus] = useState<MarketAdminStatus | null>(
    null,
  );
  const [marketAction, setMarketAction] = useState<"status" | "refresh" | null>(
    null,
  );
  const [marketFeedback, setMarketFeedback] = useState<Feedback | null>(null);

  const [deliveryActions, setDeliveryActions] = useState<
    Record<string, DeliveryActionState>
  >({});
  const [deliveryFeedback, setDeliveryFeedback] = useState<Feedback | null>(
    null,
  );

  const invitations = useMemo(
    () => [...createdInvitations, ...fixtureAdmin.invitations],
    [createdInvitations],
  );

  function setSection(next: AdminSectionKey) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`/admin?${params.toString()}`, { scroll: false });
  }

  async function sendInvite(event: React.FormEvent) {
    event.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email || invitePending) return;

    setInvitePending(true);
    setInviteFeedback(null);

    try {
      const response = await fetch("/api/admin/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, role: "member" }),
      });
      const data = await readJson<{
        error?: string;
        id?: string;
        email?: string;
        role?: "admin" | "member";
        status?: string;
        expiresAt?: string;
      }>(response);

      if (!response.ok) {
        throw new Error(data.error ?? "The invitation could not be created.");
      }

      if (data.id && data.expiresAt) {
        setCreatedInvitations((current) => [
          {
            id: data.id!,
            email: data.email ?? email,
            role: data.role ?? "member",
            status: data.status ?? "pending",
            expiresAt: data.expiresAt!,
          },
          ...current,
        ]);
      }

      setInviteEmail("");
      setInviteFeedback({
        tone: "success",
        message: data.expiresAt
          ? `Invitation created for ${data.email ?? email}. It expires ${formatCt(data.expiresAt)}.`
          : `Invitation created for ${data.email ?? email}.`,
      });
    } catch (error) {
      setInviteFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "The invitation service could not be reached.",
      });
    } finally {
      setInvitePending(false);
    }
  }

  const requestMarketStatus = useCallback(async () => {
    const response = await fetch("/api/admin/market-data", {
      cache: "no-store",
    });
    const data = await readJson<MarketAdminStatus & { error?: string }>(
      response,
    );
    if (!response.ok) {
      throw new Error(data.error ?? "Market-data status could not be loaded.");
    }
    return data;
  }, []);

  const loadMarketDataStatus = useCallback(async () => {
    setMarketAction("status");
    setMarketFeedback(null);

    try {
      const data = await requestMarketStatus();
      setMarketStatus(data);
      setMarketFeedback({
        tone: "success",
        message: `Status updated${data.freshness?.lastSuccessfulRefreshAt ? ` · last successful refresh ${formatCt(data.freshness.lastSuccessfulRefreshAt)}` : ""}.`,
      });
    } catch (error) {
      setMarketFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Market-data status could not be loaded.",
      });
    } finally {
      setMarketAction(null);
    }
  }, [requestMarketStatus]);

  async function retryMarketRefresh() {
    if (marketAction) return;
    setMarketAction("refresh");
    setMarketFeedback(null);

    try {
      const response = await fetch("/api/admin/market-data", {
        method: "POST",
      });
      const data = await readJson<MarketRefreshResponse>(response);
      if (!response.ok) {
        throw new Error(
          data.error ?? "The provider refresh could not be started.",
        );
      }

      let statusReloaded = true;
      try {
        setMarketStatus(await requestMarketStatus());
      } catch {
        statusReloaded = false;
      }

      const refreshStatus = data.refresh?.status ?? "queued";
      const isFailure =
        data.ok === false || Boolean(data.refresh?.errorMessage);
      const detail =
        data.refresh?.errorMessage ??
        data.refresh?.skippedReason ??
        (data.refresh?.symbolsRequested != null
          ? `${data.refresh.symbolsReceived ?? 0} of ${data.refresh.symbolsRequested} symbols received`
          : null);

      setMarketFeedback({
        tone: isFailure
          ? "error"
          : refreshStatus === "skipped"
            ? "info"
            : "success",
        message: `Provider refresh ${humanize(refreshStatus).toLowerCase()}${detail ? ` · ${humanize(detail)}` : ""}${statusReloaded ? "." : ". The status snapshot could not be reloaded."}`,
      });
    } catch (error) {
      setMarketFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "The provider refresh service could not be reached.",
      });
    } finally {
      setMarketAction(null);
    }
  }

  async function resendDelivery(id: string) {
    if (deliveryActions[id]?.phase === "pending") return;

    setDeliveryFeedback(null);
    setDeliveryActions((current) => ({
      ...current,
      [id]: { phase: "pending", message: "Queueing resend" },
    }));

    try {
      const response = await fetch(`/api/admin/deliveries/${id}/resend`, {
        method: "POST",
      });
      const data = await readJson<{
        error?: string;
        deliveryId?: string;
        status?: string;
        at?: string;
      }>(response);

      if (!response.ok) {
        throw new Error(data.error ?? "The delivery could not be requeued.");
      }

      const message = `Delivery ${data.deliveryId ?? id} queued for resend${data.at ? ` at ${formatCt(data.at)}` : ""}.`;
      setDeliveryActions((current) => ({
        ...current,
        [id]: { phase: "success", message },
      }));
      setDeliveryFeedback({ tone: "success", message });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "The delivery service could not be reached.";
      setDeliveryActions((current) => ({
        ...current,
        [id]: { phase: "error", message },
      }));
      setDeliveryFeedback({ tone: "error", message });
    }
  }

  const activeMembers = fixtureAdmin.team.filter(
    (member) => member.isActive,
  ).length;
  const failedDeliveries = fixtureAdmin.deliveries.filter(
    (delivery) => delivery.status === "failed",
  ).length;
  const configuredSources = fixtureAdmin.sources.filter(
    (source) => source.enabled,
  ).length;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Administration"
        title="Data Operations"
        description="Role-gated control plane for team access, report configuration, providers, jobs, delivery, and audit history."
        actions={<Badge tone="brand">Admin only</Badge>}
      />

      <dl className="grid overflow-hidden rounded-[6px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-1)] sm:grid-cols-2 xl:grid-cols-4">
        <StatusCell
          label="Team access"
          value={`${activeMembers} active`}
          detail={`${fixtureAdmin.invitations.length} pending fixture invitation`}
        />
        <StatusCell
          label="Edition schedule"
          value={`${fixtureAdmin.schedule.editions.length} editions`}
          detail={`${fixtureAdmin.schedule.timezone} · ${fixtureAdmin.schedule.graceMinutes}m grace`}
        />
        <StatusCell
          label="Source registry"
          value={`${configuredSources} enabled`}
          detail={`${fixtureAdmin.sources.length} registered sources`}
        />
        <StatusCell
          label="Delivery attention"
          value={
            failedDeliveries ? `${failedDeliveries} failed` : "No failures"
          }
          detail="Latest fixture delivery state"
        />
      </dl>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <AdminSectionNav active={section} onMobileChange={setSection} />

        <div className="min-w-0 space-y-4">
          <SectionIntro section={section} />

          {section === "team" ? (
            <div className="space-y-4">
              <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.7fr)]">
                <Panel
                  title="Members"
                  description="Current workspace access"
                  bodyClassName="p-0"
                >
                  <DataTable
                    caption="Workspace members"
                    rows={fixtureAdmin.team}
                    rowKey={(row) => row.id}
                    columns={[
                      {
                        key: "name",
                        header: "Name",
                        render: (row) => (
                          <span className="font-medium text-[var(--ib-text-primary)]">
                            {row.displayName}
                          </span>
                        ),
                      },
                      {
                        key: "email",
                        header: "Email",
                        priority: "medium",
                        render: (row) => (
                          <span className="text-[var(--ib-text-secondary)]">
                            {row.email}
                          </span>
                        ),
                      },
                      {
                        key: "role",
                        header: "Role",
                        render: (row) => <Badge tone="brand">{row.role}</Badge>,
                      },
                      {
                        key: "active",
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

                <Panel
                  title="Invite member"
                  description="Creates member access only"
                >
                  <form onSubmit={sendInvite} className="space-y-3">
                    <div>
                      <label
                        htmlFor="invite-email"
                        className="block text-xs font-medium text-[var(--ib-text-secondary)]"
                      >
                        Email address
                      </label>
                      <input
                        id="invite-email"
                        type="email"
                        autoComplete="email"
                        required
                        disabled={invitePending}
                        value={inviteEmail}
                        onChange={(event) => setInviteEmail(event.target.value)}
                        aria-describedby="invite-role-note"
                        className="mt-1.5 h-11 w-full rounded-[4px] border border-[var(--ib-border-control)] bg-[var(--ib-surface-inset)] px-3 text-sm text-[var(--ib-text-primary)] disabled:opacity-60"
                      />
                    </div>
                    <p
                      id="invite-role-note"
                      className="text-[11px] leading-4 text-[var(--ib-text-muted)]"
                    >
                      New invitations use the member role. Role changes require
                      a separate authorized workflow.
                    </p>
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={invitePending}
                      aria-busy={invitePending}
                      className="w-full"
                    >
                      {invitePending
                        ? "Creating invitation…"
                        : "Send invitation"}
                    </Button>
                  </form>
                  <div className="mt-3">
                    <FeedbackBanner feedback={inviteFeedback} />
                  </div>
                </Panel>
              </div>

              <Panel
                title="Pending invitations"
                description="Links expire automatically; no token values are displayed"
                bodyClassName="p-0"
              >
                <DataTable
                  caption="Pending workspace invitations"
                  rows={invitations}
                  rowKey={(row) => row.id}
                  columns={[
                    {
                      key: "email",
                      header: "Email",
                      render: (row) => row.email,
                    },
                    {
                      key: "role",
                      header: "Role",
                      priority: "medium",
                      render: (row) => <Badge tone="brand">{row.role}</Badge>,
                    },
                    {
                      key: "status",
                      header: "Status",
                      render: (row) => (
                        <Badge tone={workflowTone(row.status)}>
                          {row.status}
                        </Badge>
                      ),
                    },
                    {
                      key: "expires",
                      header: "Expires",
                      align: "right",
                      mono: true,
                      render: (row) => formatCt(row.expiresAt),
                    },
                  ]}
                />
              </Panel>
            </div>
          ) : null}

          {section === "schedule" ? (
            <div className="space-y-4">
              <dl className="grid overflow-hidden rounded-[6px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-1)] sm:grid-cols-3">
                <StatusCell
                  label="Timezone"
                  value={fixtureAdmin.schedule.timezone}
                  mono
                />
                <StatusCell
                  label="Grace window"
                  value={`${fixtureAdmin.schedule.graceMinutes} minutes`}
                />
                <StatusCell
                  label="Active editions"
                  value={fixtureAdmin.schedule.editions.length}
                />
              </dl>
              <Panel
                title="Edition schedule"
                description="Three firm-wide editions in America/Chicago. Close / Postmarket publishes at 16:00 CT, or one hour after an official NYSE early close."
                actions={<Badge tone="neutral">Read only</Badge>}
                bodyClassName="p-0"
              >
                <DataTable
                  caption="Firm-wide report edition schedule"
                  rows={fixtureAdmin.schedule.editions}
                  rowKey={(row) => row.edition}
                  columns={[
                    {
                      key: "edition",
                      header: "Edition",
                      render: (row) => (
                        <span className="font-medium text-[var(--ib-text-primary)]">
                          {editionLabel(row.edition)}
                        </span>
                      ),
                    },
                    {
                      key: "time",
                      header: "Local time",
                      align: "right",
                      mono: true,
                      render: (row) => row.localTime,
                    },
                    {
                      key: "timezone",
                      header: "Timezone",
                      align: "right",
                      priority: "medium",
                      mono: true,
                      render: () => fixtureAdmin.schedule.timezone,
                    },
                  ]}
                />
              </Panel>
            </div>
          ) : null}

          {section === "sources" ? (
            <div className="space-y-4">
              <dl className="grid overflow-hidden rounded-[6px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-1)] sm:grid-cols-3">
                <StatusCell
                  label="Registered"
                  value={fixtureAdmin.sources.length}
                />
                <StatusCell label="Enabled" value={configuredSources} />
                <StatusCell
                  label="Disabled"
                  value={fixtureAdmin.sources.length - configuredSources}
                />
              </dl>
              <Panel
                title="Source capability matrix"
                description="Configured state only; credentials remain server-side"
                bodyClassName="p-0"
              >
                <DataTable
                  caption="Configured source registry"
                  rows={fixtureAdmin.sources}
                  rowKey={(row) => row.id}
                  columns={[
                    {
                      key: "name",
                      header: "Source",
                      render: (row) => (
                        <div>
                          <p className="font-medium text-[var(--ib-text-primary)]">
                            {row.name}
                          </p>
                          <p className="font-mono text-[10px] text-[var(--ib-text-muted)]">
                            {row.id}
                          </p>
                        </div>
                      ),
                    },
                    {
                      key: "configured",
                      header: "Configured state",
                      align: "center",
                      render: (row) => (
                        <Badge tone={row.enabled ? "success" : "neutral"}>
                          {row.enabled ? "Enabled" : "Disabled"}
                        </Badge>
                      ),
                    },
                    {
                      key: "health",
                      header: "Health",
                      align: "right",
                      render: (row) => (
                        <Badge tone={workflowTone(row.health)}>
                          {row.health}
                        </Badge>
                      ),
                    },
                  ]}
                />
              </Panel>
            </div>
          ) : null}

          {section === "market-data" ? (
            <div className="space-y-4">
              <FeedbackBanner feedback={marketFeedback} />

              <Panel
                title="Market-data control"
                description="Refresh trusted status or retry the centralized provider refresh"
                actions={
                  marketStatus?.fixtures ? (
                    <Badge tone="mock">Mock</Badge>
                  ) : null
                }
              >
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={marketAction !== null}
                    aria-busy={marketAction === "status"}
                    onClick={() => void loadMarketDataStatus()}
                  >
                    {marketAction === "status"
                      ? "Loading status…"
                      : "Refresh status"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    disabled={marketAction !== null}
                    aria-busy={marketAction === "refresh"}
                    onClick={() => void retryMarketRefresh()}
                  >
                    {marketAction === "refresh"
                      ? "Retrying refresh…"
                      : "Retry provider refresh"}
                  </Button>
                </div>
                <p className="mt-2 text-[11px] leading-4 text-[var(--ib-text-muted)]">
                  Retry uses the existing centralized refresh service and
                  respects current provider and licensing guards.
                </p>
              </Panel>

              <Panel
                title="Licensing and entitlement"
                description="Operational guardrails; acknowledgement is not proof of a license"
                variant={
                  marketStatus?.license?.warning ? "critical" : "default"
                }
              >
                <p
                  data-testid="admin-license-warning"
                  className={
                    marketStatus?.license?.warning
                      ? "text-xs leading-5 text-[var(--state-warning)]"
                      : "text-xs leading-5 text-[var(--ib-text-secondary)]"
                  }
                >
                  {marketStatus
                    ? (marketStatus.license?.warning ??
                      "No licensing warning was reported. Acknowledgement remains an operational guardrail, not proof of a license.")
                    : "Licensing status has not been loaded. Acknowledgement remains an operational guardrail, not proof of a license. Select Refresh status to inspect the current guardrail."}
                </p>
                <dl className="mt-3 grid overflow-hidden rounded-[4px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-inset)] sm:grid-cols-[minmax(210px,1.2fr)_minmax(120px,1fr)_minmax(120px,1fr)]">
                  <StatusCell
                    label="Scope"
                    value={marketStatus?.license?.scope ?? "—"}
                    mono
                  />
                  <StatusCell
                    label="Acknowledged"
                    value={
                      marketStatus?.license?.acknowledged == null
                        ? "—"
                        : marketStatus.license.acknowledged
                          ? "Yes"
                          : "No"
                    }
                  />
                  <StatusCell
                    label="Permitted surfaces"
                    value={
                      marketStatus?.license?.permittedSurfaces?.length ?? "—"
                    }
                  />
                </dl>
              </Panel>

              <Panel title="Feed and freshness" bodyClassName="p-0">
                <dl className="grid sm:grid-cols-2 xl:grid-cols-4">
                  <StatusCell
                    label="Feed"
                    value={marketStatus?.feed?.latencyCoverageLabel ?? "—"}
                    detail={
                      marketStatus?.feed?.latencyClass ?? "Status pending"
                    }
                    testId="admin-feed-label"
                  />
                  <StatusCell
                    label="Session"
                    value={humanize(marketStatus?.feed?.marketSession)}
                    detail={marketStatus?.feed?.coverage ?? "Coverage pending"}
                  />
                  <StatusCell
                    label="Provider"
                    value={marketStatus?.feed?.providerName ?? "—"}
                    detail={`${marketStatus?.universeSize ?? "—"} active universe symbols`}
                    mono
                  />
                  <StatusCell
                    label="Last success"
                    value={formatCt(
                      marketStatus?.freshness?.lastSuccessfulRefreshAt,
                    )}
                    detail={
                      marketStatus?.freshness?.cadenceSeconds
                        ? `${marketStatus.freshness.cadenceSeconds}s cadence`
                        : "Cadence pending"
                    }
                    mono
                  />
                </dl>
                {marketStatus?.freshness?.lastError ? (
                  <div className="border-t border-[var(--ib-border-subtle)] px-3 py-2.5 text-xs text-[var(--market-negative)]">
                    Last provider error: {marketStatus.freshness.lastError}
                  </div>
                ) : null}
              </Panel>

              <div className="grid min-w-0 gap-4 xl:grid-cols-2">
                <Panel
                  title="Non-secret configuration"
                  description="Presence and routing only"
                >
                  <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                        Primary / fallback
                      </dt>
                      <dd className="mt-1 font-mono text-xs text-[var(--ib-text-primary)]">
                        {marketStatus?.config?.primary ?? "—"} /{" "}
                        {marketStatus?.config?.fallback ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                        Stock feed
                      </dt>
                      <dd className="mt-1 font-mono text-xs text-[var(--ib-text-primary)]">
                        {marketStatus?.config?.stockFeed ?? "—"}
                      </dd>
                    </div>
                    {[
                      ["Alpaca", marketStatus?.config?.hasAlpacaKeys],
                      ["Massive", marketStatus?.config?.hasMassiveKey],
                      ["Finnhub", marketStatus?.config?.hasFinnhubKey],
                    ].map(([label, configured]) => (
                      <div
                        key={String(label)}
                        className="flex items-center justify-between gap-2"
                      >
                        <dt className="text-xs text-[var(--ib-text-secondary)]">
                          {String(label)}
                        </dt>
                        <dd>
                          <Badge tone={configured ? "success" : "neutral"}>
                            {configured ? "Configured" : "Not configured"}
                          </Badge>
                        </dd>
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-xs text-[var(--ib-text-secondary)]">
                        Stale threshold
                      </dt>
                      <dd className="font-mono text-xs text-[var(--ib-text-primary)]">
                        {marketStatus?.config?.staleAfterSeconds != null
                          ? `${marketStatus.config.staleAfterSeconds}s`
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                </Panel>

                <Panel
                  title="Coverage capability"
                  description="Current cache metadata"
                >
                  <dl className="space-y-3">
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                        Breadth
                      </dt>
                      <dd className="mt-1 text-xs leading-5 text-[var(--ib-text-primary)]">
                        {marketStatus?.breadth?.supported
                          ? "Supported"
                          : (marketStatus?.breadth?.explanation ??
                            "Status unavailable")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                        Movers coverage
                      </dt>
                      <dd className="mt-1 text-xs leading-5 text-[var(--ib-text-primary)]">
                        {marketStatus?.moversCoverageNotes ??
                          "No coverage note reported"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                        Latest attempt
                      </dt>
                      <dd className="mt-1 font-mono text-xs text-[var(--ib-text-primary)]">
                        {formatCt(marketStatus?.freshness?.lastAttemptAt)}
                      </dd>
                    </div>
                  </dl>
                </Panel>
              </div>

              <Panel
                title="Provider quota and circuit state"
                bodyClassName="p-0"
              >
                <DataTable
                  caption="Market-data provider quota and circuit state"
                  emptyMessage="No provider usage has been recorded in this process."
                  rows={marketStatus?.usage ?? []}
                  rowKey={(row) => row.providerKey}
                  columns={[
                    {
                      key: "provider",
                      header: "Provider",
                      mono: true,
                      render: (row) => row.providerKey,
                    },
                    {
                      key: "minute",
                      header: "1m utilization",
                      align: "right",
                      mono: true,
                      render: (row) =>
                        `${Math.round(row.utilization.minuteRequests * 100)}%`,
                    },
                    {
                      key: "hour",
                      header: "1h utilization",
                      align: "right",
                      priority: "medium",
                      mono: true,
                      render: (row) =>
                        `${Math.round(row.utilization.hourRequests * 100)}%`,
                    },
                    {
                      key: "day",
                      header: "1d utilization",
                      align: "right",
                      priority: "wide",
                      mono: true,
                      render: (row) =>
                        `${Math.round(row.utilization.dayRequests * 100)}%`,
                    },
                    {
                      key: "circuit",
                      header: "Circuit",
                      align: "right",
                      render: (row) => (
                        <Badge tone={row.circuit.open ? "error" : "success"}>
                          {row.circuit.open ? "Open" : "Closed"}
                        </Badge>
                      ),
                    },
                  ]}
                />
              </Panel>
            </div>
          ) : null}

          {section === "ai-routing" ? (
            <Panel
              title="AI provider routing"
              description="Non-secret routing order"
              actions={<Badge tone="neutral">Read only</Badge>}
            >
              <dl className="grid overflow-hidden rounded-[4px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-inset)] sm:grid-cols-3">
                <StatusCell
                  label="Default provider"
                  value={fixtureAdmin.aiRouting.defaultProvider}
                  mono
                />
                <StatusCell
                  label="Prompt version"
                  value={fixtureAdmin.aiRouting.promptVersion}
                  mono
                />
                <StatusCell
                  label="Fallback order"
                  value={fixtureAdmin.aiRouting.fallbackOrder.join(" → ")}
                  mono
                />
              </dl>
              <p className="mt-3 text-[11px] leading-4 text-[var(--ib-text-muted)]">
                Provider keys, model credentials, and secret configuration are
                never displayed here.
              </p>
            </Panel>
          ) : null}

          {section === "jobs" ? (
            <Panel
              title="Report jobs"
              description={`${fixtureAdmin.jobs.length} recent fixture jobs`}
              bodyClassName="p-0"
            >
              <DataTable
                caption="Recent report jobs"
                rows={fixtureAdmin.jobs}
                rowKey={(row) => row.id}
                columns={[
                  {
                    key: "id",
                    header: "Job",
                    mono: true,
                    render: (row) => row.id,
                  },
                  {
                    key: "report",
                    header: "Report",
                    priority: "medium",
                    mono: true,
                    render: (row) => row.reportId,
                  },
                  {
                    key: "status",
                    header: "Status",
                    render: (row) => (
                      <Badge tone={workflowTone(row.status)}>
                        {humanize(row.status)}
                      </Badge>
                    ),
                  },
                  {
                    key: "stage",
                    header: "Stage",
                    priority: "medium",
                    render: (row) => (
                      <span className="text-xs text-[var(--ib-text-secondary)]">
                        {humanize(row.stage)}
                      </span>
                    ),
                  },
                  {
                    key: "updated",
                    header: "Updated",
                    align: "right",
                    priority: "wide",
                    mono: true,
                    render: (row) => formatCt(row.updatedAt),
                  },
                ]}
              />
            </Panel>
          ) : null}

          {section === "deliveries" ? (
            <div className="space-y-4">
              <FeedbackBanner feedback={deliveryFeedback} />
              <Panel
                title="Report deliveries"
                description="Recipient counts are aggregate; addresses are not exposed"
                bodyClassName="p-0"
              >
                <DataTable
                  caption="Recent report deliveries"
                  rows={fixtureAdmin.deliveries}
                  rowKey={(row) => row.id}
                  columns={[
                    {
                      key: "id",
                      header: "Delivery",
                      mono: true,
                      render: (row) => row.id,
                    },
                    {
                      key: "report",
                      header: "Report",
                      priority: "medium",
                      mono: true,
                      render: (row) => row.reportId,
                    },
                    {
                      key: "recipients",
                      header: "Recipients",
                      align: "right",
                      mono: true,
                      render: (row) => row.recipientCount,
                    },
                    {
                      key: "attempted",
                      header: "Attempted",
                      align: "right",
                      priority: "wide",
                      mono: true,
                      render: (row) => formatCt(row.attemptedAt),
                    },
                    {
                      key: "status",
                      header: "Status",
                      align: "right",
                      render: (row) => {
                        const queued =
                          deliveryActions[row.id]?.phase === "success";
                        const status = queued ? "queued" : row.status;
                        return (
                          <Badge tone={workflowTone(status)}>{status}</Badge>
                        );
                      },
                    },
                    {
                      key: "actions",
                      header: "Action",
                      align: "right",
                      render: (row) => {
                        const action = deliveryActions[row.id];
                        if (action?.phase === "success") {
                          return (
                            <span className="text-xs text-[var(--ib-text-muted)]">
                              Queued
                            </span>
                          );
                        }
                        return row.status === "failed" ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={action?.phase === "pending"}
                            aria-busy={action?.phase === "pending"}
                            onClick={() => void resendDelivery(row.id)}
                          >
                            {action?.phase === "pending"
                              ? "Queueing…"
                              : "Queue resend"}
                          </Button>
                        ) : null;
                      },
                    },
                  ]}
                />
              </Panel>
            </div>
          ) : null}

          {section === "audit" ? (
            <Panel
              title="Audit history"
              description="Immutable administrative event summaries"
              bodyClassName="p-0"
            >
              <DataTable
                caption="Administrative audit history"
                rows={fixtureAdmin.audit}
                rowKey={(row) => row.id}
                columns={[
                  {
                    key: "at",
                    header: "When",
                    mono: true,
                    render: (row) => formatCt(row.at),
                  },
                  {
                    key: "actor",
                    header: "Actor",
                    priority: "medium",
                    render: (row) => row.actor,
                  },
                  {
                    key: "action",
                    header: "Action",
                    render: (row) => humanize(row.action),
                  },
                  {
                    key: "target",
                    header: "Target",
                    align: "right",
                    mono: true,
                    render: (row) => row.target,
                  },
                ]}
              />
            </Panel>
          ) : null}

          {section === "instruments" ? <InstrumentQueuePanel /> : null}
        </div>
      </div>
    </div>
  );
}

function ProductionAdminWorkspace() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const section = normalizeAdminSection(searchParams.get("tab"));

  function setSection(next: AdminSectionKey) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`/admin?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        eyebrow="Administration"
        title="Data Operations"
        description="Role-gated control plane for team access, report configuration, providers, jobs, delivery, and audit history."
        actions={<Badge tone="warn">Repository limited</Badge>}
      />
      <div className="grid min-w-0 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <AdminSectionNav active={section} onMobileChange={setSection} />
        <div className="min-w-0 space-y-4">
          <SectionIntro section={section} />
          {section === "instruments" ? (
            <InstrumentQueuePanel />
          ) : (
            <StatePanel
              kind="unavailable"
              title="Live administration repository unavailable"
              description="Team, schedule, source, job, delivery, and audit records on this screen are demo fixtures, so they are hidden outside demo mode. The instrument queue is live."
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function AdminWorkspace({ demoMode }: { demoMode: boolean }) {
  return demoMode ? <DemoAdminWorkspace /> : <ProductionAdminWorkspace />;
}
