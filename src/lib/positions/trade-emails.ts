import { fixturesEnabled } from "@/lib/api/http";
import type { SessionUser } from "@/lib/auth/session";
import {
  canCreateAdminClient,
  createAdminClient,
} from "@/lib/supabase/admin";
import {
  canCreateServerClient,
  createClient,
} from "@/lib/supabase/server";
import { UNASSIGNED_OWNER_ID } from "./owners";
import { PositionBookError } from "./books";

function usesFixtures(user: SessionUser): boolean {
  return fixturesEnabled() || user.isDemo;
}

const demoFlags = new Map<string, boolean>();

export function resetDemoTradeEmails(): void {
  demoFlags.clear();
}

export function demoOwnerTradeEmails(ownerId: string): boolean {
  return demoFlags.get(ownerId) !== false;
}

export function setDemoOwnerTradeEmails(ownerId: string, enabled: boolean): void {
  demoFlags.set(ownerId, enabled);
}

function asEnabled(value: unknown): boolean {
  return value !== false;
}

export async function ownerTradeEmailsEnabled(
  user: SessionUser,
  ownerId: string,
): Promise<boolean> {
  if (!ownerId || ownerId === UNASSIGNED_OWNER_ID) return true;
  if (usesFixtures(user)) {
    return demoOwnerTradeEmails(ownerId);
  }
  if (!canCreateServerClient() || !user.firmId) return true;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("position_trade_emails")
      .eq("id", ownerId)
      .maybeSingle();
    if (error || !data) return true;
    return asEnabled(
      (data as { position_trade_emails?: boolean | null }).position_trade_emails,
    );
  } catch {
    return true;
  }
}

export async function loadOwnerTradeEmailsById(
  ownerId: string | null | undefined,
): Promise<boolean> {
  if (!ownerId || ownerId === UNASSIGNED_OWNER_ID) return true;
  if (demoFlags.has(ownerId)) return demoOwnerTradeEmails(ownerId);
  if (!canCreateAdminClient()) return true;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("profiles")
      .select("position_trade_emails")
      .eq("id", ownerId)
      .maybeSingle();
    if (error || !data) return true;
    return asEnabled(
      (data as { position_trade_emails?: boolean | null }).position_trade_emails,
    );
  } catch {
    return true;
  }
}

export async function setViewerTradeEmails(
  user: SessionUser,
  enabled: boolean,
): Promise<boolean> {
  if (usesFixtures(user)) {
    setDemoOwnerTradeEmails(user.id, enabled);
    return enabled;
  }
  if (!canCreateServerClient()) {
    throw new PositionBookError(
      "Position persistence is not connected in this environment.",
      503,
    );
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ position_trade_emails: enabled })
    .eq("id", user.id);
  if (error) {
    throw new PositionBookError(
      "Unable to update trade email preference.",
      500,
    );
  }
  return enabled;
}
