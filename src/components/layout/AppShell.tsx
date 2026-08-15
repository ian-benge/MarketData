"use client";

import {
  Activity,
  Archive,
  BarChart3,
  Briefcase,
  Clock3,
  Command,
  FilePlus2,
  Layers3,
  Menu,
  MessageSquareText,
  Newspaper,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { BrandMark } from "@/components/brand/BrandMark";
import { cn } from "@/lib/utils/cn";
import type { UserRole } from "@/lib/domain/permissions";

type NavItem = {
  href: string;
  label: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
  adminOnly?: boolean;
};

const WORKBENCH_NAV: NavItem[] = [
  {
    href: "/dashboard",
    label: "Market Overview",
    shortLabel: "Market",
    description: "Session, chart, watchlist, and catalysts",
    icon: BarChart3,
  },
  {
    href: "/news",
    label: "Material News",
    shortLabel: "News",
    description: "Headline search, event clusters, and why it’s moving",
    icon: Newspaper,
  },
  {
    href: "/positions",
    label: "Positions",
    shortLabel: "Positions",
    description: "Live book, exposure, and P&L",
    icon: Briefcase,
  },
  {
    href: "/archive",
    label: "Research Archive",
    shortLabel: "Research",
    description: "Search and open firm-wide reports",
    icon: Archive,
  },
  {
    href: "/watchlists",
    label: "Watchlists & Sectors",
    shortLabel: "Watchlists",
    description: "Shared and personal coverage universes",
    icon: Layers3,
  },
  {
    href: "/dashboard?generate=1",
    label: "Generate Brief",
    shortLabel: "Generate",
    description: "Queue a firm-wide research brief",
    icon: FilePlus2,
  },
  {
    href: "/proposals",
    label: "Proposals",
    shortLabel: "Proposals",
    description: "Team configuration requests",
    icon: MessageSquareText,
  },
  {
    href: "/admin",
    label: "Data Operations",
    shortLabel: "Admin",
    description: "Team, providers, jobs, and delivery",
    icon: Settings2,
    adminOnly: true,
  },
];

const SETTINGS_NAV: NavItem[] = [
  {
    href: "/settings",
    label: "Settings",
    shortLabel: "Settings",
    description: "Theme and personal display preferences",
    icon: SlidersHorizontal,
  },
];

function isActive(pathname: string, href: string) {
  if (href.includes("?")) return false;
  const route = href.split("?")[0];
  return (
    pathname === route ||
    (route !== "/dashboard" && pathname.startsWith(`${route}/`))
  );
}

function focusableElements(container: HTMLElement | null) {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("hidden"));
}

function trapFocus(event: React.KeyboardEvent, container: HTMLElement | null) {
  if (event.key !== "Tab") return;
  const elements = focusableElements(container);
  if (!elements.length) return;
  const first = elements[0];
  const last = elements[elements.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function Navigation({
  items,
  pathname,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Primary" className="space-y-1">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex min-h-10 items-center gap-3 rounded-[4px] px-3 text-[13px] font-medium transition-colors",
              active
                ? "bg-[var(--ib-surface-selected)] text-[var(--ib-text-primary)]"
                : "text-[var(--ib-text-secondary)] hover:bg-[var(--ib-surface-hover)] hover:text-[var(--ib-text-primary)]",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "absolute inset-y-1.5 left-0 w-0.5 rounded-r",
                active ? "bg-[var(--ib-maroon-300)]" : "bg-transparent",
              )}
            />
            <Icon
              aria-hidden="true"
              className={cn(
                "size-4 shrink-0",
                active
                  ? "text-[var(--ib-maroon-300)]"
                  : "text-[var(--ib-text-muted)] group-hover:text-[var(--ib-text-secondary)]",
              )}
            />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({
  children,
  role,
  email,
  isDemo,
}: {
  children: React.ReactNode;
  role: UserRole;
  email: string;
  isDemo?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [commandIndex, setCommandIndex] = useState(0);
  const [newsHits, setNewsHits] = useState<
    Array<{ id: string; title: string; href: string; meta: string }>
  >([]);
  const drawerRef = useRef<HTMLDivElement>(null);
  const commandRef = useRef<HTMLDivElement>(null);
  const commandInputRef = useRef<HTMLInputElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const commandButtonRef = useRef<HTMLButtonElement>(null);
  const commandTriggerRef = useRef<HTMLElement | null>(null);

  const workbenchItems = useMemo(
    () => WORKBENCH_NAV.filter((item) => !item.adminOnly || role === "admin"),
    [role],
  );
  const items = useMemo(
    () => [...workbenchItems, ...SETTINGS_NAV],
    [workbenchItems],
  );
  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(normalized) ||
        item.description.toLowerCase().includes(normalized),
    );
  }, [items, query]);
  const commandRows = useMemo(() => {
    const rows: Array<{
      key: string;
      label: string;
      description: string;
      href: string;
      icon: LucideIcon;
    }> = filteredItems.map((item) => ({
      key: item.href,
      label: item.label,
      description: item.description,
      href: item.href,
      icon: item.icon,
    }));
    const q = query.trim();
    for (const hit of q.length < 2 ? [] : newsHits) {
      rows.push({
        key: hit.id,
        label: hit.title,
        description: hit.meta,
        href: hit.href,
        icon: Newspaper,
      });
    }
    if (q.length >= 2) {
      rows.push({
        key: "search-news",
        label: `Search headlines for “${q}”`,
        description: "Open Material News",
        href: `/news?q=${encodeURIComponent(q)}`,
        icon: Newspaper,
      });
    }
    return rows;
  }, [filteredItems, newsHits, query]);
  const activeCommandIndex = Math.min(
    commandIndex,
    Math.max(commandRows.length - 1, 0),
  );

  function closeDrawer() {
    setDrawerOpen(false);
    requestAnimationFrame(() => menuButtonRef.current?.focus());
  }

  function closeCommand() {
    setCommandOpen(false);
    setQuery("");
    setCommandIndex(0);
    setNewsHits([]);
    requestAnimationFrame(() => {
      const trigger = commandTriggerRef.current;
      if (trigger?.isConnected) trigger.focus();
      else commandButtonRef.current?.focus();
    });
  }

  function openCommand() {
    commandTriggerRef.current = document.activeElement as HTMLElement | null;
    setDrawerOpen(false);
    setCommandIndex(0);
    setCommandOpen(true);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (commandOpen) closeCommand();
        else openCommand();
        return;
      }

      if (event.key === "/" && !typing) {
        event.preventDefault();
        openCommand();
      }

      if (event.key === "Escape") {
        if (commandOpen) closeCommand();
        else if (drawerOpen) closeDrawer();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commandOpen, drawerOpen]);

  useEffect(() => {
    if (commandOpen)
      requestAnimationFrame(() => commandInputRef.current?.focus());
  }, [commandOpen]);

  useEffect(() => {
    if (!commandOpen) return;
    const q = query.trim();
    if (q.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/news?q=${encodeURIComponent(q)}&limit=6&freshness=cached`,
          { cache: "no-store" },
        );
        if (!response.ok || cancelled) return;
        const body = (await response.json()) as {
          events?: Array<{ id: string; title: string; eventTypeLabel?: string }>;
        };
        if (cancelled) return;
        setNewsHits(
          (body.events ?? []).slice(0, 6).map((event) => ({
            id: event.id,
            title: event.title,
            href: `/news?q=${encodeURIComponent(q)}`,
            meta: event.eventTypeLabel ?? "Headline",
          })),
        );
      } catch {
        if (!cancelled) setNewsHits([]);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [commandOpen, query]);

  useEffect(() => {
    if (drawerOpen) {
      requestAnimationFrame(() =>
        focusableElements(drawerRef.current)[0]?.focus(),
      );
    }
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen && !commandOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [commandOpen, drawerOpen]);

  function goTo(item: { href: string }) {
    router.push(item.href);
    closeCommand();
  }

  const primaryMobileItems = items.filter((item) =>
    ["/dashboard", "/positions", "/watchlists"].includes(item.href),
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[216px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-[var(--ib-border-subtle)] bg-[var(--ib-surface-1)] lg:flex">
        <Link
          href="/dashboard"
          className="flex h-16 items-center border-b border-[var(--ib-border-subtle)] px-4"
        >
          <BrandMark />
        </Link>

        <div className="flex-1 overflow-y-auto px-2 py-4 terminal-scroll">
          <p className="mb-2 px-3 font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-[var(--ib-text-muted)]">
            Workbench
          </p>
          <Navigation items={workbenchItems} pathname={pathname} />
          <p className="mb-2 mt-5 px-3 font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-[var(--ib-text-muted)]">
            Settings
          </p>
          <Navigation items={SETTINGS_NAV} pathname={pathname} />
        </div>

        <div className="border-t border-[var(--ib-border-subtle)] p-3">
          <div className="rounded-[4px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-inset)] p-2.5">
            <div className="flex items-center gap-2">
              <span className="grid size-7 shrink-0 place-items-center rounded-[4px] bg-[var(--ib-surface-2)] text-[var(--ib-text-secondary)]">
                <UserRound aria-hidden="true" className="size-3.5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[12px] font-medium text-[var(--ib-text-primary)]">
                  {email}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                  <ShieldCheck aria-hidden="true" className="size-3" />
                  {role}
                  {isDemo ? " · demo" : ""}
                </p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 isolate border-b border-[var(--ib-border-subtle)] bg-[var(--ib-surface-1)]">
          <div className="flex h-12 items-center gap-2 px-3 sm:px-4 lg:h-11 lg:px-5 xl:px-6">
            <Link href="/dashboard" className="mr-auto lg:hidden">
              <BrandMark compact />
            </Link>

            <button
              ref={commandButtonRef}
              type="button"
              onClick={openCommand}
              className="hidden min-w-0 w-[min(100%,28rem)] max-w-[28rem] items-center gap-2 rounded-[4px] border border-[var(--ib-border-control)] bg-[var(--ib-surface-inset)] px-2.5 py-1.5 text-left text-[12px] text-[var(--ib-text-muted)] transition-colors hover:border-[var(--ib-text-muted)] hover:text-[var(--ib-text-secondary)] sm:flex"
              aria-label="Open command search"
              aria-haspopup="dialog"
            >
              <Search aria-hidden="true" className="size-3.5" />
              <span className="truncate">Search routes and research</span>
              <kbd className="ml-auto hidden rounded-[3px] border border-[var(--ib-border-strong)] bg-[var(--ib-surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ib-text-secondary)] md:inline-flex">
                Ctrl K
              </kbd>
            </button>

            <div className="ml-auto hidden items-center gap-3 text-[11px] text-[var(--ib-text-muted)] sm:flex lg:ml-auto">
              <span className="inline-flex items-center gap-1.5">
                <Clock3 aria-hidden="true" className="size-3.5" />
                America/Chicago
              </span>
              <span className="hidden h-4 w-px bg-[var(--ib-border-subtle)] xl:block" />
              <span className="hidden items-center gap-1.5 xl:inline-flex">
                <Activity
                  aria-hidden="true"
                  className="size-3.5 text-[var(--state-info)]"
                />
                Private team workspace
              </span>
            </div>

            <button
              type="button"
              onClick={openCommand}
              className="grid size-11 place-items-center rounded-[4px] text-[var(--ib-text-secondary)] hover:bg-[var(--ib-surface-hover)] sm:hidden"
              aria-label="Open command search"
              aria-haspopup="dialog"
            >
              <Command aria-hidden="true" className="size-4" />
            </button>
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="grid size-11 place-items-center rounded-[4px] text-[var(--ib-text-secondary)] hover:bg-[var(--ib-surface-hover)] lg:hidden"
              aria-label="Open navigation menu"
              aria-expanded={drawerOpen}
            >
              <Menu aria-hidden="true" className="size-5" />
            </button>
          </div>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1720px] px-3 py-4 pb-24 sm:px-4 sm:py-5 lg:px-5 lg:pb-8 xl:px-6"
        >
          {children}
        </main>
      </div>

      <nav
        aria-label="Mobile primary"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-[var(--ib-border-strong)] bg-[var(--ib-surface-1)] pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {primaryMobileItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-medium",
                active
                  ? "text-[var(--ib-text-primary)]"
                  : "text-[var(--ib-text-muted)]",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-x-3 top-0 h-0.5",
                  active ? "bg-[var(--ib-maroon-300)]" : "bg-transparent",
                )}
              />
              <Icon aria-hidden="true" className="size-4" />
              {item.shortLabel}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-medium text-[var(--ib-text-muted)]"
          aria-label="Open more navigation"
        >
          <Menu aria-hidden="true" className="size-4" />
          More
        </button>
      </nav>

      {drawerOpen ? (
        <div
          className="fixed inset-0 z-50 bg-black/70 lg:hidden"
          onMouseDown={closeDrawer}
        >
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-navigation-title"
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => trapFocus(event, drawerRef.current)}
            className="ml-auto flex h-full w-[min(88vw,360px)] flex-col border-l border-[var(--ib-border-strong)] bg-[var(--ib-surface-1)] shadow-[var(--shadow-float)]"
          >
            <div className="flex h-16 items-center justify-between border-b border-[var(--ib-border-subtle)] px-4">
              <BrandMark />
              <button
                type="button"
                onClick={closeDrawer}
                className="grid size-11 place-items-center rounded-[4px] text-[var(--ib-text-secondary)] hover:bg-[var(--ib-surface-hover)]"
                aria-label="Close navigation menu"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </div>
            <h2 id="mobile-navigation-title" className="sr-only">
              Navigation
            </h2>
            <div className="flex-1 overflow-y-auto px-3 py-4 terminal-scroll">
              <p className="mb-2 px-3 font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-[var(--ib-text-muted)]">
                Workbench
              </p>
              <Navigation
                items={workbenchItems}
                pathname={pathname}
                onNavigate={closeDrawer}
              />
              <p className="mb-2 mt-5 px-3 font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-[var(--ib-text-muted)]">
                Settings
              </p>
              <Navigation
                items={SETTINGS_NAV}
                pathname={pathname}
                onNavigate={closeDrawer}
              />
            </div>
            <div className="border-t border-[var(--ib-border-subtle)] p-4">
              <p className="truncate text-[13px] font-medium">{email}</p>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--ib-text-muted)]">
                {role}
                {isDemo ? " · demo session" : ""}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {commandOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-black/70 px-3 pt-[10vh]"
          onMouseDown={closeCommand}
        >
          <div
            ref={commandRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="command-title"
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => trapFocus(event, commandRef.current)}
            className="w-full max-w-xl overflow-hidden rounded-[8px] border border-[var(--ib-border-control)] bg-[var(--ib-surface-3)] shadow-[var(--shadow-float)]"
          >
            <div className="flex items-center gap-2 border-b border-[var(--ib-border-strong)] px-3">
              <Search
                aria-hidden="true"
                className="size-4 text-[var(--ib-text-muted)]"
              />
              <input
                ref={commandInputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setCommandIndex(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" && commandRows.length) {
                    event.preventDefault();
                    setCommandIndex(
                      (current) => (current + 1) % commandRows.length,
                    );
                  }
                  if (event.key === "ArrowUp" && commandRows.length) {
                    event.preventDefault();
                    setCommandIndex(
                      (current) =>
                        (current - 1 + commandRows.length) %
                        commandRows.length,
                    );
                  }
                  if (
                    event.key === "Enter" &&
                    commandRows[activeCommandIndex]
                  ) {
                    event.preventDefault();
                    goTo(commandRows[activeCommandIndex]);
                  }
                }}
                role="combobox"
                aria-autocomplete="list"
                aria-controls="command-results"
                aria-expanded="true"
                aria-activedescendant={
                  commandRows[activeCommandIndex]
                    ? `command-${activeCommandIndex}`
                    : undefined
                }
                aria-label="Search headlines and destinations"
                placeholder="Headlines, tickers, or a workspace…"
                className="h-12 min-w-0 flex-1 bg-transparent text-sm text-[var(--ib-text-primary)] outline-none placeholder:text-[var(--ib-text-muted)]"
              />
              <button
                type="button"
                onClick={closeCommand}
                className="grid size-9 place-items-center rounded-[4px] text-[var(--ib-text-muted)] hover:bg-[var(--ib-surface-hover)] hover:text-[var(--ib-text-primary)]"
                aria-label="Close command search"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-2 terminal-scroll">
              <p
                id="command-title"
                className="px-2 pb-2 pt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ib-text-muted)]"
              >
                Headlines and destinations
              </p>
              {commandRows.length ? (
                <ul id="command-results" role="listbox" className="space-y-1">
                  {commandRows.map((item, index) => {
                    const Icon = item.icon;
                    return (
                      <li key={item.key}>
                        <button
                          id={`command-${index}`}
                          type="button"
                          role="option"
                          aria-selected={index === activeCommandIndex}
                          onClick={() => goTo(item)}
                          onMouseEnter={() => setCommandIndex(index)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-[4px] px-3 py-2.5 text-left hover:bg-[var(--ib-surface-hover)]",
                            index === activeCommandIndex &&
                              "bg-[var(--ib-surface-hover)]",
                          )}
                        >
                          <span className="grid size-8 shrink-0 place-items-center rounded-[4px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-2)] text-[var(--ib-text-secondary)]">
                            <Icon aria-hidden="true" className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-medium text-[var(--ib-text-primary)]">
                              {item.label}
                            </span>
                            <span className="block truncate text-[11px] text-[var(--ib-text-muted)]">
                              {item.description}
                            </span>
                          </span>
                          {index === activeCommandIndex ? (
                            <kbd className="rounded-[3px] border border-[var(--ib-border-strong)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ib-text-muted)]">
                              Enter
                            </kbd>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="px-3 py-8 text-center">
                  <p className="text-sm text-[var(--ib-text-secondary)]">
                    No matching destination or headline
                  </p>
                  <p className="mt-1 text-xs text-[var(--ib-text-muted)]">
                    Try a ticker, theme, or keyword — or jump to a workspace.
                  </p>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-[var(--ib-border-subtle)] px-3 py-2 font-mono text-[10px] text-[var(--ib-text-muted)]">
              <span>↑↓ inspect · Enter open</span>
              <span>Esc close</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
