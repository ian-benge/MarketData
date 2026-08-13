/**
 * Production-safe stubs for optional provider slots.
 * Unlike mocks, these never fabricate market/research data and never write demos.
 * Operations either return empty results or a clear "not configured" failure.
 */

import type {
  AiProvider,
  CorporateEventsProvider,
  EmailProvider,
  MacroDataProvider,
  MarketDataProvider,
  NewsProvider,
} from "@/lib/providers/interfaces";
import type {
  AiResult,
  AiStructuredRequest,
  BreadthRequest,
  DateRange,
  DeliveryResult,
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
  TimeSeriesRequest,
  TransactionalEmailRequest,
} from "@/lib/providers/types";

function notConfigured(slot: string): Error {
  return new Error(
    `${slot} provider is not configured (missing credentials).`,
  );
}

export class UnconfiguredMarketDataProvider implements MarketDataProvider {
  async getQuotes(_symbols: string[]): Promise<NormalizedQuote[]> {
    return [];
  }
  async getTimeSeries(_request: TimeSeriesRequest): Promise<NormalizedBar[]> {
    return [];
  }
  async getMarketBreadth(
    _request: BreadthRequest,
  ): Promise<NormalizedBreadth | null> {
    return null;
  }
  async getTopMovers(_request: MoversRequest): Promise<NormalizedMover[]> {
    return [];
  }
}

export class UnconfiguredNewsProvider implements NewsProvider {
  async search(_request: NewsSearchRequest): Promise<NormalizedNewsItem[]> {
    return [];
  }
}

export class UnconfiguredMacroDataProvider implements MacroDataProvider {
  async getSeries(
    _requests: MacroSeriesRequest[],
  ): Promise<NormalizedMacroPoint[]> {
    return [];
  }
  async getEconomicCalendar(
    _range: DateRange,
  ): Promise<NormalizedCalendarEvent[]> {
    return [];
  }
}

export class UnconfiguredCorporateEventsProvider
  implements CorporateEventsProvider
{
  async getEarnings(
    _range: DateRange,
  ): Promise<NormalizedEarningsEvent[]> {
    return [];
  }
  async getFilings(_range: DateRange): Promise<NormalizedFiling[]> {
    return [];
  }
}

export class UnconfiguredAiProvider implements AiProvider {
  async generateStructured<T>(
    _request: AiStructuredRequest<T>,
  ): Promise<AiResult<T>> {
    throw notConfigured("ai");
  }
}

function unconfiguredDelivery(
  recipientCount: number,
  emails: string[],
): DeliveryResult {
  return {
    ok: false,
    providerName: "email-unconfigured",
    messageIds: [],
    attempted: recipientCount,
    succeeded: 0,
    failed: recipientCount,
    errors: emails.map((email) => ({
      recipient: email,
      message: "Email provider is not configured (RESEND_API_KEY missing).",
    })),
  };
}

export class UnconfiguredEmailProvider implements EmailProvider {
  async sendReport(request: ReportEmailRequest): Promise<DeliveryResult> {
    return unconfiguredDelivery(
      request.recipients.length,
      request.recipients.map((recipient) => recipient.email),
    );
  }

  async sendTransactional(
    request: TransactionalEmailRequest,
  ): Promise<DeliveryResult> {
    return unconfiguredDelivery(
      request.recipients.length,
      request.recipients.map((recipient) => recipient.email),
    );
  }
}
