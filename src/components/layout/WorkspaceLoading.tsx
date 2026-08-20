import { Skeleton } from "@/components/ui/Skeleton";

export function WorkspaceLoading({
  label = "Loading page",
  announce = true,
}: {
  label?: string;
  announce?: boolean;
}) {
  return (
    <div className="space-y-4" aria-busy="true">
      {announce ? (
        <p className="sr-only" role="status" aria-live="polite">
          {label}
        </p>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--ib-border-subtle)] pb-3.5">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-48" />
        </div>
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24 max-sm:hidden" />
      </div>
      <Skeleton className="h-64 w-full" />
      <div className="grid gap-3 lg:grid-cols-2">
        <Skeleton className="h-40" />
        <Skeleton className="h-40 max-lg:hidden" />
      </div>
    </div>
  );
}
