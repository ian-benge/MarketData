import { ScannerWorkspace } from "@/components/scanner/ScannerWorkspace";
import { requirePermission } from "@/lib/auth/authorize";
import { Suspense } from "react";

export const metadata = {
  title: "Scanner Center",
};

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function ScannerPage({
  searchParams,
}: {
  searchParams: Promise<{
    system?: string;
    ticker?: string;
    preset?: string;
    q?: string;
    watchlist?: string;
    book?: string;
  }>;
}) {
  await requirePermission("viewDashboard");
  const params = await searchParams;
  return (
    <Suspense>
      <ScannerWorkspace
        initialSystem={params.system === "desk" ? "desk" : "momentum"}
        initialTicker={params.ticker?.toUpperCase() ?? ""}
        initialPreset={params.preset}
        initialQuery={params.q ?? ""}
        initialWatchlist={params.watchlist === "1"}
        initialBook={params.book === "1"}
      />
    </Suspense>
  );
}
