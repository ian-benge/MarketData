import type { z } from "zod";
import type {
  AiResult,
  AiStructuredRequest,
  BreadthRequest,
  DateRange,
  DeliveryResult,
  EnqueueResult,
  MacroSeriesRequest,
  MoversRequest,
  NewsSearchRequest,
  NormalizedBar,
  NormalizedBreadth,
  NormalizedCalendarEvent,
  NormalizedEarningsEvent,
  NormalizedFiling,
  NormalizedMacroPoint,
  NormalizedMover,
  NormalizedNewsItem,
  NormalizedQuote,
  ReportEmailRequest,
  TransactionalEmailRequest,
  TimeSeriesRequest,
} from "./types";

export interface MarketDataProvider {
  getQuotes(symbols: string[]): Promise<NormalizedQuote[]>;
  getTimeSeries(request: TimeSeriesRequest): Promise<NormalizedBar[]>;
  getMarketBreadth(request: BreadthRequest): Promise<NormalizedBreadth | null>;
  getTopMovers(request: MoversRequest): Promise<NormalizedMover[]>;
}

export interface NewsProvider {
  search(request: NewsSearchRequest): Promise<NormalizedNewsItem[]>;
}

export interface MacroDataProvider {
  getSeries(requests: MacroSeriesRequest[]): Promise<NormalizedMacroPoint[]>;
  getEconomicCalendar(range: DateRange): Promise<NormalizedCalendarEvent[]>;
}

export interface CorporateEventsProvider {
  getEarnings(range: DateRange): Promise<NormalizedEarningsEvent[]>;
  getFilings(range: DateRange): Promise<NormalizedFiling[]>;
}

export interface AiProvider {
  generateStructured<T>(
    request: AiStructuredRequest<T>,
  ): Promise<AiResult<T>>;
}

export interface EmailProvider {
  sendReport(request: ReportEmailRequest): Promise<DeliveryResult>;
  sendTransactional(
    request: TransactionalEmailRequest,
  ): Promise<DeliveryResult>;
}

export interface SchedulerAdapter {
  enqueueDueReports(now: Date): Promise<EnqueueResult>;
}

/** Re-export zod type helper for adapter authors */
export type ZodSchema<T> = z.ZodType<T>;
