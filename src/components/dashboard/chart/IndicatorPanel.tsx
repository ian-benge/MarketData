"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus, Trash2, Workflow } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  INDICATOR_CATALOG,
  INDICATOR_GROUPS,
  definitionFor,
  instanceLabel,
  type IndicatorInstance,
  type IndicatorKind,
  type IndicatorLineStyle,
  type IndicatorLineWidth,
} from "@/lib/charts/indicator-catalog";

const LINE_STYLES: Array<{ id: IndicatorLineStyle; label: string }> = [
  { id: "solid", label: "Solid" },
  { id: "dotted", label: "Dotted" },
  { id: "dashed", label: "Dashed" },
  { id: "largeDashed", label: "Long dash" },
  { id: "sparseDotted", label: "Sparse dot" },
];

const LINE_WIDTHS: IndicatorLineWidth[] = [1, 2, 3, 4];

const fieldClass =
  "min-h-8 rounded-[3px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-2)] px-1.5 font-mono text-[10px] text-[var(--ib-text-primary)] outline-none focus:border-[var(--ib-border-control)] max-sm:min-h-11";

export function IndicatorPanel({
  instances,
  onAdd,
  onChange,
  onRemove,
}: {
  instances: IndicatorInstance[];
  onAdd: (kind: IndicatorKind) => void;
  onChange: (
    instanceId: string,
    patch: Partial<IndicatorInstance>,
  ) => void;
  onRemove: (instanceId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const activeCount = instances.filter((item) => item.enabled).length;

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const grouped = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return INDICATOR_GROUPS.map((group) => ({
      group,
      items: INDICATOR_CATALOG.filter((item) => {
        if (item.group !== group) return false;
        if (!needle) return true;
        return (
          item.label.toLowerCase().includes(needle) ||
          item.shortLabel.toLowerCase().includes(needle)
        );
      }),
    })).filter((entry) => entry.items.length);
  }, [query]);

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="chart-indicator-tab"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "inline-flex min-h-8 items-center gap-1 rounded-[3px] border px-2 font-mono text-[10px] max-sm:min-h-11",
          open || activeCount
            ? "border-[var(--ib-border-control)] bg-[var(--ib-surface-3)] text-[var(--ib-text-primary)]"
            : "border-[var(--ib-border-subtle)] bg-transparent text-[var(--ib-text-muted)] hover:text-[var(--ib-text-primary)]",
        )}
      >
        <Workflow aria-hidden="true" className="size-3.5" />
        Indicators
        <span className="rounded-[2px] bg-[var(--ib-surface-2)] px-1 text-[var(--ib-text-secondary)]">
          {activeCount}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn("size-3 transition-transform", open && "rotate-180")}
        />
      </button>

      {open ? (
        <div
          id="chart-indicator-tab"
          role="tabpanel"
          aria-label="Indicator library and style"
          className="absolute left-0 top-[calc(100%+6px)] z-30 w-[min(720px,calc(100vw-2rem))] rounded-[6px] border border-[var(--ib-border-control)] bg-[var(--ib-surface-1)] shadow-[var(--shadow-float)]"
        >
          <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <div className="border-b border-[var(--ib-border-subtle)] p-3 md:border-b-0 md:border-r">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                Add study
              </p>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search indicators"
                placeholder="Search SMA, RSI, MACD…"
                className="mt-2 min-h-8 w-full rounded-[3px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-2)] px-2 font-mono text-[11px] text-[var(--ib-text-primary)] outline-none focus:border-[var(--ib-border-control)] max-sm:min-h-11"
              />
              <div className="mt-2 max-h-72 space-y-3 overflow-auto terminal-scroll pr-1">
                {grouped.map((entry) => (
                  <div key={entry.group}>
                    <p className="mb-1 font-mono text-[10px] text-[var(--ib-text-muted)]">
                      {entry.group}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {entry.items.map((item) => (
                        <button
                          key={item.kind}
                          type="button"
                          aria-label={`Add ${item.label}`}
                          onClick={() => onAdd(item.kind)}
                          className="inline-flex min-h-8 items-center gap-1 rounded-[3px] border border-[var(--ib-border-subtle)] px-2 font-mono text-[10px] text-[var(--ib-text-secondary)] hover:border-[var(--ib-text-muted)] hover:text-[var(--ib-text-primary)] max-sm:min-h-11"
                        >
                          <Plus aria-hidden="true" className="size-3" />
                          {item.shortLabel}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                Active · color, line, size
              </p>
              <div className="mt-2 max-h-72 space-y-2 overflow-auto terminal-scroll pr-1">
                {instances.length ? (
                  instances.map((instance) => {
                    const def = definitionFor(instance.kind);
                    return (
                      <div
                        key={instance.instanceId}
                        className="rounded-[4px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-2)] p-2"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={instance.enabled}
                            aria-label={`Show ${instanceLabel(instance)}`}
                            onChange={(event) =>
                              onChange(instance.instanceId, {
                                enabled: event.target.checked,
                              })
                            }
                          />
                          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--ib-text-primary)]">
                            {instanceLabel(instance)}
                          </span>
                          <input
                            type="color"
                            value={instance.color}
                            aria-label={`${instanceLabel(instance)} color`}
                            onChange={(event) =>
                              onChange(instance.instanceId, {
                                color: event.target.value,
                              })
                            }
                            className="h-7 w-8 cursor-pointer rounded-[3px] border border-[var(--ib-border-subtle)] bg-transparent p-0"
                          />
                          <button
                            type="button"
                            aria-label={`Remove ${instanceLabel(instance)}`}
                            onClick={() => onRemove(instance.instanceId)}
                            className="grid size-8 place-items-center rounded-[3px] text-[var(--ib-text-muted)] hover:text-[var(--ib-text-primary)]"
                          >
                            <Trash2 aria-hidden="true" className="size-3.5" />
                          </button>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <label className="flex items-center gap-1 font-mono text-[10px] text-[var(--ib-text-muted)]">
                            Line
                            <select
                              value={instance.lineStyle}
                              aria-label={`${instanceLabel(instance)} line type`}
                              onChange={(event) =>
                                onChange(instance.instanceId, {
                                  lineStyle: event.target
                                    .value as IndicatorLineStyle,
                                })
                              }
                              className={fieldClass}
                            >
                              {LINE_STYLES.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex items-center gap-1 font-mono text-[10px] text-[var(--ib-text-muted)]">
                            Size
                            <select
                              value={instance.lineWidth}
                              aria-label={`${instanceLabel(instance)} line size`}
                              onChange={(event) =>
                                onChange(instance.instanceId, {
                                  lineWidth: Number(
                                    event.target.value,
                                  ) as IndicatorLineWidth,
                                })
                              }
                              className={fieldClass}
                            >
                              {LINE_WIDTHS.map((width) => (
                                <option key={width} value={width}>
                                  {width}px
                                </option>
                              ))}
                            </select>
                          </label>
                          {def.fields.map((field) => (
                            <label
                              key={field.key}
                              className="flex items-center gap-1 font-mono text-[10px] text-[var(--ib-text-muted)]"
                            >
                              {field.label}
                              <input
                                type="number"
                                min={field.min}
                                max={field.max}
                                step={field.step}
                                value={instance[field.key]}
                                aria-label={`${instanceLabel(instance)} ${field.label}`}
                                onChange={(event) =>
                                  onChange(instance.instanceId, {
                                    [field.key]: Number(event.target.value),
                                  })
                                }
                                className={cn(fieldClass, "w-16")}
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="py-6 text-center text-[12px] text-[var(--ib-text-muted)]">
                    Add a study from the library. Each one can have its own
                    color, line type, and thickness.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
