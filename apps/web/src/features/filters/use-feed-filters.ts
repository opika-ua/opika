"use client";

import { type FeedFilters, NO_FILTERS } from "@opika/domain";
import { useCallback, useEffect, useState } from "react";
import { readStoredFilters, writeStoredFilters } from "./filter-state";

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
    setFiltersState(readStoredFilters(window.sessionStorage));
  }, []);

  const setFilters = useCallback((next: FeedFilters) => {
    setFiltersState(next);
    writeStoredFilters(window.sessionStorage, next);
  }, []);

  return [filters, setFilters];
}
