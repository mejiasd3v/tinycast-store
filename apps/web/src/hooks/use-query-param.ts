import { useCallback, useSyncExternalStore } from "react";

const EVENT = "querychange";

function subscribe(callback: () => void) {
  window.addEventListener("popstate", callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener(EVENT, callback);
  };
}

/**
 * A string kept in the URL's query string, so a search or an open listing can be shared.
 * `push` adds a history entry (opening a listing, so Back closes it); typing replaces instead.
 */
export function useQueryParam(key: string): [string, (value: string, mode?: "push" | "replace") => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => new URLSearchParams(window.location.search).get(key) ?? "",
    () => "",
  );

  const set = useCallback(
    (next: string, mode: "push" | "replace" = "replace") => {
      const url = new URL(window.location.href);
      if (next) url.searchParams.set(key, next);
      else url.searchParams.delete(key);
      history[mode === "push" ? "pushState" : "replaceState"](null, "", url);
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );

  return [value, set];
}
