import { cn } from "@/lib/utils/cn";

export type Column<T> = {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  className?: string;
  headerClassName?: string;
  priority?: "always" | "medium" | "wide";
  width?: string;
  mono?: boolean;
  render: (row: T) => React.ReactNode;
};

export type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage?: React.ReactNode;
  dense?: boolean;
  className?: string;
  caption?: string;
  stickyHeader?: boolean;
  rowClassName?: (row: T) => string | undefined;
};

function priorityClass(priority: Column<unknown>["priority"]) {
  if (priority === "medium") return "hidden md:table-cell";
  if (priority === "wide") return "hidden xl:table-cell";
  return undefined;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyMessage = "No rows available",
  dense = true,
  className,
  caption,
  stickyHeader = true,
  rowClassName,
}: DataTableProps<T>) {
  return (
    <div
      className={cn(
        "w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain terminal-scroll",
        className,
      )}
      tabIndex={0}
      role="region"
      aria-label={caption ?? "Data table"}
    >
      <table className="w-full min-w-[620px] border-collapse text-left text-[13px] tabular-nums">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-[var(--ib-border-strong)] bg-[var(--ib-surface-2)] font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                style={col.width ? { width: col.width } : undefined}
                className={cn(
                  dense ? "h-8 px-2.5 font-medium" : "h-9 px-3 font-medium",
                  stickyHeader && "sticky top-0 z-10 bg-[var(--ib-surface-2)]",
                  col.align === "right" && "text-right",
                  col.align === "center" && "text-center",
                  priorityClass(col.priority),
                  col.headerClassName,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-10 text-center text-[13px] text-[var(--ib-text-muted)]"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={cn(
                  "border-b border-[var(--ib-border-subtle)] transition-colors last:border-b-0 hover:bg-[var(--ib-surface-hover)] focus-within:bg-[var(--ib-surface-hover)]",
                  rowClassName?.(row),
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      dense ? "h-[34px] px-2.5 py-1.5" : "h-10 px-3 py-2",
                      col.align === "right" && "text-right",
                      col.align === "center" && "text-center",
                      col.mono && "font-mono",
                      priorityClass(col.priority),
                      col.className,
                    )}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
