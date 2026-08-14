"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  TABLE_PAGE_SIZES,
  pageWindow,
  type TablePageSize,
} from "@/components/positions/pagination";
import { Button } from "@/components/ui/Button";

export function TablePager({
  total,
  page,
  pageSize,
  pageSizeId,
  navLabel,
  pageSizeLabel,
  onPageChange,
  onPageSizeChange,
}: {
  total: number;
  page: number;
  pageSize: TablePageSize;
  pageSizeId: string;
  navLabel: string;
  pageSizeLabel: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: TablePageSize) => void;
}) {
  if (total <= 0) return null;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const rangeStart = (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--ib-border-subtle)] px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-mono text-[11px] text-[var(--ib-text-muted)]">
          {rangeStart}–{rangeEnd} of {total}
        </p>
        <label
          htmlFor={pageSizeId}
          className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ib-text-muted)]"
        >
          Per page
          <select
            id={pageSizeId}
            aria-label={pageSizeLabel}
            className="h-8 rounded-[4px] border border-[var(--ib-border-control)] bg-[var(--ib-surface-inset)] px-2 font-mono text-[12px] text-[var(--ib-text-primary)] outline-none focus:border-[var(--ib-text-muted)]"
            value={pageSize}
            onChange={(event) => {
              onPageSizeChange(Number(event.target.value) as TablePageSize);
              onPageChange(1);
            }}
          >
            {TABLE_PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>
      <nav className="flex flex-wrap items-center gap-1" aria-label={navLabel}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="px-2"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-3.5" aria-hidden="true" />
        </Button>
        {pageWindow(currentPage, pageCount).map((item, index) =>
          item === "ellipsis" ? (
            <span
              key={`gap-${index}`}
              className="px-1 font-mono text-[12px] text-[var(--ib-text-muted)]"
            >
              …
            </span>
          ) : (
            <Button
              key={item}
              type="button"
              variant={item === currentPage ? "secondary" : "ghost"}
              size="sm"
              className="min-w-8 px-2 font-mono"
              aria-current={item === currentPage ? "page" : undefined}
              aria-label={`Page ${item}`}
              onClick={() => onPageChange(item)}
            >
              {item}
            </Button>
          ),
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="px-2"
          disabled={currentPage >= pageCount}
          onClick={() => onPageChange(Math.min(pageCount, currentPage + 1))}
          aria-label="Next page"
        >
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </Button>
      </nav>
    </div>
  );
}
