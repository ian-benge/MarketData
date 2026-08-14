"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import { DEFAULT_BOOK_TITLE, moveBookInList } from "@/lib/positions/books";
import type { PositionBook } from "@/lib/positions/types";

export function PositionsBookTabs({
  books,
  bookId,
  canEdit,
  onSelect,
  onCreate,
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
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onReorder?: (bookIds: string[]) => void;
  busy?: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const skipClickRef = useRef(false);

  const selected = books.find((book) => book.id === bookId) ?? null;
  const canDelete =
    canEdit &&
    selected != null &&
    books.length > 1 &&
    selected.positionCount === 0;
  const canDragBooks = Boolean(canEdit && onReorder && !busy && books.length > 1);

  function commitCreate() {
    const title = createTitle.trim();
    if (!title) return;
    onCreate(title);
    setCreateTitle("");
    setCreating(false);
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
              aria-selected={selectedBook}
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
                  : selectedBook
                    ? "border-[var(--ib-border-strong)] bg-[var(--ib-surface-inset)] text-[var(--ib-text-primary)]"
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
            </button>
          );
        })}
      </div>

      {canEdit ? (
        creating ? (
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
                  setCreating(false);
                  setCreateTitle("");
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
              onClick={() => {
                setCreating(false);
                setCreateTitle("");
              }}
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
            onClick={() => setCreating(true)}
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
              setRenamingId(selected.id);
              setRenameTitle(selected.title);
            }}
          >
            Rename
          </Button>
          {canDelete ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => onDelete(selected.id)}
            >
              Delete
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
