import {
  handleRouteError,
  jsonError,
  jsonOk,
  fixturesEnabled,
} from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("resendDelivery");
    const { id } = await context.params;
    if (!fixturesEnabled()) {
      return jsonError(
        "Delivery persistence is not connected in this environment.",
        503,
      );
    }
    return jsonOk({
      ok: true,
      deliveryId: id,
      status: "queued",
      demo: true,
      at: new Date().toISOString(),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
