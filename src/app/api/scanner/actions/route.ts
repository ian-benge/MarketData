import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { addSymbolsToWatchlist, listStoredWatchlists } from "@/lib/watchlists/store";
import { setMute, setPin } from "@/lib/scanner/store";

export async function POST(request: Request) {
  try {
    const user = await requirePermission("viewDashboard");
    const body = (await request.json().catch(() => null)) as {
      action?: string;
      ticker?: string;
      strategyId?: string;
      watchlistId?: string;
      mutedUntil?: string | null;
    } | null;
    const ticker = body?.ticker?.trim().toUpperCase();
    if (!body?.action) return jsonError("action is required", 400);
    if (!user.firmId) return jsonError("Scanner actions require a connected firm workspace.", 503);

    if (body.action === "watchlists") {
      const stored = await listStoredWatchlists(user);
      return jsonOk({
        watchlists: stored.lists.map((list) => ({
          id: list.id,
          name: list.name,
          visibility: list.visibility,
        })),
      });
    }

    if (!ticker) return jsonError("ticker is required", 400);

    if (body.action === "pin" || body.action === "unpin") {
      const ok = await setPin({
        userId: user.id,
        firmId: user.firmId,
        ticker,
        pinned: body.action === "pin",
      });
      if (!ok) return jsonError("Could not update pin.", 503);
      return jsonOk({ ok: true, ticker, pinned: body.action === "pin" });
    }

    if (body.action === "mute" || body.action === "unmute") {
      const ok = await setMute({
        userId: user.id,
        firmId: user.firmId,
        ticker,
        strategyId: body.strategyId,
        muted: body.action === "mute",
        mutedUntil: body.mutedUntil,
      });
      if (!ok) return jsonError("Could not update mute.", 503);
      return jsonOk({ ok: true, ticker, muted: body.action === "mute" });
    }

    if (body.action === "add_to_watchlist") {
      await requirePermission("editWatchlists");
      if (!body.watchlistId) return jsonError("watchlistId is required", 400);
      const watchlist = await addSymbolsToWatchlist(user, body.watchlistId, [ticker]);
      return jsonOk({ ok: true, watchlistId: watchlist.id, ticker });
    }

    return jsonError("Unknown action", 400);
  } catch (error) {
    return handleRouteError(error);
  }
}
