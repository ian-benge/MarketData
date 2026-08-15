import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { assertAdmin } from "@/lib/auth/authorize";
import {
  listInstrumentResolutionQueue,
  resolveStaleInstruments,
  updateInstrumentResolution,
} from "@/lib/watchlists/resolve";

export async function GET() {
  try {
    await assertAdmin();
    const queue = await listInstrumentResolutionQueue();
    return jsonOk(queue);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await assertAdmin();
    const body = (await request.json().catch(() => null)) as {
      id?: string;
      action?: "dismiss" | "resolve" | "scan";
    } | null;
    if (body?.action === "scan") {
      const result = await resolveStaleInstruments({ limit: 40 });
      return jsonOk(result);
    }
    if (!body?.id || (body.action !== "dismiss" && body.action !== "resolve")) {
      return jsonError("Invalid body", 400);
    }
    const item = await updateInstrumentResolution({
      id: body.id,
      action: body.action,
      userId: user.id,
    });
    if (!item) return jsonError("Queue item not found.", 404);
    return jsonOk({ item });
  } catch (error) {
    return handleRouteError(error);
  }
}
