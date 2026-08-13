import type { PositionBook, PositionRecord } from "@/lib/positions/types";

const DEMO_FIRM_ID = "a0000000-0000-4000-8000-000000000001";
const NOW = "2026-08-13T15:12:00.000Z";

export const FIXTURE_BOOK_ADMIN_MAIN = "book-demo-admin-main";
export const FIXTURE_BOOK_MEMBER_MAIN = "book-demo-member-main";
export const FIXTURE_BOOK_MEMBER_IRA = "book-demo-member-ira";

export const fixtureBooks: PositionBook[] = [
  {
    id: FIXTURE_BOOK_ADMIN_MAIN,
    ownerId: "demo-admin",
    title: "Main",
    accountValue: 350_000,
    openCount: 0,
    positionCount: 0,
  },
  {
    id: FIXTURE_BOOK_MEMBER_MAIN,
    ownerId: "demo-member",
    title: "Main",
    accountValue: 175_000,
    openCount: 0,
    positionCount: 0,
  },
  {
    id: FIXTURE_BOOK_MEMBER_IRA,
    ownerId: "demo-member",
    title: "IRA",
    accountValue: 60_000,
    openCount: 0,
    positionCount: 0,
  },
];

function position(
  partial: Omit<
    PositionRecord,
    "firmId" | "currency" | "createdBy" | "createdAt" | "updatedAt" | "bookId"
  > &
    Partial<
      Pick<
        PositionRecord,
        "currency" | "createdAt" | "updatedAt" | "createdBy" | "bookId"
      >
    >,
): PositionRecord {
  const createdBy = partial.createdBy ?? "demo-admin";
  return {
    firmId: DEMO_FIRM_ID,
    currency: "USD",
    createdBy,
    bookId:
      partial.bookId ??
      (createdBy === "demo-member"
        ? FIXTURE_BOOK_MEMBER_MAIN
        : FIXTURE_BOOK_ADMIN_MAIN),
    createdAt: NOW,
    updatedAt: NOW,
    ...partial,
  };
}

export const fixturePositions: PositionRecord[] = [
  position({
    id: "pos-nvda-core",
    ticker: "NVDA",
    assetType: "equity",
    side: "long",
    quantity: 120,
    multiplier: 1,
    entryPrice: 118.4,
    entryDate: "2026-06-12",
    strategy: "AI core",
    notes: "Primary semiconductor exposure versus the AI infrastructure complex.",
    status: "open",
    closePrice: null,
    closeDate: null,
    closedAt: null,
  }),
  position({
    id: "pos-nvda-trim",
    ticker: "NVDA",
    assetType: "equity",
    side: "long",
    quantity: 40,
    multiplier: 1,
    entryPrice: 118.4,
    entryDate: "2026-06-12",
    strategy: "AI core",
    notes: "Trimmed the core sleeve into strength.",
    status: "closed",
    closePrice: 129.8,
    closeDate: "2026-07-30",
    closedAt: "2026-07-30T20:05:00.000Z",
    updatedAt: "2026-07-30T20:05:00.000Z",
  }),
  position({
    id: "pos-msft-core",
    ticker: "MSFT",
    assetType: "equity",
    side: "long",
    quantity: 35,
    multiplier: 1,
    entryPrice: 412.1,
    entryDate: "2026-05-20",
    strategy: "AI core",
    notes: "Platform compounder; sized below NVDA.",
    status: "open",
    closePrice: null,
    closeDate: null,
    closedAt: null,
  }),
  position({
    id: "pos-amd-core",
    ticker: "AMD",
    assetType: "equity",
    side: "long",
    quantity: 80,
    multiplier: 1,
    entryPrice: 148.2,
    entryDate: "2026-07-22",
    strategy: "AI core",
    notes: "Secondary semiconductor sleeve.",
    status: "open",
    closePrice: null,
    closeDate: null,
    closedAt: null,
  }),
  position({
    id: "pos-tlt-hedge",
    ticker: "TLT",
    assetType: "etf",
    side: "short",
    quantity: 180,
    multiplier: 1,
    entryPrice: 96.2,
    entryDate: "2026-07-08",
    strategy: "Rates hedge",
    notes: "Duration short against long-duration growth names.",
    status: "open",
    closePrice: null,
    closeDate: null,
    closedAt: null,
  }),
  position({
    id: "pos-qqq-closed",
    ticker: "QQQ",
    assetType: "etf",
    side: "long",
    quantity: 25,
    multiplier: 1,
    entryPrice: 470,
    entryDate: "2026-05-06",
    strategy: "Beta",
    notes: "Trimmed after the June-July run.",
    status: "closed",
    closePrice: 490.2,
    closeDate: "2026-08-05",
    closedAt: "2026-08-05T20:05:00.000Z",
    updatedAt: "2026-08-05T20:05:00.000Z",
  }),
  position({
    id: "pos-aapl-core",
    ticker: "AAPL",
    assetType: "equity",
    side: "long",
    quantity: 70,
    multiplier: 1,
    entryPrice: 238.5,
    entryDate: "2026-07-01",
    strategy: "Core equity",
    notes: null,
    status: "open",
    closePrice: null,
    closeDate: null,
    closedAt: null,
    createdBy: "demo-member",
  }),
  position({
    id: "pos-aapl-trim",
    ticker: "AAPL",
    assetType: "equity",
    side: "long",
    quantity: 20,
    multiplier: 1,
    entryPrice: 238.5,
    entryDate: "2026-07-01",
    strategy: "Core equity",
    notes: "Trimmed after the July fade.",
    status: "closed",
    closePrice: 232.4,
    closeDate: "2026-08-01",
    closedAt: "2026-08-01T20:05:00.000Z",
    updatedAt: "2026-08-01T20:05:00.000Z",
    createdBy: "demo-member",
  }),
  position({
    id: "pos-spy-beta",
    ticker: "SPY",
    assetType: "etf",
    side: "long",
    quantity: 40,
    multiplier: 1,
    entryPrice: 548,
    entryDate: "2026-04-15",
    strategy: "Beta",
    notes: "Index overlay.",
    status: "open",
    closePrice: null,
    closeDate: null,
    closedAt: null,
    createdBy: "demo-member",
  }),
  position({
    id: "pos-gld-macro",
    ticker: "GLD",
    assetType: "etf",
    side: "long",
    quantity: 55,
    multiplier: 1,
    entryPrice: 224.1,
    entryDate: "2026-06-03",
    strategy: "Macro",
    notes: "Real-asset hedge.",
    status: "open",
    closePrice: null,
    closeDate: null,
    closedAt: null,
    createdBy: "demo-member",
    bookId: FIXTURE_BOOK_MEMBER_IRA,
  }),
  position({
    id: "pos-iwm-factor",
    ticker: "IWM",
    assetType: "etf",
    side: "short",
    quantity: 90,
    multiplier: 1,
    entryPrice: 228.4,
    entryDate: "2026-07-28",
    strategy: "Factor",
    notes: "Small-cap factor short.",
    status: "open",
    closePrice: null,
    closeDate: null,
    closedAt: null,
    createdBy: "demo-member",
    bookId: FIXTURE_BOOK_MEMBER_IRA,
  }),
];

export function fixturePositionTickers(): string[] {
  return [
    ...new Set(
      fixturePositions
        .filter((row) => row.status === "open")
        .map((row) => row.ticker),
    ),
  ];
}

export function fixtureAccountValue(bookId: string): number | null {
  return fixtureBooks.find((book) => book.id === bookId)?.accountValue ?? null;
}
