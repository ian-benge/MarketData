import { canCreateAdminClient, createAdminClient } from "@/lib/supabase/admin";

export type FirmRecipient = { userId: string; email: string; name?: string };

export async function loadFirmRecipients(firmId: string): Promise<FirmRecipient[]> {
  if (!canCreateAdminClient()) return [];
  const client = createAdminClient();
  const { data, error } = await client
    .from("team_memberships")
    .select("user_id, profiles(email, display_name)")
    .eq("firm_id", firmId)
    .eq("is_active", true);
  if (error || !data) return [];

  const recipients: FirmRecipient[] = [];
  for (const row of data) {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const email =
      profile && typeof profile === "object" && "email" in profile
        ? String((profile as { email?: string }).email ?? "")
        : "";
    if (!email) continue;
    const name =
      profile && typeof profile === "object" && "display_name" in profile
        ? (profile as { display_name?: string | null }).display_name
        : undefined;
    recipients.push({
      userId: String(row.user_id),
      email,
      name: name ?? undefined,
    });
  }
  return recipients;
}
