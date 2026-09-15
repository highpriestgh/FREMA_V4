import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { useToast } from "@/components/ui/toast";

interface State<T> {
  data: T | null;
  loading: boolean;
  error: unknown;
}

interface Options {
  /**
   * Don't show a toast when loading fails. For pages that render the failure themselves —
   * a document the user may not open, say — where a toast would repeat what is on screen.
   */
  silent?: boolean;
}

/**
 * Fetches on mount and whenever `deps` change, and hands back a `reload` for after a
 * mutation.
 *
 * The abort signal is what makes this safe: without it a slow first response can land after a
 * faster second one and overwrite fresher data with staler data.
 *
 * `initialLoading` is true only until the first response — use it for skeletons. `loading` is
 * also true during later reloads, when the existing content should stay on screen.
 */
export function useApi<T>(path: string | null, deps: unknown[] = [], options: Options = {}) {
  const [state, setState] = useState<State<T>>({ data: null, loading: path !== null, error: null });
  const [nonce, setNonce] = useState(0);
  const toast = useToast();

  // Read through a ref so a change of toast identity does not refetch.
  const report = useRef(toast.fromError);
  report.current = toast.fromError;

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
        setState((previous) => ({ data: previous.data, loading: false, error }));
        if (!options.silent) report.current(error, "Couldn't load this page");
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, nonce, ...deps]);

  return {
    ...state,
    initialLoading: state.loading && state.data === null && state.error === null,
    reload,
  };
}
