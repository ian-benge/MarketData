import {
  ArchiveFilters,
  type ArchiveFilterValues,
} from "@/components/reports/ArchiveFilters";
import { ArchiveResults } from "@/components/reports/ArchiveResults";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatePanel } from "@/components/ui/StatePanel";
import { isDemoAuthEnabled } from "@/lib/auth/demo";
import { listFixtureReports } from "@/lib/fixtures/reports";
import { normalizeReportEdition } from "@/lib/reports/editions";
import {
  isLiveReportsAvailable,
  listLiveReports,
} from "@/lib/reports/live-reports";

export const metadata = {
  title: "Research Archive",
};

type RawArchiveSearchParams = {
  q?: string | string[];
  edition?: string | string[];
  from?: string | string[];
  to?: string | string[];
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<RawArchiveSearchParams>;
}) {
  const raw = await searchParams;
  const filters: ArchiveFilterValues = {
    q: firstValue(raw.q),
    edition: normalizeReportEdition(firstValue(raw.edition)),
    from: firstValue(raw.from),
    to: firstValue(raw.to),
  };
  const demoMode = isDemoAuthEnabled();
  const live = !demoMode && isLiveReportsAvailable();

  if (!demoMode && !live) {
    return (
      <div className="min-w-0 space-y-4">
        <PageHeader
          title="Research Archive"
          description="Search immutable firm-wide market reports by headline, ticker, edition, or trading date."
        />
        <StatePanel
          kind="unavailable"
          title="Research archive unavailable"
          description="A live report repository is not connected in this environment. Demo reports are never shown as production research."
        />
      </div>
    );
  }

  const reports = demoMode
    ? listFixtureReports(filters)
    : await listLiveReports(filters);
  const hasFilters = Boolean(
    filters.q?.trim() || filters.edition || filters.from || filters.to,
  );

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        title="Research Archive"
        description="Search immutable firm-wide market reports by headline, ticker, edition, or trading date."
      />
      <ArchiveFilters values={filters} hasFilters={hasFilters} />
      <ArchiveResults reports={reports} hasFilters={hasFilters} />
    </div>
  );
}
