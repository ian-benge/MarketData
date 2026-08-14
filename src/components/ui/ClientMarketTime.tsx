"use client";

import { useEffect, useState } from "react";
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
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    setLabel(formatMarketDateTime(value, { seconds }));
  }, [seconds, value]);
  return (
    <time dateTime={value ?? undefined} className={className} suppressHydrationWarning>
      {label ?? "—"}
    </time>
  );
}
