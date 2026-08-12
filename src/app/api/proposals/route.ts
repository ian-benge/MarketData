import { nanoid } from "nanoid";
import { z } from "zod";
import {
  handleRouteError,
  jsonError,
  jsonOk,
  fixturesEnabled,
} from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { fixtureProposals } from "@/lib/fixtures/proposals";

const CreateSchema = z.object({
  type: z.enum([
    "watchlist_add",
    "watchlist_remove",
    "sector_change",
    "threshold_change",
  ]),
  title: z.string().min(1),
  detail: z.string().min(1),
});

export async function GET() {
  try {
    await requirePermission("submitProposals");
    if (fixturesEnabled()) {
      return jsonOk({ proposals: fixtureProposals });
    }
    return jsonOk({ proposals: [] });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission("submitProposals");
    if (!fixturesEnabled()) {
      return jsonError(
        "Proposal persistence is not connected in this environment.",
        503,
      );
    }
    const parsed = CreateSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) return jsonError("Invalid body", 400);

    return jsonOk({
      id: `prop-${nanoid(10)}`,
      ...parsed.data,
      status: "pending",
      submittedBy: user.email,
      submittedAt: new Date().toISOString(),
      reviewedBy: null,
      reviewedAt: null,
      demo: true,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
