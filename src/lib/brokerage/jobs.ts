import type { SessionUser } from "@/lib/auth/session";
import { createAdminClient, canCreateAdminClient } from "@/lib/supabase/admin";
import {
  listConnectedBrokerageUserIds,
} from "./store";
import { syncBrokerageHoldings, type SyncResult } from "./sync";

export async function loadBrokerageJobUser(
  userId: string,
): Promise<SessionUser | null> {
  if (!canCreateAdminClient() || !userId) return null;
  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("team_memberships")
    .select("role, firm_id, is_active")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (!membership) return null;
  const { data: profile } = await admin
    .from("profiles")
    .select("email, display_name")
    .eq("id", userId)
    .maybeSingle();
  return {
    id: userId,
    email: String(
      (profile as { email?: string | null } | null)?.email ?? "",
    ),
    displayName:
      (profile as { display_name?: string | null } | null)?.display_name ?? null,
    role: (membership as { role: SessionUser["role"] }).role,
    firmId: String((membership as { firm_id: string }).firm_id),
    isDemo: false,
  };
}

export async function loadBrokerageJobUserBySnapTradeId(
  snaptradeUserId: string,
): Promise<SessionUser | null> {
  if (!canCreateAdminClient() || !snaptradeUserId) return null;
  const admin = createAdminClient();
  const bySnap = await admin
    .from("snaptrade_users")
    .select("user_id")
    .eq("snaptrade_user_id", snaptradeUserId)
    .maybeSingle();
  const userId =
    (bySnap.data as { user_id?: string } | null)?.user_id ??
    (
      await admin
        .from("snaptrade_users")
        .select("user_id")
        .eq("user_id", snaptradeUserId)
        .maybeSingle()
    ).data?.user_id;
  if (!userId) return null;
  return loadBrokerageJobUser(String(userId));
}

export async function syncBrokerageHoldingsLive(
  user: SessionUser,
): Promise<SyncResult> {
  return syncBrokerageHoldings(user, {
    historyLookback: false,
    live: true,
  });
}

export async function syncAllLinkedBrokerageHoldings(): Promise<{
  users: number;
  imported: number;
  updated: number;
  closed: number;
  errors: string[];
}> {
  const userIds = await listConnectedBrokerageUserIds();
  let imported = 0;
  let updated = 0;
  let closed = 0;
  const errors: string[] = [];
  for (const userId of userIds) {
    const user = await loadBrokerageJobUser(userId);
    if (!user) continue;
    try {
      const result = await syncBrokerageHoldingsLive(user);
      imported += result.imported;
      updated += result.updated;
      closed += result.closed;
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : "Brokerage sync failed.",
      );
    }
  }
  return { users: userIds.length, imported, updated, closed, errors };
}
