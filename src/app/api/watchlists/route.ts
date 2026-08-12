import { nanoid } from "nanoid";
import { z } from "zod";
import {
  handleRouteError,
  jsonError,
  jsonOk,
  fixturesEnabled,
} from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { fixtureWatchlists } from "@/lib/fixtures/watchlists";

const CreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  symbols: z.array(z.string()).default([]),
});

export async function GET() {
  try {
    await requirePermission("viewDashboard");
    if (fixturesEnabled()) {
      return jsonOk({ watchlists: fixtureWatchlists });
    }
    return jsonOk({ watchlists: [] });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requirePermission("editWatchlists");
    if (!fixturesEnabled()) {
      return jsonError(
        "Watchlist persistence is not connected in this environment.",
        503,
      );
    }
    const parsed = CreateSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) return jsonError("Invalid body", 400);

    return jsonOk({
      id: `wl-${nanoid(10)}`,
      ...parsed.data,
      isDefault: false,
      demo: true,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
