"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/providers/ThemeProvider";
import { Panel } from "@/components/ui/Panel";
import type { ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils/cn";

const OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  description: string;
  icon: typeof Moon;
}> = [
  {
    value: "dark",
    label: "Dark",
    description: "Terminal canvas — default IB Market Data look",
    icon: Moon,
  },
  {
    value: "light",
    label: "Light",
    description: "High-contrast light surfaces for bright rooms",
    icon: Sun,
  },
  {
    value: "system",
    label: "System",
    description: "Follow the OS appearance preference",
    icon: Monitor,
  },
];

export function ThemePreferenceControl() {
  const { preference, resolved, setPreference } = useTheme();

  return (
    <Panel
      title="Appearance"
      description="Theme applies across the authenticated workspace. Choice is stored in this browser."
      bodyClassName="space-y-3 p-3"
    >
      <div
        role="radiogroup"
        aria-label="Theme preference"
        className="grid gap-2 sm:grid-cols-3"
      >
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          const selected = preference === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setPreference(option.value)}
              className={cn(
                "flex min-h-[6.5rem] flex-col items-start gap-2 rounded-[4px] border px-3 py-3 text-left transition-colors",
                selected
                  ? "border-[var(--ib-border-control)] bg-[var(--ib-surface-selected)]"
                  : "border-[var(--ib-border-subtle)] bg-[var(--ib-surface-inset)] hover:border-[var(--ib-border-control)] hover:bg-[var(--ib-surface-hover)]",
              )}
            >
              <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                <Icon
                  aria-hidden="true"
                  className={cn(
                    "size-3.5",
                    selected
                      ? "text-[var(--ib-maroon-300)]"
                      : "text-[var(--ib-text-muted)]",
                  )}
                />
                {option.label}
              </span>
              <span className="text-[13px] font-medium text-[var(--ib-text-primary)]">
                {option.label} theme
              </span>
              <span className="text-[11px] leading-4 text-[var(--ib-text-secondary)]">
                {option.description}
              </span>
            </button>
          );
        })}
      </div>
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
        Active · {resolved}
        {preference === "system" ? " (from system)" : ""}
      </p>
    </Panel>
  );
}
