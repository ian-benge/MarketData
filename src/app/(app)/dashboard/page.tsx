import { LiveMarketOverview } from "@/components/dashboard/LiveMarketOverview";
import { OnDemandReportButton } from "@/components/dashboard/OnDemandReportButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatePanel } from "@/components/ui/StatePanel";
import { fixturesEnabled } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { AuthError } from "@/lib/auth/session";
import { loadDashboardSnapshot } from "@/lib/dashboard/snapshot";
import { loadDashboardBookImpact } from "@/lib/dashboard/book-impact-load";
import { attachMovesToBookImpact, type DashboardBookImpact } from "@/lib/dashboard/book-impact";
import {
  type DashboardSnapshot,
} from "@/lib/fixtures/dashboard";
import { emptyWatchlistSnapshot } from "@/lib/market-data/watchlist-service";

export const metadata = {
  title: "Market Overview",
};

type DashboardView = DashboardSnapshot & {
  unavailableReason?: string | null;
  bookImpact?: DashboardBookImpact;
};

type DemoViewState =
  | "fresh"
  | "loading"
  | "delayed"
  | "partial"
  | "stale"
  | "empty"
  | "rate-limit"
  | "provider-error";

const DEMO_VIEW_STATES = new Set<DemoViewState>([
  "fresh",
  "loading",
  "delayed",
  "partial",
  "stale",
  "empty",
  "rate-limit",
  "provider-error",
]);

function demoViewState(raw: string | undefined): DemoViewState | null {
  return raw && DEMO_VIEW_STATES.has(raw as DemoViewState)
    ? (raw as DemoViewState)
    : null;
}

function applyDemoViewState(
  data: DashboardView,
  state: DemoViewState | null,
): DashboardView {
  if (!state || state === "fresh") {
    return state === "fresh"
      ? { ...data, latencyCoverageLabel: "Mock data · fresh fixture" }
      : data;
  }

  if (state === "delayed") {
    return {
      ...data,
      latencyCoverageLabel: "15-minute delayed · mock fixture",
      latencyClass: "delayed",
    };
  }

  if (state === "loading") {
    return {
      ...data,
      latencyCoverageLabel: "Mock data · background refresh fixture",
    };
  }

  if (state === "partial") {
    return {
      ...data,
      tape: data.tape.slice(0, Math.max(data.tape.length - 2, 0)),
      providers: data.providers.map((provider) =>
        provider.id === "mock" ? { ...provider, health: "degraded" } : provider,
      ),
      latencyCoverageLabel: "Partial coverage · mock fixture",
      latencyClass: "delayed",
    };
  }

  if (state === "stale") {
    return {
      ...data,
      stale: true,
      latencyCoverageLabel: "Stale · mock fixture",
      latencyClass: "stale",
    };
  }

  if (state === "empty") {
    return {
      ...data,
      movers: [],
      watchlist: data.watchlist
        ? { ...data.watchlist, rows: [], error: "Empty-result fixture." }
        : data.watchlist,
      headlines: [],
      calendar: [],
      latestReport: null,
      latencyCoverageLabel: "Mock data · empty-result fixture",
    };
  }

  if (state === "rate-limit") {
    return {
      ...data,
      providers: data.providers.map((provider) =>
        provider.id === "mock" ? { ...provider, health: "degraded" } : provider,
      ),
      latencyCoverageLabel: "Rate limited · mock fixture",
      latencyClass: "delayed",
    };
  }

  return {
    ...data,
    stale: true,
    providers: data.providers.map((provider) =>
      provider.id === "mock"
        ? { ...provider, health: "down", lastSuccessAt: data.asOf }
        : provider,
    ),
    latencyCoverageLabel: "Unavailable · mock failure fixture",
    latencyClass: "unavailable",
  };
}

function unavailableDashboard(reason: string): DashboardView {
  const now = new Date().toISOString();
  return {
    asOf: now,
    dataCutoff: now,
    stale: true,
    tape: [],
    movers: [],
    watchlist: emptyWatchlistSnapshot(reason),
    coverage: {
      lists: [],
      selectedListId: null,
      exceptions: [],
      deskSectors: [],
      coverageSymbolSet: [],
      inBookTickers: [],
    },
    headlines: [],
    calendar: [],
    providers: [],
    latestReport: null,
    latencyCoverageLabel: "Unavailable",
    feedCoverage: "unknown",
    latencyClass: "unavailable",
    marketSession: null,
    licenseWarning: null,
    breadthSupported: false,
    breadthExplanation:
      "Market breadth and proxy coverage are unavailable with the current snapshot.",
    unavailableReason: reason,
  };
}

async function loadDashboard(
  listId?: string | null,
  sectorId?: string | null,
): Promise<DashboardView> {
  try {
    const user = await requirePermission("viewDashboard");
    const [snapshot, rawBook] = await Promise.all([
      loadDashboardSnapshot({
        user,
        listId,
        sectorId,
        live: false,
      }),
      loadDashboardBookImpact(user).catch(() => undefined),
    ]);
    return {
      ...snapshot,
      bookImpact: rawBook
        ? attachMovesToBookImpact(rawBook, snapshot.intelligence?.moves ?? [])
        : undefined,
      unavailableReason: null,
    };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    return unavailableDashboard(
      error instanceof Error
        ? `${error.message} No fixture values were substituted.`
        : "The market snapshot service is unreachable. No fixture values were substituted.",
    );
  }
}

function normalizedSymbol(raw: string | undefined, available: Set<string>) {
  const symbol = raw?.trim().toUpperCase();
  if (!symbol || !/^[A-Z0-9.-]{1,16}$/.test(symbol) || !available.has(symbol)) {
    return available.has("SPY") ? "SPY" : ([...available][0] ?? "SPY");
  }
  return symbol;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    symbol?: string;
    generate?: string;
    state?: string;
    listId?: string;
    sectorId?: string;
  }>;
}) {
  const params = await searchParams;
  const snapshot = await loadDashboard(params.listId, params.sectorId);
  const previewState = fixturesEnabled() ? demoViewState(params.state) : null;
  const data = applyDemoViewState(snapshot, previewState);
  const availableSymbols = new Set([
    ...data.tape.map((quote) => quote.ticker),
    ...data.movers.map((mover) => mover.ticker),
    ...(data.watchlist?.rows.map((row) => row.ticker) ?? []),
  ]);
  const selectedSymbol = normalizedSymbol(params.symbol, availableSymbols);

  return (
    <div className="min-w-0 space-y-3">
      <PageHeader
        compact
        title="Market Overview"
        description="Session, book, regime, coverage, and the next catalysts. Research only."
        actions={
          <OnDemandReportButton
            key={params.generate === "1" ? "auto-open" : "manual"}
            autoOpen={params.generate === "1"}
            demoMode={fixturesEnabled()}
          />
        }
      />

      {previewState ? (
        <StatePanel
          kind="info"
          title={`Deterministic ${previewState} preview`}
          description="Development-only fixture state for visual validation. All displayed values remain explicitly identified as mock data."
          className="py-4"
        />
      ) : null}

      {data.unavailableReason ? (
        <StatePanel
          kind="unavailable"
          title="Market snapshot unavailable"
          description={`${data.unavailableReason} Research, watchlists, and the archive remain available.`}
          className="py-5"
        />
      ) : null}

      <LiveMarketOverview
        initial={data}
        initialBookImpact={data.bookImpact}
        selectedSymbol={selectedSymbol}
        selectedListId={params.listId}
        selectedSectorId={params.sectorId}
        live={!fixturesEnabled() && !data.unavailableReason}
        pulseLoading={previewState === "loading"}
      />
    </div>
  );
}
