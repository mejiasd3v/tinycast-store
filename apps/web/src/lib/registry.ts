import { discover, type Registry } from "@tinycast-store/registry";

function isRegistry(value: unknown): value is Registry {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Registry).version === 1 &&
    Array.isArray((value as Registry).listings)
  );
}

/**
 * The snapshot built at deploy time is the fast path and costs GitHub nothing.
 * When it's missing (local dev before `pnpm registry:generate`, or a broken deploy),
 * fall back to asking GitHub directly from the browser: same result, fewer details.
 */
export async function loadRegistry(): Promise<Registry> {
  try {
    const response = await fetch("/registry.json");
    // In dev a missing file is answered with index.html, which fails to parse and lands below.
    const snapshot: unknown = await response.json();
    if (response.ok && isRegistry(snapshot)) return snapshot;
  } catch {
    // Fall through to the live query.
  }
  return discover();
}
