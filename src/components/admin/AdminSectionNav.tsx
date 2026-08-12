"use client";

import Link from "next/link";
import { cn } from "@/lib/utils/cn";

export const ADMIN_SECTION_GROUPS = [
  {
    label: "Access",
    sections: [
      {
        key: "team",
        label: "Team access",
        description: "Members and invitations",
      },
    ],
  },
  {
    label: "Configuration",
    sections: [
      {
        key: "schedule",
        label: "Report schedule",
        description: "Edition timing and grace window",
      },
      {
        key: "sources",
        label: "Source registry",
        description: "Configured source capability",
      },
      {
        key: "market-data",
        label: "Market data",
        description: "Feed, licensing, and quota",
      },
      {
        key: "ai-routing",
        label: "AI routing",
        description: "Provider order and prompt version",
      },
    ],
  },
  {
    label: "Operations",
    sections: [
      {
        key: "jobs",
        label: "Report jobs",
        description: "Stages and latest updates",
      },
      {
        key: "deliveries",
        label: "Deliveries",
        description: "Attempts, recipients, and retries",
      },
      {
        key: "audit",
        label: "Audit history",
        description: "Administrative activity",
      },
    ],
  },
] as const;

export type AdminSectionKey =
  (typeof ADMIN_SECTION_GROUPS)[number]["sections"][number]["key"];

const ADMIN_SECTION_KEYS = ADMIN_SECTION_GROUPS.flatMap((group) =>
  group.sections.map((section) => section.key),
) as readonly AdminSectionKey[];

export function normalizeAdminSection(raw: string | null): AdminSectionKey {
  return ADMIN_SECTION_KEYS.includes(raw as AdminSectionKey)
    ? (raw as AdminSectionKey)
    : "team";
}

export function AdminSectionNav({
  active,
  onMobileChange,
}: {
  active: AdminSectionKey;
  onMobileChange: (section: AdminSectionKey) => void;
}) {
  return (
    <aside className="min-w-0 lg:sticky lg:top-4 lg:self-start">
      <div className="lg:hidden">
        <label
          htmlFor="admin-section"
          className="mb-1.5 block font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--ib-text-muted)]"
        >
          Data Operations section
        </label>
        <select
          id="admin-section"
          value={active}
          onChange={(event) =>
            onMobileChange(event.target.value as AdminSectionKey)
          }
          className="h-11 w-full rounded-[4px] border border-[var(--ib-border-control)] bg-[var(--ib-surface-1)] px-3 text-sm text-[var(--ib-text-primary)]"
        >
          {ADMIN_SECTION_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.sections.map((section) => (
                <option key={section.key} value={section.key}>
                  {section.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <nav
        aria-label="Admin sections"
        className="hidden max-h-[calc(100svh-7rem)] overflow-y-auto rounded-[6px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-1)] p-2 lg:block"
      >
        {ADMIN_SECTION_GROUPS.map((group, groupIndex) => (
          <div
            key={group.label}
            className={cn(
              groupIndex > 0 &&
                "mt-2 border-t border-[var(--ib-border-subtle)] pt-2",
            )}
          >
            <p className="px-2 pb-1.5 font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--ib-text-muted)]">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.sections.map((section) => {
                const selected = section.key === active;

                return (
                  <li key={section.key}>
                    <Link
                      href={`/admin?tab=${section.key}`}
                      aria-current={selected ? "page" : undefined}
                      className={cn(
                        "relative block rounded-[4px] border-l-2 px-2.5 py-2 transition-colors",
                        selected
                          ? "border-l-[var(--ib-maroon-300)] bg-[var(--ib-surface-selected)] text-[var(--ib-text-primary)]"
                          : "border-l-transparent text-[var(--ib-text-secondary)] hover:bg-[var(--ib-surface-hover)] hover:text-[var(--ib-text-primary)]",
                      )}
                    >
                      <span className="block text-[13px] font-medium">
                        {section.label}
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-4 text-[var(--ib-text-muted)]">
                        {section.description}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
