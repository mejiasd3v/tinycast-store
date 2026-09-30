import { Cache } from "@raycast/api";
import { useCallback, useEffect, useState } from "react";
import { discover, type Registry } from "@tinycast-store/registry";

const SNAPSHOT_URL = "https://tinycast.store/registry.json";
const SNAPSHOT_TIMEOUT_MS = 5_000;
/** Long enough that reopening the list is instant, short enough that new extensions show up. */
const FRESH_FOR_MS = 10 * 60 * 1000;

const cache = new Cache({ namespace: "registry" });
const CACHE_KEY = "registry";

interface Cached {
  savedAt: number;
  registry: Registry;
}

function isRegistry(value: unknown): value is Registry {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Registry).version === 1 &&
    Array.isArray((value as Registry).listings)
  );
}

/** `fetch` has no abort here, so a stalled request loses a race against a timer instead. */
async function fetchSnapshot(): Promise<Registry | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), SNAPSHOT_TIMEOUT_MS);
  });
  const request = fetch(SNAPSHOT_URL).then(async (response) => {
    if (!response.ok) return undefined;
    const body: unknown = await response.json();
    return isRegistry(body) ? body : undefined;
  });
  try {
    return await Promise.race([request, timeout]);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** The site's snapshot when it is reachable and non-empty, otherwise GitHub itself. */
export async function loadRegistry(): Promise<Registry> {
  const snapshot = await fetchSnapshot();
  if (snapshot && snapshot.listings.length > 0) return snapshot;
  return discover({ releases: false });
}

function readCache(): Cached | undefined {
  try {
    const raw = cache.get(CACHE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : undefined;
    return parsed && isRegistry((parsed as Cached).registry) ? (parsed as Cached) : undefined;
  } catch {
    return undefined;
  }
}

export function useRegistry() {
  const [cached] = useState(readCache);
  const [registry, setRegistry] = useState(cached?.registry);
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(!cached || Date.now() - cached.savedAt > FRESH_FOR_MS);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(undefined);
    try {
      const fresh = await loadRegistry();
      cache.set(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), registry: fresh } satisfies Cached));
      setRegistry(fresh);
    } catch (e) {
      // Keep showing whatever we already have; the error only matters when there is nothing.
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!cached || Date.now() - cached.savedAt > FRESH_FOR_MS) void reload();
  }, [cached, reload]);

  return { registry, error, isLoading, reload };
}
