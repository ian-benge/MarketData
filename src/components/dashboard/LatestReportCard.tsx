import { ArrowUpRight, FileText } from "lucide-react";
import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { StatusIndicator } from "@/components/ui/StatusIndicator";
import { formatMarketDateTime } from "@/lib/utils/format";

export type LatestReport = {
  id: string;
  edition: string;
  tradingDate: string;
  status: string;
  headlineSummary: string;
  completedAt: string;
};

export function LatestReportLine({ report }: { report: LatestReport | null }) {
  if (!report) {
    return (
      <p className="text-[11px] leading-4 text-[var(--ib-text-muted)]">
        No archived research yet.
      </p>
    );
  }
  return (
    <Link
      href={`/reports/${report.id}`}
      className="inline-flex min-w-0 items-center gap-1.5 text-[11px] leading-4 text-[var(--ib-text-secondary)] hover:text-[var(--ib-maroon-300)]"
    >
      <span className="shrink-0 font-mono uppercase tracking-[0.08em] text-[var(--ib-maroon-300)]">
        {report.edition}
      </span>
      <span className="min-w-0 truncate">{report.headlineSummary}</span>
      <ArrowUpRight aria-hidden="true" className="size-3 shrink-0" />
    </Link>
  );
}

export function LatestReportCard({ report }: { report: LatestReport | null }) {
  return (
    <Panel
      title="Research desk"
      description="Latest completed firm-wide edition"
      actions={
        <FileText
          aria-hidden="true"
          className="size-4 text-[var(--ib-maroon-300)]"
        />
      }
    >
      {!report ? (
        <div className="py-4 text-center">
          <p className="text-[13px] text-[var(--ib-text-secondary)]">
            No archived research yet.
          </p>
          <p className="mt-1 text-[11px] text-[var(--ib-text-muted)]">
            Generate a brief or wait for the next scheduled edition.
          </p>
        </div>
      ) : (
        <article>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ib-maroon-300)]">
              {report.edition} brief
            </span>
            <StatusIndicator
              kind={
                report.status === "completed"
                  ? "completed"
                  : report.status === "partial"
                    ? "partial"
                    : report.status === "failed"
                      ? "failed"
                      : "queued"
              }
              label={report.status}
            />
          </div>
          <p className="mt-3 text-[13px] font-medium leading-5 text-[var(--ib-text-primary)]">
            {report.headlineSummary}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-2 border-y border-[var(--ib-border-subtle)] py-2 font-mono text-[10px]">
            <div>
              <dt className="text-[var(--ib-text-muted)]">Trading date</dt>
              <dd className="mt-0.5 text-[var(--ib-text-secondary)]">
                {report.tradingDate}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--ib-text-muted)]">Completed</dt>
              <dd className="mt-0.5 text-[var(--ib-text-secondary)]">
                {formatMarketDateTime(report.completedAt)}
              </dd>
            </div>
          </dl>
          <Link
            href={`/reports/${report.id}`}
            className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-[4px] border border-[var(--ib-border-control)] bg-[var(--ib-surface-2)] px-3 text-[12px] font-medium text-[var(--ib-text-primary)] hover:bg-[var(--ib-surface-hover)] max-sm:min-h-11"
          >
            Open research
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </Link>
        </article>
      )}
    </Panel>
  );
}
