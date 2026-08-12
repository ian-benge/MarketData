import { cn } from "@/lib/utils/cn";

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "ib-skeleton rounded-[3px] bg-[var(--ib-surface-2)]",
        className,
      )}
      {...props}
    />
  );
}
