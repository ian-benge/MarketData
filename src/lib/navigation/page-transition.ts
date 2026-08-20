type Listener = (pending: boolean) => void;

const listeners = new Set<Listener>();
let pending = false;

function emit(): void {
  for (const listener of listeners) listener(pending);
}

export function isPageTransitionPending(): boolean {
  return pending;
}

export function beginPageTransition(): void {
  if (pending) return;
  pending = true;
  emit();
}

export function endPageTransition(): void {
  if (!pending) return;
  pending = false;
  emit();
}

export function subscribePageTransition(listener: Listener): () => void {
  listeners.add(listener);
  listener(pending);
  return () => {
    listeners.delete(listener);
  };
}

function normalizedPath(url: URL): string {
  return url.pathname.replace(/\/+$/, "") || "/";
}

export function shouldStartPageTransition(current: URL, next: URL): boolean {
  if (next.origin !== current.origin) return false;
  if (next.protocol !== "http:" && next.protocol !== "https:") return false;
  return (
    normalizedPath(current) !== normalizedPath(next) ||
    current.search !== next.search
  );
}

export function beginPageTransitionTo(href: string): void {
  if (typeof window === "undefined") return;
  try {
    const next = new URL(href, window.location.href);
    if (shouldStartPageTransition(new URL(window.location.href), next)) {
      beginPageTransition();
    }
  } catch {
    beginPageTransition();
  }
}
