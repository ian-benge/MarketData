import { NewsWorkspace } from "@/components/news/NewsWorkspace";
import { requirePermission } from "@/lib/auth/authorize";

export const metadata = {
  title: "Material News",
};

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    ticker?: string;
    query?: string;
    type?: string;
    theme?: string;
    material?: string;
    window?: string;
  }>;
}) {
  await requirePermission("viewDashboard");
  const params = await searchParams;
  return (
    <NewsWorkspace
      initialQuery={params.q ?? params.query ?? ""}
      initialTicker={params.ticker?.toUpperCase() ?? ""}
      initialEventType={params.type}
      initialTheme={params.theme}
      initialMaterial={params.material === "1"}
      initialWindow={params.window}
    />
  );
}
