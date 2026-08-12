/**
 * Fail closed: mock providers must never construct in production.
 */
export function assertMockProvidersAllowed(providerName: string): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `${providerName} refused to start: mock providers are forbidden when NODE_ENV=production`,
    );
  }
}

export function mockNowIso(): string {
  return new Date().toISOString();
}

export const MOCK_COVERAGE_NOTE =
  "DEMO mock data — not live market data. For local development and tests only.";
