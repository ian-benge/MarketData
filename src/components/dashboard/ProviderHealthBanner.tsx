import { Activity, ShieldAlert } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import {
  StatusIndicator,
  type StatusKind,
} from "@/components/ui/StatusIndicator";
import { formatMarketDateTime } from "@/lib/utils/format";

export type ProviderHealthRow = {
  id: string;
  name: string;
  category: string;
  health: string;
  lastSuccessAt: string | null;
};

function healthKind(health: string): StatusKind {
  if (health === "healthy") return "healthy";
  if (health === "degraded") return "degraded";
  if (health === "down") return "failed";
  if (health === "disabled") return "disabled";
  return "neutral";
}

export function ProviderHealthBanner({
  providers,
  latencyCoverageLabel,
  asOf,
  marketSession,
  licenseWarning,
}: {
  providers: ProviderHealthRow[];
  latencyCoverageLabel?: string | null;
  asOf?: string | null;
  marketSession?: string | null;
  licenseWarning?: string | null;
}) {
  const unhealthy = providers.filter(
    (provider) => provider.health === "degraded" || provider.health === "down",
  );

  return (
    <Panel
      title="Data provenance"
      description={
        unhealthy.length
          ? `${unhealthy.length} active source${unhealthy.length === 1 ? "" : "s"} need attention`
          : "Configured source status and last success"
      }
      bodyClassName="p-0"
      variant={unhealthy.length ? "critical" : "default"}
      actions={
        <Activity
          aria-hidden="true"
          className="size-4 text-[var(--ib-text-muted)]"
        />
      }
    >
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-b border-[var(--ib-border-subtle)] px-3 py-2 font-mono text-[10px]">
        <div>
          <dt className="text-[var(--ib-text-muted)]">Coverage</dt>
          <dd
            data-testid="provider-feed-label"
            className="mt-0.5 text-[var(--ib-text-secondary)]"
          >
            {latencyCoverageLabel ?? "Unavailable"}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--ib-text-muted)]">Session</dt>
          <dd className="mt-0.5 capitalize text-[var(--ib-text-secondary)]">
            {marketSession ?? "Unavailable"}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[var(--ib-text-muted)]">Snapshot</dt>
          <dd className="mt-0.5 text-[var(--ib-text-secondary)]">
            {formatMarketDateTime(asOf, { seconds: true })}
          </dd>
        </div>
      </dl>
      {licenseWarning ? (
        <div
          data-testid="license-warning"
          className="flex items-start gap-2 border-b border-[color-mix(in_oklab,var(--state-warning)_25%,var(--ib-border-subtle))] bg-[color-mix(in_oklab,var(--state-warning)_6%,transparent)] px-3 py-2 text-[10px] leading-4 text-[var(--state-warning)]"
        >
          <ShieldAlert
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0"
          />
          <span>{licenseWarning}</span>
        </div>
      ) : null}
      {providers.length ? (
        <ul className="divide-y divide-[var(--ib-border-subtle)]">
          {providers.map((provider) => (
            <li
              key={provider.id}
              className="flex items-center justify-between gap-3 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-[12px] font-medium text-[var(--ib-text-primary)]">
                  {provider.name}
                </p>
                <p className="mt-0.5 truncate font-mono text-[10px] text-[var(--ib-text-muted)]">
                  {provider.category.replaceAll("_", " ")}
                  {provider.lastSuccessAt
                    ? ` · ${formatMarketDateTime(provider.lastSuccessAt)}`
                    : " · no successful refresh"}
                </p>
              </div>
              <StatusIndicator
                kind={healthKind(provider.health)}
                label={provider.health}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-3 py-8 text-center text-[12px] text-[var(--ib-text-muted)]">
          Provider status is unavailable.
        </p>
      )}
    </Panel>
  );
}
