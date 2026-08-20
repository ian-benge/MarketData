"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  beginPageTransition,
  endPageTransition,
  shouldStartPageTransition,
  subscribePageTransition,
} from "@/lib/navigation/page-transition";
import { WorkspaceLoading } from "@/components/layout/WorkspaceLoading";

const SAFETY_MS = 20_000;

export function PageTransitionOverlay() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const [pending, setPending] = useState(false);

  useEffect(() => subscribePageTransition(setPending), []);

  useEffect(() => {
    endPageTransition();
  }, [pathname, search]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      let next: URL;
      try {
        next = new URL(anchor.href);
      } catch {
        return;
      }
      if (!shouldStartPageTransition(new URL(window.location.href), next)) {
        return;
      }
      beginPageTransition();
    }

    function onPopState() {
      beginPageTransition();
    }

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => endPageTransition(), SAFETY_MS);
    return () => window.clearTimeout(timer);
  }, [pending]);

  if (!pending) return null;

  return (
    <div
      className="absolute inset-0 z-20 min-h-[calc(100dvh-8rem)] overflow-hidden bg-[color-mix(in_oklab,var(--ib-canvas)_92%,transparent)]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        aria-hidden="true"
        className="h-0.5 overflow-hidden bg-[var(--ib-surface-2)]"
      >
        <div className="ib-page-progress h-full w-1/3 bg-[var(--ib-maroon-300)]" />
      </div>
      <div className="px-1 pt-4">
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--ib-maroon-300)]">
          Loading page
        </p>
        <WorkspaceLoading announce={false} />
      </div>
    </div>
  );
}
