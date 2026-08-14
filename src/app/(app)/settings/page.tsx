import { ThemePreferenceControl } from "@/components/settings/ThemePreferenceControl";
import { TeamAccessPanel } from "@/components/settings/TeamAccessPanel";
import { OwnerUnlockResetPanel } from "@/components/settings/OwnerUnlockResetPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { listTeamMembers } from "@/lib/auth/team";
import { getSessionUser } from "@/lib/auth/session";

export const metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const user = await getSessionUser();
  const isAdmin = user?.role === "admin";
  const members = isAdmin && user ? await listTeamMembers(user) : [];

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description={
          isAdmin
            ? "Personal display preferences, teammate book access, and admin-only controls to add people to this desk."
            : "Personal display preferences for this browser, and a control to lock your blotter if a teammate previously entered your password."
        }
      />
      <ThemePreferenceControl />
      {user ? (
        <OwnerUnlockResetPanel isAdmin={isAdmin} demo={user.isDemo} />
      ) : null}
      {isAdmin && user ? (
        <TeamAccessPanel initialMembers={members} demo={user.isDemo} />
      ) : null}
    </div>
  );
}
