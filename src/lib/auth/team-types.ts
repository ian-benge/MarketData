import type { UserRole } from "@/lib/domain/permissions";

export type TeamMember = {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  isActive: boolean;
};
