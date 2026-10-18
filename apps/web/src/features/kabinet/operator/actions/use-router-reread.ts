"use client";

import type { RegistryShelterView } from "@opika/contracts";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useTransition } from "react";
import type { Reread } from "./operator-actions";

/**
 * S4's re-read: the page renders itself again on the server (`router.refresh`
 * in a transition), through its own guard and its picked read-only registry
 * router, and the promise answers with the record the page then holds. The
 * browser never reads the registry itself (`registry-actions-client.ts`).
 *
 * The transition's pending flag is how the refresh's end is seen: it turns
 * on as the refresh starts and off in the same commit as the new page, so by
 * the time the waiting promises are resolved (a passive effect) the record
 * the page passed down (stored in a layout effect, which runs first) is the
 * fresh one. Whatever ends the transition resolves the promise with the
 * record the page holds at that point, so a refresh that brought nothing new
 * answers with the old record, which a caller checking a lost answer reads as
 * not done, never as done.
 */
export function useRouterReread(pageView: RegistryShelterView): Reread {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const latest = useRef(pageView);
  const waiting = useRef<((view: RegistryShelterView) => void)[]>([]);
  const sawRefreshing = useRef(false);

  useLayoutEffect(() => {
    latest.current = pageView;
  });

  useEffect(() => {
    if (refreshing) {
      sawRefreshing.current = true;
      return;
    }
    if (!sawRefreshing.current) return;
    sawRefreshing.current = false;
    for (const resolve of waiting.current.splice(0)) resolve(latest.current);
  }, [refreshing]);

  return useCallback(
    () =>
      new Promise<RegistryShelterView | null>((resolve) => {
        waiting.current.push(resolve);
        startTransition(() => router.refresh());
      }),
    [router],
  );
}
