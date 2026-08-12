"use client";

import { useState, type FormEvent } from "react";
import { Badge, type BadgeProps } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { Panel } from "@/components/ui/Panel";
import type { FixtureProposal } from "@/lib/fixtures/proposals";

type ProposalType = FixtureProposal["type"];
type SessionState = "submitting" | "accepted";

type ProposalRow = FixtureProposal & {
  demo?: boolean;
  sessionState?: SessionState;
};

type Feedback = { tone: "error" | "success"; message: string } | null;

type FieldErrors = Partial<Record<"title" | "detail", string>>;

type CreateProposalResponse = {
  id?: unknown;
  type?: unknown;
  title?: unknown;
  detail?: unknown;
  status?: unknown;
  submittedBy?: unknown;
  submittedAt?: unknown;
  reviewedBy?: unknown;
  reviewedAt?: unknown;
  demo?: unknown;
  error?: unknown;
};

const PROPOSAL_TYPES: Array<{
  value: ProposalType;
  label: string;
  description: string;
}> = [
  {
    value: "watchlist_add",
    label: "Add to watchlist",
    description: "Request an additional ticker in shared coverage.",
  },
  {
    value: "watchlist_remove",
    label: "Remove from watchlist",
    description: "Request removal of an existing shared ticker.",
  },
  {
    value: "sector_change",
    label: "Change sector coverage",
    description: "Request a sector membership or taxonomy adjustment.",
  },
  {
    value: "threshold_change",
    label: "Change mover threshold",
    description: "Request an adjustment to a configured materiality threshold.",
  },
];

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Chicago",
  timeZoneName: "short",
});

function proposalTypeLabel(type: ProposalType): string {
  return PROPOSAL_TYPES.find((option) => option.value === type)?.label ?? type;
}

function statusTone(status: FixtureProposal["status"]): BadgeProps["tone"] {
  if (status === "approved") return "success";
  if (status === "rejected") return "error";
  if (status === "pending") return "info";
  return "neutral";
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Time unavailable"
    : dateTimeFormatter.format(parsed);
}

function reviewCopy(row: ProposalRow) {
  if (!row.reviewedBy && !row.reviewedAt) {
    return (
      <span className="text-[var(--ib-text-muted)]">Awaiting admin review</span>
    );
  }
  return (
    <span>
      {row.reviewedBy ? `Reviewed by ${row.reviewedBy}` : "Reviewed"}
      {row.reviewedAt ? (
        <>
          <br />
          <span className="font-mono text-[11px] text-[var(--ib-text-muted)]">
            {formatDateTime(row.reviewedAt)}
          </span>
        </>
      ) : null}
    </span>
  );
}

function ProposalCards({ rows }: { rows: ProposalRow[] }) {
  return (
    <div className="space-y-2 md:hidden">
      {rows.map((row) => (
        <article
          key={row.id}
          className="min-w-0 rounded-[4px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-2)] p-3"
        >
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                {proposalTypeLabel(row.type)}
              </p>
              <h3 className="mt-1 text-sm font-semibold leading-5 text-[var(--ib-text-primary)]">
                {row.title}
              </h3>
            </div>
            <Badge tone={statusTone(row.status)}>{row.status}</Badge>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--ib-text-secondary)]">
            {row.detail}
          </p>
          <dl className="mt-3 grid gap-2 border-t border-[var(--ib-border-subtle)] pt-3 text-xs">
            <div>
              <dt className="text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                Submitted
              </dt>
              <dd className="mt-0.5 break-words text-[var(--ib-text-secondary)]">
                {row.submittedBy}
                <br />
                <span className="font-mono text-[11px] text-[var(--ib-text-muted)]">
                  {formatDateTime(row.submittedAt)}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                Review
              </dt>
              <dd className="mt-0.5 break-words text-[var(--ib-text-secondary)]">
                {reviewCopy(row)}
              </dd>
            </div>
          </dl>
          {row.sessionState ? (
            <div className="mt-3">
              <Badge tone={row.sessionState === "submitting" ? "warn" : "mock"}>
                {row.sessionState === "submitting"
                  ? "Submitting"
                  : "Session only"}
              </Badge>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

export function ProposalsWorkspace({
  initialProposals,
}: {
  initialProposals: FixtureProposal[];
}) {
  const [rows, setRows] = useState<ProposalRow[]>(initialProposals);
  const [type, setType] = useState<ProposalType>("watchlist_add");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [submitting, setSubmitting] = useState(false);

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!title.trim()) errors.title = "Enter a concise proposal title.";
    if (!detail.trim()) {
      errors.detail = "Explain the requested change and why it is needed.";
    }
    return errors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setFeedback(null);
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const temporaryId = `session-proposal-${Date.now()}`;
    const submittedAt = new Date().toISOString();
    const optimistic: ProposalRow = {
      id: temporaryId,
      type,
      title: title.trim(),
      detail: detail.trim(),
      status: "pending",
      submittedBy: "Current member · session",
      submittedAt,
      reviewedBy: null,
      reviewedAt: null,
      sessionState: "submitting",
    };

    setSubmitting(true);
    setRows((current) => [optimistic, ...current]);

    try {
      const response = await fetch("/api/proposals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type,
          title: optimistic.title,
          detail: optimistic.detail,
        }),
      });
      const payload = (await response
        .json()
        .catch(() => ({}))) as CreateProposalResponse;

      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : "The proposal could not be submitted.",
        );
      }
      if (typeof payload.id !== "string") {
        throw new Error("The proposal response was incomplete.");
      }

      const saved: ProposalRow = {
        ...optimistic,
        id: payload.id,
        type: PROPOSAL_TYPES.some((option) => option.value === payload.type)
          ? (payload.type as ProposalType)
          : type,
        title:
          typeof payload.title === "string" ? payload.title : optimistic.title,
        detail:
          typeof payload.detail === "string"
            ? payload.detail
            : optimistic.detail,
        status:
          payload.status === "approved" ||
          payload.status === "rejected" ||
          payload.status === "withdrawn" ||
          payload.status === "pending"
            ? payload.status
            : "pending",
        submittedBy:
          typeof payload.submittedBy === "string"
            ? payload.submittedBy
            : optimistic.submittedBy,
        submittedAt:
          typeof payload.submittedAt === "string"
            ? payload.submittedAt
            : submittedAt,
        reviewedBy:
          typeof payload.reviewedBy === "string" ? payload.reviewedBy : null,
        reviewedAt:
          typeof payload.reviewedAt === "string" ? payload.reviewedAt : null,
        demo: payload.demo === true,
        sessionState: payload.demo === true ? "accepted" : undefined,
      };

      setRows((current) =>
        current.map((row) => (row.id === temporaryId ? saved : row)),
      );
      setType("watchlist_add");
      setTitle("");
      setDetail("");
      setFieldErrors({});
      setFeedback({
        tone: "success",
        message:
          payload.demo === true
            ? "Proposal accepted for admin review and added to this session. Demo fixture changes reset when the page reloads."
            : "Proposal submitted for administrator review.",
      });
    } catch (error) {
      setRows((current) => current.filter((row) => row.id !== temporaryId));
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "The proposal could not be submitted.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const pendingCount = rows.filter((row) => row.status === "pending").length;
  const reviewedCount = rows.filter(
    (row) => row.reviewedBy || row.reviewedAt,
  ).length;
  const selectedType = PROPOSAL_TYPES.find((option) => option.value === type)!;

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(290px,0.72fr)_minmax(0,1.6fr)]">
      <Panel
        title="Submit proposal"
        description="Member request for an administrator decision. Submission does not apply the change."
        actions={<Badge tone="brand">Member action</Badge>}
      >
        <form
          className="space-y-3"
          onSubmit={handleSubmit}
          aria-busy={submitting}
          noValidate
        >
          <div>
            <label
              htmlFor="proposal-type"
              className="mb-1 block text-xs font-medium text-[var(--ib-text-secondary)]"
            >
              Request type
            </label>
            <select
              id="proposal-type"
              className="field-control"
              value={type}
              onChange={(event) => setType(event.target.value as ProposalType)}
              aria-describedby="proposal-type-help"
              disabled={submitting}
            >
              {PROPOSAL_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p
              id="proposal-type-help"
              className="mt-1 text-[11px] leading-4 text-[var(--ib-text-muted)]"
            >
              {selectedType.description}
            </p>
          </div>

          <div>
            <label
              htmlFor="proposal-title"
              className="mb-1 block text-xs font-medium text-[var(--ib-text-secondary)]"
            >
              Proposal title
            </label>
            <input
              id="proposal-title"
              className="field-control"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setFieldErrors((current) => ({ ...current, title: undefined }));
              }}
              aria-invalid={Boolean(fieldErrors.title)}
              aria-describedby={
                fieldErrors.title ? "proposal-title-error" : undefined
              }
              maxLength={120}
              disabled={submitting}
              required
            />
            {fieldErrors.title ? (
              <p
                id="proposal-title-error"
                className="mt-1 text-xs text-[var(--market-negative)]"
              >
                {fieldErrors.title}
              </p>
            ) : null}
          </div>

          <div>
            <label
              htmlFor="proposal-detail"
              className="mb-1 block text-xs font-medium text-[var(--ib-text-secondary)]"
            >
              Rationale and requested change
            </label>
            <textarea
              id="proposal-detail"
              className="field-control min-h-32 resize-y"
              value={detail}
              onChange={(event) => {
                setDetail(event.target.value);
                setFieldErrors((current) => ({
                  ...current,
                  detail: undefined,
                }));
              }}
              aria-invalid={Boolean(fieldErrors.detail)}
              aria-describedby={
                fieldErrors.detail
                  ? "proposal-detail-help proposal-detail-error"
                  : "proposal-detail-help"
              }
              maxLength={1200}
              disabled={submitting}
              required
            />
            <p
              id="proposal-detail-help"
              className="mt-1 text-[11px] leading-4 text-[var(--ib-text-muted)]"
            >
              Include the affected watchlist, sector, symbol, or threshold and
              the operational reason for the change.
            </p>
            {fieldErrors.detail ? (
              <p
                id="proposal-detail-error"
                className="mt-1 text-xs text-[var(--market-negative)]"
              >
                {fieldErrors.detail}
              </p>
            ) : null}
          </div>

          {feedback ? (
            <div
              role={feedback.tone === "error" ? "alert" : "status"}
              className={
                feedback.tone === "error"
                  ? "rounded-[4px] border border-[color-mix(in_oklab,var(--market-negative)_38%,transparent)] bg-[color-mix(in_oklab,var(--market-negative)_8%,transparent)] p-2.5 text-xs leading-5 text-[var(--market-negative)]"
                  : "rounded-[4px] border border-[var(--ib-border-strong)] bg-[var(--ib-surface-2)] p-2.5 text-xs leading-5 text-[var(--ib-text-secondary)]"
              }
            >
              {feedback.message}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--ib-border-subtle)] pt-3">
            <p className="max-w-xs text-[11px] leading-4 text-[var(--ib-text-muted)]">
              Session preview: accepted fixture requests remain local to this
              browser page.
            </p>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={submitting}
              aria-busy={submitting}
            >
              {submitting ? "Submitting…" : "Submit proposal"}
            </Button>
          </div>
        </form>
      </Panel>

      <Panel
        title="Review queue"
        description="Member requests and administrator decisions, including review attribution when available."
        actions={
          <div className="flex items-center gap-1.5">
            <Badge tone="info">{pendingCount} pending</Badge>
            <Badge tone="neutral">{reviewedCount} reviewed</Badge>
          </div>
        }
        bodyClassName="p-0"
      >
        <div className="p-3 md:hidden">
          <ProposalCards rows={rows} />
        </div>
        <div className="hidden md:block">
          <DataTable
            rows={rows}
            rowKey={(row) => row.id}
            caption="Proposal review queue"
            rowClassName={(row) =>
              row.sessionState === "submitting"
                ? "bg-[var(--ib-surface-selected)]"
                : undefined
            }
            columns={[
              {
                key: "proposal",
                header: "Proposal",
                width: "37%",
                render: (row) => (
                  <div className="min-w-52">
                    <div className="font-medium leading-5 text-[var(--ib-text-primary)]">
                      {row.title}
                    </div>
                    <div className="mt-0.5 text-[11px] leading-4 text-[var(--ib-text-muted)]">
                      {row.detail}
                    </div>
                    {row.sessionState ? (
                      <div className="mt-1.5">
                        <Badge
                          tone={
                            row.sessionState === "submitting" ? "warn" : "mock"
                          }
                        >
                          {row.sessionState === "submitting"
                            ? "Submitting"
                            : "Session only"}
                        </Badge>
                      </div>
                    ) : null}
                  </div>
                ),
              },
              {
                key: "type",
                header: "Type",
                priority: "medium",
                width: "150px",
                render: (row) => (
                  <span className="text-xs text-[var(--ib-text-secondary)]">
                    {proposalTypeLabel(row.type)}
                  </span>
                ),
              },
              {
                key: "status",
                header: "Status",
                width: "94px",
                render: (row) => (
                  <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                ),
              },
              {
                key: "submitted",
                header: "Submitted",
                priority: "medium",
                width: "190px",
                render: (row) => (
                  <span className="break-words text-xs text-[var(--ib-text-secondary)]">
                    {row.submittedBy}
                    <br />
                    <span className="font-mono text-[11px] text-[var(--ib-text-muted)]">
                      {formatDateTime(row.submittedAt)}
                    </span>
                  </span>
                ),
              },
              {
                key: "review",
                header: "Review",
                width: "210px",
                render: (row) => (
                  <span className="break-words text-xs leading-4 text-[var(--ib-text-secondary)]">
                    {reviewCopy(row)}
                  </span>
                ),
              },
            ]}
          />
        </div>
      </Panel>
    </div>
  );
}
