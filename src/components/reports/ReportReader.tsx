import Link from "next/link";
import {
  ChevronLeft,
  Download,
  ExternalLink,
  FileText,
  List,
  LockKeyhole,
} from "lucide-react";
import { ReportStatusBadge } from "@/components/reports/ReportStatusBadge";
import {
  formatEdition,
  formatReportStatus,
  formatReportTimestamp,
  formatTradingDate,
  reportSectionId,
} from "@/components/reports/report-format";
import { InstitutionalReportView } from "@/components/reports/InstitutionalReportView";
import type { FixtureReportDetail } from "@/lib/fixtures/reports";
import { listFixtureReports } from "@/lib/fixtures/reports";

type OutlineItem = {
  id: string;
  label: string;
};

function OutlineLinks({ items }: { items: OutlineItem[] }) {
  return (
    <ol className="mt-3 space-y-1 border-l border-[var(--ib-border-strong)] pl-3">
      {items.map((item, index) => (
        <li key={item.id}>
          <a
            href={`#${item.id}`}
            className="block py-1 text-xs leading-5 text-[var(--ib-text-muted)] transition-colors hover:text-[var(--ib-text-primary)]"
          >
            <span className="mr-2 font-mono text-[10px] text-[var(--ib-maroon-300)]">
              {String(index + 1).padStart(2, "0")}{" "}
            </span>
            {item.label}
          </a>
        </li>
      ))}
    </ol>
  );
}

function MobileOutline({ items }: { items: OutlineItem[] }) {
  return (
    <details className="border border-[var(--ib-border-strong)] bg-[var(--ib-surface-1)] p-3 xl:hidden">
      <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-[var(--ib-text-primary)] marker:hidden">
        <List
          aria-hidden="true"
          className="size-4 text-[var(--ib-maroon-300)]"
        />
        On this page
      </summary>
      <nav aria-label="Report section outline">
        <OutlineLinks items={items} />
      </nav>
    </details>
  );
}

function ReportMetadata({ report }: { report: FixtureReportDetail }) {
  return (
    <div className="mt-6 border-y border-[var(--report-rule)] py-4">
      <dl className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--report-ink-secondary)]">
            Trading date
          </dt>
          <dd className="mt-1 font-mono text-xs text-[var(--report-ink)]">
            {formatTradingDate(report.tradingDate)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--report-ink-secondary)]">
            Generated
          </dt>
          <dd className="mt-1 font-mono text-xs leading-5 text-[var(--report-ink)]">
            <time dateTime={report.completedAt ?? undefined}>
              {formatReportTimestamp(report.completedAt)}
            </time>
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--report-ink-secondary)]">
            Edition
          </dt>
          <dd className="mt-1 text-xs font-semibold text-[var(--report-ink)]">
            {formatEdition(report.edition)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--report-ink-secondary)]">
            Report status
          </dt>
          <dd className="mt-1 text-xs font-semibold text-[var(--report-ink)]">
            {formatReportStatus(report.status)}
          </dd>
        </div>
      </dl>

      <div className="mt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--report-ink-secondary)]">
          Covered tickers
        </p>
        <p className="mt-1 font-mono text-xs leading-5 text-[var(--report-ink)]">
          {report.tickers.length ? report.tickers.join(" · ") : "—"}
        </p>
      </div>
    </div>
  );
}

function JobMetadata({ report }: { report: FixtureReportDetail }) {
  return (
    <section
      id="run-metadata"
      aria-labelledby="run-metadata-heading"
      className="scroll-mt-20 border border-[var(--report-rule)] bg-[var(--report-paper-inset)] p-4 sm:p-5"
    >
      <h2
        id="run-metadata-heading"
        className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--report-ink)]"
      >
        Generation record
      </h2>
      {report.job ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--report-ink-secondary)]">
              Job ID
            </dt>
            <dd className="mt-1 break-all font-mono text-xs text-[var(--report-ink)]">
              {report.job.id}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--report-ink-secondary)]">
              Job status
            </dt>
            <dd className="mt-1 text-xs font-semibold text-[var(--report-ink)]">
              {formatReportStatus(report.job.status)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--report-ink-secondary)]">
              Final stage
            </dt>
            <dd className="mt-1 text-xs font-semibold text-[var(--report-ink)]">
              {formatReportStatus(report.job.stage)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--report-ink-secondary)]">
              Last update
            </dt>
            <dd className="mt-1 font-mono text-xs leading-5 text-[var(--report-ink)]">
              <time dateTime={report.job.updatedAt}>
                {formatReportTimestamp(report.job.updatedAt)}
              </time>
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-2 text-sm leading-6 text-[var(--report-ink-secondary)]">
          No report-run metadata is attached to this archived record.
        </p>
      )}
    </section>
  );
}

function SameDayEditionNav({ report }: { report: FixtureReportDetail }) {
  const siblings = listFixtureReports().filter(
    (row) => row.tradingDate === report.tradingDate && row.id !== report.id,
  );
  if (siblings.length === 0) return null;
  return (
    <nav
      aria-label="Same-day editions"
      className="mt-2 flex flex-wrap gap-2 text-xs"
    >
      {siblings.map((row) => (
        <Link
          key={row.id}
          href={`/reports/${row.id}`}
          className="rounded-[var(--radius-sm)] border border-[var(--ib-border-strong)] px-2 py-1 text-[var(--ib-text-secondary)] hover:text-[var(--ib-text-primary)]"
        >
          {formatEdition(row.edition)}
        </Link>
      ))}
    </nav>
  );
}

export function ReportReader({ report }: { report: FixtureReportDetail }) {
  const sectionItems = report.sections.map((section, index) => ({
    id: reportSectionId(section.title, index),
    label: section.title,
  }));
  const outlineItems: OutlineItem[] = [
    { id: "run-metadata", label: "Generation record" },
    ...sectionItems,
    { id: "citations", label: "Citations" },
  ];

  return (
    <div className="min-w-0 space-y-4">
      <header className="mx-auto flex max-w-[1080px] flex-col gap-3 border-b border-[var(--ib-border-strong)] pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link
            href="/archive"
            className="inline-flex min-h-8 items-center gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ib-text-muted)] transition-colors hover:text-[var(--ib-text-primary)]"
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
            Research Archive
          </Link>
          <p className="mt-1 font-mono text-xs text-[var(--ib-text-muted)]">
            {report.id}
          </p>
          <SameDayEditionNav report={report} />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <ReportStatusBadge status={report.status} />
          {report.pdfAvailable ? (
            <a
              href={`/api/reports/${report.id}/pdf`}
              download
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--ib-maroon-800)] px-4 text-sm font-semibold text-[var(--ib-text-primary)] transition-colors hover:bg-[var(--ib-maroon-650)] sm:min-h-9"
            >
              <Download aria-hidden="true" className="size-4" />
              Download PDF
            </a>
          ) : null}
        </div>
      </header>

      <div className="mx-auto max-w-[860px] xl:hidden">
        <MobileOutline items={outlineItems} />
      </div>

      <div className="mx-auto grid min-w-0 max-w-[1080px] items-start gap-4 xl:grid-cols-[minmax(0,1fr)_12rem]">
        <article className="min-w-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--report-rule)] bg-[var(--report-paper)] text-[var(--report-ink)]">
          <header className="px-5 py-6 sm:px-8 sm:py-8 lg:px-12 lg:py-10">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ib-maroon-650)]">
              <FileText aria-hidden="true" className="size-3.5" />
              IB Market Data · Research Archive
            </div>
            <h1 className="mt-4 max-w-2xl font-[family-name:var(--font-display)] text-2xl font-semibold leading-tight tracking-[-0.02em] text-[var(--report-ink)] sm:text-3xl">
              {formatEdition(report.edition)} market brief
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--report-ink-secondary)] sm:text-lg sm:leading-8">
              {report.document
                ? `${report.document.firmName} · cutoff ${report.document.dataCutoff}${
                    report.document.isDemo
                      ? " · DEMO fixtures — not for trading"
                      : ""
                  }`
                : report.headlineSummary}
            </p>
            <ReportMetadata report={report} />
          </header>

          <div className="space-y-8 px-5 pb-8 sm:px-8 sm:pb-10 lg:px-12 lg:pb-12">
            <aside className="flex gap-3 border-l-2 border-[var(--ib-maroon-650)] bg-[var(--report-paper-inset)] px-4 py-3">
              <LockKeyhole
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-[var(--ib-maroon-650)]"
              />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--report-ink)]">
                  Immutable research snapshot
                </p>
                <p className="mt-1 text-sm leading-6 text-[var(--report-ink-secondary)]">
                  Values and cited sources are presented as captured for this
                  report. They do not refresh with Market Overview.
                </p>
              </div>
            </aside>

            <JobMetadata report={report} />

            {report.document ? (
              <InstitutionalReportView document={report.document} />
            ) : (
              report.sections.map((section, index) => {
              const id = sectionItems[index].id;
              return (
                <section
                  key={id}
                  id={id}
                  aria-labelledby={`${id}-heading`}
                  className="scroll-mt-20 border-t border-[var(--report-rule)] pt-6 first:border-t-0 first:pt-0"
                >
                  <p className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--ib-maroon-650)]">
                    Section {String(index + 1).padStart(2, "0")}
                  </p>
                  <h2
                    id={`${id}-heading`}
                    className="mt-2 text-xl font-semibold tracking-[-0.01em] text-[var(--report-ink)]"
                  >
                    {section.title}
                  </h2>
                  <p className="mt-3 text-[15px] leading-7 text-[var(--report-ink-secondary)]">
                    {section.body}
                  </p>
                </section>
              );
            })
            )}

            <section
              id="citations"
              aria-labelledby="citations-heading"
              className="scroll-mt-20 border-t border-[var(--report-rule)] pt-6"
            >
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--ib-maroon-650)]">
                Sources
              </p>
              <h2
                id="citations-heading"
                className="mt-2 text-xl font-semibold tracking-[-0.01em] text-[var(--report-ink)]"
              >
                Citations
              </h2>
              {report.citations.length === 0 ? (
                <p className="mt-3 text-sm leading-6 text-[var(--report-ink-secondary)]">
                  No external citations are attached to this archived report.
                </p>
              ) : (
                <ol className="mt-4 divide-y divide-[var(--report-rule)] border-y border-[var(--report-rule)]">
                  {report.citations.map((citation, index) => (
                    <li
                      key={citation.id}
                      className="grid grid-cols-[2rem_minmax(0,1fr)] gap-2 py-3"
                    >
                      <span className="font-mono text-xs text-[var(--report-ink-secondary)]">
                        [{index + 1}]
                      </span>
                      <a
                        href={citation.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-w-0 items-start gap-1.5 text-sm font-medium leading-6 text-[var(--ib-maroon-650)] underline decoration-[var(--report-rule)] underline-offset-4 hover:decoration-[var(--ib-maroon-650)]"
                      >
                        <span>{citation.label}</span>
                        <ExternalLink
                          aria-hidden="true"
                          className="mt-1 size-3.5 shrink-0"
                        />
                      </a>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </article>

        <aside className="sticky top-4 hidden border border-[var(--ib-border-strong)] bg-[var(--ib-surface-1)] p-4 xl:block">
          <div className="flex items-center gap-2">
            <List
              aria-hidden="true"
              className="size-4 text-[var(--ib-maroon-300)]"
            />
            <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ib-text-primary)]">
              Report outline
            </h2>
          </div>
          <nav aria-label="Report section outline">
            <OutlineLinks items={outlineItems} />
          </nav>
        </aside>
      </div>
    </div>
  );
}
