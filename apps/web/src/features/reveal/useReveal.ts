"use client";

import type { ContactRevealView } from "@opika/contracts";
import type { AnimalId } from "@opika/domain";
import { isDefinedError, safe } from "@orpc/client";
import { useCallback, useRef, useState } from "react";
import { revealBrowserClient } from "../../api/browser-client";

/**
 * What `ContactRevealDialog` needs to display before the server has
 * answered (or after it's refused to) — the caller's own idea of which
 * animal this is, not derived from the reveal response, since there is no
 * response yet in `"loading"`/`"error"`.
 */
export interface RevealSnapshot {
  animalId: AnimalId;
  animalName: string;
  cityName: string | null;
}

/**
 * `reason` distinguishes `animals.reveal`'s own `RATE_LIMITED` — 30 distinct
 * shelters in 24h, `apps/web/src/api/reveal-rate-limit.ts` — from every
 * other failure, so `ContactRevealDialog` can render the honest, specific
 * copy for it (`uk.errors.rateLimited`) instead of the generic "something
 * failed on our side" every error used to collapse into. A discriminated
 * union, not a boolean, per this repo's own standing rule — `rateLimited`
 * and `loadFailed` are not "the same failure, sometimes flagged," they are
 * different facts a caller needs to render differently (no retry action
 * makes sense for the former).
 */
export type RevealErrorReason = "rateLimited" | "loadFailed";

export type RevealState =
  | { kind: "idle" }
  | ({ kind: "loading" } & RevealSnapshot)
  | ({ kind: "error"; reason: RevealErrorReason } & RevealSnapshot)
  | ({ kind: "open"; reveal: ContactRevealView } & RevealSnapshot);

/**
 * Extracted from `RevealFlow.tsx` (R3, Phase R, `docs/build-plan.md`) so
 * the deck (`SwipeDeck.tsx`) can open the same reveal client the detail
 * page already used, without a second bootstrap-then-reveal
 * implementation to drift out of sync with the first.
 *
 * `open` takes the snapshot per call, not a fixed `animalId` bound once at
 * the hook's own call site: the detail page opens the same animal every
 * time (one `RevealFlow` instance per page, `animalId` never changes), but
 * the deck's `SwipeDeck` is one long-lived component cycling through many
 * different cards — a hook parameterised at mount would need re-mounting
 * (and losing in-flight state) on every swipe just to change which animal
 * it points at. Bundling `animalName`/`cityName` into the snapshot, not
 * kept as separate outer state, rules out one race but not the other:
 * atomic spreading means `state` can never pair one animal's display name
 * with a different animal's `ContactRevealView`, but it does NOT by
 * itself stop a *slower* first response from landing after a *faster*
 * second one and overwriting it — `callGenerationRef` below is what closes
 * that half, discarding any resolution that isn't the most recent call.
 *
 * `ensureSession`, injectable rather than always calling
 * `revealBrowserClient.session.bootstrap` directly: caught on review — the
 * deck already has its own memoised session-bootstrap promise
 * (`use-feed-deck.ts`'s `ensureSession`, shared with `swipes.record`), and
 * this hook calling `session.bootstrap` a second, independent time raced
 * it. Two concurrent cookie-less bootstrap requests can't tell the server
 * they're the same visitor, so both mint — two adopters, two sessions, one
 * surviving cookie, and whichever swipe or reveal landed under the
 * discarded identity silently vanishes. `SwipeDeck.tsx` passes its own
 * `ensureSession` in; `RevealFlow.tsx` (the detail page, with no sibling
 * session consumer to race) omits it and keeps this hook's own default.
 */
export function useReveal(ensureSession?: () => Promise<boolean>) {
  const [state, setState] = useState<RevealState>({ kind: "idle" });
  const callGenerationRef = useRef(0);

  const open = useCallback(
    async (snapshot: RevealSnapshot) => {
      const generation = ++callGenerationRef.current;
      setState({ kind: "loading", ...snapshot });

      const ready = ensureSession
        ? await ensureSession()
        : await safe(revealBrowserClient.session.bootstrap({})).then(([error]) => !error);
      if (generation !== callGenerationRef.current) return;
      if (!ready) {
        /**
         * Always `"loadFailed"`, never `"rateLimited"` — not because
         * `session.bootstrap` can't declare `RATE_LIMITED` in its contract
         * (`packages/contracts/src/procedures/session.ts` says it can), but
         * because the mechanism that actually rate-limits it is the generic
         * per-IP limiter (`apps/web/src/api/rate-limit.ts`), which answers
         * with a raw `new Response("Too Many Requests", { status: 429 })`
         * before oRPC's own handler ever runs
         * (`app/api/rpc/[...rpc]/route.ts`) — never a well-formed, defined
         * oRPC error. `ensureSession`'s own `.then(([error]) => !error)`
         * also discards whatever error object this branch would need to
         * inspect regardless. If `session.bootstrap` ever threw a real
         * `errors.RATE_LIMITED()` from inside its own handler, this branch
         * would need to inspect that error the same way the block below
         * does — it doesn't today because nothing here can produce one.
         */
        setState({ kind: "error", reason: "loadFailed", ...snapshot });
        return;
      }

      const [revealError, result] = await safe(
        revealBrowserClient.animals.reveal({ animalId: snapshot.animalId }),
      );
      if (generation !== callGenerationRef.current) return;
      if (revealError || !result) {
        // Same `isDefinedError` + `error.code` pattern as
        // `use-feed-deck.ts`'s own `INVALID_CURSOR` check — `RATE_LIMITED`
        // is one of `animals.reveal`'s declared contract errors
        // (`packages/contracts/src/procedures/animals.ts`), so a real
        // response carrying it is `isDefinedError() === true`.
        const reason: RevealErrorReason =
          revealError && isDefinedError(revealError) && revealError.code === "RATE_LIMITED"
            ? "rateLimited"
            : "loadFailed";
        setState({ kind: "error", reason, ...snapshot });
        return;
      }
      setState({ kind: "open", ...snapshot, reveal: result });
    },
    [ensureSession],
  );

  const close = useCallback(() => {
    // Bumping the generation here too: an in-flight `open()` whose
    // response arrives after `close()` must not resurrect a dialog the
    // caller already dismissed.
    callGenerationRef.current++;
    setState({ kind: "idle" });
  }, []);

  return { state, open, close };
}
