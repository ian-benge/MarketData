import { ExternalLink, Newspaper } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import type { NormalizedNewsItem } from "@/lib/providers/types";
import { formatMarketTime } from "@/lib/utils/format";

export function HeadlineFeed({
  headlines,
  onSelectSymbol,
}: {
  headlines: NormalizedNewsItem[];
  onSelectSymbol?: (ticker: string) => void;
}) {
  const clustered = [...headlines].sort((a, b) => {
    const left = a.tickers[0] ?? "";
    const right = b.tickers[0] ?? "";
    if (left !== right) return left.localeCompare(right);
    return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
  });
  return (
    <Panel
      title="Material news"
      description="Clustered by tagged ticker · click a ticker to open the chart"
      bodyClassName="p-0"
      actions={
        <Newspaper
          aria-hidden="true"
          className="size-4 text-[var(--ib-text-muted)]"
        />
      }
    >
      {clustered.length ? (
        <ol className="divide-y divide-[var(--ib-border-subtle)]">
          {clustered.map((headline) => (
            <li
              key={headline.id}
              className="grid gap-2 px-3 py-3 hover:bg-[var(--ib-surface-hover)] sm:grid-cols-[88px_minmax(0,1fr)]"
            >
              <div className="font-mono text-[10px] leading-4 text-[var(--ib-text-muted)]">
                <time
                  dateTime={headline.publishedAt}
                  className="block text-[var(--ib-text-secondary)]"
                >
                  {formatMarketTime(headline.publishedAt)}
                </time>
                <span className="mt-0.5 block capitalize">
                  {headline.sourceClass}
                </span>
                <span className="block">
                  {headline.publisher ?? headline.providerName}
                </span>
              </div>
              <div className="min-w-0">
                <a
                  href={headline.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-start gap-1.5 text-[13px] font-semibold leading-5 text-[var(--ib-text-primary)] hover:text-[var(--ib-maroon-300)]"
                >
                  <span>{headline.title}</span>
                  <ExternalLink
                    aria-hidden="true"
                    className="mt-1 size-3 shrink-0 text-[var(--ib-text-muted)] group-hover:text-[var(--ib-maroon-300)]"
                  />
                </a>
                {headline.summary ? (
                  <p className="mt-1 text-[12px] leading-5 text-[var(--ib-text-secondary)]">
                    {headline.summary}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {headline.sourceQuality === "mock" ? (
                    <Badge tone="mock">Mock source</Badge>
                  ) : null}
                  {headline.tickers.slice(0, 5).map((ticker) => (
                    <button
                      key={ticker}
                      type="button"
                      onClick={() => onSelectSymbol?.(ticker)}
                      className="rounded-[3px] focus-visible:outline focus-visible:outline-offset-2"
                      aria-label={`Open ${ticker} in primary chart`}
                    >
                      <Badge tone="neutral">{ticker}</Badge>
                    </button>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="px-3 py-10 text-center text-[13px] text-[var(--ib-text-muted)]">
          No material headlines are available for the configured sources.
        </p>
      )}
    </Panel>
  );
}
