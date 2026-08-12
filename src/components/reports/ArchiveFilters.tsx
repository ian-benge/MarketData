import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/Button";

export type ArchiveFilterValues = {
  q?: string;
  edition?: string;
  from?: string;
  to?: string;
};

const fieldClassName =
  "mt-1.5 h-11 w-full min-w-0 rounded-[var(--radius-sm)] border border-[var(--ib-border-control)] bg-[var(--ib-surface-inset)] px-3 text-sm text-[var(--ib-text-primary)] outline-none placeholder:text-[var(--ib-text-muted)] focus:border-[var(--ib-focus)] sm:h-9";

export function ArchiveFilters({
  values,
  hasFilters,
}: {
  values: ArchiveFilterValues;
  hasFilters: boolean;
}) {
  return (
    <section
      aria-labelledby="archive-search-heading"
      className="border border-[var(--ib-border-strong)] bg-[var(--ib-surface-1)] p-3 sm:p-4"
    >
      <div className="mb-3">
        <h2
          id="archive-search-heading"
          className="text-sm font-semibold text-[var(--ib-text-primary)]"
        >
          Search the archive
        </h2>
        <p className="mt-0.5 text-xs text-[var(--ib-text-muted)]">
          Search report headlines, covered tickers, or report IDs.
        </p>
      </div>

      <form action="/archive" method="get" className="min-w-0 space-y-3">
        <label className="block min-w-0 text-xs font-medium text-[var(--ib-text-secondary)]">
          Search research
          <span className="relative mt-1.5 block">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ib-text-muted)]"
              strokeWidth={1.8}
            />
            <input
              type="search"
              name="q"
              defaultValue={values.q ?? ""}
              placeholder="NVDA, inflation, or report ID"
              autoComplete="off"
              className="h-11 w-full min-w-0 rounded-[var(--radius-sm)] border border-[var(--ib-border-control)] bg-[var(--ib-surface-inset)] py-2 pl-10 pr-3 text-sm text-[var(--ib-text-primary)] outline-none placeholder:text-[var(--ib-text-muted)] focus:border-[var(--ib-focus)] sm:h-10"
            />
          </span>
        </label>

        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(9rem,0.75fr)_minmax(9.5rem,1fr)_minmax(9.5rem,1fr)_auto]">
          <label className="block min-w-0 text-xs font-medium text-[var(--ib-text-secondary)]">
            Edition
            <select
              name="edition"
              defaultValue={values.edition ?? ""}
              className={fieldClassName}
            >
              <option value="">All editions</option>
              <option value="premarket">Premarket</option>
              <option value="midday">Midday</option>
              <option value="close_postmarket">Close / Postmarket</option>
            </select>
          </label>

          <label className="block min-w-0 text-xs font-medium text-[var(--ib-text-secondary)]">
            From
            <input
              type="date"
              name="from"
              defaultValue={values.from ?? ""}
              className={fieldClassName}
            />
          </label>

          <label className="block min-w-0 text-xs font-medium text-[var(--ib-text-secondary)]">
            To
            <input
              type="date"
              name="to"
              defaultValue={values.to ?? ""}
              className={fieldClassName}
            />
          </label>

          <div className="flex min-w-0 items-end gap-2 sm:col-span-2 xl:col-span-1">
            {hasFilters ? (
              <Link
                href="/archive"
                className="inline-flex h-11 flex-1 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--ib-border-strong)] px-3 text-sm font-medium text-[var(--ib-text-secondary)] transition-colors hover:bg-[var(--ib-surface-2)] hover:text-[var(--ib-text-primary)] sm:h-9 xl:flex-none"
              >
                Reset
              </Link>
            ) : null}
            <Button
              type="submit"
              variant="primary"
              className="h-11 flex-1 px-4 sm:h-9 xl:min-w-24"
            >
              Apply filters
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
}
