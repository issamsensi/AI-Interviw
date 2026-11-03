"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

/**
 * Hydration-safe read of a localStorage value.
 *
 * The server snapshot is always null (matching SSR output); after
 * hydration the live browser value is used. Reading localStorage
 * directly during render (or behind a `typeof window` branch) produces
 * different HTML on server and client whenever a value is stored.
 */
export function useStoredValue(key: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => window.localStorage.getItem(key),
    () => null,
  );
}
