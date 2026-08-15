"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ClientMarketTime } from "@/components/ui/ClientMarketTime";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { StaleBanner } from "@/components/ui/StaleBanner";
import { StatePanel } from "@/components/ui/StatePanel";
import { BrokerageConnect, type BrokerageConnectHandle } from "@/components/positions/BrokerageConnect";
import { PositionFormDialog, type PositionFormValues } from "@/components/positions/PositionFormDialog";
import { PositionActivity } from "@/components/positions/PositionActivity";
import {
  PastPositionsMetrics,
  PositionsAttribution,
  PositionsMetricsStrip,
  LockedOwnerPnlStrip,
} from "@/components/positions/PositionsSummary";
import { PositionsOwnerTabs } from "@/components/positions/PositionsOwnerTabs";
import { OwnerUnlockPanel } from "@/components/positions/OwnerUnlockPanel";
import { PositionsBookTabs } from "@/components/positions/PositionsBookTabs";
import { PositionsTable } from "@/components/positions/PositionsTable";
import { PositionsPrivacyProvider } from "@/components/positions/privacy-context";
import { PositionsValuePrivacyToggle } from "@/components/positions/PositionsPrivacy";
import { BookRiskPanel } from "@/components/intel/BookRiskPanel";
import {
  applyAccountValueToSnapshot,
  toPositionRecord,
} from "@/lib/positions/assemble";
import { applyCloseToBook, PositionCloseError } from "@/lib/positions/close";
import { mergePolledSnapshot, positionsCoverageCopy } from "@/lib/positions/coverage";
import { buildPositionActivity } from "@/lib/positions/math";
import { UNASSIGNED_OWNER_ID, snapshotBelongsToView } from "@/lib/positions/owners";
import type {
  PositionBook,
  PositionRecord,
  PositionsSnapshot,
} from "@/lib/positions/types";
import type { BrokerageSnapshot } from "@/lib/brokerage/types";
import { formatQuantity } from "@/lib/utils/format";
import { displayPositionTicker } from "@/lib/positions/option-symbol";

const POLL_MS = 15_000;
const CLOSED_REFRESH_MS = 10 * 60 * 1000;

type SideFilter = "all" | "long" | "short";

function matchesPositionFilters(
  row: { ticker: string; side: string; strategy: string | null; notes: string | null },
  query: string,
  side: SideFilter,
) {
  if (side !== "all" && row.side !== side) return false;
  const needle = query.trim().toUpperCase();
  if (!needle) return true;
  return (
    row.ticker.includes(needle) ||
    displayPositionTicker(row.ticker).toUpperCase().includes(needle) ||
    (row.strategy ?? "").toUpperCase().includes(needle) ||
    (row.notes ?? "").toUpperCase().includes(needle)
  );
}

function recordsFromSnapshot(snapshot: PositionsSnapshot): PositionRecord[] {
  return snapshot.positions.map(toPositionRecord);
}

export function PositionsWorkspace({
  initial,
}: {
  initial: PositionsSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [book, setBook] = useState<PositionRecord[]>(() =>
    recordsFromSnapshot(initial),
  );
  const [sessionBooks, setSessionBooks] = useState<Record<string, PositionRecord[]>>(
    () => ({ [initial.bookId || initial.ownerId]: recordsFromSnapshot(initial) }),
  );
  const [sessionAccountValues, setSessionAccountValues] = useState<
    Record<string, number | null>
  >(() => ({ [initial.bookId || initial.ownerId]: initial.accountValue }));
  const [sessionOwnerBooks, setSessionOwnerBooks] = useState<
    Record<string, PositionBook[]>
  >(() => ({ [initial.ownerId]: initial.books }));
  const [lastBookByOwner, setLastBookByOwner] = useState<Record<string, string>>(
    () => ({ [initial.ownerId]: initial.bookId }),
  );
  const [savingAccountValue, setSavingAccountValue] = useState(false);
  const [bookBusy, setBookBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [side, setSide] = useState<SideFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<"add" | "edit" | null>(null);
  const [confirmBrokerageAdd, setConfirmBrokerageAdd] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [showFillTape, setShowFillTape] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "error" | "success";
    message: string;
  } | null>(null);

  const viewedOwnerRef = useRef(initial.ownerId);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const brokerageRef = useRef<BrokerageConnectHandle | null>(null);
  const [viewerBrokerage, setViewerBrokerage] = useState<
    BrokerageSnapshot | undefined
  >(() =>
    initial.ownerId === initial.viewerId ? initial.brokerage : undefined,
  );
  const demo = snapshot.usingFixtures || snapshot.persistence === "fixtures";
  const activeOwner =
    snapshot.owners.find((owner) => owner.id === snapshot.ownerId) ?? null;
  const bookKey = snapshot.bookId || snapshot.ownerId;
  const unassignedLocked =
    snapshot.ownerLocked && snapshot.ownerId === UNASSIGNED_OWNER_ID;

  function rememberLots(id: string, nextBook: PositionRecord[]) {
    setBook(nextBook);
    setSessionBooks((current) => ({ ...current, [id]: nextBook }));
  }

  function rememberAccountValue(id: string, value: number | null) {
    setSessionAccountValues((current) => ({ ...current, [id]: value }));
  }

  function rememberOwnerBooks(ownerId: string, books: PositionBook[]) {
    setSessionOwnerBooks((current) => ({ ...current, [ownerId]: books }));
  }

  const accountValueForBook =
    sessionAccountValues[bookKey] !== undefined
      ? sessionAccountValues[bookKey]!
      : snapshot.accountValue;

  useEffect(() => {
    if (snapshot.ownerId === snapshot.viewerId && snapshot.brokerage) {
      setViewerBrokerage(snapshot.brokerage);
    }
  }, [snapshot.brokerage, snapshot.ownerId, snapshot.viewerId]);

  /** Metrics/weights always reflect the session account value, even if DB save fails. */
  const displaySnapshot = useMemo(
    () =>
      snapshot.ownerLocked
        ? snapshot
        : applyAccountValueToSnapshot(snapshot, accountValueForBook),
    [accountValueForBook, snapshot],
  );
  const selected =
    displaySnapshot.positions.find((row) => row.id === selectedId) ?? null;

  function mergeOwnerBooks(
    server: PositionBook[],
    ownerId: string,
  ): PositionBook[] {
    const extras = sessionOwnerBooks[ownerId] ?? [];
    if (!extras.length) return server;
    const ids = new Set(server.map((row) => row.id));
    return [...server, ...extras.filter((row) => !ids.has(row.id))];
  }

  async function refreshFromBook(
    nextBook: PositionRecord[],
    ownerId = snapshot.ownerId,
    accountValue = accountValueForBook,
    bookId = snapshot.bookId,
    books = snapshot.books,
  ) {
    const response = await fetch("/api/positions/snapshot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        positions: nextBook,
        includeClosed: true,
        includeHistory: false,
        ownerId,
        bookId,
        books,
        accountValue,
      }),
    });
    if (!response.ok) throw new Error("Unable to refresh live marks.");
    const next = (await response.json()) as PositionsSnapshot;
    const nextBooks = mergeOwnerBooks(next.books, next.ownerId || ownerId);
    const resolved = {
      ...next,
      books: nextBooks,
      bookId: next.bookId || bookId,
    };
    if (!snapshotBelongsToView(resolved, viewedOwnerRef.current)) return;
    setSnapshot(resolved);
    rememberLots(resolved.bookId || bookId, recordsFromSnapshot(resolved));
    rememberAccountValue(resolved.bookId || bookId, resolved.accountValue);
    rememberOwnerBooks(resolved.ownerId || ownerId, nextBooks);
    setLastBookByOwner((current) => ({
      ...current,
      [resolved.ownerId || ownerId]: resolved.bookId || bookId,
    }));
  }

  const openRows = useMemo(
    () =>
      displaySnapshot.positions.filter(
        (row) => row.status === "open" && matchesPositionFilters(row, query, side),
      ),
    [displaySnapshot.positions, query, side],
  );
  const closedRows = useMemo(
    () =>
      displaySnapshot.positions.filter(
        (row) =>
          row.status === "closed" && matchesPositionFilters(row, query, side),
      ),
    [displaySnapshot.positions, query, side],
  );
  const activity = useMemo(
    () => buildPositionActivity([...openRows, ...closedRows]),
    [closedRows, openRows],
  );

  async function loadNamedBook(ownerId: string, requestedBookId?: string) {
    viewedOwnerRef.current = ownerId;
    setSelectedId(null);
    const preferred =
      requestedBookId || lastBookByOwner[ownerId] || undefined;
    if (demo && preferred && sessionBooks[preferred]) {
      const nextBook = sessionBooks[preferred]!;
      setBook(nextBook);
      const accountValue =
        sessionAccountValues[preferred] !== undefined
          ? sessionAccountValues[preferred]!
          : undefined;
      const books =
        sessionOwnerBooks[ownerId] ??
        (ownerId === snapshot.ownerId ? snapshot.books : undefined);
      await refreshFromBook(
        nextBook,
        ownerId,
        accountValue,
        preferred,
        books,
      );
      return;
    }
    const params = new URLSearchParams({ includeClosed: "1", owner: ownerId });
    if (preferred) params.set("book", preferred);
    const response = await fetch(`/api/positions?${params}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load that book.");
    const next = (await response.json()) as PositionsSnapshot;
    const nextBooks = mergeOwnerBooks(next.books, next.ownerId || ownerId);
    const resolvedBookId = preferred && nextBooks.some((row) => row.id === preferred)
      ? preferred
      : next.bookId;
    if (demo && resolvedBookId && sessionBooks[resolvedBookId]) {
      await refreshFromBook(
        sessionBooks[resolvedBookId]!,
        next.ownerId || ownerId,
        sessionAccountValues[resolvedBookId],
        resolvedBookId,
        nextBooks,
      );
      return;
    }
    const nextLots = recordsFromSnapshot(next);
    const resolved = { ...next, books: nextBooks, bookId: resolvedBookId };
    if (!snapshotBelongsToView(resolved, viewedOwnerRef.current)) return;
    setSnapshot(resolved);
    rememberOwnerBooks(resolved.ownerId || ownerId, nextBooks);
    setLastBookByOwner((current) => ({
      ...current,
      [resolved.ownerId || ownerId]: resolved.bookId,
    }));
    if (resolved.ownerLocked) {
      setUnlockError(null);
      return;
    }
    rememberLots(resolved.bookId || next.ownerId, nextLots);
    if (sessionAccountValues[resolved.bookId] === undefined) {
      rememberAccountValue(resolved.bookId, resolved.accountValue);
    }
  }

  async function handleAccountValue(value: number | null) {
    setSavingAccountValue(true);
    setFeedback(null);
    rememberAccountValue(bookKey, value);
    setSnapshot((current) => applyAccountValueToSnapshot(current, value));
    try {
      if (demo) {
        await refreshFromBook(book, snapshot.ownerId, value, snapshot.bookId);
        setFeedback({
          tone: "success",
          message:
            value == null
              ? "Account value cleared for this session."
              : "Account value updated for this session.",
        });
        return;
      }
      const response = await fetch("/api/positions/account", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountValue: value,
          ownerId: snapshot.ownerId,
          bookId: snapshot.bookId,
        }),
      });
      const payload = (await response.json()) as {
        snapshot?: PositionsSnapshot;
        accountValue?: number | null;
        error?: string;
      };
      if (!response.ok) {
        setFeedback({
          tone: "error",
          message:
            `${payload.error ?? "Unable to save account value."} Metrics still use this session’s value.`,
        });
        return;
      }
      if (payload.snapshot) {
        setSnapshot(
          applyAccountValueToSnapshot(
            payload.snapshot,
            payload.snapshot.accountValue ?? value,
          ),
        );
        rememberLots(
          payload.snapshot.bookId || bookKey,
          recordsFromSnapshot(payload.snapshot),
        );
        rememberAccountValue(
          payload.snapshot.bookId || bookKey,
          payload.snapshot.accountValue ?? value,
        );
        rememberOwnerBooks(payload.snapshot.ownerId, payload.snapshot.books);
      }
      setFeedback({
        tone: "success",
        message:
          value == null ? "Account value cleared." : "Account value saved.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          `${error instanceof Error ? error.message : "Unable to save account value."} Metrics still use this session’s value.`,
      });
    } finally {
      setSavingAccountValue(false);
    }
  }

  useEffect(() => {
    if (!demo) return;
    let cancelled = false;
    async function pull() {
      if (document.visibilityState === "hidden") return;
      try {
        const response = await fetch("/api/positions/snapshot", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            positions: book,
            includeClosed: true,
            includeHistory: false,
            ownerId: snapshot.ownerId,
            bookId: snapshot.bookId,
            books: snapshot.books,
            accountValue: accountValueForBook,
          }),
        });
        if (!response.ok || cancelled) return;
        const next = (await response.json()) as PositionsSnapshot;
        if (
          !cancelled &&
          snapshotBelongsToView(next, viewedOwnerRef.current)
        ) {
          setSnapshot({
            ...next,
            books: mergeOwnerBooks(next.books, next.ownerId || snapshot.ownerId),
            bookId: next.bookId || snapshot.bookId,
          });
        }
      } catch {
        /* keep last valid snapshot */
      }
    }
    const timeout = window.setTimeout(pull, 2_000);
    const interval = window.setInterval(pull, POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- quotes poll keyed to book + owner; books array would retrigger
  }, [accountValueForBook, book, demo, snapshot.bookId, snapshot.ownerId]);

  useEffect(() => {
    if (demo || snapshot.persistence !== "supabase") {
      return;
    }
    let cancelled = false;
    async function pull() {
      if (document.visibilityState === "hidden") return;
      const ownerId = viewedOwnerRef.current;
      if (ownerId !== snapshot.ownerId) return;
      try {
        const params = new URLSearchParams({
          owner: ownerId,
        });
        if (snapshot.bookId) params.set("book", snapshot.bookId);
        const response = await fetch(`/api/positions?${params}`, {
          cache: "no-store",
        });
        if (!response.ok || cancelled) return;
        const next = (await response.json()) as PositionsSnapshot;
        if (cancelled || !snapshotBelongsToView(next, viewedOwnerRef.current)) {
          return;
        }
        const merged = mergePolledSnapshot(snapshotRef.current, next);
        setSnapshot(merged);
        if (!merged.ownerLocked) {
          rememberLots(merged.bookId || merged.ownerId, recordsFromSnapshot(merged));
        }
      } catch {
        /* keep last valid snapshot */
      }
    }
    const timeout = window.setTimeout(pull, 2_000);
    const interval = window.setInterval(pull, POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [demo, snapshot.bookId, snapshot.ownerId, snapshot.ownerLocked, snapshot.persistence]);

  useEffect(() => {
    if (demo || snapshot.persistence !== "supabase") return;
    let cancelled = false;
    async function pullClosed() {
      if (document.visibilityState === "hidden") return;
      const ownerId = viewedOwnerRef.current;
      if (ownerId !== snapshot.ownerId) return;
      try {
        const params = new URLSearchParams({
          includeClosed: "1",
          owner: ownerId,
        });
        if (snapshot.bookId) params.set("book", snapshot.bookId);
        const response = await fetch(`/api/positions?${params}`, {
          cache: "no-store",
        });
        if (!response.ok || cancelled) return;
        const next = (await response.json()) as PositionsSnapshot;
        if (cancelled || !snapshotBelongsToView(next, viewedOwnerRef.current)) {
          return;
        }
        setSnapshot(next);
        if (!next.ownerLocked) {
          rememberLots(next.bookId || next.ownerId, recordsFromSnapshot(next));
        }
      } catch {
        /* keep last valid snapshot */
      }
    }
    function onVisible() {
      if (document.visibilityState === "visible") void pullClosed();
    }
    const interval = window.setInterval(pullClosed, CLOSED_REFRESH_MS);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [demo, snapshot.bookId, snapshot.ownerId, snapshot.ownerLocked, snapshot.persistence]);

  async function handleCreate(values: PositionFormValues) {
    setSubmitting(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/positions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ticker: values.ticker,
          assetType: values.assetType,
          side: values.side,
          quantity: values.quantity,
          multiplier: values.multiplier,
          entryPrice: values.entryPrice,
          entryDate: values.entryDate,
          strategy: values.strategy || null,
          notes: values.notes || null,
          ownerId: snapshot.ownerId,
          bookId: snapshot.bookId || undefined,
          confirmManualOnBrokerageBook: confirmBrokerageAdd || undefined,
        }),
      });
      const payload = (await response.json()) as {
        position?: PositionRecord;
        snapshot?: PositionsSnapshot;
        demo?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Save failed.");
      if (payload.snapshot) {
        setSnapshot(payload.snapshot);
        rememberLots(payload.snapshot.bookId || bookKey, recordsFromSnapshot(payload.snapshot));
        rememberOwnerBooks(payload.snapshot.ownerId, payload.snapshot.books);
      } else if (payload.position) {
        const nextBook = [
          ...book,
          {
            ...payload.position,
            bookId: payload.position.bookId ?? snapshot.bookId,
          },
        ];
        rememberLots(bookKey, nextBook);
        await refreshFromBook(nextBook, snapshot.ownerId);
      }
      setFormMode(null);
      setFeedback({
        tone: "success",
        message: payload.demo
          ? "Position added to this session. Demo blotter changes reset on reload."
          : "Position saved to this book.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to add the position.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEdit(values: PositionFormValues) {
    if (!selected) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/positions/${selected.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ticker: values.ticker,
          assetType: values.assetType,
          side: values.side,
          quantity: values.quantity,
          multiplier: values.multiplier,
          entryPrice: values.entryPrice,
          entryDate: values.entryDate,
          strategy: values.strategy || null,
          notes: values.notes || null,
        }),
      });
      const payload = (await response.json()) as {
        snapshot?: PositionsSnapshot;
        patch?: Partial<PositionRecord>;
        updatedAt?: string;
        demo?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Update failed.");
      if (payload.snapshot) {
        setSnapshot(payload.snapshot);
        rememberLots(payload.snapshot.bookId || bookKey, recordsFromSnapshot(payload.snapshot));
        rememberOwnerBooks(payload.snapshot.ownerId, payload.snapshot.books);
      } else {
        const nextBook = book.map((row) =>
          row.id === selected.id
            ? {
                ...row,
                ticker: values.ticker,
                assetType: values.assetType,
                side: values.side,
                quantity: values.quantity,
                multiplier: values.multiplier,
                entryPrice: values.entryPrice,
                entryDate: values.entryDate,
                strategy: values.strategy || null,
                notes: values.notes || null,
                updatedAt: payload.updatedAt ?? new Date().toISOString(),
              }
            : row,
        );
        rememberLots(bookKey, nextBook);
        await refreshFromBook(nextBook, snapshot.ownerId);
      }
      setFormMode(null);
      setFeedback({
        tone: "success",
        message: payload.demo
          ? "Session position updated."
          : "Position updated.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to update the position.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClose(input: {
    closePrice: number;
    closeDate: string;
    quantity: number;
  }) {
    if (!selected) return;
    setClosing(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/positions/${selected.id}/close`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const payload = (await response.json()) as {
        snapshot?: PositionsSnapshot;
        closePrice?: number;
        closeDate?: string;
        closedAt?: string;
        quantity?: number | null;
        closedLotId?: string;
        demo?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Close failed.");
      if (payload.snapshot) {
        setSnapshot(payload.snapshot);
        rememberLots(
          payload.snapshot.bookId || bookKey,
          recordsFromSnapshot(payload.snapshot),
        );
        rememberOwnerBooks(payload.snapshot.ownerId, payload.snapshot.books);
        const remaining = payload.snapshot.positions.find(
          (row) => row.id === selected.id && row.status === "open",
        );
        setSelectedId(remaining ? remaining.id : null);
      } else {
        const result = applyCloseToBook(book, selected.id, {
          closePrice: payload.closePrice ?? input.closePrice,
          closeDate: payload.closeDate ?? input.closeDate,
          quantity: payload.quantity ?? input.quantity,
          closedAt: payload.closedAt ?? new Date().toISOString(),
          closedLotId: payload.closedLotId,
        });
        rememberLots(bookKey, result.book);
        await refreshFromBook(result.book, snapshot.ownerId);
        setSelectedId(result.remaining?.id ?? null);
      }
      const closedQty = payload.quantity ?? input.quantity;
      const partial = closedQty > 0 && closedQty < selected.quantity;
      setFeedback({
        tone: "success",
        message: partial
          ? payload.demo
            ? `Closed ${formatQuantity(closedQty)} of ${formatQuantity(selected.quantity)} in this session. Remaining sleeve stays on the book.`
            : `Closed ${formatQuantity(closedQty)} of ${formatQuantity(selected.quantity)}. Remaining sleeve stays on the book.`
          : payload.demo
            ? "Position closed in this session."
            : "Position closed.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof PositionCloseError || error instanceof Error
            ? error.message
            : "Unable to close the position.",
      });
    } finally {
      setClosing(false);
    }
  }

  async function handleCreateBook(title: string) {
    setBookBusy(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/positions/books", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, ownerId: snapshot.ownerId }),
      });
      const payload = (await response.json()) as {
        book?: PositionBook;
        snapshot?: PositionsSnapshot;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Unable to create the book.");
      if (payload.snapshot) {
        setSnapshot(payload.snapshot);
        rememberLots(
          payload.snapshot.bookId,
          recordsFromSnapshot(payload.snapshot),
        );
        rememberOwnerBooks(payload.snapshot.ownerId, payload.snapshot.books);
        rememberAccountValue(payload.snapshot.bookId, payload.snapshot.accountValue);
        setLastBookByOwner((current) => ({
          ...current,
          [payload.snapshot!.ownerId]: payload.snapshot!.bookId,
        }));
        setSelectedId(null);
        return;
      }
      if (!payload.book) throw new Error("Unable to create the book.");
      const books = [...snapshot.books, payload.book];
      rememberOwnerBooks(snapshot.ownerId, books);
      rememberLots(payload.book.id, []);
      rememberAccountValue(payload.book.id, null);
      await refreshFromBook([], snapshot.ownerId, null, payload.book.id, books);
      setSelectedId(null);
      setFeedback({
        tone: "success",
        message: `Created ${payload.book.title}.`,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error ? error.message : "Unable to create the book.",
      });
    } finally {
      setBookBusy(false);
    }
  }

  async function handleRenameBook(id: string, title: string) {
    setBookBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/positions/books/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const payload = (await response.json()) as {
        book?: PositionBook;
        snapshot?: PositionsSnapshot;
        title?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Unable to rename the book.");
      if (payload.snapshot) {
        setSnapshot(payload.snapshot);
        rememberOwnerBooks(payload.snapshot.ownerId, payload.snapshot.books);
        return;
      }
      const nextTitle = payload.book?.title ?? payload.title ?? title;
      const books = snapshot.books.map((row) =>
        row.id === id ? { ...row, title: nextTitle } : row,
      );
      rememberOwnerBooks(snapshot.ownerId, books);
      setSnapshot((current) => ({ ...current, books }));
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error ? error.message : "Unable to rename the book.",
      });
    } finally {
      setBookBusy(false);
    }
  }

  async function handleDeleteBook(id: string) {
    const removed = snapshot.books.find((book) => book.id === id);
    setBookBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/positions/books/${id}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as {
        snapshot?: PositionsSnapshot;
        deletedLots?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Unable to delete the book.");
      setSessionBooks((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setSessionAccountValues((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      const lotCount = payload.deletedLots ?? removed?.positionCount ?? 0;
      const title = removed?.title ?? "book";
      if (payload.snapshot) {
        setSnapshot(payload.snapshot);
        rememberLots(
          payload.snapshot.bookId,
          recordsFromSnapshot(payload.snapshot),
        );
        rememberOwnerBooks(payload.snapshot.ownerId, payload.snapshot.books);
        setLastBookByOwner((current) => ({
          ...current,
          [payload.snapshot!.ownerId]: payload.snapshot!.bookId,
        }));
        setSelectedId(null);
      } else {
        const books = snapshot.books.filter((row) => row.id !== id);
        const next = books[0];
        rememberOwnerBooks(snapshot.ownerId, books);
        if (next) {
          await loadNamedBook(snapshot.ownerId, next.id);
        }
        setSelectedId(null);
      }
      setFeedback({
        tone: "success",
        message:
          lotCount > 0
            ? `Deleted ${title} and ${lotCount} ${lotCount === 1 ? "lot" : "lots"}.`
            : `Deleted ${title}.`,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error ? error.message : "Unable to delete the book.",
      });
    } finally {
      setBookBusy(false);
    }
  }

  async function handleReorderBooks(bookIds: string[]) {
    const previous = snapshot.books;
    const nextBooks = bookIds
      .map((id) => previous.find((book) => book.id === id))
      .filter((book): book is PositionBook => Boolean(book));
    if (nextBooks.length !== previous.length) return;
    setSnapshot((current) => ({ ...current, books: nextBooks }));
    rememberOwnerBooks(snapshot.ownerId, nextBooks);
    try {
      const response = await fetch("/api/positions/books/reorder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ownerId: snapshot.ownerId,
          bookIds,
          bookId: snapshot.bookId,
        }),
      });
      const payload = (await response.json()) as {
        snapshot?: PositionsSnapshot;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to reorder books.");
      }
      if (payload.snapshot) {
        const keepBookId =
          snapshot.bookId &&
          payload.snapshot.books.some((book) => book.id === snapshot.bookId)
            ? snapshot.bookId
            : payload.snapshot.bookId;
        const resolved = { ...payload.snapshot, bookId: keepBookId };
        setSnapshot(resolved);
        rememberOwnerBooks(resolved.ownerId, resolved.books);
        rememberLots(resolved.bookId, recordsFromSnapshot(resolved));
      }
    } catch (error) {
      setSnapshot((current) => ({ ...current, books: previous }));
      rememberOwnerBooks(snapshot.ownerId, previous);
      setFeedback({
        tone: "error",
        message:
          error instanceof Error ? error.message : "Unable to reorder books.",
      });
    }
  }

  async function handleUnlock(password: string) {
    setUnlocking(true);
    setUnlockError(null);
    try {
      const response = await fetch("/api/positions/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ownerId: snapshot.ownerId, password }),
      });
      const payload = (await response.json()) as PositionsSnapshot & {
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Unable to unlock that blotter.");
      if (!snapshotBelongsToView(payload, viewedOwnerRef.current)) return;
      setSnapshot(payload);
      if (payload.ownerLocked) return;
      rememberLots(
        payload.bookId || payload.ownerId,
        recordsFromSnapshot(payload),
      );
      rememberOwnerBooks(payload.ownerId, payload.books);
      rememberAccountValue(
        payload.bookId || payload.ownerId,
        payload.accountValue,
      );
      setLastBookByOwner((current) => ({
        ...current,
        [payload.ownerId]: payload.bookId,
      }));
    } catch (error) {
      setUnlockError(
        error instanceof Error ? error.message : "Unable to unlock that blotter.",
      );
    } finally {
      setUnlocking(false);
    }
  }

  const activeBookRow = snapshot.books.find((row) => row.id === snapshot.bookId);
  const snaptradeBook = activeBookRow?.source === "snaptrade";
  const flatBook =
    !snapshot.ownerLocked &&
    displaySnapshot.summary.openCount === 0 &&
    displaySnapshot.summary.closedCount > 0;
  const emptyBook =
    displaySnapshot.summary.openCount === 0 &&
    displaySnapshot.summary.closedCount === 0;
  const sameDayRoundTrips =
    flatBook && (displaySnapshot.summary.closedAverageHoldingDays ?? 0) < 1;
  const coverage = positionsCoverageCopy(displaySnapshot);
  const primaryRows = flatBook ? closedRows : openRows;
  const secondaryClosed = flatBook ? [] : closedRows;

  if (snapshot.persistence === "unavailable" && !snapshot.usingFixtures) {
    return (
      <StatePanel
        kind="unavailable"
        title="Position blotter unavailable"
        description={
          snapshot.error ??
          "A live position repository is not connected in this environment."
        }
      />
    );
  }

  return (
    <PositionsPrivacyProvider>
    <div className="min-w-0 space-y-3">
      <PageHeader
        title="Positions"
        className="mb-2"
        actions={
          unassignedLocked ? undefined : (
          <div className="flex flex-wrap items-center gap-2">
            <PositionsValuePrivacyToggle />
            <BrokerageConnect
              ref={brokerageRef}
              brokerage={
                viewerBrokerage ??
                (snapshot.ownerId === snapshot.viewerId
                  ? snapshot.brokerage
                  : undefined)
              }
              canManage={snapshot.canEdit && snapshot.ownerId === snapshot.viewerId}
              headless={snapshot.ownerId !== snapshot.viewerId}
              busy={submitting || closing || bookBusy}
              bookId={
                snapshot.ownerId === snapshot.viewerId
                  ? snapshot.bookId
                  : undefined
              }
              onSnapshot={(next) => {
                if (next.brokerage) setViewerBrokerage(next.brokerage);
                rememberOwnerBooks(next.ownerId, next.books);
                if (!next.ownerLocked) {
                  rememberLots(
                    next.bookId || next.ownerId,
                    recordsFromSnapshot(next),
                  );
                  rememberAccountValue(
                    next.bookId || next.ownerId,
                    next.accountValue,
                  );
                }
                setLastBookByOwner((current) => ({
                  ...current,
                  [next.ownerId]: next.bookId,
                }));
                if (!snapshotBelongsToView(next, viewedOwnerRef.current)) return;
                const keepBookId =
                  snapshot.bookId &&
                  next.books.some((book) => book.id === snapshot.bookId)
                    ? snapshot.bookId
                    : next.bookId;
                if (keepBookId && keepBookId !== next.bookId) {
                  void loadNamedBook(next.ownerId, keepBookId);
                  return;
                }
                const resolved = mergePolledSnapshot(snapshotRef.current, {
                  ...next,
                  bookId: keepBookId,
                });
                setSnapshot(resolved);
              }}
              onFeedback={setFeedback}
            />
            {snapshot.ownerId === snapshot.viewerId && snapshot.canEdit && !snaptradeBook ? (
              <Button variant="primary" size="sm" onClick={() => setFormMode("add")}>
                <Plus aria-hidden="true" className="size-3.5" />
                Add position
              </Button>
            ) : snapshot.ownerId === snapshot.viewerId && snapshot.canEdit && snaptradeBook ? (
              <div className="relative">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-expanded={moreOpen}
                  aria-haspopup="menu"
                  onClick={() => setMoreOpen((value) => !value)}
                >
                  <MoreHorizontal aria-hidden="true" className="size-3.5" />
                  More
                </Button>
                {moreOpen ? (
                  <div
                    role="menu"
                    className="absolute right-0 z-20 mt-1 w-64 rounded-[4px] border border-[var(--ib-border-strong)] bg-[var(--ib-surface-1)] p-2 shadow-lg"
                  >
                    <p className="px-1 pb-2 text-[11px] leading-4 text-[var(--ib-text-muted)]">
                      Manual lots on a linked book are not updated by the broker.
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        setMoreOpen(false);
                        setConfirmBrokerageAdd(true);
                        setFormMode("add");
                      }}
                    >
                      Add position
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : snapshot.ownerId === snapshot.viewerId ? null : (
              <Badge tone="neutral">View only</Badge>
            )}
          </div>
          )
        }
      />

      {!unassignedLocked ? (
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--ib-text-muted)]">
        {snapshot.usingFixtures ? <Badge tone="mock">Mock data</Badge> : null}
        {snapshot.licenseWarning ? (
          <Badge tone="warn">License</Badge>
        ) : null}
        <span className="font-mono">
          {coverage.label}
          {coverage.detail ? ` · ${coverage.detail}` : ""}
          {snapshot.marketSession ? ` · ${snapshot.marketSession}` : ""}
          {" · as of "}
          <ClientMarketTime value={snapshot.asOf} seconds />
        </span>
        {activeOwner && !activeOwner.isViewer ? (
          <span>Viewing {activeOwner.displayName}</span>
        ) : null}
      </div>
      ) : null}

      {snapshot.owners.length > 0 ? (
        <div className="sticky top-12 z-20 -mx-3 space-y-1.5 border-b border-[var(--ib-border-subtle)] bg-[var(--ib-canvas)] px-3 py-1.5 lg:top-11">
          <PositionsOwnerTabs
            owners={snapshot.owners}
            ownerId={snapshot.ownerId}
            onSelect={(id) => {
              setUnlockError(null);
              void loadNamedBook(id).catch((error: unknown) => {
                setFeedback({
                  tone: "error",
                  message:
                    error instanceof Error
                      ? error.message
                      : "Unable to switch owners.",
                });
              });
            }}
          />
          {!unassignedLocked &&
          (snapshot.books.length > 0 || snapshot.canEdit) ? (
            <PositionsBookTabs
              books={snapshot.books}
              bookId={snapshot.bookId}
              canEdit={snapshot.canEdit}
              busy={bookBusy}
              onSelect={(id) => {
                void loadNamedBook(snapshot.ownerId, id).catch(
                  (error: unknown) => {
                    setFeedback({
                      tone: "error",
                      message:
                        error instanceof Error
                          ? error.message
                          : "Unable to switch books.",
                    });
                  },
                );
              }}
              onCreate={(title) => {
                void handleCreateBook(title);
              }}
              onLinkBrokerage={() => brokerageRef.current?.openPicker()}
              onManageBrokerage={() => brokerageRef.current?.openManage()}
              canLinkBrokerage={Boolean(
                snapshot.ownerId === snapshot.viewerId &&
                  (viewerBrokerage ?? snapshot.brokerage)?.connectable,
              )}
              hasLinkedBrokerage={Boolean(
                snapshot.ownerId === snapshot.viewerId &&
                  (viewerBrokerage ?? snapshot.brokerage)?.connections.length,
              )}
              onRename={(id, title) => {
                void handleRenameBook(id, title);
              }}
              onDelete={(id) => {
                void handleDeleteBook(id);
              }}
              onReorder={(bookIds) => {
                void handleReorderBooks(bookIds);
              }}
            />
          ) : null}
        </div>
      ) : null}

      {unassignedLocked ? (
        <OwnerUnlockPanel
          ownerId={snapshot.ownerId}
          ownerName={activeOwner?.displayName || "this teammate"}
          busy={unlocking}
          error={unlockError}
          onUnlock={handleUnlock}
        />
      ) : (
        <>
      {snapshot.ownerLocked ? (
        <OwnerUnlockPanel
          ownerId={snapshot.ownerId}
          ownerName={activeOwner?.displayName || "this teammate"}
          busy={unlocking}
          error={unlockError}
          onUnlock={handleUnlock}
        />
      ) : null}
      {snapshot.stale ? <StaleBanner asOf={snapshot.asOf} /> : null}
      {snapshot.error && snapshot.quotesCovered > 0 ? (
        <StatePanel
          kind="info"
          title="Partial marks"
          description={snapshot.error}
          className="py-4"
        />
      ) : null}

      <div className="flex min-w-0 flex-col gap-3">
        {snapshot.ownerLocked ? null : (
          <div className="order-1 min-w-0">
            <PositionsMetricsStrip
              snapshot={displaySnapshot}
              onAccountValueChange={
                snapshot.canEdit &&
                snapshot.books.find((book) => book.id === snapshot.bookId)
                  ?.source !== "snaptrade"
                  ? handleAccountValue
                  : undefined
              }
              savingAccountValue={savingAccountValue}
            />
          </div>
        )}
        <div className="order-1 min-w-0">
          <BookRiskPanel />
        </div>
        {snapshot.ownerLocked ? null : (
          <div className="order-3 min-w-0 lg:order-2">
            <PositionsAttribution snapshot={displaySnapshot} />
          </div>
        )}

        <div className="order-2 min-w-0 space-y-3 lg:order-3">
          <Panel
            title={flatBook ? "Recent closes" : "Position blotter"}
            description={
              snapshot.ownerLocked
                ? "Open lots with live marks, day P&L, and open P&L. Account value, cash, and closed lots stay hidden until unlocked."
                : flatBook
                  ? `Flat · ${activeBookRow?.brokerageName || activeBookRow?.title || "book"} · 0 open`
                  : "Open lots with live marks. Brokerage lots stay in their linked book. Click a row for the lot blotter."
            }
            actions={
              <Badge tone="neutral">
                {flatBook ? `${closedRows.length} closed` : `${openRows.length} shown`}
              </Badge>
            }
            bodyClassName="p-0"
          >
            {snapshot.ownerLocked ? (
              <LockedOwnerPnlStrip snapshot={displaySnapshot} />
            ) : null}
            <div className="flex flex-wrap items-end gap-2 border-b border-[var(--ib-border-subtle)] px-3 py-2.5">
              <div className="min-w-[160px] flex-1">
                <label htmlFor="pos-filter" className="sr-only">
                  Filter positions
                </label>
                <input
                  id="pos-filter"
                  className="field-control"
                  placeholder="Filter ticker, strategy, notes"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="pos-side" className="sr-only">
                  Side
                </label>
                <select
                  id="pos-side"
                  className="field-control w-auto"
                  value={side}
                  onChange={(event) =>
                    setSide(event.target.value as SideFilter)
                  }
                >
                  <option value="all">All sides</option>
                  <option value="long">Long</option>
                  <option value="short">Short</option>
                </select>
              </div>
            </div>

            {feedback ? (
              <div
                role={feedback.tone === "error" ? "alert" : "status"}
                className={
                  feedback.tone === "error"
                    ? "mx-3 mt-3 rounded-[4px] border border-[color-mix(in_oklab,var(--market-negative)_38%,transparent)] bg-[color-mix(in_oklab,var(--market-negative)_8%,transparent)] p-2.5 text-xs text-[var(--market-negative)]"
                    : "mx-3 mt-3 rounded-[4px] border border-[var(--ib-border-strong)] bg-[var(--ib-surface-2)] p-2.5 text-xs text-[var(--ib-text-secondary)]"
                }
              >
                {feedback.message}
              </div>
            ) : null}

            {emptyBook && !query.trim() && side === "all" ? (
              <div className="p-3">
                <StatePanel
                  kind="empty"
                  title={
                    snaptradeBook
                      ? "Waiting for holdings"
                      : "No positions on the book"
                  }
                  description={
                    snaptradeBook
                      ? "This brokerage account has no holdings yet. Sync again after positions appear at the broker."
                      : snapshot.canEdit
                      ? "Add a ticker by hand, or connect a brokerage to import holdings."
                      : `${activeOwner?.displayName ?? "This user"} has no positions on the book.`
                  }
                  actions={
                    snapshot.canEdit && !snaptradeBook ? (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setFormMode("add")}
                      >
                        Add position
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <PositionsTable
                key={snapshot.ownerLocked ? "tape" : flatBook ? "closed-primary" : "full"}
                rows={primaryRows}
                selectedId={selectedId}
                onSelect={setSelectedId}
                history={snapshot.history}
                canEdit={snapshot.canEdit}
                onEdit={() => setFormMode("edit")}
                onClosePosition={handleClose}
                closing={closing}
                privacy={snapshot.ownerLocked ? "tape" : "full"}
                variant={flatBook ? "closed" : "open"}
                groupFills={flatBook}
                emptyMessage={
                  flatBook
                    ? "No closed lots match the current filters."
                    : "No open lots match the current filters."
                }
              />
            )}
          </Panel>

          {snapshot.ownerLocked || flatBook ? null : (
            <>
          <Panel
            title="Past positions"
            description="Closed lots and realized return versus entry. Linked accounts refresh automatically while this page is open."
            actions={<Badge tone="neutral">{secondaryClosed.length} closed</Badge>}
            bodyClassName="p-0"
          >
            <PastPositionsMetrics snapshot={displaySnapshot} />
            <PositionsTable
              rows={secondaryClosed}
              selectedId={selectedId}
              onSelect={setSelectedId}
              history={snapshot.history}
              canEdit={snapshot.canEdit}
              onEdit={() => setFormMode("edit")}
              onClosePosition={handleClose}
              closing={closing}
              variant="closed"
              groupFills
              emptyMessage={
                snapshot.summary.closedCount === 0
                  ? snapshot.brokerage?.connections.length
                    ? "No closed lots yet. Linked accounts keep checking for fills; same-day history can lag the brokerage."
                    : "No closed lots on this book."
                  : "No closed lots match the current filters."
              }
            />
          </Panel>

          {sameDayRoundTrips && !showFillTape ? (
            <button
              type="button"
              className="text-left text-[12px] text-[var(--ib-text-muted)] underline-offset-2 hover:underline"
              onClick={() => setShowFillTape(true)}
            >
              Show fill tape
            </button>
          ) : (
          <Panel
            title="Entries & exits"
            description="Every open and close on this book, newest first."
            actions={<Badge tone="neutral">{activity.length} events</Badge>}
            bodyClassName="p-0"
          >
            <PositionActivity
              events={activity}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </Panel>
          )}
            </>
          )}
          {snapshot.ownerLocked || !flatBook ? null : (
            <>
            {sameDayRoundTrips && !showFillTape ? (
              <button
                type="button"
                className="text-left text-[12px] text-[var(--ib-text-muted)] underline-offset-2 hover:underline"
                onClick={() => setShowFillTape(true)}
              >
                Show fill tape
              </button>
            ) : (
              <Panel
                title="Entries & exits"
                description="Fill tape for this book."
                actions={<Badge tone="neutral">{activity.length} events</Badge>}
                bodyClassName="p-0"
              >
                <PositionActivity
                  events={activity}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              </Panel>
            )}
            </>
          )}
        </div>
      </div>
        </>
      )}

      {formMode ? (
        <PositionFormDialog
          mode={formMode}
          initial={formMode === "edit" ? selected : null}
          submitting={submitting}
          onClose={() => {
            setFormMode(null);
            setConfirmBrokerageAdd(false);
          }}
          onSubmit={formMode === "edit" ? handleEdit : handleCreate}
          brokerageWarning={formMode === "add" && (confirmBrokerageAdd || snaptradeBook)}
        />
      ) : null}
    </div>
    </PositionsPrivacyProvider>
  );
}
