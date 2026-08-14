import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";
import { UNASSIGNED_OWNER_ID } from "./owners";
import type { PositionBookOwner } from "./types";

export const OWNER_UNLOCK_COOKIE = "md_owner_unlock";
const UNLOCK_TTL_MS = 8 * 60 * 60 * 1000;

export type OwnerUnlockPayload = {
  v: string;
  g: Record<string, number>;
};

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

function signingSecret(): string | null {
  const env = getEnv();
  return env.CRON_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || null;
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
    for (const [ownerId, exp] of Object.entries(parsed.g)) {
      if (typeof exp === "number" && exp > now) unlocked.add(ownerId);
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
): string {
  const current = readOwnerUnlock(token, secret, viewerId, now);
  current.add(ownerId);
  const grants: Record<string, number> = {};
  const exp = now + UNLOCK_TTL_MS;
  for (const id of current) grants[id] = exp;
  return signOwnerUnlock({ v: viewerId, g: grants }, secret);
}

export async function listUnlockedOwnerIds(viewerId: string): Promise<Set<string>> {
  const secret = signingSecret();
  if (!secret) return new Set();
  const store = await cookies();
  return readOwnerUnlock(
    store.get(OWNER_UNLOCK_COOKIE)?.value,
    secret,
    viewerId,
  );
}

export async function persistOwnerUnlock(
  viewerId: string,
  ownerId: string,
): Promise<void> {
  const secret = signingSecret();
  if (!secret) {
    throw new Error("Owner unlock signing secret is not configured.");
  }
  const store = await cookies();
  const token = grantOwnerUnlock(
    store.get(OWNER_UNLOCK_COOKIE)?.value,
    secret,
    viewerId,
    ownerId,
  );
  store.set(OWNER_UNLOCK_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: getEnv().NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function verifyOwnerPassword(
  email: string,
  password: string,
): Promise<boolean> {
  const env = getEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return false;
  const trimmed = password.trim();
  if (!trimmed || trimmed.length > 200) return false;
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password: trimmed,
  });
  return !error;
}
