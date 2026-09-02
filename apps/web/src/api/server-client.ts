import type { Database } from "@opika/db";
import { createRouterClient } from "@orpc/server";
import type { AppContext } from "./context";
import { getDb } from "./db";
import { router } from "./router";

/**
 * The subset of the router a Server Component may call, built by `pick`.
 *
 * Not the whole `router`, and not `Omit<typeof router, "session">`, for the
 * same reason public views are picked rather than omitted: an omission is
 * allow-by-default, so a procedure added to the router later would become
 * callable on this path silently.
 *
 * What makes that unsafe here specifically: this path discards `setCookies`.
 * A Server Component cannot write a cookie, so any procedure that queues one
 * would appear to succeed while its Set-Cookie was dropped on the floor.
 * `session.bootstrap` is that procedure today — it inserts an adopter row and
 * a session row *before* queueing the cookie, so calling it from a Server
 * Component would mint an orphan adopter on every render and report success.
 * docs/gallery-contract-decisions.md §5 asserts "nothing on this path mints or
 * reads a session"; leaving it out of this object is what makes that a fact
 * about the type rather than a convention someone has to remember.
 *
 * Read-only by construction as a consequence: `animals.reveal` and
 * `swipes.record` both need an `adopterId` this path never has, so neither
 * belongs here either.
 *
 * Trimmed to what a real Server Component actually calls today — `cities.list`
 * (the home screen), `gallery.list` (the E1 grid), `gallery.relaxationCounts`
 * (V2's no-match state, `apps/web/src/features/gallery/NoMatch.tsx`),
 * `animals.byId` and `shelters.byId` (F1's detail page, both read-only with
 * no `adopterId` involved) — not to what a later phase will eventually want.
 * `feed.list` was added ahead of Phase F needing it and stayed unused on
 * this path; that is exactly the premature scaffolding `CLAUDE.md`'s
 * phase-scope-discipline section warns against — E5 ended up giving the
 * deck its own client-side caller instead
 * (`apps/web/src/api/browser-client.ts`), since deck pagination is
 * inherently client-driven. `animals.byId`/`shelters.byId` land here
 * instead, in the same commit that starts calling them, because the detail
 * page genuinely is server-rendered.
 *
 * `relaxationCounts` is safe on this path for the same reason `gallery.list`
 * is: read-only, filters-only input, no `adopterId` or cookie involved.
 * `animals.byId`/`shelters.byId` are the same shape of safe: public
 * projections, no `adopterId` read or written. `animals.reveal` is not
 * here and must not be — it needs a real `adopterId` this path never has
 * (see `apps/web/src/api/browser-client.ts` for where the reveal flow's
 * client-side caller lives).
 */
const serverComponentRouter = {
  cities: { list: router.cities.list },
  gallery: { list: router.gallery.list, relaxationCounts: router.gallery.relaxationCounts },
  animals: { byId: router.animals.byId },
  shelters: { byId: router.shelters.byId },
} as const;

/**
 * In-process router client for Server Components — no HTTP hop, but every
 * procedure still runs through `implement(contract)`'s output-schema
 * validation and stripping, because these are the same procedure objects the
 * HTTP route serves. See docs/gallery-contract-decisions.md §5 for the full
 * argument — this mechanism was decided for the gallery, and `gallery.list`
 * below is its first real use.
 *
 * Anonymous only: no adopterId or tokenHash, since nothing calling this way
 * carries a session — there's no cookie to read and none can be written back.
 * A caller that needs a real adopter session belongs on the HTTP path.
 *
 * The context is a factory, not a value, because oRPC resolves it per call.
 * `now` therefore reads the clock at the moment the procedure runs, matching
 * the HTTP route's per-request read. A captured `new Date()` would be frozen
 * for the lifetime of the client, which is invisible while every caller
 * builds one per request and silently wrong the first time someone hoists a
 * client to module scope.
 *
 * `db` is a parameter, defaulting to the memoised production connection, so a
 * test can inject the ephemeral database `createTestHarness` sets up instead
 * of either sharing `getDb`'s process-wide singleton or duplicating this
 * function's context-building just to exercise it.
 */
export function anonymousRouterClient(db: Database = getDb()) {
  return createRouterClient(serverComponentRouter, {
    context: (): AppContext => ({
      db,
      adopterId: null,
      tokenHash: null,
      now: new Date(),
      setCookies: [],
    }),
  });
}
