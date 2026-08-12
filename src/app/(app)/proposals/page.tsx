import { ProposalsWorkspace } from "@/components/proposals/ProposalsWorkspace";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatePanel } from "@/components/ui/StatePanel";
import { isDemoAuthEnabled } from "@/lib/auth/demo";
import { fixtureProposals } from "@/lib/fixtures/proposals";

export const metadata = {
  title: "Proposals",
};

export default function ProposalsPage() {
  const demoMode = isDemoAuthEnabled();

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        eyebrow="Team governance"
        title="Proposals"
        description="Submit a documented coverage or threshold change for administrator review. A proposal never changes configuration by itself."
        actions={<Badge tone="info">Admin-reviewed</Badge>}
      />
      {demoMode ? (
        <ProposalsWorkspace initialProposals={fixtureProposals} />
      ) : (
        <StatePanel
          kind="unavailable"
          title="Proposal workflow unavailable"
          description="A live proposal repository is not connected in this environment. Demo requests and review decisions are hidden outside demo mode."
        />
      )}
    </div>
  );
}
