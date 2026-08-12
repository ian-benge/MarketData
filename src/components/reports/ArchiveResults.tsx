import Link from "next/link";
import { ArrowRight, SearchX } from "lucide-react";
import { ReportStatusBadge } from "@/components/reports/ReportStatusBadge";
import {
  formatEdition,
  formatReportTimestamp,
  formatTradingDate,
} from "@/components/reports/report-format";
import type { FixtureReportSummary } from "@/lib/fixtures/reports";

function TickerList({ tickers }: { tickers: string[] }) {
  return tickers.length ? (
    <span className="font-mono text-xs text-[var(--ib-text-secondary)]">
      {tickers.join(" · ")}
    </span>
  ) : (
    <span className="text-[var(--ib-text-muted)]">—</span>
  );
}

function OpenReportLink({ report }: { report: FixtureReportSummary }) {
  return (
    <Link
      href={`/reports/${report.id}`}
      aria-label={`Open ${formatEdition(report.edition)} report for ${formatTradingDate(report.tradingDate)}`}
      className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--ib-border-strong)] px-2.5 text-xs font-semibold text-[var(--ib-text-primary)] transition-colors hover:border-[var(--ib-maroon-500)] hover:bg-[var(--ib-surface-selected)]"
    >
      Open research
      <ArrowRight aria-hidden="true" className="size-3.5" />
    </Link>
  );
}

function EmptyArchive({ hasFilters }: { hasFilters: boolean }) {
  return (
    <section className="border border-[var(--ib-border-strong)] bg-[var(--ib-surface-1)] px-5 py-12 text-center">
      <SearchX
        aria-hidden="true"
        className="mx-auto size-7 text-[var(--ib-text-muted)]"
        strokeWidth={1.5}
      />
      <h2 className="mt-4 text-base font-semibold text-[var(--ib-text-primary)]">
        {hasFilters
          ? "No reports match these filters"
          : "No archived reports are available"}
      </h2>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-[var(--ib-text-muted)]">
        {hasFilters
          ? "Clear the current search and date constraints to return to the complete firm-wide archive."
          : "Completed and partial reports will appear here when they enter the firm-wide archive."}
      </p>
      {hasFilters ? (
        <Link
          href="/archive"
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--ib-maroon-800)] px-4 text-sm font-semibold text-[var(--ib-text-primary)] transition-colors hover:bg-[var(--ib-maroon-650)]"
        >
          Reset archive filters
        </Link>
      ) : null}
    </section>
  );
}

export function ArchiveResults({
  reports,
  hasFilters,
}: {
  reports: FixtureReportSummary[];
  hasFilters: boolean;
}) {
  if (reports.length === 0) return <EmptyArchive hasFilters={hasFilters} />;

  return (
    <section
      aria-labelledby="archive-results-heading"
      className="min-w-0 border border-[var(--ib-border-strong)] bg-[var(--ib-surface-1)]"
    >
      <header className="flex items-center justify-between gap-3 border-b border-[var(--ib-border-strong)] px-3 py-2.5 sm:px-4">
        <div>
          <h2
            id="archive-results-heading"
            className="text-sm font-semibold text-[var(--ib-text-primary)]"
          >
            Archived research
          </h2>
          <p className="mt-0.5 text-xs text-[var(--ib-text-muted)]">
            Firm-wide report snapshots
          </p>
        </div>
        <span className="font-mono text-xs text-[var(--ib-text-secondary)]">
          {reports.length} {reports.length === 1 ? "report" : "reports"}
        </span>
      </header>

      <ul className="divide-y divide-[var(--ib-border-subtle)] md:hidden">
        {reports.map((report) => (
          <li key={report.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--ib-maroon-300)]">
                  {formatEdition(report.edition)} edition
                </p>
                <p className="mt-1 font-mono text-xs text-[var(--ib-text-muted)]">
                  {formatTradingDate(report.tradingDate)}
                </p>
              </div>
              <ReportStatusBadge status={report.status} />
            </div>

            <h3 className="mt-3 text-sm font-semibold leading-5 text-[var(--ib-text-primary)]">
              <Link href={`/reports/${report.id}`} className="hover:underline">
                {report.headlineSummary}
              </Link>
            </h3>

            <div className="mt-3">
              <p className="text-[11px] uppercase tracking-wide text-[var(--ib-text-muted)]">
                Coverage
              </p>
              <p className="mt-1">
                <TickerList tickers={report.tickers} />
              </p>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--ib-border-subtle)] pt-3">
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-[var(--ib-text-muted)]">
                  Generated
                </dt>
                <dd className="mt-1 font-mono text-xs leading-5 text-[var(--ib-text-secondary)]">
                  {formatReportTimestamp(report.completedAt)}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-[var(--ib-text-muted)]">
                  Report ID
                </dt>
                <dd className="mt-1 truncate font-mono text-xs leading-5 text-[var(--ib-text-secondary)]">
                  {report.id}
                </dd>
              </div>
            </dl>

            <div className="mt-4">
              <OpenReportLink report={report} />
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden min-w-0 overflow-x-auto md:block">
        <table className="w-full min-w-[920px] border-collapse text-left text-[13px]">
          <caption className="sr-only">
            Firm-wide archived market research reports
          </caption>
          <thead className="bg-[var(--ib-surface-2)] text-[11px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
            <tr>
              <th scope="col" className="min-w-[300px] px-3 py-2 font-medium">
                Report
              </th>
              <th scope="col" className="w-28 px-3 py-2 font-medium">
                Edition
              </th>
              <th scope="col" className="w-36 px-3 py-2 font-medium">
                Trading date
              </th>
              <th scope="col" className="w-48 px-3 py-2 font-medium">
                Generated
              </th>
              <th scope="col" className="w-44 px-3 py-2 font-medium">
                Tickers
              </th>
              <th scope="col" className="w-32 px-3 py-2 font-medium">
                Status
              </th>
              <th scope="col" className="w-36 px-3 py-2 text-right font-medium">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ib-border-subtle)]">
            {reports.map((report) => (
              <tr
                key={report.id}
                className="transition-colors hover:bg-[var(--ib-surface-hover)]"
              >
                <td className="px-3 py-2.5 align-top">
                  <Link
                    href={`/reports/${report.id}`}
                    className="font-medium leading-5 text-[var(--ib-text-primary)] hover:underline"
                  >
                    {report.headlineSummary}
                  </Link>
                  <div className="mt-1 font-mono text-[11px] text-[var(--ib-text-muted)]">
                    {report.id}
                  </div>
                </td>
                <td className="px-3 py-2.5 align-top font-medium text-[var(--ib-text-secondary)]">
                  {formatEdition(report.edition)}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 align-top font-mono text-xs text-[var(--ib-text-secondary)]">
                  {formatTradingDate(report.tradingDate)}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 align-top font-mono text-xs text-[var(--ib-text-secondary)]">
                  <time dateTime={report.completedAt ?? undefined}>
                    {formatReportTimestamp(report.completedAt)}
                  </time>
                </td>
                <td className="px-3 py-2.5 align-top">
                  <TickerList tickers={report.tickers} />
                </td>
                <td className="px-3 py-2.5 align-top">
                  <ReportStatusBadge status={report.status} />
                </td>
                <td className="px-3 py-2.5 text-right align-top">
                  <OpenReportLink report={report} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
