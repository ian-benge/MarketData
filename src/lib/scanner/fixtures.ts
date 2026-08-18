import { buildFeatureSnapshot } from "./features";
import { evaluateScan } from "./evaluate";
import { inferSessionPreset, readScannerClock } from "./session";
import type { MinuteBar, ScannerCenterSnapshot, ScannerFeatureSnapshot } from "./types";
import type { FeatureBuildInput } from "./features";

const AS_OF = "2026-08-17T14:42:00.000Z";

function minuteBars(endIso: string, closes: number[], volumes: number[]): MinuteBar[] {
  const end = Date.parse(endIso);
  return closes.map((close, index) => {
    const start = new Date(end - (closes.length - 1 - index) * 60_000).toISOString();
    const prev = closes[index - 1] ?? close;
    return {
      start,
      open: prev,
      high: Math.max(prev, close) * 1.002,
      low: Math.min(prev, close) * 0.998,
      close,
      volume: volumes[index] ?? 50_000,
    };
  });
}

function base(partial: Partial<FeatureBuildInput> & Pick<FeatureBuildInput, "ticker" | "last">): ScannerFeatureSnapshot {
  return buildFeatureSnapshot({
    asOf: AS_OF,
    session: "regular",
    sessionDate: "2026-08-17",
    sessionElapsed: 0.55,
    providerName: "mock",
    feedCoverage: "delayed_15m",
    latencyClass: "mock",
    priorClose: partial.last,
    ...partial,
  });
}

export function fixtureScannerFeatures(nowIso = AS_OF): ScannerFeatureSnapshot[] {
  const asOf = nowIso;
  return [
    base({
      ticker: "ABCD",
      name: "Alpha Bio",
      last: 8.42,
      open: 6.9,
      high: 8.45,
      priorClose: 6.55,
      volume: 18_400_000,
      avgVolume20d: 2_100_000,
      floatShares: 12_400_000,
      marketCap: 180_000_000,
      bid: 8.4,
      ask: 8.44,
      minuteBars: minuteBars(asOf, [7.2, 7.4, 7.7, 7.95, 8.1, 8.28, 8.35, 8.42], [400_000, 500_000, 700_000, 900_000, 800_000, 1_100_000, 900_000, 1_200_000]),
      inWatchlist: false,
      attributionKind: "confirmed_company",
      attributionHeadline: "ABCD reports FDA clearance for lead asset",
      attributionDetail: "Primary-source 8-K and company press release in the last 90 minutes.",
      latestHeadlineAt: "2026-08-17T13:10:00.000Z",
      evidence: [
        {
          id: "n1",
          title: "ABCD reports FDA clearance",
          url: "https://example.com/abcd-fda",
          publisher: "Company IR",
          publishedAt: "2026-08-17T13:10:00.000Z",
          eventType: "regulatory",
        },
      ],
      formerRunner: true,
    }),
    base({
      ticker: "SMCI",
      name: "Super Micro",
      last: 46.2,
      open: 44.1,
      high: 46.25,
      priorClose: 43.8,
      volume: 22_000_000,
      avgVolume20d: 9_400_000,
      floatShares: 48_000_000,
      marketCap: 27_000_000_000,
      minuteBars: minuteBars(asOf, [44.2, 44.6, 45.0, 45.4, 45.7, 45.9, 46.05, 46.2], Array(8).fill(400_000)),
      inWatchlist: true,
      watchlistNames: ["AI Infrastructure"],
      themes: ["datacenter", "semiconductors"],
      attributionKind: "likely_catalyst",
      attributionHeadline: "SMCI extends datacenter bid on supply commentary",
      latestHeadlineAt: "2026-08-17T12:40:00.000Z",
    }),
    base({
      ticker: "NVDA",
      name: "NVIDIA",
      last: 131.4,
      open: 128.9,
      high: 131.6,
      priorClose: 128.9,
      volume: 210_000_000,
      avgVolume20d: 180_000_000,
      marketCap: 3_200_000_000_000,
      floatShares: 24_000_000_000,
      week52High: 140.8,
      inWatchlist: true,
      watchlistNames: ["AI Infrastructure"],
      themes: ["semiconductors", "hyperscalers"],
      minuteBars: minuteBars(asOf, [129.2, 129.6, 130.0, 130.4, 130.7, 131.0, 131.2, 131.4], Array(8).fill(2_000_000)),
      attributionKind: "sympathy",
      attributionHeadline: "Semiconductor complex bid with NVDA leading the tape",
      latestHeadlineAt: "2026-08-16T21:00:00.000Z",
    }),
    base({
      ticker: "CEG",
      name: "Constellation Energy",
      last: 278.3,
      open: 272.4,
      high: 279.1,
      priorClose: 270.5,
      volume: 3_480_000,
      avgVolume20d: 1_900_000,
      marketCap: 87_000_000_000,
      inWatchlist: true,
      inPosition: true,
      themes: ["power"],
      watchlistNames: ["Power & Grid"],
      attributionKind: "likely_catalyst",
      attributionHeadline: "Nuclear/power complex higher with hyperscaler demand tape",
      latestHeadlineAt: "2026-08-17T11:05:00.000Z",
    }),
    base({
      ticker: "IREN",
      name: "IREN Limited",
      last: 18.4,
      open: 19.6,
      high: 19.8,
      priorClose: 19.9,
      volume: 28_000_000,
      avgVolume20d: 12_000_000,
      floatShares: 190_000_000,
      inWatchlist: true,
      watchlistNames: ["AI Infrastructure"],
      themes: ["datacenter", "power"],
      latestHeadlineAt: null,
      coverageNotes: "Watchlist name moving without a ticker-matched headline in the news window.",
    }),
    base({
      ticker: "XYZ",
      name: "Penny Runner Inc",
      last: 3.18,
      open: 2.41,
      high: 3.19,
      priorClose: 2.22,
      volume: 42_000_000,
      avgVolume20d: 4_200_000,
      floatShares: 8_600_000,
      marketCap: 48_000_000,
      bid: 3.16,
      ask: 3.2,
      minuteBars: minuteBars(asOf, [2.6, 2.72, 2.85, 2.94, 3.02, 3.08, 3.14, 3.18], [800_000, 900_000, 1_200_000, 1_400_000, 1_100_000, 1_600_000, 1_300_000, 1_800_000]),
      recentReverseSplit: true,
      reverseSplitDate: "2026-07-22",
      formerRunner: true,
      frequentHalt: true,
      attributionKind: "likely_catalyst",
      attributionHeadline: "XYZ gaps on contract rumor — not a primary filing",
      latestHeadlineAt: "2026-08-17T13:50:00.000Z",
    }),
    base({
      ticker: "HALT",
      name: "Halt Example",
      last: 12.1,
      open: 11.4,
      high: 14.2,
      priorClose: 11.2,
      volume: 9_400_000,
      avgVolume20d: 1_100_000,
      floatShares: 16_000_000,
      haltStatus: "halted",
      haltReason: "LULD pause — volatility",
      attributionKind: "confirmed_company",
      attributionHeadline: "HALT: LULD pause after news-driven spike",
      latestHeadlineAt: "2026-08-17T14:20:00.000Z",
    }),
    base({
      ticker: "NEWC",
      name: "Newco IPO",
      last: 22.4,
      open: 18.9,
      high: 22.6,
      priorClose: 17.8,
      volume: 14_200_000,
      avgVolume20d: 2_800_000,
      floatShares: 18_000_000,
      ipoAgeDays: 42,
      week52High: 22.5,
      minuteBars: minuteBars(asOf, [19.2, 19.8, 20.4, 20.9, 21.4, 21.8, 22.1, 22.4], Array(8).fill(600_000)),
      attributionKind: "confirmed_company",
      attributionHeadline: "NEWC prices follow-on; tape confirming the deal print",
      latestHeadlineAt: "2026-08-17T10:05:00.000Z",
      evidence: [
        {
          id: "n2",
          title: "NEWC announces follow-on offering",
          url: "https://example.com/newc-8k",
          publisher: "SEC EDGAR",
          publishedAt: "2026-08-17T10:05:00.000Z",
          eventType: "offering",
        },
      ],
    }),
    base({
      ticker: "COHR",
      name: "Coherent",
      last: 92.1,
      open: 88.4,
      high: 92.4,
      priorClose: 88.9,
      volume: 4_800_000,
      avgVolume20d: 2_100_000,
      marketCap: 14_200_000_000,
      inWatchlist: true,
      themes: ["photonics"],
      attributionKind: "sympathy",
      attributionHeadline: "Optical names bid with datacenter optics tape",
      latestHeadlineAt: "2026-08-17T12:15:00.000Z",
    }),
    base({
      ticker: "MSFT",
      name: "Microsoft",
      last: 428.1,
      open: 426.4,
      high: 429.0,
      priorClose: 425.9,
      volume: 18_400_000,
      avgVolume20d: 21_000_000,
      marketCap: 3_180_000_000_000,
      inWatchlist: true,
      inPosition: true,
      themes: ["hyperscalers", "ai_software"],
      week52High: 468,
    }),
  ];
}

export function fixtureScannerSnapshot(now = new Date(AS_OF)): ScannerCenterSnapshot {
  const clock = readScannerClock(now);
  const features = fixtureScannerFeatures(now.toISOString()).map((row) => ({
    ...row,
    asOf: now.toISOString(),
    session: clock.session === "closed" ? "regular" : clock.session,
    sessionDate: clock.sessionDate,
  }));
  const extra: ScannerFeatureSnapshot[] = [];
  for (let i = 0; i < 24; i += 1) {
    extra.push(
      base({
        ticker: `R${String(i).padStart(2, "0")}`,
        name: `Runner ${i}`,
        last: 4 + i * 0.15,
        priorClose: 3.2,
        open: 3.4,
        high: 4 + i * 0.16,
        volume: 5_000_000 + i * 100_000,
        avgVolume20d: 800_000,
        floatShares: 9_000_000,
        minuteBars: minuteBars(now.toISOString(), [3.5, 3.6, 3.8, 3.9, 4.0, 4.1, 4.2, 4 + i * 0.15], Array(8).fill(200_000)),
        formerRunner: i % 3 === 0,
      }),
    );
  }
  const all = [...features, ...extra];
  const evaluated = evaluateScan({
    features: all,
    now,
    sessionDate: clock.sessionDate,
    listLimit: 25,
    idFactory: (() => {
      let n = 0;
      return () => `fixture-alert-${++n}`;
    })(),
  });
  return {
    asOf: now.toISOString(),
    session: clock.session === "closed" ? "regular" : clock.session,
    sessionDate: clock.sessionDate,
    sessionPreset: clock.session === "closed" ? "midday" : inferSessionPreset(now),
    system: "momentum",
    lists: evaluated.lists,
    alerts: evaluated.alerts,
    selectedTicker: all[0]?.ticker ?? null,
    features: Object.fromEntries(all.map((row) => [row.ticker, row])),
    coverage: {
      freshness: "mock",
      providerName: "mock",
      feedCoverage: "delayed_15m",
      latencyClass: "mock",
      cadenceSeconds: 20,
      lastUpdate: now.toISOString(),
      nextUpdate: new Date(now.getTime() + 20_000).toISOString(),
      symbolsRequested: all.length,
      symbolsReceived: all.length,
      universeLimited: true,
      coverageNotes: [
        "Demo snapshot. Not live market data. Polling cadence is simulated.",
        "IEX/SIP entitlements do not apply in mock mode.",
      ],
      entitlements: {
        trades: false,
        quotes: true,
        float: true,
        news: true,
        halts: true,
        options: false,
        fullMarket: false,
      },
    },
    runId: "fixture-run",
    mocked: true,
  };
}
