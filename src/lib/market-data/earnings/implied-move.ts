import type { EarningsSession, YahooOptionContract } from "@/lib/market-data/earnings/types";

export function contractMid(contract: YahooOptionContract): number | null {
  if (
    contract.bid != null &&
    contract.ask != null &&
    contract.bid > 0 &&
    contract.ask > 0
  ) {
    return Math.round(((contract.bid + contract.ask) / 2) * 10000) / 10000;
  }
  if (contract.last != null && contract.last > 0) return contract.last;
  return null;
}

export function pickAtmStrike(spot: number, strikes: number[]): number | null {
  if (!Number.isFinite(spot) || spot <= 0 || !strikes.length) return null;
  return strikes.reduce((best, strike) =>
    Math.abs(strike - spot) < Math.abs(best - spot) ? strike : best,
  );
}

export function isoFromUnixSeconds(unix: number): string {
  return new Date(unix * 1000).toISOString().slice(0, 10);
}

/** First listed expiry that still covers the print. AMC uses the next session. */
export function pickEarningsExpiry(
  expirationUnix: number[],
  reportDate: string,
  session: EarningsSession,
): number | null {
  if (!expirationUnix.length) return null;
  const reportUtc = Date.parse(`${reportDate}T00:00:00.000Z`) / 1000;
  if (!Number.isFinite(reportUtc)) return null;
  const minimum =
    session === "amc" || session === "unknown" ? reportUtc + 86_400 : reportUtc;
  const sorted = [...expirationUnix].sort((a, b) => a - b);
  return (
    sorted.find((stamp) => stamp >= minimum) ??
    sorted.find((stamp) => stamp >= reportUtc) ??
    null
  );
}

export function atmStraddleMove(
  spot: number,
  calls: YahooOptionContract[],
  puts: YahooOptionContract[],
): {
  strike: number;
  callMid: number;
  putMid: number;
  straddle: number;
  percent: number;
  dollars: number;
} | null {
  const strikes = [
    ...new Set([
      ...calls.map((row) => row.strike),
      ...puts.map((row) => row.strike),
    ]),
  ];
  const strike = pickAtmStrike(spot, strikes);
  if (strike == null) return null;
  const call = calls.find((row) => row.strike === strike);
  const put = puts.find((row) => row.strike === strike);
  if (!call || !put) return null;
  const callMid = contractMid(call);
  const putMid = contractMid(put);
  if (callMid == null || putMid == null || spot <= 0) return null;
  const straddle = Math.round((callMid + putMid) * 10000) / 10000;
  return {
    strike,
    callMid,
    putMid,
    straddle,
    dollars: straddle,
    percent: Math.round((straddle / spot) * 1000) / 10,
  };
}
