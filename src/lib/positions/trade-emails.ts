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

type FlagError = { code?: string; message?: string } | null;
type FlagRow = { position_trade_emails?: boolean | null } | null;

export function isMissingTradeEmailsColumn(error: FlagError): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /position_trade_emails/i.test(message)
  );
}

function failOpen(ownerId: string, error: FlagError): true {
  console.error("[positions] trade-emails lookup failed; sending desk email", {
    ownerId,
    code: error?.code ?? "no-row",
    message: error?.message ?? "profile not found",
  });
  return true;
}

function readFlag(ownerId: string, data: FlagRow, error: FlagError): boolean {
  if (error || !data) return failOpen(ownerId, error);
  return asEnabled(data.position_trade_emails);
}

function persistedFlag(data: FlagRow, error: FlagError): boolean {
  if (isMissingTradeEmailsColumn(error)) {
    throw new PositionBookError(
      "Trade email preference is not available on this database.",
      503,
    );
  }
  if (error || data == null) {
    throw new PositionBookError(
      "Unable to update trade email preference.",
      500,
    );
  }
  return asEnabled(data.position_trade_emails);
}

export async function ownerTradeEmailsEnabled(
  user: SessionUser,
  ownerId: string,
): Promise<boolean> {
  if (!ownerId || ownerId === UNASSIGNED_OWNER_ID) return true;
  if (usesFixtures(user)) {
    return demoOwnerTradeEmails(ownerId);
  }
  try {
    if (canCreateAdminClient()) {
      const { data, error } = await createAdminClient()
        .from("profiles")
        .select("position_trade_emails")
        .eq("id", ownerId)
        .maybeSingle();
      return readFlag(ownerId, data, error);
    }
    if (!canCreateServerClient() || !user.firmId) return true;
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("position_trade_emails")
      .eq("id", ownerId)
      .maybeSingle();
    return readFlag(ownerId, data, error);
  } catch (error) {
    console.error("[positions] trade-emails lookup threw; sending desk email", error);
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
    const { data, error } = await createAdminClient()
      .from("profiles")
      .select("position_trade_emails")
      .eq("id", ownerId)
      .maybeSingle();
    return readFlag(ownerId, data, error);
  } catch (error) {
    console.error("[positions] trade-emails lookup threw; sending desk email", error);
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
  if (canCreateAdminClient()) {
    const { data, error } = await createAdminClient()
      .from("profiles")
      .update({ position_trade_emails: enabled })
      .eq("id", user.id)
      .select("position_trade_emails")
      .maybeSingle();
    return persistedFlag(data, error);
  }
  if (!canCreateServerClient()) {
    throw new PositionBookError(
      "Position persistence is not connected in this environment.",
      503,
    );
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ position_trade_emails: enabled })
    .eq("id", user.id)
    .select("position_trade_emails")
    .maybeSingle();
  return persistedFlag(data, error);
}
