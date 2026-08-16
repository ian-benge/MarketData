import type { SessionUser } from "@/lib/auth/session";
import type { MoveExplanation } from "@/lib/intelligence/types";
import {
  compactBookImpact,
  emptyBookImpact,
  type DashboardBookImpact,
} from "@/lib/dashboard/book-impact";
import { buildPositionsSnapshot } from "@/lib/positions/service";

export async function loadDashboardBookImpact(
  user: SessionUser,
  moves: MoveExplanation[] = [],
): Promise<DashboardBookImpact> {
  try {
    const snapshot = await buildPositionsSnapshot({
      user,
      includeClosed: false,
      includeHistory: false,
    });
    return compactBookImpact(snapshot, moves);
  } catch (error) {
    return emptyBookImpact(
      error instanceof Error
        ? error.message
        : "Position blotter is unavailable for the overview.",
    );
  }
}
