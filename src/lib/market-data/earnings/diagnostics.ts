export function sanitizeEarningsError(message: string): string {
  return message
    .replaceAll(/apikey=[^&\s"]+/gi, "apikey=redacted")
    .replaceAll(/token=[^&\s"]+/gi, "token=redacted")
    .replaceAll(/[?&](key|api_key)=[^&\s"]+/gi, "")
    .slice(0, 240);
}

export function logEarningsDiagnostics(payload: Record<string, unknown>) {
  const safe = { ...payload };
  for (const key of Object.keys(safe)) {
    const lower = key.toLowerCase();
    if (
      lower.includes("key") ||
      lower.includes("token") ||
      lower.includes("secret") ||
      lower.includes("authorization") ||
      lower.includes("apikey")
    ) {
      delete safe[key];
    }
  }
  console.info(JSON.stringify({ scope: "earnings-calendar", ...safe }));
}
