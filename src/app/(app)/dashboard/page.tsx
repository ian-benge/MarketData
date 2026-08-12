import { cookies } from "next/headers";
import { LiveMarketOverview } from "@/components/dashboard/LiveMarketOverview";
import { OnDemandReportButton } from "@/components/dashboard/OnDemandReportButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatePanel } from "@/components/ui/StatePanel";
import { fixturesEnabled } from "@/lib/api/http";
import {
  fixtureDashboard,
  type DashboardSnapshot,
} from "@/lib/fixtures/dashboard";
import { emptyWatchlistSnapshot } from "@/lib/market-data/watchlist-service";
import { MockMarketDataProvider } from "@/lib/providers/mock";
import type { NormalizedBar } from "@/lib/providers/types";

export const metadata = {
  title: "Market Overview",
};

type DashboardView = DashboardSnapshot & {
  unavailableReason?: string | null;
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

async function loadDashboard(): Promise<DashboardView> {
  if (fixturesEnabled()) {
    return {
      ...fixtureDashboard,
      latencyCoverageLabel: "Mock data",
      feedCoverage: "unknown",
      latencyClass: "mock",
      marketSession: "regular",
      licenseWarning:
        "License scope is single_user_development — shared production surfaces are not authorized.",
      breadthSupported: true,
      breadthExplanation: null,
      unavailableReason: null,
    };
  }

  try {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const cookieHeader = (await cookies())
      .getAll()
      .map(({ name, value }) => `${name}=${value}`)
      .join("; ");
    const response = await fetch(`${base}/api/dashboard`, {
      cache: "no-store",
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    });
    if (!response.ok) {
      return unavailableDashboard(
        `Market snapshot request failed (${response.status}). No fixture values were substituted.`,
      );
    }
    return (await response.json()) as DashboardSnapshot;
  } catch {
    return unavailableDashboard(
      "The market snapshot service is unreachable. No fixture values were substituted.",
    );
  }
}

async function loadFixtureChartSeries(
  symbols: string[],
  quoteByTicker: Map<string, DashboardSnapshot["tape"][number]>,
) {
  if (!fixturesEnabled()) return {} as Record<string, NormalizedBar[]>;
  const provider = new MockMarketDataProvider();
  const entries = await Promise.all(
    symbols.map(async (symbol) => {
      const bars = await provider.getTimeSeries({
        symbol,
        interval: "1d",
        limit: 90,
      });
      const lastBar = bars.at(-1);
      const quote = quoteByTicker.get(symbol);
      if (lastBar && quote?.last != null) {
        lastBar.close = quote.last;
        lastBar.high = Math.max(lastBar.high ?? quote.last, quote.last);
        lastBar.low = Math.min(lastBar.low ?? quote.last, quote.last);
        lastBar.value = quote.last;
      }
      return [symbol, bars] as const;
    }),
  );
  return Object.fromEntries(entries);
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
  searchParams: Promise<{ symbol?: string; generate?: string; state?: string }>;
}) {
  const [snapshot, params] = await Promise.all([loadDashboard(), searchParams]);
  const previewState = fixturesEnabled() ? demoViewState(params.state) : null;
  const data = applyDemoViewState(snapshot, previewState);
  const availableSymbols = new Set([
    ...data.tape.map((quote) => quote.ticker),
    ...data.movers.map((mover) => mover.ticker),
    ...(data.watchlist?.rows.map((row) => row.ticker) ?? []),
  ]);
  const selectedSymbol = normalizedSymbol(params.symbol, availableSymbols);
  const chartSymbols = [
    ...new Set([selectedSymbol, "SPY", "QQQ", "TLT", "NVDA", "AMD"]),
  ].filter((symbol) => availableSymbols.has(symbol));
  const quoteByTicker = new Map(
    data.tape.map((quote) => [quote.ticker, quote]),
  );
  const chartSeries =
    previewState === "empty"
      ? {}
      : await loadFixtureChartSeries(chartSymbols, quoteByTicker);
  const chartMode = fixturesEnabled()
    ? "mock"
    : data.latencyClass === "unavailable"
      ? "unavailable"
      : "provider";
  const chartInitialState =
    previewState === "loading"
      ? "loading"
      : previewState === "empty"
        ? "empty"
        : previewState === "rate-limit"
          ? "rate-limited"
          : previewState === "provider-error"
            ? "unavailable"
            : previewState === "stale"
              ? "stale"
              : previewState === "delayed"
                ? "delayed"
                : undefined;

  return (
    <div className="min-w-0 space-y-3">
      <PageHeader
        eyebrow="IB Market Data"
        title="Market Overview"
        description="U.S. market state with cross-asset and global macro read-throughs. Research only — no order entry or execution."
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
        selectedSymbol={selectedSymbol}
        chartSeries={chartSeries}
        chartMode={chartMode}
        chartInitialState={chartInitialState}
        live={chartMode === "provider" && !data.unavailableReason}
      />
    </div>
  );
}
