"use client";

import type { RegistryShelterView } from "@opika/contracts";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type ActionRefusal, actionFailureOf, staleAfter } from "./action-result";
import {
  type RegistryActionsClient,
  registryActionsBrowserClient,
} from "./registry-actions-client";

/**
 * Reads the shelter again and answers with the fresh record, or null when the
 * read itself failed. On S4 this re-renders the page from the server
 * (`use-router-reread.ts`): the browser holds no registry read of its own.
 */
export type Reread = () => Promise<RegistryShelterView | null>;

/** Which control is mid-request, so only that one says so; every other action waits. */
export type ActionPhase =
  | { kind: "idle" }
  | { kind: "sending"; owner: string }
  | { kind: "checking"; owner: string };

export type ActionRequest<T> = {
  /** The control asking: it alone shows the in-flight and lost-answer states. */
  owner: string;
  call: (client: RegistryActionsClient) => Promise<T>;
  /** The fresh record, for procedures that answer with one (verification and donation moves). */
  viewOf?: (value: T) => RegistryShelterView;
  /** After a lost answer: whether the re-read record shows this action done. */
  landed: (fresh: RegistryShelterView) => boolean;
  /**
   * False for an action after which this page must not be read again:
   * entering support turns this browser's operator into a support view,
   * which S4's own guard answers with 404. Such an action is never re-read,
   * and a lost answer for it is `landed: false`.
   */
  rereads?: boolean;
};

/**
 * How an action ended, once the page has caught up with it.
 *
 * - `busy`: another action was in flight; nothing was sent (one at a time).
 * - `ok`: the server answered; the page has been re-read since.
 * - `refused`: the server answered with a refusal. `reread` says whether
 *   the page was read again because the refusal means it was stale
 *   (`done`), whether that read failed (`failed`, so nothing may claim the
 *   page was updated), or whether the refusal didn't call for one.
 * - `lost`: no answer came back; the page was read again before anything was
 *   said, and `landed` is whether that read shows the action done. A failed
 *   re-read is `landed: false`: nothing may claim it happened.
 */
export type Settled<T> =
  | { kind: "busy" }
  | { kind: "ok"; value: T }
  | { kind: "refused"; failure: ActionRefusal; reread: "done" | "failed" | "not_needed" }
  | { kind: "lost"; landed: boolean };

type OperatorActions = {
  /** The record as S4 last knew it: the page's own, or a write's answer since. */
  view: RegistryShelterView;
  phase: ActionPhase;
  run: <T>(request: ActionRequest<T>) => Promise<Settled<T>>;
  /** A full navigation (support mode needs the server to read its new cookie). */
  navigate: (to: string) => void;
};

const OperatorActionsContext = createContext<OperatorActions | null>(null);

const assignLocation = (to: string) => window.location.assign(to);

export function useOperatorActions(): OperatorActions {
  const actions = useContext(OperatorActionsContext);
  if (actions === null) throw new Error("useOperatorActions outside OperatorActionsProvider");
  return actions;
}

/**
 * The one runner every S4 action goes through, so the rules hold for all of
 * them at once:
 *
 * - **One request at a time.** A second press anywhere on the page while one
 *   is in flight sends nothing (a ref, so two presses in one tick can't both
 *   get through), and the wait includes the re-read that follows.
 * - **A write's answer is shown at once.** Verification and donation moves
 *   answer with the new record, which the controls switch to immediately;
 *   the page is then read again for everything else on it (the history).
 * - **Stale refusals re-read first.** ILLEGAL_TRANSITION, CONFLICT, a
 *   refused approve and a vanished admin all mean the page is out of date;
 *   it is read again before the message, which then says so.
 * - **A lost answer re-reads before saying anything** (inbox K4-T16's
 *   pattern): the server may have done it, so the control is told whether
 *   the fresh record shows it done, never left to guess.
 *
 * The record shown is the page's (`view`), unless a write or re-read since
 * answered with a newer one. That override is tied to the page record it
 * replaced, so when the page itself re-renders with a newer one, the page's
 * wins and nothing stale lingers.
 */
export function OperatorActionsProvider({
  view: pageView,
  reread,
  client = registryActionsBrowserClient,
  navigate = assignLocation,
  children,
}: {
  view: RegistryShelterView;
  reread: Reread;
  client?: RegistryActionsClient;
  navigate?: (to: string) => void;
  children: ReactNode;
}) {
  const [override, setOverride] = useState<{
    base: RegistryShelterView;
    view: RegistryShelterView;
  } | null>(null);
  const [phase, setPhase] = useState<ActionPhase>({ kind: "idle" });
  const inFlight = useRef(false);
  const pageViewRef = useRef(pageView);
  useLayoutEffect(() => {
    pageViewRef.current = pageView;
  });

  const view = override !== null && override.base === pageView ? override.view : pageView;

  const adopt = useCallback((next: RegistryShelterView) => {
    setOverride({ base: pageViewRef.current, view: next });
  }, []);

  const readAgain = useCallback(async (): Promise<RegistryShelterView | null> => {
    try {
      const fresh = await reread();
      if (fresh !== null) adopt(fresh);
      return fresh;
    } catch {
      return null;
    }
  }, [reread, adopt]);

  const run = useCallback(
    async <T,>(request: ActionRequest<T>): Promise<Settled<T>> => {
      if (inFlight.current) return { kind: "busy" };
      inFlight.current = true;
      setPhase({ kind: "sending", owner: request.owner });
      try {
        let value: T;
        try {
          value = await request.call(client);
        } catch (error) {
          const failure = actionFailureOf(error);
          const rereads = request.rereads ?? true;
          if (failure.kind === "no_answer") {
            if (!rereads) return { kind: "lost", landed: false };
            setPhase({ kind: "checking", owner: request.owner });
            const fresh = await readAgain();
            return { kind: "lost", landed: fresh !== null && request.landed(fresh) };
          }
          if (!rereads || !staleAfter(failure)) {
            return { kind: "refused", failure, reread: "not_needed" };
          }
          const fresh = await readAgain();
          return { kind: "refused", failure, reread: fresh === null ? "failed" : "done" };
        }
        const answered = request.viewOf?.(value);
        if (answered !== undefined) adopt(answered);
        if (request.rereads ?? true) await readAgain();
        return { kind: "ok", value };
      } finally {
        inFlight.current = false;
        setPhase({ kind: "idle" });
      }
    },
    [client, readAgain, adopt],
  );

  const actions = useMemo(() => ({ view, phase, run, navigate }), [view, phase, run, navigate]);
  return (
    <OperatorActionsContext.Provider value={actions}>{children}</OperatorActionsContext.Provider>
  );
}
