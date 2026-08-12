import { ThemePreferenceControl } from "@/components/settings/ThemePreferenceControl";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Personal display preferences for this browser. Changes apply immediately and do not affect other teammates."
      />
      <ThemePreferenceControl />
    </div>
  );
}
