"use client";

import type { ContactRevealView } from "@opika/contracts";
import type { AnimalId } from "@opika/domain";
import { isDefinedError, safe } from "@orpc/client";
import { useCallback, useRef, useState } from "react";
import { revealBrowserClient } from "../../api/browser-client";
import { isTooManyRequests } from "../../api/too-many-requests";

/**
 * What `ContactRevealDialog` needs to display before the server has
 * answered (or after it's refused to) - the caller's own idea of which
 * animal this is, not derived from the reveal response, since there is no
 * response yet in `"loading"`/`"error"`.
 */
export interface RevealSnapshot {
  animalId: AnimalId;
  animalName: string;
  cityName: string | null;
  /** The bare city for the dialog's header line; absent where `cityName` already is bare. */
  cityLabel?: string | null | undefined;
}

/**
 * `reason` distinguishes `animals.reveal`'s own `RATE_LIMITED` - 30 distinct
 * shelters in 24h, `apps/web/src/api/reveal-rate-limit.ts` - and a genuine
 * network failure, from every other failure, so `ContactRevealDialog` can
 * render the honest, specific copy for each (`uk.errors.rateLimited` /
 * `.offline`) instead of the generic "something failed on our side" every
 * error used to collapse into. A discriminated union, not a boolean, per
 * this repo's own standing rule - these are not "the same failure,
 * sometimes flagged," they are different facts a caller needs to render
 * differently (no retry action makes sense for `rateLimited`).
 *
 * `tooManyRequests` is the other 429: the per-IP limiter's plain refusal, a
 * different fact from the reveal budget. It reads «Забагато запитів…», not
 * «на нашому боці» (audit 2026-10-22, G1).
 */
export type RevealErrorReason =
  | "rateLimited"
  | "tooManyRequests"
  | "shelterPaused"
  | "offline"
  | "loadFailed";

export type RevealState =
  | { kind: "idle" }
  | ({ kind: "loading" } & RevealSnapshot)
  | ({ kind: "error"; reason: RevealErrorReason } & RevealSnapshot)
  | ({ kind: "open"; reveal: ContactRevealView } & RevealSnapshot);

/**
 * Extracted from `RevealFlow.tsx` (R3, Phase R, `docs/build-plan.md`).
 *
 * `open` takes the snapshot per call, not a fixed `animalId` bound once at
 * the hook's own call site. Bundling `animalName`/`cityName` into the
 * snapshot, not kept as separate outer state, means `state` can never pair
 * one animal's display name with a different animal's `ContactRevealView`;
 * `callGenerationRef` below closes the other half, discarding any resolution
 * that isn't the most recent call, so a slower first response cannot land
 * after a faster second one and overwrite it.
 */
export function useReveal() {
  const [state, setState] = useState<RevealState>({ kind: "idle" });
  const callGenerationRef = useRef(0);

  const open = useCallback(async (snapshot: RevealSnapshot) => {
    const generation = ++callGenerationRef.current;
    setState({ kind: "loading", ...snapshot });

    const [bootstrapError] = await safe(revealBrowserClient.session.bootstrap({}));
    const ready = !bootstrapError;
    if (generation !== callGenerationRef.current) return;
    if (!ready) {
      /**
       * A network failure (`TypeError`) is offline. A bootstrap 429 is
       * `tooManyRequests`, never `rateLimited`: both the per-IP API limiter
       * (`api/public-rpc-route.ts`) and the per-IP adopter cap
       * (`perIpBudgetSpent`, `api/per-ip-budgets.ts`) answer with the undefined
       * `TOO_MANY_REQUESTS`, so `isTooManyRequests` catches either.
       */
      const reason: RevealErrorReason =
        bootstrapError instanceof TypeError
          ? "offline"
          : isTooManyRequests(bootstrapError)
            ? "tooManyRequests"
            : "loadFailed";
      setState({ kind: "error", reason, ...snapshot });
      return;
    }

    const [revealError, result] = await safe(
      revealBrowserClient.animals.reveal({ animalId: snapshot.animalId }),
    );
    if (generation !== callGenerationRef.current) return;
    if (revealError || !result) {
      /**
       * `revealError instanceof TypeError` checked first - the same
       * "offline" test: a genuine network failure (the fetch never
       * reached a server at all) is a `TypeError` at the fetch layer, per
       * the Fetch API's own contract, and is neither the app's fault nor
       * the shelter's - `uk.errors.loadFailed`'s "щось не спрацювало на
       * нашому боці" is false for this case specifically. Otherwise `RATE_LIMITED` is one of
       * `animals.reveal`'s
       * declared contract errors (`packages/contracts/src/procedures/
       * animals.ts`), so a real response carrying it is
       * `isDefinedError() === true`.
       */
      const reason: RevealErrorReason =
        revealError instanceof TypeError
          ? "offline"
          : revealError && isDefinedError(revealError) && revealError.code === "RATE_LIMITED"
            ? "rateLimited"
            : revealError && isDefinedError(revealError) && revealError.code === "SHELTER_PAUSED"
              ? "shelterPaused"
              : isTooManyRequests(revealError)
                ? "tooManyRequests"
                : "loadFailed";
      setState({ kind: "error", reason, ...snapshot });
      return;
    }
    setState({ kind: "open", ...snapshot, reveal: result });
  }, []);

  const close = useCallback(() => {
    // Bumping the generation here too: an in-flight `open()` whose
    // response arrives after `close()` must not resurrect a dialog the
    // caller already dismissed.
    callGenerationRef.current++;
    setState({ kind: "idle" });
  }, []);

  return { state, open, close };
}
