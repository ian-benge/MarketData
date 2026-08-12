import {
  hasPermission,
  type Permission,
  type UserRole,
} from "@/lib/domain/permissions";
import { AuthError, getSessionUser, type SessionUser } from "@/lib/auth/session";

export async function assertAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("Unauthorized", 401);
  if (user.role !== "admin") throw new AuthError("Forbidden", 403);
  return user;
}

export async function assertMember(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("Unauthorized", 401);
  return user;
}

export async function requirePermission(
  permission: Permission,
): Promise<SessionUser> {
  const user = await assertMember();
  if (!hasPermission(user.role, permission)) {
    throw new AuthError(`Missing permission: ${permission}`, 403);
  }
  return user;
}

export function roleMay(
  role: UserRole,
  permission: Permission,
): boolean {
  return hasPermission(role, permission);
}
