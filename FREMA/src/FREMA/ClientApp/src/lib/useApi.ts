import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

interface State<T> {
  data: T | null;
  loading: boolean;
  error: unknown;
}

/**
 * Fetches on mount and whenever `deps` change, and hands back a `reload` for after a
 * mutation.
 *
 * The abort signal is what makes this safe: without it a slow first response can land
 * after a faster second one and overwrite fresher data with staler data.
 */
export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [state, setState] = useState<State<T>>({ data: null, loading: true, error: null });
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (path === null) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    const controller = new AbortController();
    setState((previous) => ({ ...previous, loading: true }));

    api
      .get<T>(path, undefined, controller.signal)
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((error: unknown) => {
        // An aborted request was superseded on purpose; it is not a failure to report.
        if (error instanceof Error && error.name === "AbortError") return;
        setState({ data: null, loading: false, error });
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, nonce, ...deps]);

  return { ...state, reload };
}
