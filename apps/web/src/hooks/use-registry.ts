import type { Registry } from "@tinycast-store/registry";
import { useCallback, useEffect, useState } from "react";
import { loadRegistry } from "@/lib/registry";

type State =
  | { status: "loading" }
  | { status: "ready"; registry: Registry }
  | { status: "error"; message: string };

export function useRegistry() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    setState({ status: "loading" });
    loadRegistry().then(
      (registry) => current && setState({ status: "ready", registry }),
      (error: unknown) =>
        current && setState({ status: "error", message: error instanceof Error ? error.message : String(error) }),
    );
    return () => {
      current = false;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
