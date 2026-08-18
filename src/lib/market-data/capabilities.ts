import type {
  BarsRequest,
  CorporateActionsRequest,
  InstrumentRequest,
  MoversRequest,
  NormalizedBarBatch,
  NormalizedCorporateActionBatch,
  NormalizedInstrumentBatch,
  NormalizedMarketStatus,
  NormalizedMoverBatch,
  NormalizedQuoteBatch,
  NormalizedSnapshotBatch,
  QuoteRequest,
  SnapshotRequest,
} from "@/lib/market-data/schemas";

export interface QuoteProvider {
  getQuotes(request: QuoteRequest): Promise<NormalizedQuoteBatch>;
}

export interface BarProvider {
  getBars(request: BarsRequest): Promise<NormalizedBarBatch>;
}

export interface MarketSnapshotProvider {
  getSnapshots(request: SnapshotRequest): Promise<NormalizedSnapshotBatch>;
}

export interface MoverProvider {
  getMovers(request: MoversRequest): Promise<NormalizedMoverBatch>;
}

export interface ReferenceDataProvider {
  resolveInstruments(
    request: InstrumentRequest,
  ): Promise<NormalizedInstrumentBatch>;
  getCorporateActions(
    request: CorporateActionsRequest,
  ): Promise<NormalizedCorporateActionBatch>;
}

export interface MarketClockProvider {
  getMarketStatus(at: Date): Promise<NormalizedMarketStatus>;
}

export type MarketDataCapabilities = {
  quotes: boolean;
  bars: boolean;
  snapshots: boolean;
  movers: boolean;
  reference: boolean;
  corporateActions: boolean;
  marketClock: boolean;
  /** Full-market gainers/losers/most-active. Never implied by IEX snapshot sorting. */
  screener?: boolean;
  fundamentals?: boolean;
  halts?: boolean;
  options?: boolean;
};

export type CapabilityKeyedProvider = {
  id: string;
  capabilities: MarketDataCapabilities;
  quotes?: QuoteProvider;
  bars?: BarProvider;
  snapshots?: MarketSnapshotProvider;
  movers?: MoverProvider;
  reference?: ReferenceDataProvider;
  marketClock?: MarketClockProvider;
};

export function emptyCapabilities(): MarketDataCapabilities {
  return {
    quotes: false,
    bars: false,
    snapshots: false,
    movers: false,
    reference: false,
    corporateActions: false,
    marketClock: false,
  };
}
