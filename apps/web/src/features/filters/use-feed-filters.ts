"use client";

import { type FeedFilters, NO_FILTERS } from "@opika/domain";
import { useCallback, useEffect, useState } from "react";
import { readStoredFilters, writeStoredFilters } from "./filter-state";

/**
 * `window.sessionStorage` is not merely absent on the server: reading the
 * property *throws* `SecurityError` whenever the document has no access to
 * storage — an opaque origin, or a browser with site data blocked for the
 * site (verified in Chromium). Unhandled, that throw happens inside a mount
 * effect on the app's front door and replaces the whole screen with an error
 * boundary, over a filter preference. A browser that won't remember is a
 * session that doesn't remember, not a broken page.
 */
function sessionStorageOrNull(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Filter state shared across the app, backed by sessionStorage.
 *
 * Starts at NO_FILTERS on every render — including the first client
 * render, since Next.js server-renders this component and `sessionStorage`
 * doesn't exist there — then syncs to whatever's actually stored in an
 * effect once mounted. A first-time visitor sees no city selected
 * (the honest "Уся Київщина" reading) either way; a returning one with a
 * stored preference sees it apply a moment after paint, not before.
 */
export function useFeedFilters(): [FeedFilters, (next: FeedFilters) => void] {
  const [filters, setFiltersState] = useState<FeedFilters>(NO_FILTERS);

  useEffect(() => {
    const storage = sessionStorageOrNull();
    if (storage) setFiltersState(readStoredFilters(storage));
  }, []);

  const setFilters = useCallback((next: FeedFilters) => {
    setFiltersState(next);
    const storage = sessionStorageOrNull();
    if (storage) writeStoredFilters(storage, next);
  }, []);

  return [filters, setFilters];
}
