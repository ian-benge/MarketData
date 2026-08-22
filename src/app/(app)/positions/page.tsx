import { PositionsWorkspace } from "@/components/positions/PositionsWorkspace";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatePanel } from "@/components/ui/StatePanel";
import { requirePermission } from "@/lib/auth/authorize";
import { buildPositionsSnapshot } from "@/lib/positions/service";

export const metadata = {
  title: "Positions",
};

export default async function PositionsPage() {
  try {
    const user = await requirePermission("viewDashboard");
    const snapshot = await buildPositionsSnapshot({
      user,
      includeClosed: true,
      includeHistory: false,
    });
    return <PositionsWorkspace initial={snapshot} />;
  } catch {
    return (
      <div className="min-w-0 space-y-4">
        <PageHeader
          compact
          title="Positions"
        />
        <StatePanel
          kind="unavailable"
          title="Position blotter unavailable"
          description="The positions service could not be loaded for this session."
        />
      </div>
    );
  }
}
