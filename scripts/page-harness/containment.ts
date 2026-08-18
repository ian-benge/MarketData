import path from "node:path";
import { ARTIFACT_NAME_LIST, MAX_ARTIFACT_BYTES, type ArtifactName } from "./schemas";

export function normalizeFsPath(filePath: string): string {
  return path.resolve(filePath).replace(/\\/g, "/");
}

export function pathIsInside(root: string, candidate: string): boolean {
  const base = normalizeFsPath(root);
  const target = normalizeFsPath(candidate);
  if (process.platform === "win32") {
    const left = base.toLowerCase();
    const right = target.toLowerCase();
    return right === left || right.startsWith(`${left}/`);
  }
  return target === base || target.startsWith(`${base}/`);
}

export function assertPathInside(
  candidate: string,
  roots: string[],
  label = "path",
): string {
  const resolved = path.resolve(candidate);
  if (roots.some((root) => pathIsInside(root, resolved))) {
    return resolved;
  }
  throw new Error(
    `${label} escapes the run sandbox: ${resolved}. Allowed roots: ${roots.join(", ")}`,
  );
}

export function isLocalHarnessOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    return (
      (host === "127.0.0.1" || host === "localhost") &&
      (url.protocol === "http:" || url.protocol === "https:")
    );
  } catch {
    return false;
  }
}

export function assertHarnessOrigin(candidate: string, allowedOrigin: string): void {
  const actual = new URL(candidate);
  const allowed = new URL(allowedOrigin);
  if (!isLocalHarnessOrigin(actual.origin) || !isLocalHarnessOrigin(allowed.origin)) {
    throw new Error(
      `Browser inspection is restricted to the harness-owned local origin. Rejected ${actual.origin}.`,
    );
  }
  if (actual.origin !== allowed.origin) {
    throw new Error(
      `Inspection origin ${actual.origin} does not match harness server ${allowed.origin}.`,
    );
  }
}

export function routePath(route: string): string {
  const withSlash = route.startsWith("/") ? route : `/${route}`;
  return withSlash.split("?")[0]?.replace(/\/+$/, "") || "/";
}

export function assertRouteContained(
  requested: string,
  target: string,
  adjacent: string[] = [],
): string {
  const pathOnly = routePath(requested);
  const allowed = new Set([routePath(target), ...adjacent.map(routePath)]);
  if (!allowed.has(pathOnly)) {
    throw new Error(
      `Route ${requested} is outside the run target ${target} (adjacent: ${adjacent.join(", ") || "none"}).`,
    );
  }
  return pathOnly;
}

export function assertArtifactName(name: string): ArtifactName {
  if (!ARTIFACT_NAME_LIST.includes(name as ArtifactName)) {
    throw new Error(
      `Artifact name '${name}' is not allowlisted. Allowed: ${ARTIFACT_NAME_LIST.join(", ")}`,
    );
  }
  return name as ArtifactName;
}

export function assertArtifactSize(payload: unknown, maxBytes = MAX_ARTIFACT_BYTES): void {
  const bytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
  if (bytes > maxBytes) {
    throw new Error(
      `Artifact exceeds ${maxBytes} bytes (${bytes}). Split or reduce the payload.`,
    );
  }
}

export function relativePosix(from: string, to: string): string {
  return path.relative(from, to).replace(/\\/g, "/");
}
