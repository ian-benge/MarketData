import { OwnerUnlockResetPanel } from "@/components/settings/OwnerUnlockResetPanel";
import { SessionPanel } from "@/components/settings/SessionPanel";
import { TeamAccessPanel } from "@/components/settings/TeamAccessPanel";
import { ThemePreferenceControl } from "@/components/settings/ThemePreferenceControl";
import { PageHeader } from "@/components/ui/PageHeader";
import { getSessionUser } from "@/lib/auth/session";
import { listTeamMembers, type TeamMember } from "@/lib/auth/team";
import {
  listUnlockedOwnerIds,
  resolveOwnerUnlockSigningSecret,
  UNLOCK_TTL_MS,
} from "@/lib/positions/owner-unlock";
import { MARKET_TIME_ZONE } from "@/lib/utils/format";

export const metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const user = await getSessionUser();
  const isAdmin = user?.role === "admin";

  let members: TeamMember[] = [];
  let listError: string | null = null;
  if (isAdmin && user) {
    try {
      members = await listTeamMembers(user);
    } catch (error) {
      listError =
        error instanceof Error ? error.message : "Unable to list desk members.";
    }
  }

  const unlockInventoryAvailable = resolveOwnerUnlockSigningSecret() != null;
  const unlockedGrantCount =
    user && unlockInventoryAvailable
      ? (await listUnlockedOwnerIds(user)).size
      : 0;
  const unlockTtlHours = UNLOCK_TTL_MS / 3_600_000;

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description={
          isAdmin
            ? "Session, personal display preferences, teammate book access, and admin-only controls to add people to this desk."
            : "Session, personal display preferences for this browser, and a control to lock your blotter if a teammate previously entered the desk unlock secret."
        }
      />
      {user ? (
        <SessionPanel
          email={user.email}
          role={user.role}
          isDemo={user.isDemo}
          timeZone={MARKET_TIME_ZONE}
        />
      ) : null}
      <ThemePreferenceControl />
      {user ? (
        <OwnerUnlockResetPanel
          key={
            unlockInventoryAvailable
              ? `grants-${unlockedGrantCount}`
              : "grants-unavailable"
          }
          isAdmin={isAdmin}
          demo={user.isDemo}
          unlockInventoryAvailable={unlockInventoryAvailable}
          unlockedGrantCount={unlockedGrantCount}
          unlockTtlHours={unlockTtlHours}
        />
      ) : null}
      {isAdmin && user ? (
        <TeamAccessPanel
          initialMembers={members}
          demo={user.isDemo}
          listError={listError}
        />
      ) : null}
    </div>
  );
}
