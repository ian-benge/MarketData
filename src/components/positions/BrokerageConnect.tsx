"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Landmark, History, RefreshCw, Unplug, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatMarketDateTime } from "@/lib/utils/format";
import {
  HISTORY_LOOKBACKS,
  HISTORY_LOOKBACK_LABELS,
  type HistoryLookback,
} from "@/lib/brokerage/history-lookback";
import { FEATURED_BROKERS, type BrokerageSnapshot } from "@/lib/brokerage/types";
import { isUsEquityMonitorWindow } from "@/lib/scheduling/chicago-schedule";
import type { PositionsSnapshot } from "@/lib/positions/types";

type PortalState = "picker" | "portal" | "manage" | "import" | null;

const BROKERAGE_REFRESH_MS = 15_000;

export function BrokerageConnect({
  brokerage,
  canManage,
  busy,
  usingFixtures = false,
  bookId,
  onSnapshot,
  onFeedback,
}: {
  brokerage: BrokerageSnapshot | undefined;
  canManage: boolean;
  busy: boolean;
  usingFixtures?: boolean;
  bookId?: string;
  onSnapshot: (snapshot: PositionsSnapshot) => void;
  onFeedback: (message: { tone: "error" | "success"; message: string }) => void;
}) {
  const titleId = useId();
  const [panel, setPanel] = useState<PortalState>(null);
  const [redirectUri, setRedirectUri] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [lookbackBusy, setLookbackBusy] = useState<HistoryLookback | null>(null);
  const snapshot = brokerage ?? {
    configured: false,
    connectable: false,
    connections: [],
  };
  const connected = snapshot.connections.length > 0;
  const needsReconnect = snapshot.connections.some(
    (row) => row.status !== "connected",
  );
  const lastSyncAt = snapshot.connections
    .map((row) => row.lastSyncAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  const onSnapshotRef = useRef(onSnapshot);
  const onFeedbackRef = useRef(onFeedback);
  const syncingRef = useRef(false);
  const pendingAnnounceRef = useRef(false);
  const pullHoldingsRef = useRef<
    (announce: boolean, silent?: boolean, holdingsOnly?: boolean) => Promise<void>
  >(async () => undefined);
  const importing = snapshot.connections.some((row) =>
    Boolean(row.lastSyncError && /import/i.test(row.lastSyncError)),
  );

  function withBook(path: string) {
    if (!bookId) return path;
    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}book=${encodeURIComponent(bookId)}`;
  }

  async function pullHoldings(
    announce: boolean,
    silent = false,
    holdingsOnly = false,
  ) {
    if (announce) pendingAnnounceRef.current = true;
    if (syncingRef.current) return;
    syncingRef.current = true;
    if (!silent) setWorking(true);
    try {
      const response = await fetch(
        withBook(
          holdingsOnly ? "/api/brokerage/sync?live=1" : "/api/brokerage/sync",
        ),
        {
          method: "POST",
        },
      );
      const payload = (await response.json()) as {
        snapshot?: PositionsSnapshot;
        pending?: boolean;
        historyImported?: number;
        error?: string;
        warnings?: string[];
      };
      const shouldAnnounce = pendingAnnounceRef.current;
      pendingAnnounceRef.current = false;
      if (!response.ok) {
        if (shouldAnnounce || !silent) {
          onFeedbackRef.current({
            tone: "error",
            message: payload.error ?? "Unable to sync brokerage holdings.",
          });
        }
        return;
      }
      if (payload.snapshot) onSnapshotRef.current(payload.snapshot);
      const historyImported = payload.historyImported ?? 0;
      if (shouldAnnounce) {
        const warning = payload.warnings?.find(Boolean);
        onFeedbackRef.current({
          tone: payload.pending ? "success" : warning ? "error" : "success",
          message: payload.pending
            ? warning ??
              "Connected. Holdings are still importing — sync again in a moment."
            : warning && !payload.snapshot?.positions.length
              ? warning
              : historyImported > 0
                ? `Brokerage updated. Imported ${historyImported} closed lot${historyImported === 1 ? "" : "s"} from recent fills.`
                : "Brokerage holdings updated.",
        });
      } else if (historyImported > 0) {
        onFeedbackRef.current({
          tone: "success",
          message: `Imported ${historyImported} closed lot${historyImported === 1 ? "" : "s"} from brokerage fills.`,
        });
      }
    } catch (error) {
      const shouldAnnounce = pendingAnnounceRef.current;
      pendingAnnounceRef.current = false;
      if (shouldAnnounce || !silent) {
        onFeedbackRef.current({
          tone: "error",
          message:
            error instanceof Error
              ? error.message
              : "Unable to sync brokerage holdings.",
        });
      }
    } finally {
      syncingRef.current = false;
      setWorking(false);
    }
  }

  async function importHistory(lookback: HistoryLookback) {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setWorking(true);
    setLookbackBusy(lookback);
    try {
      const response = await fetch(withBook("/api/brokerage/history"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lookback }),
      });
      const payload = (await response.json()) as {
        snapshot?: PositionsSnapshot;
        pending?: boolean;
        imported?: number;
        skipped?: number;
        fills?: number;
        updated?: number;
        lookback?: HistoryLookback;
        fromDate?: string | null;
        toDate?: string | null;
        firstTransactionDate?: string | null;
        error?: string;
        warnings?: string[];
      };
      if (!response.ok) {
        onFeedbackRef.current({
          tone: "error",
          message: payload.error ?? "Unable to import past trades.",
        });
        return;
      }
      if (payload.snapshot) onSnapshotRef.current(payload.snapshot);
      const warning = payload.warnings?.find(Boolean);
      const imported = payload.imported ?? 0;
      const updated = payload.updated ?? 0;
      const windowLabel =
        HISTORY_LOOKBACK_LABELS[payload.lookback ?? lookback].toLowerCase();
      const range =
        payload.fromDate && payload.toDate
          ? ` (${payload.fromDate} → ${payload.toDate})`
          : payload.firstTransactionDate
            ? ` (SnapTrade history starts ${payload.firstTransactionDate})`
            : "";
      onFeedbackRef.current({
        tone: "success",
        message: payload.pending
          ? warning ??
            "Trade history is still importing from the brokerage — try again later."
          : imported > 0
            ? `Imported ${imported} closed lot${imported === 1 ? "" : "s"} from ${windowLabel}${range}.`
            : updated > 0
              ? `Updated fees and P&L on ${updated} closed lot${updated === 1 ? "" : "s"} from ${windowLabel}${range}.`
              : warning ?? `No new closed lots in ${windowLabel}.`,
      });
      setPanel(null);
    } catch (error) {
      onFeedbackRef.current({
        tone: "error",
        message:
          error instanceof Error ? error.message : "Unable to import past trades.",
      });
    } finally {
      syncingRef.current = false;
      setWorking(false);
      setLookbackBusy(null);
    }
  }

  useEffect(() => {
    onSnapshotRef.current = onSnapshot;
    onFeedbackRef.current = onFeedback;
    pullHoldingsRef.current = pullHoldings;
  });

  useEffect(() => {
    const snaptradeOrigins = new Set([
      "https://app.snaptrade.com",
      "https://connect.snaptrade.com",
      "https://app.staging.snaptrade.com",
    ]);
    function onMessage(event: MessageEvent) {
      if (!snaptradeOrigins.has(event.origin)) return;
      const data = event.data;
      if (!data) return;
      if (data.status === "SUCCESS") {
        setPanel(null);
        setRedirectUri(null);
        void pullHoldingsRef.current(true);
      } else if (data.status === "ERROR") {
        setPanel(null);
        setRedirectUri(null);
        onFeedbackRef.current({
          tone: "error",
          message: "Brokerage connection did not complete. You can try again.",
        });
      }
      if (data === "CLOSE_MODAL" || data === "ABANDONED" || data === "CLOSED") {
        setPanel(null);
        setRedirectUri(null);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    const flag = params.get("brokerage");
    if (status === "SUCCESS" || flag === "return" || flag === "connected") {
      const url = new URL(window.location.href);
      url.searchParams.delete("status");
      url.searchParams.delete("brokerage");
      url.searchParams.delete("connection_id");
      window.history.replaceState({}, "", url.pathname + url.search);
      if (status === "ERROR") {
        onFeedbackRef.current({
          tone: "error",
          message: "Brokerage connection did not complete. You can try again.",
        });
        return;
      }
      void pullHoldingsRef.current(true);
    }
  }, []);

  const importRetryRef = useRef(false);

  useEffect(() => {
    if (!snapshot.connectable || !connected || needsReconnect) return;
    if (!importing) {
      importRetryRef.current = false;
      return;
    }
    if (importRetryRef.current) return;
    importRetryRef.current = true;
    const timer = window.setTimeout(() => {
      void pullHoldingsRef.current(false, true);
    }, 12_000);
    return () => window.clearTimeout(timer);
  }, [connected, importing, needsReconnect, snapshot.connectable]);

  useEffect(() => {
    if (!snapshot.connectable || !connected || needsReconnect) return;

    let ticks = 0;
    function tick() {
      if (document.visibilityState === "hidden") return;
      ticks += 1;
      const session = isUsEquityMonitorWindow();
      if (!session && ticks % 4 !== 0) return;
      const holdingsOnly = session && ticks % 4 !== 0;
      void pullHoldingsRef.current(false, true, holdingsOnly);
    }

    tick();
    const interval = window.setInterval(tick, BROKERAGE_REFRESH_MS);
    function onVisible() {
      if (document.visibilityState === "visible") tick();
    }
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [connected, needsReconnect, snapshot.connectable]);

  async function startConnect(broker: string | null, reconnectId?: string) {
    setWorking(true);
    try {
      const response = await fetch("/api/brokerage/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ broker, reconnectId }),
      });
      const payload = (await response.json()) as {
        redirectUri?: string;
        error?: string;
      };
      if (!response.ok || !payload.redirectUri) {
        onFeedback({
          tone: "error",
          message: payload.error ?? "Unable to open the brokerage portal.",
        });
        return;
      }
      setRedirectUri(payload.redirectUri);
      setPanel("portal");
    } catch (error) {
      onFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to open the brokerage portal.",
      });
    } finally {
      setWorking(false);
    }
  }

  function finishPortal(result: "connected" | "error") {
    setPanel(null);
    setRedirectUri(null);
    if (result === "error") {
      onFeedback({
        tone: "error",
        message: "Brokerage connection did not complete. You can try again.",
      });
      return;
    }
    void pullHoldings(true);
  }

  async function disconnect(id: string) {
    setWorking(true);
    try {
      const response = await fetch(withBook(`/api/brokerage/connections/${id}`), {
        method: "DELETE",
      });
      const payload = (await response.json()) as {
        snapshot?: PositionsSnapshot;
        error?: string;
      };
      if (!response.ok) {
        onFeedback({
          tone: "error",
          message: payload.error ?? "Unable to disconnect that brokerage.",
        });
        return;
      }
      if (payload.snapshot) onSnapshot(payload.snapshot);
      onFeedback({
        tone: "success",
        message: "Brokerage disconnected. Synced lots were closed; manual lots are unchanged.",
      });
      setPanel(null);
    } catch (error) {
      onFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to disconnect that brokerage.",
      });
    } finally {
      setWorking(false);
    }
  }

  if (!canManage && !connected) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {connected ? (
          <>
            <Badge tone={needsReconnect ? "warn" : importing ? "warn" : "brand"}>
              {needsReconnect
                ? "Reconnect brokerage"
                : importing
                  ? "Importing holdings"
                  : "Brokerage linked"}
            </Badge>
            {lastSyncAt && !importing ? (
              <span className="font-mono text-[11px] text-[var(--ib-text-muted)]">
                Synced {formatMarketDateTime(lastSyncAt, { seconds: false })}
              </span>
            ) : null}
            {snapshot.connectable ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy || working}
                  onClick={() => void pullHoldings(true)}
                >
                  <RefreshCw aria-hidden="true" className="size-3.5" />
                  Sync
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy || working}
                  onClick={() => setPanel("import")}
                >
                  <History aria-hidden="true" className="size-3.5" />
                  Import past trades
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy || working}
                  onClick={() => setPanel("manage")}
                >
                  Manage
                </Button>
              </>
            ) : null}
          </>
        ) : snapshot.connectable ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy || working}
            onClick={() => setPanel("picker")}
          >
            <Landmark aria-hidden="true" className="size-3.5" />
            Connect brokerage
          </Button>
        ) : snapshot.configured ? null : canManage && !usingFixtures ? (
          <span className="font-mono text-[11px] text-[var(--ib-text-muted)]">
            Brokerage sync needs SnapTrade keys
          </span>
        ) : null}
      </div>

      {panel ? (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-black/70 px-3 pt-[8vh]"
          onMouseDown={() => {
            setPanel(null);
            setRedirectUri(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onMouseDown={(event) => event.stopPropagation()}
            className="w-full max-w-xl overflow-hidden rounded-[8px] border border-[var(--ib-border-control)] bg-[var(--ib-surface-3)] shadow-[var(--shadow-float)]"
          >
            <div className="flex items-center justify-between border-b border-[var(--ib-border-subtle)] px-4 py-3">
              <h2 id={titleId} className="text-sm font-semibold">
                {panel === "manage"
                  ? "Brokerage accounts"
                  : panel === "import"
                    ? "Import past trades"
                    : panel === "portal"
                      ? "Connect brokerage"
                      : "Connect a brokerage"}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setPanel(null);
                  setRedirectUri(null);
                }}
                className="grid size-9 place-items-center rounded-[4px] text-[var(--ib-text-muted)] hover:bg-[var(--ib-surface-hover)]"
                aria-label="Close brokerage dialog"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>

            {panel === "picker" ? (
              <div className="space-y-3 p-4">
                <p className="text-[13px] text-[var(--ib-text-secondary)]">
                  Read-only SnapTrade login. This workspace never stores brokerage
                  passwords and cannot place trades.
                </p>
                <div className="grid gap-2">
                  {FEATURED_BROKERS.map((broker) => (
                    <Button
                      key={broker.slug}
                      type="button"
                      variant="secondary"
                      disabled={working}
                      onClick={() => void startConnect(broker.slug)}
                    >
                      {broker.name}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={working}
                    onClick={() => void startConnect(null)}
                  >
                    Other SnapTrade brokers
                  </Button>
                </div>
              </div>
            ) : null}

            {panel === "portal" && redirectUri ? (
              <div className="p-0">
                <iframe
                  title="SnapTrade connection portal"
                  src={redirectUri}
                  className="h-[70vh] w-full border-0 bg-[var(--ib-surface-inset)]"
                  referrerPolicy="no-referrer"
                  allow="clipboard-read; clipboard-write"
                />
                <div className="flex items-center justify-between gap-2 border-t border-[var(--ib-border-subtle)] px-4 py-2">
                  <a
                    href={redirectUri}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[11px] text-[var(--ib-maroon-300)] hover:underline"
                  >
                    Open in a new tab
                  </a>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void finishPortal("connected")}
                  >
                    I&apos;m done
                  </Button>
                </div>
              </div>
            ) : null}

            {panel === "manage" ? (
              <div className="space-y-3 p-4">
                {snapshot.connections.map((connection) => (
                  <div
                    key={connection.id}
                    className="rounded-[4px] border border-[var(--ib-border-subtle)] px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-[13px] font-medium">
                          {connection.brokerageName}
                        </p>
                        <p className="font-mono text-[11px] text-[var(--ib-text-muted)]">
                          {connection.status === "connected"
                            ? "Connected · read only"
                            : "Reconnect required"}
                          {connection.accounts.length
                            ? ` · ${connection.accounts.map((account) => account.name).join(", ")}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {connection.status === "connected" ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={working}
                            onClick={() => setPanel("import")}
                          >
                            Import past trades
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={working}
                            onClick={() => void startConnect(null, connection.id)}
                          >
                            Reconnect
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={working}
                          onClick={() => void disconnect(connection.id)}
                        >
                          <Unplug aria-hidden="true" className="size-3.5" />
                          Disconnect
                        </Button>
                      </div>
                    </div>
                    {connection.lastSyncError ? (
                      <p className="mt-1 text-[12px] text-[var(--market-negative)]">
                        {connection.lastSyncError}
                      </p>
                    ) : null}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={working}
                  onClick={() => setPanel("picker")}
                >
                  Connect another
                </Button>
              </div>
            ) : null}

            {panel === "import" ? (
              <div className="space-y-3 p-4">
                <p className="text-[13px] text-[var(--ib-text-secondary)]">
                  Choose how far back to pull SnapTrade fills. Closed lots need
                  both the entry and the exit in this window — use All history
                  for older entries. Sync already refreshes holdings and the
                  last week of fills while this page is open.
                </p>
                <p className="text-[13px] text-[var(--ib-text-secondary)]">
                  SnapTrade order history can lag about a day after you connect.
                  Safe to run again; already imported lots are updated in place.
                </p>
                <div
                  role="group"
                  aria-label="Import lookback"
                  className="grid grid-cols-2 gap-2"
                >
                  {HISTORY_LOOKBACKS.map((option) => (
                    <Button
                      key={option}
                      type="button"
                      variant={option === "all" ? "secondary" : "ghost"}
                      size="sm"
                      disabled={busy || working}
                      aria-busy={lookbackBusy === option}
                      onClick={() => void importHistory(option)}
                    >
                      <History aria-hidden="true" className="size-3.5" />
                      {lookbackBusy === option
                        ? "Importing…"
                        : HISTORY_LOOKBACK_LABELS[option]}
                    </Button>
                  ))}
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={working}
                    onClick={() => setPanel(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
