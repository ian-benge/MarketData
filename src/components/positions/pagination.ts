export const TABLE_PAGE_SIZES = [10, 20, 50, 100] as const;
export type TablePageSize = (typeof TABLE_PAGE_SIZES)[number];
export const DEFAULT_TABLE_PAGE_SIZE: TablePageSize = 10;

export const CLOSED_PAGE_SIZES = TABLE_PAGE_SIZES;
export type ClosedPageSize = TablePageSize;
export const DEFAULT_CLOSED_PAGE_SIZE = DEFAULT_TABLE_PAGE_SIZE;

export function paginate<T>(
  items: T[],
  page: number,
  pageSize: number,
): {
  pageCount: number;
  currentPage: number;
  rangeStart: number;
  rangeEnd: number;
  items: T[];
} {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize) || 1);
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const start = (currentPage - 1) * pageSize;
  return {
    pageCount,
    currentPage,
    rangeStart: items.length === 0 ? 0 : start + 1,
    rangeEnd: Math.min(start + pageSize, items.length),
    items: items.slice(start, start + pageSize),
  };
}

export function pageWindow(
  current: number,
  total: number,
): Array<number | "ellipsis"> {
  if (total < 1) return [];
  const safe = Math.min(Math.max(1, current), total);
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, total, safe]);
  for (let page = safe - 1; page <= safe + 1; page += 1) {
    if (page >= 1 && page <= total) pages.add(page);
  }
  if (safe <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }
  if (safe >= total - 2) {
    pages.add(total - 3);
    pages.add(total - 2);
    pages.add(total - 1);
  }

  const ordered = [...pages].sort((a, b) => a - b);
  const items: Array<number | "ellipsis"> = [];
  let previous = 0;
  for (const page of ordered) {
    if (previous > 0 && page - previous > 1) items.push("ellipsis");
    items.push(page);
    previous = page;
  }
  return items;
}
