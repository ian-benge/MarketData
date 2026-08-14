"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { StaleBanner } from "@/components/ui/StaleBanner";
import { StatePanel } from "@/components/ui/StatePanel";
import { BrokerageConnect } from "@/components/positions/BrokerageConnect";
import { PositionFormDialog, type PositionFormValues } from "@/components/positions/PositionFormDialog";
import { PositionActivity } from "@/components/positions/PositionActivity";
import {
  PastPositionsMetrics,
  PositionsAttribution,
  PositionsMetricsStrip,
} from "@/components/positions/PositionsSummary";
import { PositionsOwnerTabs } from "@/components/positions/PositionsOwnerTabs";
import { OwnerUnlockPanel } from "@/components/positions/OwnerUnlockPanel";
import { PositionsBookTabs } from "@/components/positions/PositionsBookTabs";
import { PositionsTable } from "@/components/positions/PositionsTable";
import {
  applyAccountValueToSnapshot,
  toPositionRecord,
} from "@/lib/positions/assemble";
import { applyCloseToBook, PositionCloseError } from "@/lib/positions/close";
import { buildPositionActivity } from "@/lib/positions/math";
import type {
  PositionBook,
  PositionRecord,
  PositionsSnapshot,
} from "@/lib/positions/types";
import { formatMarketDateTime, formatQuantity } from "@/lib/utils/format";

const POLL_MS = 15_000;

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
  const [submitting, setSubmitting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "error" | "success";
    message: string;
  } | null>(null);

  const demo = snapshot.usingFixtures || snapshot.persistence === "fixtures";
  const activeOwner =
    snapshot.owners.find((owner) => owner.id === snapshot.ownerId) ?? null;
  const bookKey = snapshot.bookId || snapshot.ownerId;

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

  /** Metrics/weights always reflect the session account value, even if DB save fails. */
  const displaySnapshot = useMemo(
    () => applyAccountValueToSnapshot(snapshot, accountValueForBook),
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
    setSnapshot(resolved);
    if (resolved.ownerLocked) {
      setUnlockError(null);
      return;
    }
    rememberLots(resolved.bookId || next.ownerId, nextLots);
    rememberOwnerBooks(resolved.ownerId || ownerId, nextBooks);
    setLastBookByOwner((current) => ({
      ...current,
      [resolved.ownerId || ownerId]: resolved.bookId,
    }));
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
            ownerId: snapshot.ownerId,
            bookId: snapshot.bookId,
            books: snapshot.books,
            accountValue: accountValueForBook,
          }),
        });
        if (!response.ok || cancelled) return;
        const next = (await response.json()) as PositionsSnapshot;
        if (!cancelled) {
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
    if (demo || snapshot.persistence !== "supabase" || snapshot.ownerLocked) {
      return;
    }
    let cancelled = false;
    async function pull() {
      if (document.visibilityState === "hidden") return;
      try {
        const params = new URLSearchParams({
          includeClosed: "1",
          owner: snapshot.ownerId,
        });
        if (snapshot.bookId) params.set("book", snapshot.bookId);
        const response = await fetch(`/api/positions?${params}`, {
          cache: "no-store",
        });
        if (!response.ok || cancelled) return;
        const next = (await response.json()) as PositionsSnapshot;
        if (!cancelled) {
          setSnapshot(next);
          if (!next.ownerLocked) {
            rememberLots(next.bookId || next.ownerId, recordsFromSnapshot(next));
          }
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
    setBookBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/positions/books/${id}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as {
        snapshot?: PositionsSnapshot;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Unable to delete the book.");
      if (payload.snapshot) {
        setSnapshot(payload.snapshot);
        rememberLots(
          payload.snapshot.bookId,
          recordsFromSnapshot(payload.snapshot),
        );
        rememberOwnerBooks(payload.snapshot.ownerId, payload.snapshot.books);
        setSelectedId(null);
        return;
      }
      const books = snapshot.books.filter((row) => row.id !== id);
      const next = books[0];
      rememberOwnerBooks(snapshot.ownerId, books);
      if (next) {
        await loadNamedBook(snapshot.ownerId, next.id);
      }
      setSelectedId(null);
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
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to unlock that blotter.");
      }
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
    <div className="min-w-0 space-y-3">
      <PageHeader
        eyebrow="Portfolio monitor"
        title="Positions"
        description="Per-user blotters with live marks, exposure, and P&L. Add lots by hand or connect a brokerage."
        actions={
          snapshot.ownerLocked ? undefined : (
          <div className="flex flex-wrap items-center gap-2">
            <BrokerageConnect
              brokerage={snapshot.brokerage}
              canManage={snapshot.canEdit && snapshot.ownerId === snapshot.viewerId}
              busy={submitting || closing || bookBusy}
              usingFixtures={snapshot.usingFixtures}
              bookId={snapshot.bookId}
              onSnapshot={(next) => {
                const keepBookId =
                  snapshot.bookId &&
                  next.books.some((book) => book.id === snapshot.bookId)
                    ? snapshot.bookId
                    : next.bookId;
                rememberOwnerBooks(next.ownerId, next.books);
                setLastBookByOwner((current) => ({
                  ...current,
                  [next.ownerId]: keepBookId,
                }));
                if (keepBookId && keepBookId !== next.bookId) {
                  void loadNamedBook(next.ownerId, keepBookId);
                  return;
                }
                const resolved = { ...next, bookId: keepBookId };
                setSnapshot(resolved);
                rememberLots(
                  resolved.bookId || bookKey,
                  recordsFromSnapshot(resolved),
                );
                rememberAccountValue(
                  resolved.bookId || bookKey,
                  resolved.accountValue,
                );
              }}
              onFeedback={setFeedback}
            />
            {snapshot.canEdit ? (
              <Button variant="primary" size="sm" onClick={() => setFormMode("add")}>
                <Plus aria-hidden="true" className="size-3.5" />
                Add position
              </Button>
            ) : (
              <Badge tone="neutral">View only</Badge>
            )}
          </div>
          )
        }
      />

      {!snapshot.ownerLocked ? (
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--ib-text-muted)]">
        {snapshot.usingFixtures ? <Badge tone="mock">Mock data</Badge> : null}
        <span className="font-mono">
          {snapshot.latencyCoverageLabel} · as of{" "}
          {formatMarketDateTime(snapshot.asOf, { seconds: true })}
        </span>
        <span>
          {snapshot.quotesCovered}/{snapshot.quotesRequested} symbols marked
        </span>
        {activeOwner && !activeOwner.isViewer ? (
          <span>Viewing {activeOwner.displayName}</span>
        ) : null}
      </div>
      ) : null}

      {snapshot.owners.length > 0 ? (
        <div className="space-y-1.5">
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
          {!snapshot.ownerLocked &&
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

      {snapshot.ownerLocked ? (
        <OwnerUnlockPanel
          ownerId={snapshot.ownerId}
          ownerName={activeOwner?.displayName || "this teammate"}
          busy={unlocking}
          error={unlockError}
          onUnlock={handleUnlock}
        />
      ) : (
        <>
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

        <div className="order-3 min-w-0 lg:order-2">
          <PositionsAttribution snapshot={displaySnapshot} />
        </div>

        <div className="order-2 min-w-0 space-y-3 lg:order-3">
          <Panel
            title="Position blotter"
            description="Open lots with live marks. Brokerage lots stay in their linked book. Click a row for the lot blotter."
            actions={<Badge tone="neutral">{openRows.length} shown</Badge>}
            bodyClassName="p-0"
          >
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

            {displaySnapshot.summary.openCount === 0 && !query.trim() && side === "all" ? (
              <div className="p-3">
                <StatePanel
                  kind="empty"
                  title="No open positions on the book"
                  description={
                    snapshot.books.find((book) => book.id === snapshot.bookId)
                      ?.source === "snaptrade"
                      ? "This brokerage account has no holdings yet. Sync again after positions appear at the broker."
                      : snapshot.canEdit
                      ? "Add a ticker by hand, or connect a brokerage to import holdings."
                      : `${activeOwner?.displayName ?? "This user"} has no open positions on the book.`
                  }
                  actions={
                    snapshot.canEdit ? (
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
                rows={openRows}
                selectedId={selectedId}
                onSelect={setSelectedId}
                history={snapshot.history}
                canEdit={snapshot.canEdit}
                onEdit={() => setFormMode("edit")}
                onClosePosition={handleClose}
                closing={closing}
                emptyMessage="No open lots match the current filters."
              />
            )}
          </Panel>

          <Panel
            title="Past positions"
            description="Closed lots and realized return versus entry. Remaining sleeves of the same name stay in the blotter above."
            actions={<Badge tone="neutral">{closedRows.length} closed</Badge>}
            bodyClassName="p-0"
          >
            <PastPositionsMetrics snapshot={displaySnapshot} />
            <PositionsTable
              rows={closedRows}
              selectedId={selectedId}
              onSelect={setSelectedId}
              history={snapshot.history}
              canEdit={snapshot.canEdit}
              onEdit={() => setFormMode("edit")}
              onClosePosition={handleClose}
              closing={closing}
              variant="closed"
              emptyMessage={
                snapshot.summary.closedCount === 0
                  ? "No closed lots on this book."
                  : "No closed lots match the current filters."
              }
            />
          </Panel>

          <Panel
            title="Entries & exits"
            description="Every open and close on this book, newest first. Click a row to inspect the lot."
            actions={<Badge tone="neutral">{activity.length} events</Badge>}
            bodyClassName="p-0"
          >
            <PositionActivity
              events={activity}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </Panel>
        </div>
      </div>
        </>
      )}

      {formMode ? (
        <PositionFormDialog
          mode={formMode}
          initial={formMode === "edit" ? selected : null}
          submitting={submitting}
          onClose={() => setFormMode(null)}
          onSubmit={formMode === "edit" ? handleEdit : handleCreate}
        />
      ) : null}
    </div>
  );
}
