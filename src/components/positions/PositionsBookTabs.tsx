"use client";

import { useEffect, useRef, useState } from "react";
import { Landmark, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import { DEFAULT_BOOK_TITLE, moveBookInList } from "@/lib/positions/books";
import { tabListKeyDown } from "@/components/positions/tablist-keyboard";
import type { PositionBook } from "@/lib/positions/types";

export function PositionsBookTabs({
  books,
  bookId,
  canEdit,
  onSelect,
  onCreate,
  onLinkBrokerage,
  onManageBrokerage,
  canLinkBrokerage = false,
  hasLinkedBrokerage = false,
  onRename,
  onDelete,
  onReorder,
  busy = false,
}: {
  books: PositionBook[];
  bookId: string;
  canEdit: boolean;
  onSelect: (id: string) => void;
  onCreate: (title: string) => void;
  onLinkBrokerage?: () => void;
  onManageBrokerage?: () => void;
  canLinkBrokerage?: boolean;
  hasLinkedBrokerage?: boolean;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onReorder?: (bookIds: string[]) => void;
  busy?: boolean;
}) {
  const [creating, setCreating] = useState<"choose" | "manual" | false>(false);
  const [createTitle, setCreateTitle] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const skipClickRef = useRef(false);

  const selected = books.find((book) => book.id === bookId) ?? null;
  const brokerageSelected = selected?.source === "snaptrade";
  const deleteBlocked = !canEdit
    ? null
    : brokerageSelected
      ? "Disconnect the brokerage before deleting this book."
      : books.length <= 1
        ? "Keep at least one book."
        : null;

  useEffect(() => {
    setConfirmDelete(false);
  }, [bookId]);

  const canDragBooks = Boolean(canEdit && onReorder && !busy && books.length > 1);

  function commitCreate() {
    const title = createTitle.trim();
    if (!title) return;
    onCreate(title);
    setCreateTitle("");
    setCreating(false);
  }

  function cancelCreate() {
    setCreating(false);
    setCreateTitle("");
  }

  function commitRename() {
    if (!renamingId) return;
    const title = renameTitle.trim();
    if (!title) {
      setRenamingId(null);
      return;
    }
    onRename(renamingId, title);
    setRenamingId(null);
  }

  function finishDrag() {
    setDraggingId(null);
    setDragOverId(null);
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <div
        role="tablist"
        aria-label="Named books"
        className="flex min-w-0 gap-1 overflow-x-auto overscroll-x-contain terminal-scroll pb-0.5"
        onKeyDown={(event) =>
          tabListKeyDown(event, {
            ids: books.map((book) => book.id),
            selectedId: bookId,
            onSelect,
          })
        }
      >
        {books.map((book) => {
          const selectedBook = book.id === bookId;
          const draggable = canDragBooks && renamingId !== book.id;
          if (renamingId === book.id) {
            return (
              <input
                key={book.id}
                aria-label="Rename book"
                className="field-control h-8 w-[140px] shrink-0 font-mono text-[12px]"
                value={renameTitle}
                autoFocus
                disabled={busy}
                onChange={(event) => setRenameTitle(event.target.value)}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitRename();
                  }
                  if (event.key === "Escape") {
                    setRenamingId(null);
                  }
                }}
              />
            );
          }
          return (
            <button
              key={book.id}
              type="button"
              role="tab"
              id={`tab-book-${book.id}`}
              aria-selected={selectedBook}
              aria-controls={`positions-book-${book.id}`}
              tabIndex={selectedBook ? 0 : -1}
              aria-grabbed={draggable ? draggingId === book.id : undefined}
              title={draggable ? "Drag to reorder" : undefined}
              disabled={busy}
              draggable={draggable}
              onClick={() => {
                if (skipClickRef.current) {
                  skipClickRef.current = false;
                  return;
                }
                onSelect(book.id);
              }}
              onDoubleClick={() => {
                if (!canEdit) return;
                setRenamingId(book.id);
                setRenameTitle(book.title);
              }}
              onDragStart={(event) => {
                if (!draggable) {
                  event.preventDefault();
                  return;
                }
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", book.id);
                requestAnimationFrame(() => setDraggingId(book.id));
              }}
              onDragOver={(event) => {
                if (!draggable) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                if (dragOverId !== book.id) setDragOverId(book.id);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const fromId =
                  event.dataTransfer.getData("text/plain") || draggingId;
                finishDrag();
                if (!fromId || fromId === book.id || !onReorder) return;
                const next = moveBookInList(books, fromId, book.id);
                if (next === books) return;
                skipClickRef.current = true;
                onReorder(next.map((row) => row.id));
              }}
              onDragEnd={finishDrag}
              className={cn(
                "inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-[4px] border px-2 text-left text-[12px] transition-colors max-sm:min-h-11",
                draggable ? "cursor-grab active:cursor-grabbing" : null,
                draggingId === book.id ? "opacity-50" : null,
                dragOverId === book.id && draggingId && draggingId !== book.id
                  ? "border-[var(--ib-maroon-300)]"
                  :                 selectedBook
                    ? "border-[var(--ib-maroon-500)] bg-[var(--ib-surface-selected)] text-[var(--ib-text-primary)]"
                    : "border-transparent bg-transparent text-[var(--ib-text-secondary)] hover:border-[var(--ib-border-strong)] hover:bg-[var(--ib-surface-2)]",
              )}
            >
              <span className="font-medium">{book.title}</span>
              {book.source === "snaptrade" ? (
                <span className="font-mono text-[10px] text-[var(--ib-maroon-300)]">
                  {book.brokerageName || "brokerage"}
                </span>
              ) : book.title === DEFAULT_BOOK_TITLE ? (
                <span className="font-mono text-[10px] text-[var(--ib-text-muted)]">
                  default
                </span>
              ) : null}
              <span className="font-mono text-[10px] text-[var(--ib-text-muted)]">
                {book.openCount}
              </span>
              {book.connectionStatus === "reconnect_required" ? (
                <span className="font-mono text-[10px] text-[var(--state-warning)]">
                  reconnect
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {canEdit ? (
        creating === "manual" ? (
          <div className="flex items-center gap-1">
            <input
              id="new-book-title"
              aria-label="New book title"
              className="field-control h-8 w-[140px] font-mono text-[12px]"
              placeholder="e.g. IRA"
              value={createTitle}
              autoFocus
              disabled={busy}
              onChange={(event) => setCreateTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitCreate();
                }
                if (event.key === "Escape") {
                  cancelCreate();
                }
              }}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy || !createTitle.trim()}
              onMouseDown={(event) => event.preventDefault()}
              onClick={commitCreate}
            >
              Create book
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onMouseDown={(event) => event.preventDefault()}
              onClick={cancelCreate}
            >
              Cancel
            </Button>
          </div>
        ) : creating === "choose" ? (
          <div className="flex flex-wrap items-center gap-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => setCreating("manual")}
            >
              Manual book
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy || !canLinkBrokerage || !onLinkBrokerage}
              title={
                canLinkBrokerage
                  ? "Create a book from a SnapTrade login"
                  : "Brokerage sync needs SnapTrade keys"
              }
              onClick={() => {
                cancelCreate();
                onLinkBrokerage?.();
              }}
            >
              <Landmark aria-hidden="true" className="size-3.5" />
              Linked brokerage
            </Button>
            {hasLinkedBrokerage && onManageBrokerage ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  cancelCreate();
                  onManageBrokerage();
                }}
              >
                Manage accounts
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={cancelCreate}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => setCreating("choose")}
          >
            <Plus aria-hidden="true" className="size-3.5" />
            New book
          </Button>
        )
      ) : null}

      {canEdit && selected && renamingId !== selected.id ? (
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              setConfirmDelete(false);
              setRenamingId(selected.id);
              setRenameTitle(selected.title);
            }}
          >
            Rename
          </Button>
          <Button
            type="button"
            variant={confirmDelete ? "danger" : "ghost"}
            size="sm"
            disabled={busy || Boolean(deleteBlocked)}
            title={deleteBlocked ?? undefined}
            aria-label={
              deleteBlocked
                ? deleteBlocked
                : confirmDelete
                  ? `Confirm delete ${selected.title}`
                  : `Delete ${selected.title}`
            }
            onClick={() => {
              if (deleteBlocked) return;
              const needsConfirm = selected.positionCount > 0;
              if (needsConfirm && !confirmDelete) {
                setConfirmDelete(true);
                return;
              }
              setConfirmDelete(false);
              onDelete(selected.id);
            }}
          >
            {confirmDelete
              ? selected.positionCount === 1
                ? "Confirm delete (1 lot)"
                : `Confirm delete (${selected.positionCount} lots)`
              : "Delete"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
