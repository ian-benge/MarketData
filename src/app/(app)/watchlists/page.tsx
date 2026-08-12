import { WatchlistsWorkspace } from "@/components/watchlists/WatchlistsWorkspace";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatePanel } from "@/components/ui/StatePanel";
import { isDemoAuthEnabled } from "@/lib/auth/demo";
import { fixtureSectors, fixtureWatchlists } from "@/lib/fixtures/watchlists";

export const metadata = {
  title: "Watchlists & Sectors",
};

export default function WatchlistsPage() {
  const demoMode = isDemoAuthEnabled();

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        eyebrow="Shared coverage"
        title="Watchlists & Sectors"
        description="Manage the team's shared ticker coverage and inspect the read-only sector taxonomy used across market monitoring."
        actions={<Badge tone="brand">Shared team scope</Badge>}
      />
      {demoMode ? (
        <WatchlistsWorkspace
          initialWatchlists={fixtureWatchlists}
          sectors={fixtureSectors}
        />
      ) : (
        <StatePanel
          kind="unavailable"
          title="Shared coverage unavailable"
          description="A live watchlist repository is not connected in this environment. Demo watchlists and sector mappings are hidden outside demo mode."
        />
      )}
    </div>
  );
}
