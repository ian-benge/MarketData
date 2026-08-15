import type {
  CoverageItem,
  CoverageSector,
  CoverageWatchlist,
  NavGroup,
  SectorKind,
  WatchlistPurpose,
} from "@/lib/watchlists/types";

export type FixtureWatchlist = {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  symbols: string[];
  visibility?: "shared" | "personal";
  purpose?: WatchlistPurpose;
  navGroup?: NavGroup;
  ownerId?: string | null;
  archivedAt?: string | null;
  sortOrder?: number;
  tagsBySymbol?: Record<string, string[]>;
};

export type FixtureSector = {
  id: string;
  slug: string;
  name: string;
  symbols: string[];
  description?: string | null;
  kind?: SectorKind;
  navGroup?: NavGroup;
  parentId?: string | null;
  benchmarkSymbol?: string | null;
  screenKey?: CoverageSector["screenKey"];
  sortOrder?: number;
};

const DEMO_FIRM_ID = "a0000000-0000-4000-8000-000000000001";
const NOW = "2026-08-14T18:00:00.000Z";

function itemsFrom(
  symbols: string[],
  tagsBySymbol?: Record<string, string[]>,
): CoverageItem[] {
  return symbols.map((ticker, index) => ({
    ticker,
    name: null,
    notes: null,
    tags: tagsBySymbol?.[ticker] ?? [],
    sortOrder: (index + 1) * 10,
  }));
}

export const fixtureWatchlists: FixtureWatchlist[] = [
  {
    id: "wl-core",
    name: "Market Tape",
    description:
      "Cross-asset session tape: indices, rates, credit, dollar, commodities, vol, and bitcoin.",
    isDefault: true,
    visibility: "shared",
    purpose: "tape",
    navGroup: "market_tape",
    sortOrder: 10,
    symbols: [
      "SPY",
      "QQQ",
      "IWM",
      "DIA",
      "RSP",
      "TLT",
      "HYG",
      "UUP",
      "GLD",
      "USO",
      "VIXY",
      "IBIT",
    ],
    tagsBySymbol: {
      SPY: ["benchmark"],
      QQQ: ["benchmark"],
    },
  },
  {
    id: "wl-leaders",
    name: "Market Leaders",
    description: "Mega-cap leadership set kept separate from the tape.",
    isDefault: false,
    visibility: "shared",
    navGroup: "market_tape",
    sortOrder: 20,
    symbols: [
      "NVDA",
      "MSFT",
      "AAPL",
      "GOOGL",
      "AMZN",
      "META",
      "AVGO",
      "AMD",
      "TSM",
      "TSLA",
      "ORCL",
      "PLTR",
    ],
  },
  {
    id: "wl-research",
    name: "Research Queue",
    description: "Working names that need a thesis, not a trading stack.",
    isDefault: false,
    visibility: "shared",
    purpose: "research",
    navGroup: "tactical",
    sortOrder: 30,
    symbols: ["NVDA", "AMD", "AVGO", "TSM", "PLTR", "CEG", "EQIX", "IREN"],
  },
  {
    id: "wl-personal-desk",
    name: "My desk",
    description: "Personal working list — not visible to the rest of the firm",
    isDefault: false,
    visibility: "personal",
    purpose: "general",
    navGroup: "tactical",
    ownerId: "demo-member",
    sortOrder: 40,
    symbols: ["NVDA", "SMH", "CEG", "VST", "CRWD"],
  },
];

export const fixtureSectors: FixtureSector[] = [
  {
    id: "sec-semis",
    slug: "semiconductors",
    name: "Semiconductors",
    kind: "industry",
    navGroup: "ai_compute",
    benchmarkSymbol: "SMH",
    description: "Chip designers, foundries, and equipment for AI compute.",
    sortOrder: 10,
    symbols: ["NVDA", "AMD", "AVGO", "TSM", "INTC", "MU", "ASML", "AMAT", "LRCX", "KLAC"],
  },
  {
    id: "sec-photonics",
    slug: "photonics",
    name: "Photonics",
    kind: "theme",
    navGroup: "ai_compute",
    parentId: "sec-semis",
    benchmarkSymbol: "SMH",
    description: "Optical interconnects and laser / transceiver suppliers.",
    sortOrder: 20,
    symbols: ["COHR", "LITE", "AAOI", "CIEN", "FN"],
  },
  {
    id: "sec-hyperscalers",
    slug: "hyperscalers",
    name: "Hyperscalers",
    kind: "theme",
    navGroup: "ai_compute",
    description: "Cloud platforms driving AI training and inference spend.",
    sortOrder: 30,
    symbols: ["MSFT", "GOOGL", "AMZN", "META", "ORCL"],
  },
  {
    id: "sec-datacenters",
    slug: "data-centers",
    name: "Data Centers",
    kind: "theme",
    navGroup: "ai_compute",
    description: "REITs and infrastructure hosting AI capacity.",
    sortOrder: 40,
    symbols: ["DLR", "EQIX", "AMT", "CCI", "IRM"],
  },
  {
    id: "sec-power",
    slug: "power-grid-nuclear-gas",
    name: "Power Grid / Nuclear / Gas",
    kind: "theme",
    navGroup: "energy_materials",
    benchmarkSymbol: "XLU",
    description: "Generation and fuel enabling AI power demand.",
    sortOrder: 50,
    symbols: ["CEG", "VST", "NEE", "CTRA", "LNG", "SMR", "OKLO"],
  },
  {
    id: "sec-ai-software",
    slug: "ai-software",
    name: "AI Software",
    kind: "theme",
    navGroup: "ai_compute",
    description: "Platforms and apps monetizing AI workloads.",
    sortOrder: 60,
    symbols: ["PLTR", "SNOW", "DDOG", "NET", "CRWD", "MDB", "PATH", "NOW"],
  },
  {
    id: "sec-etfs",
    slug: "official-sector-tape",
    name: "Official U.S. Sector Tape",
    kind: "sector",
    navGroup: "official_sectors",
    benchmarkSymbol: "SPY",
    description: "The 11 GICS sector SPDRs plus SMH for liquid factor comparison.",
    sortOrder: 70,
    symbols: ["XLK", "XLF", "XLE", "XLV", "XLI", "XLY", "XLP", "XLU", "XLB", "XLRE", "XLC", "SMH"],
  },
  {
    id: "sec-rvol",
    slug: "relative-volume",
    name: "Relative Volume Leaders",
    kind: "screen",
    navGroup: "tactical",
    screenKey: "relative_volume",
    description: "Live screen of quoted names with relative volume ≥ 1.8×.",
    sortOrder: 80,
    symbols: [],
  },
];

export function fixtureWatchlistRecords(
  viewerId = "demo-member",
): CoverageWatchlist[] {
  return fixtureWatchlists
    .filter((list) => {
      const visibility = list.visibility ?? "shared";
      if (visibility === "shared") return true;
      return (list.ownerId ?? viewerId) === viewerId;
    })
    .map((list, index) => ({
      id: list.id,
      firmId: DEMO_FIRM_ID,
      name: list.name,
      description: list.description,
      isDefault: list.isDefault,
      visibility: list.visibility ?? "shared",
      purpose: list.purpose ?? "general",
      navGroup: list.navGroup ?? (list.purpose === "tape" ? "market_tape" : "tactical"),
      ownerId:
        (list.visibility ?? "shared") === "personal"
          ? (list.ownerId ?? viewerId)
          : null,
      archivedAt: list.archivedAt ?? null,
      sortOrder: list.sortOrder ?? (index + 1) * 10,
      createdBy: list.ownerId ?? "demo-admin",
      createdAt: NOW,
      updatedAt: NOW,
      symbols: list.symbols,
      items: itemsFrom(list.symbols, list.tagsBySymbol),
    }));
}

export function fixtureSectorRecords(): CoverageSector[] {
  return fixtureSectors.map((sector, index) => ({
    id: sector.id,
    firmId: DEMO_FIRM_ID,
    slug: sector.slug,
    name: sector.name,
    description: sector.description ?? null,
    kind: sector.kind ?? "sector",
    navGroup: sector.navGroup ?? "tactical",
    parentId: sector.parentId ?? null,
    benchmarkSymbol: sector.benchmarkSymbol ?? null,
    lastReviewedAt: NOW,
    reviewBy: null,
    expiresAt: null,
    sourceUrl: null,
    screenKey: sector.screenKey ?? null,
    isSystem: Boolean(sector.screenKey) || sector.kind === "sector",
    archivedAt: null,
    sortOrder: sector.sortOrder ?? (index + 1) * 10,
    createdAt: NOW,
    updatedAt: NOW,
    symbols: sector.symbols,
    items: itemsFrom(sector.symbols),
  }));
}
