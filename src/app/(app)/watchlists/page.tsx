import { WatchlistsWorkspace } from "@/components/watchlists/WatchlistsWorkspace";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatePanel } from "@/components/ui/StatePanel";
import { requirePermission } from "@/lib/auth/authorize";
import { buildCoverageSnapshot } from "@/lib/watchlists/service";
import type { CoverageSelection, CoverageSnapshot } from "@/lib/watchlists/types";

export const metadata = {
  title: "Watchlists & Sectors",
};

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function WatchlistsPage({
  searchParams,
}: {
  searchParams: Promise<{ listId?: string; sectorId?: string; ticker?: string }>;
}) {
  const user = await requirePermission("viewDashboard");
  const params = await searchParams;
  const selection: CoverageSelection | null = params.sectorId
    ? { type: "sector", id: params.sectorId }
    : params.listId
      ? { type: "watchlist", id: params.listId }
      : null;
  let snapshot: CoverageSnapshot | null = null;
  try {
    snapshot = await buildCoverageSnapshot({
      user,
      selection,
    });
  } catch {
    snapshot = null;
  }

  if (!snapshot) {
    return (
      <div className="min-w-0 space-y-4">
        <PageHeader
          eyebrow="Coverage"
          title="Watchlists & Sectors"
          description="Persistent shared and personal coverage with sector comparison and tape context."
        />
        <StatePanel
          kind="unavailable"
          title="Coverage workspace unavailable"
          description="The coverage service could not be loaded for this session. Shared and personal watchlists were not changed."
        />
      </div>
    );
  }

  return (
    <WatchlistsWorkspace
      initial={snapshot}
      initialTicker={params.ticker?.trim().toUpperCase() || null}
    />
  );
}
