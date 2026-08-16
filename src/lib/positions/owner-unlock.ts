import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getEnv } from "@/lib/env";
import { AuthError, type SessionUser } from "@/lib/auth/session";
import {
  canCreateServerClient,
  createClient as createServerClient,
} from "@/lib/supabase/server";
import { UNASSIGNED_OWNER_ID } from "./owners";
import type { PositionBookOwner } from "./types";

export const OWNER_UNLOCK_COOKIE = "md_owner_unlock";
const UNLOCK_TTL_MS = 8 * 60 * 60 * 1000;

export type OwnerUnlockPayload = {
  v: string;
  e?: number;
  g: Record<string, number>;
  o?: Record<string, number>;
};

export type UnlockEpochs = {
  firm: number;
  owners: Record<string, number>;
};

export const ZERO_UNLOCK_EPOCHS: UnlockEpochs = { firm: 0, owners: {} };

export function ownerViewRequiresUnlock(
  viewerId: string,
  ownerId: string,
  unlockedOwnerIds: ReadonlySet<string>,
): boolean {
  if (!ownerId || ownerId === viewerId) return false;
  if (ownerId === UNASSIGNED_OWNER_ID) return true;
  return !unlockedOwnerIds.has(ownerId);
}

export function applyOwnerUnlockFlags(
  owners: PositionBookOwner[],
  viewerId: string,
  unlockedOwnerIds: ReadonlySet<string>,
): PositionBookOwner[] {
  return owners.map((owner) => {
    const needsUnlock = ownerViewRequiresUnlock(
      viewerId,
      owner.id,
      unlockedOwnerIds,
    );
    return {
      ...owner,
      needsUnlock,
    };
  });
}

export function resolveOwnerUnlockSigningSecret(
  env: { OWNER_UNLOCK_SIGNING_SECRET?: string | null } = getEnv(),
): string | null {
  return env.OWNER_UNLOCK_SIGNING_SECRET?.trim() || null;
}

function signingSecret(): string | null {
  return resolveOwnerUnlockSigningSecret();
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function verifyOwnerUnlockSecret(
  secret: string,
  expected = getEnv().OWNER_UNLOCK_SECRET,
): boolean {
  const trimmed = secret.trim();
  const configured = expected?.trim() ?? "";
  if (!trimmed || trimmed.length > 200 || !configured) return false;
  return timingSafeEqual(sha256(trimmed), sha256(configured));
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: getEnv().NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export function signOwnerUnlock(payload: OwnerUnlockPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function readOwnerUnlock(
  token: string | undefined,
  secret: string,
  viewerId: string,
  now = Date.now(),
  epochs: UnlockEpochs = ZERO_UNLOCK_EPOCHS,
): Set<string> {
  const unlocked = new Set<string>();
  if (!token) return unlocked;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return unlocked;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return unlocked;
  try {
    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as OwnerUnlockPayload;
    if (parsed.v !== viewerId || !parsed.g || typeof parsed.g !== "object") {
      return unlocked;
    }
    const grantFirmEpoch = typeof parsed.e === "number" ? parsed.e : 0;
    if (grantFirmEpoch !== epochs.firm) return unlocked;
    for (const [ownerId, exp] of Object.entries(parsed.g)) {
      if (typeof exp !== "number" || exp <= now) continue;
      const grantOwnerEpoch =
        parsed.o && typeof parsed.o[ownerId] === "number" ? parsed.o[ownerId]! : 0;
      const liveOwnerEpoch = epochs.owners[ownerId] ?? 0;
      if (grantOwnerEpoch !== liveOwnerEpoch) continue;
      unlocked.add(ownerId);
    }
  } catch {
    return unlocked;
  }
  return unlocked;
}

export function grantOwnerUnlock(
  token: string | undefined,
  secret: string,
  viewerId: string,
  ownerId: string,
  now = Date.now(),
  epochs: UnlockEpochs = ZERO_UNLOCK_EPOCHS,
): string {
  const current = readOwnerUnlock(token, secret, viewerId, now, epochs);
  current.add(ownerId);
  const grants: Record<string, number> = {};
  const ownerEpochs: Record<string, number> = {};
  const exp = now + UNLOCK_TTL_MS;
  for (const id of current) {
    grants[id] = exp;
    ownerEpochs[id] = epochs.owners[id] ?? 0;
  }
  return signOwnerUnlock(
    { v: viewerId, e: epochs.firm, g: grants, o: ownerEpochs },
    secret,
  );
}

export async function loadUnlockEpochs(
  firmId: string | null,
): Promise<UnlockEpochs> {
  if (!firmId || !canCreateServerClient()) return ZERO_UNLOCK_EPOCHS;
  try {
    const supabase = await createServerClient();
    const [{ data: firm }, { data: profiles }] = await Promise.all([
      supabase
        .from("firms")
        .select("owner_unlock_epoch")
        .eq("id", firmId)
        .maybeSingle(),
      supabase.from("profiles").select("id, owner_unlock_epoch"),
    ]);
    const owners: Record<string, number> = {};
    for (const row of profiles ?? []) {
      if (typeof row.id !== "string") continue;
      owners[row.id] =
        typeof row.owner_unlock_epoch === "number" ? row.owner_unlock_epoch : 0;
    }
    return {
      firm:
        typeof firm?.owner_unlock_epoch === "number" ? firm.owner_unlock_epoch : 0,
      owners,
    };
  } catch {
    return ZERO_UNLOCK_EPOCHS;
  }
}

export async function listUnlockedOwnerIds(user: SessionUser): Promise<Set<string>> {
  const secret = signingSecret();
  if (!secret) return new Set();
  const store = await cookies();
  const epochs = await loadUnlockEpochs(user.firmId);
  return readOwnerUnlock(
    store.get(OWNER_UNLOCK_COOKIE)?.value,
    secret,
    user.id,
    Date.now(),
    epochs,
  );
}

export async function persistOwnerUnlock(
  user: SessionUser,
  ownerId: string,
): Promise<void> {
  const secret = signingSecret();
  if (!secret) {
    throw new Error("Owner unlock signing secret is not configured.");
  }
  const store = await cookies();
  const epochs = await loadUnlockEpochs(user.firmId);
  const token = grantOwnerUnlock(
    store.get(OWNER_UNLOCK_COOKIE)?.value,
    secret,
    user.id,
    ownerId,
    Date.now(),
    epochs,
  );
  store.set(OWNER_UNLOCK_COOKIE, token, cookieOptions(60 * 60 * 8));
}

export async function clearOwnerUnlockCookie(): Promise<void> {
  const store = await cookies();
  store.set(OWNER_UNLOCK_COOKIE, "", cookieOptions(0));
}

export async function bumpOwnerUnlockEpoch(
  user: SessionUser,
  scope: "self" | "desk",
): Promise<number | null> {
  if (user.isDemo) {
    await clearOwnerUnlockCookie();
    return null;
  }
  if (!canCreateServerClient()) {
    throw new Error("Teammate unlock reset is not connected in this environment.");
  }
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("bump_owner_unlock_epoch", {
    scope,
  });
  if (error) {
    const message = error.message || "Unable to reset teammate unlocks.";
    if (/forbidden/i.test(message)) {
      throw new AuthError("Only admins can reset every teammate unlock.", 403);
    }
    if (/unauthorized/i.test(message)) {
      throw new AuthError("Unauthorized", 401);
    }
    throw new Error(message);
  }
  if (scope === "desk") {
    await clearOwnerUnlockCookie();
  }
  return typeof data === "number" ? data : null;
}
