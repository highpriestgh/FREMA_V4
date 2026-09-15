import { useSyncExternalStore } from "react";

/**
 * Counts requests in flight, so one loading bar can reflect everything the app is waiting on —
 * page data, saves, uploads — without each page wiring it up.
 */
let active = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function beginRequest() {
  active += 1;
  emit();
}

export function endRequest() {
  active = Math.max(0, active - 1);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True while at least one tracked request is in flight. */
export function useIsLoading() {
  return useSyncExternalStore(subscribe, () => active > 0, () => false);
}
