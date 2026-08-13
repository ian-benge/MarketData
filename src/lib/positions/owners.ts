import type { SessionUser } from "@/lib/auth/session";
import type { PositionBookOwner, PositionRecord } from "./types";

export const UNASSIGNED_OWNER_ID = "unassigned";

export type PositionTeamMember = {
  id: string;
  email: string;
  displayName: string | null;
  role: "admin" | "member";
};

export function ownerKey(createdBy: string | null | undefined): string {
  return createdBy?.trim() ? createdBy : UNASSIGNED_OWNER_ID;
}

export function canEditPositionBook(
  user: Pick<SessionUser, "id" | "role">,
  ownerId: string,
): boolean {
  if (user.role === "admin") return true;
  return user.id === ownerId;
}

export function openCountByOwner(
  positions: PositionRecord[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const position of positions) {
    if (position.status !== "open") continue;
    const key = ownerKey(position.createdBy);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function buildOwnerList(
  team: PositionTeamMember[],
  positions: PositionRecord[],
  viewerId: string,
): PositionBookOwner[] {
  const counts = openCountByOwner(positions);
  const seen = new Set<string>();
  const owners: PositionBookOwner[] = [];

  for (const member of team) {
    seen.add(member.id);
    owners.push({
      id: member.id,
      displayName: member.displayName?.trim() || member.email || "Member",
      email: member.email,
      role: member.role,
      openCount: counts.get(member.id) ?? 0,
      isViewer: member.id === viewerId,
    });
  }

  const orphanIds = new Set<string>();
  for (const position of positions) {
    const key = ownerKey(position.createdBy);
    if (!seen.has(key)) orphanIds.add(key);
  }

  if (orphanIds.has(UNASSIGNED_OWNER_ID)) {
    owners.push({
      id: UNASSIGNED_OWNER_ID,
      displayName: "Unassigned",
      email: "",
      role: "unassigned",
      openCount: counts.get(UNASSIGNED_OWNER_ID) ?? 0,
      isViewer: false,
    });
    orphanIds.delete(UNASSIGNED_OWNER_ID);
  }

  for (const id of orphanIds) {
    owners.push({
      id,
      displayName: "Former member",
      email: "",
      role: "member",
      openCount: counts.get(id) ?? 0,
      isViewer: id === viewerId,
    });
  }

  owners.sort((a, b) => {
    if (a.isViewer !== b.isViewer) return a.isViewer ? -1 : 1;
    if (a.role === "unassigned" && b.role !== "unassigned") return 1;
    if (b.role === "unassigned" && a.role !== "unassigned") return -1;
    return a.displayName.localeCompare(b.displayName);
  });

  return owners;
}

export function resolveOwnerId(
  requested: string | null | undefined,
  viewerId: string,
  owners: PositionBookOwner[],
): string {
  if (requested && owners.some((owner) => owner.id === requested)) {
    return requested;
  }
  if (owners.some((owner) => owner.id === viewerId)) return viewerId;
  return owners[0]?.id ?? viewerId;
}

export function positionsForOwner(
  positions: PositionRecord[],
  ownerId: string,
): PositionRecord[] {
  return positions.filter((position) => ownerKey(position.createdBy) === ownerId);
}
