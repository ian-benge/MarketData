export type FixtureWatchlist = {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  symbols: string[];
};

export type FixtureSector = {
  id: string;
  slug: string;
  name: string;
  symbols: string[];
};

export const fixtureWatchlists: FixtureWatchlist[] = [
  {
    id: "wl-core",
    name: "Core",
    description: "Default cross-asset tape and mega-cap coverage",
    isDefault: true,
    symbols: ["SPY", "QQQ", "IWM", "TLT", "GLD", "USO", "NVDA", "MSFT", "AAPL"],
  },
  {
    id: "wl-ai",
    name: "AI stack",
    description: "Semiconductors, software, power, and data centers",
    isDefault: false,
    symbols: ["NVDA", "AMD", "AVGO", "TSM", "PLTR", "CEG", "EQIX"],
  },
];

export const fixtureSectors: FixtureSector[] = [
  {
    id: "sec-semis",
    slug: "semiconductors",
    name: "Semiconductors",
    symbols: ["NVDA", "AMD", "AVGO", "TSM", "INTC", "MU"],
  },
  {
    id: "sec-rates",
    slug: "rates",
    name: "Rates",
    symbols: ["TLT", "IEF", "SHY"],
  },
  {
    id: "sec-energy",
    slug: "energy",
    name: "Energy",
    symbols: ["USO", "XLE", "UNG"],
  },
];
