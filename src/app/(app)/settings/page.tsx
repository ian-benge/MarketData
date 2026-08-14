import { ThemePreferenceControl } from "@/components/settings/ThemePreferenceControl";
import { TeamAccessPanel } from "@/components/settings/TeamAccessPanel";
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
            ? "Personal display preferences, and admin-only controls to add people to this desk."
            : "Personal display preferences for this browser. Changes apply immediately and do not affect other teammates."
        }
      />
      <ThemePreferenceControl />
      {isAdmin && user ? (
        <TeamAccessPanel initialMembers={members} demo={user.isDemo} />
      ) : null}
    </div>
  );
}
