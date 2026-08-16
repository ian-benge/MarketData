"use client";

import { formatMarketDateTime } from "@/lib/utils/format";

export function ClientMarketTime({
  value,
  seconds = false,
  className,
}: {
  value: string | null | undefined;
  seconds?: boolean;
  className?: string;
}) {
  return (
    <time dateTime={value ?? undefined} className={className} suppressHydrationWarning>
      {formatMarketDateTime(value, { seconds })}
    </time>
  );
}
