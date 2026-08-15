"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ChevronRight } from "lucide-react";
import { CoverageHeatmap, SectorHeatmapBoard } from "@/components/watchlists/CoverageHeatmap";
import { CoverageSidebar } from "@/components/watchlists/CoverageSidebar";
import { CoverageSummary } from "@/components/watchlists/CoverageSummary";
import { CoverageTable } from "@/components/watchlists/CoverageTable";
import { SectorBoard } from "@/components/watchlists/SectorBoard";
import { SectorFormDialog } from "@/components/watchlists/SectorFormDialog";
import { TickerInspector } from "@/components/watchlists/TickerInspector";
import { WatchlistFormDialog } from "@/components/watchlists/WatchlistFormDialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ClientMarketTime } from "@/components/ui/ClientMarketTime";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { StaleBanner } from "@/components/ui/StaleBanner";
import { StatePanel } from "@/components/ui/StatePanel";
import { overlaySessionLists } from "@/lib/watchlists/assemble";
import {
  parseSymbols,
  validateSymbols,
} from "@/lib/watchlists/symbols";
import {
  KIND_LABELS,
  SECTOR_KINDS,
  defaultNavGroupForKind,
} from "@/lib/watchlists/taxonomy";
import type {
  CoverageColumnSet,
  CoverageGroupMode,
  CoverageItem,
  CoverageSector,
  CoverageSelection,
  CoverageSnapshot,
  CoverageWatchlist,
  SectorKind,
  WatchlistVisibility,
} from "@/lib/watchlists/types";

const POLL_MS = 15_000;

function withSymbols<T extends { symbols: string[]; items: CoverageItem[] }>(
  row: T,
  symbols: string[],
): T {
  const byTicker = new Map(row.items.map((item) => [item.ticker, item]));
  return {
    ...row,
    symbols,
    items: symbols.map((ticker, index) => ({
      ticker,
      name: byTicker.get(ticker)?.name ?? null,
      notes: byTicker.get(ticker)?.notes ?? null,
      tags: byTicker.get(ticker)?.tags ?? [],
      sortOrder: (index + 1) * 10,
    })),
  };
}

function kindLabel(kind: SectorKind) {
  return KIND_LABELS[kind];
}

function moveId(ids: string[], id: string, direction: -1 | 1) {
  const index = ids.indexOf(id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= ids.length) return ids;
  const copy = [...ids];
  const [item] = copy.splice(index, 1);
  copy.splice(next, 0, item!);
  return copy;
}

type Feedback = { tone: "error" | "success"; message: string } | null;

export function WatchlistsWorkspace({ initial }: { initial: CoverageSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [lists, setLists] = useState(initial.watchlists);
  const [sectors, setSectors] = useState(initial.sectors);
  const [selection, setSelection] = useState<CoverageSelection | null>(initial.selection);
  const [listFilter, setListFilter] = useState<"all" | "shared" | "personal">("all");
  const [showArchived, setShowArchived] = useState(false);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<"edit" | null>(null);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editingSectorId, setEditingSectorId] = useState<string | null>(null);
  const [sectorForm, setSectorForm] = useState<"create" | "edit" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createSymbols, setCreateSymbols] = useState("");
  const [createVisibility, setCreateVisibility] = useState<WatchlistVisibility>("shared");
  const [createBucket, setCreateBucket] = useState<"watchlist" | "sector">("watchlist");
  const [createKind, setCreateKind] = useState<SectorKind>("theme");
  const [columnSet, setColumnSet] = useState<CoverageColumnSet>("tape");
  const [groupMode, setGroupMode] = useState<CoverageGroupMode>("none");
  const [query, setQuery] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<"name" | "symbols", string>>>({});
  const createPanelRef = useRef<HTMLDetailsElement>(null);

  const demo = snapshot.usingFixtures || snapshot.persistence === "fixtures";

  const display = useMemo(
    () => overlaySessionLists(snapshot, lists, sectors, selection),
    [lists, sectors, selection, snapshot],
  );

  const selectedList =
    display.selection?.type === "watchlist"
      ? display.watchlists.find((list) => list.id === display.selection?.id) ?? null
      : null;
  const selectedSector =
    display.selection?.type === "sector"
      ? display.sectors.find((sector) => sector.id === display.selection?.id) ?? null
      : null;

  const creatingSector =
    display.canEditSectors &&
    (!display.canEditWatchlists || createBucket === "sector");
  const createActionLabel =
    !creatingSector
      ? "Create watchlist"
      : createKind === "theme"
        ? "Create theme"
        : `Create ${kindLabel(createKind).toLowerCase()}`;

  function openCreatePanel(bucket: "watchlist" | "sector") {
    setCreateBucket(bucket);
    if (bucket === "sector") setCreateKind("theme");
    const panel = createPanelRef.current;
    if (panel) panel.open = true;
    window.setTimeout(() => {
      panel?.scrollIntoView({ block: "start" });
      document.getElementById("watchlist-name")?.focus();
    }, 0);
  }

  const canMutate = selectedList
    ? display.canEditWatchlists &&
      (selectedList.visibility !== "personal" || selectedList.ownerId === display.viewerId)
    : Boolean(selectedSector && display.canEditSectors);

  function canManageList(list: CoverageWatchlist) {
    return (
      display.canEditWatchlists &&
      (list.visibility !== "personal" || list.ownerId === display.viewerId)
    );
  }

  const editingList =
    formMode === "edit" && editingListId
      ? lists.find((list) => list.id === editingListId) ?? null
      : null;
  const editingSector =
    sectorForm === "edit" && editingSectorId
      ? sectors.find((sector) => sector.id === editingSectorId) ?? selectedSector
      : selectedSector;

  useEffect(() => {
    if (demo || snapshot.persistence !== "supabase") return;
    let cancelled = false;
    let inFlight = false;
    async function pull() {
      if (inFlight) return;
      inFlight = true;
      const params = new URLSearchParams();
      if (selection?.type === "watchlist") params.set("listId", selection.id);
      if (selection?.type === "sector") params.set("sectorId", selection.id);
      if (showArchived) params.set("includeArchived", "1");
      try {
        const response = await fetch(`/api/watchlists?${params.toString()}`);
        if (!response.ok || cancelled) return;
        const next = (await response.json()) as CoverageSnapshot;
        if (cancelled) return;
        if (!Array.isArray(next.watchlists) || !Array.isArray(next.sectors)) return;
        setSnapshot(next);
        setLists(next.watchlists);
        setSectors(next.sectors);
      } catch {
        /* keep the last good snapshot */
      } finally {
        inFlight = false;
      }
    }
    void pull();
    const timer = window.setInterval(() => {
      void pull();
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [demo, snapshot.persistence, selection?.type, selection?.id, showArchived]);

  async function refreshSelection(nextSelection = selection) {
    const params = new URLSearchParams();
    if (nextSelection?.type === "watchlist") params.set("listId", nextSelection.id);
    if (nextSelection?.type === "sector") params.set("sectorId", nextSelection.id);
    if (showArchived) params.set("includeArchived", "1");
    const response = await fetch(`/api/watchlists?${params.toString()}`);
    if (!response.ok) return;
    const next = (await response.json()) as CoverageSnapshot;
    setSnapshot(next);
    if (!demo) {
      setLists(next.watchlists);
      setSectors(next.sectors);
    }
  }

  function applyCreatedList(list: CoverageWatchlist, message: string) {
    setLists((current) => [list, ...current.filter((row) => row.id !== list.id)]);
    setSelection({ type: "watchlist", id: list.id });
    setCreateName("");
    setCreateDescription("");
    setCreateSymbols("");
    setFieldErrors({});
    setFeedback({ tone: "success", message });
  }

  function applyCreatedSector(sector: CoverageSector, message: string) {
    setSectors((current) => [sector, ...current.filter((row) => row.id !== sector.id)]);
    setSelection({ type: "sector", id: sector.id });
    setCreateName("");
    setCreateDescription("");
    setCreateSymbols("");
    setFieldErrors({});
    setFeedback({ tone: "success", message });
  }

  async function createFromValues(values: {
    name: string;
    description: string;
    symbols: string;
    visibility: WatchlistVisibility;
    isDefault?: boolean;
  }) {
    const checked = validateSymbols(values.symbols);
    if (!values.name.trim()) {
      setFieldErrors({ name: "Enter a watchlist name." });
      return false;
    }
    if (lists.some(
      (list) =>
        !list.archivedAt &&
        list.visibility === values.visibility &&
        list.name.trim().toLowerCase() === values.name.trim().toLowerCase(),
    )) {
      setFieldErrors({
        name:
          values.visibility === "personal"
            ? "A personal watchlist with this name already exists."
            : "A shared watchlist with this name already exists.",
      });
      return false;
    }
    if (!checked.normalized.length) {
      setFieldErrors({ symbols: "Enter at least one ticker symbol." });
      return false;
    }
    if (checked.invalid.length) {
      setFieldErrors({
        symbols: `Use valid uppercase ticker symbols. Check: ${checked.invalid.join(", ")}.`,
      });
      return false;
    }
    if (checked.duplicates.length) {
      setFieldErrors({
        symbols: `Remove duplicate symbols: ${checked.duplicates.join(", ")}.`,
      });
      return false;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/watchlists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: values.name.trim(),
          description: values.description.trim() || undefined,
          symbols: checked.normalized,
          visibility: values.visibility,
          isDefault: values.isDefault,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        id?: string;
        name?: string;
        description?: string | null;
        symbols?: string[];
        isDefault?: boolean;
        demo?: boolean;
        watchlist?: CoverageWatchlist;
        snapshot?: CoverageSnapshot;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "The watchlist could not be saved.");
      }
      const saved = payload.watchlist ?? {
        id: payload.id ?? `wl-${Date.now()}`,
        firmId: snapshot.viewerId,
        name: payload.name ?? values.name.trim(),
        description: payload.description ?? (values.description.trim() || null),
        isDefault: payload.isDefault === true,
        visibility: values.visibility,
        purpose: "general",
        navGroup: "tactical",
        ownerId: values.visibility === "personal" ? snapshot.viewerId : null,
        archivedAt: null,
        sortOrder: 0,
        createdBy: snapshot.viewerId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        symbols: payload.symbols ?? checked.normalized,
        items: (payload.symbols ?? checked.normalized).map((ticker, index) => ({
          ticker,
          name: null,
          notes: null,
          tags: [],
          sortOrder: (index + 1) * 10,
        })),
      };
      applyCreatedList(
        saved,
        payload.demo
          ? `${values.visibility === "personal" ? "Personal" : "Shared"} watchlist accepted and added to this session. Demo fixture changes reset when the page reloads.`
          : values.visibility === "personal"
            ? "Personal watchlist saved to your coverage."
            : "Shared watchlist created and saved for the team.",
      );
      if (payload.snapshot) {
        setSnapshot(payload.snapshot);
        setLists(payload.snapshot.watchlists);
        setSectors(payload.snapshot.sectors);
      } else if (!payload.demo) {
        await refreshSelection({ type: "watchlist", id: saved.id });
      }
    return true;
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "The watchlist could not be saved.",
      });
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function handleInlineCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creatingSector) {
      await createSectorFromValues({
        name: createName,
        description: createDescription,
        symbols: createSymbols,
        kind: createKind,
      });
      return;
    }
    await createFromValues({
      name: createName,
      description: createDescription,
      symbols: createSymbols,
      visibility: createVisibility,
    });
  }

  async function createSectorFromValues(values: {
    name: string;
    description: string;
    symbols: string;
    kind: SectorKind;
  }) {
    const checked = validateSymbols(values.symbols);
    if (!values.name.trim()) {
      setFieldErrors({ name: "Enter a sector or theme name." });
      return false;
    }
    if (
      sectors.some(
        (sector) =>
          !sector.archivedAt &&
          sector.name.trim().toLowerCase() === values.name.trim().toLowerCase(),
      )
    ) {
      setFieldErrors({ name: "A sector or theme with this name already exists." });
      return false;
    }
    if (checked.invalid.length) {
      setFieldErrors({
        symbols: `Use valid uppercase ticker symbols. Check: ${checked.invalid.join(", ")}.`,
      });
      return false;
    }
    if (checked.duplicates.length) {
      setFieldErrors({
        symbols: `Remove duplicate symbols: ${checked.duplicates.join(", ")}.`,
      });
      return false;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/sectors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: values.name.trim(),
          description: values.description.trim() || undefined,
          kind: values.kind,
          symbols: checked.normalized,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        sector?: CoverageSector;
        snapshot?: CoverageSnapshot;
        demo?: boolean;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "The sector could not be saved.");
      }
      const saved = payload.sector ?? {
        id: `sec-${Date.now()}`,
        firmId: snapshot.viewerId,
        slug: values.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        name: values.name.trim(),
        description: values.description.trim() || null,
        kind: values.kind,
        parentId: null,
        navGroup: defaultNavGroupForKind(values.kind),
        benchmarkSymbol: null,
        lastReviewedAt: null,
        reviewBy: null,
        expiresAt: null,
        sourceUrl: null,
        screenKey: null,
        isSystem: false,
        archivedAt: null,
        sortOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        symbols: checked.normalized,
        items: checked.normalized.map((ticker, index) => ({
          ticker,
          name: null,
          notes: null,
          tags: [],
          sortOrder: (index + 1) * 10,
        })),
      };
      applyCreatedSector(
        saved,
        payload.demo
          ? `${kindLabel(values.kind)} accepted and added to this session. Demo fixture changes reset when the page reloads.`
          : `${kindLabel(values.kind)} saved and included in the rotation board below.`,
      );
      if (payload.snapshot) {
        setSnapshot(payload.snapshot);
        setLists(payload.snapshot.watchlists);
        setSectors(payload.snapshot.sectors);
      } else if (!payload.demo) {
        await refreshSelection({ type: "sector", id: saved.id });
      }
      return true;
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "The sector could not be saved.",
      });
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function patchList(list: CoverageWatchlist, body: Record<string, unknown>) {
    setSubmitting(true);
    try {
      const response = await fetch(`/api/watchlists/${list.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        snapshot?: CoverageSnapshot;
        error?: string;
        demo?: boolean;
      };
      if (!response.ok) throw new Error(payload.error || "Unable to update watchlist.");
      if (payload.snapshot) {
        setSnapshot(payload.snapshot);
        setLists(payload.snapshot.watchlists);
        setSectors(payload.snapshot.sectors);
      } else {
        setLists((current) =>
          current.map((row) => {
            if (row.id !== list.id) return row;
            const next = {
              ...row,
              ...("name" in body ? { name: String(body.name) } : {}),
              ...("description" in body
                ? { description: (body.description as string | null) ?? null }
                : {}),
              ...("visibility" in body
                ? { visibility: body.visibility as WatchlistVisibility }
                : {}),
              ...("archived" in body
                ? { archivedAt: body.archived ? new Date().toISOString() : null }
                : {}),
            };
            if ("symbols" in body) return withSymbols(next, body.symbols as string[]);
            return next;
          }),
        );
      }
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to update watchlist.",
      });
    } finally {
      setSubmitting(false);
      setFormMode(null);
      setEditingListId(null);
    }
  }

  async function convertListToSector(
    list: CoverageWatchlist,
    values: {
      name: string;
      description: string;
      kind: SectorKind;
      symbols: string;
    },
  ) {
    setSubmitting(true);
    try {
      const response = await fetch(`/api/watchlists/${list.id}/convert`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          identity: "sector",
          name: values.name.trim(),
          description: values.description.trim() || null,
          kind: values.kind,
          symbols: parseSymbols(values.symbols),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        sector?: CoverageSector;
        snapshot?: CoverageSnapshot;
        demo?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Unable to convert watchlist.");
      if (payload.snapshot) {
        setSnapshot(payload.snapshot);
        setLists(payload.snapshot.watchlists);
        setSectors(payload.snapshot.sectors);
        if (payload.snapshot.selection) setSelection(payload.snapshot.selection);
        setFeedback({
          tone: "success",
          message: `${kindLabel(values.kind)} saved and included on the Sectors & themes tab.`,
        });
      } else if (payload.sector) {
        setLists((current) => current.filter((row) => row.id !== list.id));
        applyCreatedSector(
          payload.sector,
          payload.demo
            ? `${kindLabel(values.kind)} accepted and added to this session. Demo fixture changes reset when the page reloads.`
            : `${kindLabel(values.kind)} saved and included on the Sectors & themes tab.`,
        );
      }
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to convert watchlist.",
      });
    } finally {
      setSubmitting(false);
      setFormMode(null);
      setEditingListId(null);
    }
  }

  async function convertSectorToWatchlist(
    sector: CoverageSector,
    values: {
      name: string;
      description: string;
      visibility: WatchlistVisibility;
      isDefault: boolean;
      symbols: string;
    },
  ) {
    setSubmitting(true);
    try {
      const response = await fetch(`/api/sectors/${sector.id}/convert`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          identity: "watchlist",
          name: values.name.trim(),
          description: values.description.trim() || null,
          visibility: values.visibility,
          isDefault: values.isDefault,
          symbols: parseSymbols(values.symbols),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        watchlist?: CoverageWatchlist;
        snapshot?: CoverageSnapshot;
        demo?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Unable to convert sector.");
      if (payload.snapshot) {
        setSnapshot(payload.snapshot);
        setLists(payload.snapshot.watchlists);
        setSectors(payload.snapshot.sectors);
        if (payload.snapshot.selection) setSelection(payload.snapshot.selection);
        setFeedback({
          tone: "success",
          message:
            values.visibility === "personal"
              ? "Personal watchlist saved to your coverage."
              : "Shared watchlist created and saved for the team.",
        });
      } else if (payload.watchlist) {
        setSectors((current) => current.filter((row) => row.id !== sector.id));
        applyCreatedList(
          payload.watchlist,
          payload.demo
            ? `${values.visibility === "personal" ? "Personal" : "Shared"} watchlist accepted and added to this session. Demo fixture changes reset when the page reloads.`
            : values.visibility === "personal"
              ? "Personal watchlist saved to your coverage."
              : "Shared watchlist created and saved for the team.",
        );
      }
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to convert sector.",
      });
    } finally {
      setSubmitting(false);
      setSectorForm(null);
      setEditingSectorId(null);
    }
  }

  async function patchSelected(body: Record<string, unknown>) {
    if (!selectedList) return;
    await patchList(selectedList, body);
  }

  async function patchSector(sector: CoverageSector, body: Record<string, unknown>) {
    setSubmitting(true);
    try {
      const response = await fetch(`/api/sectors/${sector.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        snapshot?: CoverageSnapshot;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Unable to update sector.");
      if (payload.snapshot) {
        setSnapshot(payload.snapshot);
        setLists(payload.snapshot.watchlists);
        setSectors(payload.snapshot.sectors);
      } else {
        setSectors((current) =>
          current.map((row) => {
            if (row.id !== sector.id) return row;
            const next = {
              ...row,
              ...("name" in body ? { name: String(body.name) } : {}),
              ...("description" in body
                ? { description: (body.description as string | null) ?? null }
                : {}),
              ...("kind" in body ? { kind: body.kind as CoverageSector["kind"] } : {}),
              ...("archived" in body
                ? { archivedAt: body.archived ? new Date().toISOString() : null }
                : {}),
            };
            if ("symbols" in body) return withSymbols(next, body.symbols as string[]);
            return next;
          }),
        );
      }
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to update sector.",
      });
    } finally {
      setSubmitting(false);
      setSectorForm(null);
      setEditingSectorId(null);
    }
  }

  async function duplicateList(list: CoverageWatchlist) {
    const response = await fetch(`/api/watchlists/${list.id}/duplicate`, {
      method: "POST",
    });
    const payload = (await response.json().catch(() => ({}))) as {
      watchlist?: CoverageWatchlist;
      snapshot?: CoverageSnapshot;
      error?: string;
    };
    if (!response.ok) {
      setFeedback({ tone: "error", message: payload.error || "Unable to duplicate." });
      return;
    }
    setFormMode(null);
    setEditingListId(null);
    if (payload.snapshot) {
      setSnapshot(payload.snapshot);
      setLists(payload.snapshot.watchlists);
      setSelection({ type: "watchlist", id: payload.watchlist?.id ?? list.id });
    } else if (payload.watchlist) {
      applyCreatedList(payload.watchlist, "Watchlist duplicated in this session.");
    }
  }

  async function deleteList(list: CoverageWatchlist) {
    if (!window.confirm(`Delete ${list.name}? This cannot be undone.`)) return;
    const response = await fetch(`/api/watchlists/${list.id}`, { method: "DELETE" });
    if (!response.ok) {
      setFeedback({ tone: "error", message: "Unable to delete watchlist." });
      return;
    }
    setLists((current) => current.filter((row) => row.id !== list.id));
    if (selectedList?.id === list.id) setSelection(null);
    setFormMode(null);
    setEditingListId(null);
  }

  async function deleteSector(sector: CoverageSector) {
    if (!window.confirm(`Delete ${sector.name}? This cannot be undone.`)) return;
    const response = await fetch(`/api/sectors/${sector.id}`, { method: "DELETE" });
    if (!response.ok) {
      setFeedback({ tone: "error", message: "Unable to delete sector." });
      return;
    }
    setSectors((current) => current.filter((row) => row.id !== sector.id));
    if (selectedSector?.id === sector.id) setSelection(null);
    setSectorForm(null);
    setEditingSectorId(null);
  }

  async function reorder(kind: "watchlist" | "sector", id: string, direction: -1 | 1) {
    if (kind === "watchlist") {
      const ids = moveId(
        lists.filter((list) => !list.archivedAt).map((list) => list.id),
        id,
        direction,
      );
      const order = new Map(ids.map((value, index) => [value, index]));
      setLists((current) =>
        [...current].sort(
          (a, b) => (order.get(a.id) ?? a.sortOrder) - (order.get(b.id) ?? b.sortOrder),
        ),
      );
      if (!demo) {
        await fetch("/api/watchlists/reorder", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ids }),
        });
      }
      return;
    }
    const ids = moveId(
      sectors.filter((sector) => !sector.archivedAt).map((sector) => sector.id),
      id,
      direction,
    );
    const order = new Map(ids.map((value, index) => [value, index]));
    setSectors((current) =>
      [...current].sort(
        (a, b) => (order.get(a.id) ?? a.sortOrder) - (order.get(b.id) ?? b.sortOrder),
      ),
    );
    if (!demo) {
      await fetch("/api/sectors/reorder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids }),
      });
    }
  }

  async function moveTicker(
    ticker: string,
    target: {
      type: "watchlist" | "sector";
      id: string;
      mode: "copy" | "move";
    },
  ) {
    const response = await fetch("/api/watchlists/move", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ticker,
        fromId: selectedList?.id ?? selectedSector?.id,
        toId: target.id,
        fromType: selectedList ? "watchlist" : "sector",
        toType: target.type,
        mode: target.mode,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      snapshot?: CoverageSnapshot;
      error?: string;
    };
    if (!response.ok) {
      setFeedback({ tone: "error", message: payload.error || "Unable to move ticker." });
      return;
    }
    if (payload.snapshot) {
      setSnapshot(payload.snapshot);
      setLists(payload.snapshot.watchlists);
      setSectors(payload.snapshot.sectors);
      return;
    }
    const add = (symbols: string[]) =>
      symbols.includes(ticker) ? symbols : [...symbols, ticker];
    const remove = (symbols: string[]) => symbols.filter((value) => value !== ticker);
    setLists((current) =>
      current.map((list) => {
        if (target.type === "watchlist" && list.id === target.id) {
          return withSymbols(list, add(list.symbols));
        }
        if (target.mode === "move" && selectedList && list.id === selectedList.id) {
          return withSymbols(list, remove(list.symbols));
        }
        return list;
      }),
    );
    setSectors((current) =>
      current.map((sector) => {
        if (target.type === "sector" && sector.id === target.id) {
          return withSymbols(sector, add(sector.symbols));
        }
        if (target.mode === "move" && selectedSector && sector.id === selectedSector.id) {
          return withSymbols(sector, remove(sector.symbols));
        }
        return sector;
      }),
    );
    if (target.mode === "move") setSelectedTicker(null);
  }

  const selectedRow =
    display.rows.find((row) => row.ticker === selectedTicker) ?? null;

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        eyebrow="Coverage"
        title="Watchlists & Sectors"
        description="Persistent shared and personal coverage with live tape, multi-horizon performance, and sector rotation."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {demo ? <Badge tone="mock">Demo session</Badge> : <Badge tone="brand">Live coverage</Badge>}
            {display.latencyCoverageLabel ? (
              <Badge tone="neutral">{display.latencyCoverageLabel}</Badge>
            ) : null}
            {display.asOf ? (
              <span className="font-mono text-[10px] text-[var(--ib-text-muted)]">
                As of <ClientMarketTime value={display.asOf} seconds />
              </span>
            ) : null}
          </div>
        }
      />

      {snapshot.persistence === "unavailable" ? (
        <StatePanel
          kind="unavailable"
          title="Coverage persistence disconnected"
          description="This environment has no watchlist repository. Lists are not saved across sessions. Connect Supabase to enable shared and personal coverage."
        />
      ) : null}
      {display.stale ? <StaleBanner asOf={display.asOf} /> : null}
      {display.quoteError ? (
        <StatePanel
          kind="error"
          title="Market enrichment incomplete"
          description={display.quoteError}
          className="py-4"
        />
      ) : null}

      {display.canEditWatchlists || display.canEditSectors ? (
        <details
          ref={createPanelRef}
          id="create-coverage"
          className="group min-w-0 overflow-hidden rounded-[6px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-1)]"
        >
          <summary className="flex cursor-pointer list-none items-start gap-2 px-3 py-2.5 marker:hidden [&::-webkit-details-marker]:hidden">
            <ChevronRight
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-[var(--ib-text-muted)] transition-transform group-open:rotate-90"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-[var(--ib-text-primary)]">
                  Create coverage
                </h2>
                <Badge tone="brand">Team edit</Badge>
              </div>
              <p className="mt-0.5 text-[11px] leading-4 text-[var(--ib-text-muted)]">
                {creatingSector
                  ? "Sectors and themes appear on the Sectors & themes tab and on the heatmap and rotation board below."
                  : "Watchlist or sector / theme. Shared lists persist for the firm. Personal lists stay owner-only."}
              </p>
            </div>
          </summary>
          <div className="border-t border-[var(--ib-border-subtle)] p-3">
            <form
              className="max-w-2xl space-y-3"
              onSubmit={handleInlineCreate}
              aria-busy={submitting}
              noValidate
            >
              {display.canEditWatchlists && display.canEditSectors ? (
                <fieldset className="space-y-1.5">
                  <legend className="text-xs font-medium text-[var(--ib-text-secondary)]">
                    Classification
                  </legend>
                  <div className="flex flex-wrap gap-3 text-xs text-[var(--ib-text-secondary)]">
                    <label className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="inline-bucket"
                        value="watchlist"
                        checked={createBucket === "watchlist"}
                        onChange={() => setCreateBucket("watchlist")}
                      />
                      Watchlist
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="inline-bucket"
                        value="sector"
                        checked={createBucket === "sector"}
                        onChange={() => setCreateBucket("sector")}
                      />
                      Sector / theme
                    </label>
                  </div>
                </fieldset>
              ) : null}
              <div>
                <label htmlFor="watchlist-name" className="mb-1 block text-xs font-medium text-[var(--ib-text-secondary)]">
                  {creatingSector ? "Name" : "Watchlist name"}
                </label>
                <input
                  id="watchlist-name"
                  className="field-control"
                  value={createName}
                  onChange={(event) => {
                    setCreateName(event.target.value);
                    setFieldErrors((current) => ({ ...current, name: undefined }));
                  }}
                  aria-invalid={Boolean(fieldErrors.name)}
                  aria-describedby={fieldErrors.name ? "watchlist-name-error" : undefined}
                  autoComplete="off"
                  maxLength={80}
                  disabled={submitting}
                  required
                />
                {fieldErrors.name ? (
                  <p id="watchlist-name-error" className="mt-1 text-xs text-[var(--market-negative)]">
                    {fieldErrors.name}
                  </p>
                ) : null}
              </div>
              <div>
                <label htmlFor="watchlist-description" className="mb-1 block text-xs font-medium text-[var(--ib-text-secondary)]">
                  Description <span className="text-[var(--ib-text-muted)]">(optional)</span>
                </label>
                <textarea
                  id="watchlist-description"
                  className="field-control min-h-16 resize-y"
                  value={createDescription}
                  onChange={(event) => setCreateDescription(event.target.value)}
                  maxLength={800}
                  disabled={submitting}
                />
              </div>
              <div>
                <label htmlFor="watchlist-symbols" className="mb-1 block text-xs font-medium text-[var(--ib-text-secondary)]">
                  Ticker symbols
                </label>
                <textarea
                  id="watchlist-symbols"
                  className="field-control min-h-20 resize-y font-mono uppercase"
                  value={createSymbols}
                  onChange={(event) => {
                    setCreateSymbols(event.target.value.toUpperCase());
                    setFieldErrors((current) => ({ ...current, symbols: undefined }));
                  }}
                  aria-invalid={Boolean(fieldErrors.symbols)}
                  aria-describedby={
                    fieldErrors.symbols
                      ? "watchlist-symbols-help watchlist-symbols-error"
                      : "watchlist-symbols-help"
                  }
                  placeholder="NVDA, AMD, AVGO"
                  disabled={submitting}
                  required={!creatingSector}
                />
                <p id="watchlist-symbols-help" className="mt-1 text-[11px] text-[var(--ib-text-muted)]">
                  {creatingSector
                    ? "Optional. Separate with commas or spaces. Empty themes still appear on the Sectors & themes tab and on the boards below."
                    : "Separate symbols with commas or spaces. Lowercase input is converted to uppercase; duplicates are rejected."}
                </p>
                {fieldErrors.symbols ? (
                  <p id="watchlist-symbols-error" className="mt-1 text-xs text-[var(--market-negative)]">
                    {fieldErrors.symbols}
                  </p>
                ) : null}
              </div>
              {creatingSector ? (
                <div>
                  <label htmlFor="coverage-kind" className="mb-1 block text-xs font-medium text-[var(--ib-text-secondary)]">
                    Kind
                  </label>
                  <select
                    id="coverage-kind"
                    className="field-control"
                    value={createKind}
                    onChange={(event) => setCreateKind(event.target.value as SectorKind)}
                    disabled={submitting}
                  >
                    {SECTOR_KINDS.filter((value) => value !== "screen").map((value) => (
                      <option key={value} value={value}>
                        {KIND_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="flex flex-wrap gap-3 text-xs text-[var(--ib-text-secondary)]">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="inline-visibility"
                      checked={createVisibility === "shared"}
                      onChange={() => setCreateVisibility("shared")}
                    />
                    Shared
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="inline-visibility"
                      checked={createVisibility === "personal"}
                      onChange={() => setCreateVisibility("personal")}
                    />
                    Personal
                  </label>
                </div>
              )}
              {feedback ? (
                <div
                  role={feedback.tone === "error" ? "alert" : "status"}
                  className={
                    feedback.tone === "error"
                      ? "rounded-[4px] border border-[color-mix(in_oklab,var(--market-negative)_38%,transparent)] bg-[color-mix(in_oklab,var(--market-negative)_8%,transparent)] p-2.5 text-xs text-[var(--market-negative)]"
                      : "rounded-[4px] border border-[var(--ib-border-strong)] bg-[var(--ib-surface-2)] p-2.5 text-xs text-[var(--ib-text-secondary)]"
                  }
                >
                  {feedback.message}
                </div>
              ) : null}
              <div className="flex justify-end border-t border-[var(--ib-border-subtle)] pt-3">
                <Button type="submit" variant="primary" size="sm" disabled={submitting} aria-busy={submitting}>
                  {submitting ? "Saving…" : createActionLabel}
                </Button>
              </div>
            </form>
          </div>
        </details>
      ) : null}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(260px,0.72fr)_minmax(0,1.8fr)]">
        <div className="space-y-3">
          <CoverageSidebar
            watchlists={display.watchlists}
            sectors={display.sectors}
            selection={display.selection}
            onSelect={setSelection}
            showArchived={showArchived}
            onToggleArchived={() => setShowArchived((value) => !value)}
            sectorBoard={display.sectorBoard}
            canEditWatchlists={display.canEditWatchlists}
            canEditSectors={display.canEditSectors}
            onNewWatchlist={() => openCreatePanel("watchlist")}
            onNewSector={() => openCreatePanel("sector")}
            onEditWatchlist={(list) => {
              setSelection({ type: "watchlist", id: list.id });
              setEditingListId(list.id);
              setFormMode("edit");
            }}
            canManageWatchlist={canManageList}
            onEditSector={
              display.canEditSectors
                ? (sector) => {
                    setSelection({ type: "sector", id: sector.id });
                    setEditingSectorId(sector.id);
                    setSectorForm("edit");
                  }
                : undefined
            }
            listFilter={listFilter}
            onListFilter={setListFilter}
            canReorder={display.canEditWatchlists || display.canEditSectors}
            onMoveWatchlist={
              display.canEditWatchlists
                ? (id, direction) => void reorder("watchlist", id, direction)
                : undefined
            }
            onMoveSector={
              display.canEditSectors
                ? (id, direction) => void reorder("sector", id, direction)
                : undefined
            }
          />
        </div>

        <div className="min-w-0 space-y-3">
          {selectedList || selectedSector ? (
            <>
              <CoverageSummary
                summary={display.summary}
                winners={display.winners}
                losers={display.losers}
                unusual={display.unusual}
                onSelectTicker={setSelectedTicker}
                selection={display.selection}
                watchlists={display.watchlists}
                sectors={display.sectors}
                showArchived={showArchived}
                onSelectCoverage={setSelection}
              />
              <CoverageHeatmap rows={display.rows} onSelect={setSelectedTicker} />
              <Panel
                title="Constituents"
                description="Tape columns by default. Switch to identity or performance when the desk needs more context."
                bodyClassName="p-0"
              >
                <div className="flex flex-wrap items-center gap-2 border-b border-[var(--ib-border-subtle)] px-2 py-2">
                  <input
                    className="field-control h-8 min-w-40 flex-1 text-xs"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Filter symbol, name, or tag"
                    aria-label="Filter constituents"
                  />
                  {(["tape", "performance", "identity", "full"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={columnSet === value}
                      onClick={() => setColumnSet(value)}
                      className={
                        columnSet === value
                          ? "h-7 rounded-[3px] border border-[var(--ib-border-control)] bg-[var(--ib-surface-3)] px-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-primary)]"
                          : "h-7 rounded-[3px] border border-transparent px-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)] hover:text-[var(--ib-text-primary)]"
                      }
                    >
                      {value}
                    </button>
                  ))}
                  <select
                    className="field-control h-8 w-auto text-xs"
                    value={groupMode}
                    onChange={(event) =>
                      setGroupMode(event.target.value as CoverageGroupMode)
                    }
                    aria-label="Group constituents"
                  >
                    <option value="none">No grouping</option>
                    <option value="role">Role</option>
                    <option value="tier">Tier</option>
                    <option value="type">Type</option>
                    <option value="change">Change</option>
                  </select>
                </div>
                <CoverageTable
                  rows={display.rows}
                  columnSet={columnSet}
                  groupMode={groupMode}
                  query={query}
                  selectedTicker={selectedTicker}
                  onSelect={setSelectedTicker}
                />
                {selectedRow ? (
                  <TickerInspector
                    row={selectedRow}
                    catalysts={display.catalysts}
                    lists={display.watchlists}
                    sectors={display.sectors}
                    canEdit={canMutate}
                    onClose={() => setSelectedTicker(null)}
                    onRemove={() => {
                      const current = selectedList?.symbols ?? selectedSector?.symbols ?? [];
                      const next = current.filter((ticker) => ticker !== selectedRow.ticker);
                      if (selectedList) void patchSelected({ symbols: next });
                      else if (selectedSector) void patchSector(selectedSector, { symbols: next });
                      setSelectedTicker(null);
                    }}
                    onMove={(target) => void moveTicker(selectedRow.ticker, target)}
                  />
                ) : null}
              </Panel>
            </>
          ) : null}

          <SectorHeatmapBoard
            rows={display.sectorBoard}
            selectedId={selectedSector?.id}
            onSelect={(id) => setSelection({ type: "sector", id })}
          />
          <SectorBoard
            rows={display.sectorBoard}
            selectedId={selectedSector?.id}
            onSelect={(id) => setSelection({ type: "sector", id })}
          />
        </div>
      </div>

      {formMode === "edit" && editingList ? (
        <WatchlistFormDialog
          mode="edit"
          initial={editingList}
          submitting={submitting}
          onClose={() => {
            setFormMode(null);
            setEditingListId(null);
          }}
          onSubmit={(values) => {
            if (values.identity === "sector") {
              void convertListToSector(editingList, values);
              return;
            }
            void patchList(editingList, {
              name: values.name,
              description: values.description || null,
              symbols: parseSymbols(values.symbols),
              visibility: values.visibility,
              isDefault: values.isDefault,
            });
          }}
          canConvertIdentity={display.canEditSectors}
          onDuplicate={() => void duplicateList(editingList)}
          onArchive={() =>
            void patchList(editingList, { archived: !editingList.archivedAt })
          }
          onDelete={() => void deleteList(editingList)}
        />
      ) : null}
      {sectorForm === "edit" && editingSector ? (
        <SectorFormDialog
          mode="edit"
          initial={editingSector}
          submitting={submitting}
          onClose={() => {
            setSectorForm(null);
            setEditingSectorId(null);
          }}
          onSubmit={(values) => {
            if (values.identity === "watchlist") {
              void convertSectorToWatchlist(editingSector, values);
              return;
            }
            void patchSector(editingSector, {
              name: values.name,
              description: values.description || null,
              kind: values.kind,
              navGroup: values.navGroup,
              benchmarkSymbol: values.benchmarkSymbol || null,
              reviewBy: values.reviewBy || null,
              expiresAt: values.expiresAt || null,
              sourceUrl: values.sourceUrl || null,
              symbols: parseSymbols(values.symbols),
            });
          }}
          canConvertIdentity={display.canEditWatchlists}
          onArchive={() =>
            void patchSector(editingSector, { archived: !editingSector.archivedAt })
          }
          onDelete={() => void deleteSector(editingSector)}
        />
      ) : null}
    </div>
  );
}
