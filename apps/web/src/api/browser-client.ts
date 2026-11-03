import type { contract } from "@opika/contracts";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";

/**
 * F2's reveal flow: `session.bootstrap` (mint-or-return an anonymous
 * session, only ever triggered by a reveal itself - see
 * `docs/gallery-contract-decisions.md` §5, still true for the
 * server-rendered detail page: nothing there mints or reads a session on
 * its own) and `animals.reveal` (the disclosure itself, session-gated
 * server-side by `context.adopterId`, not by anything this client trims).
 * An explicit list, not `typeof contract` minus what is excluded, so a
 * procedure added to the contract later is not callable from the browser by default. Types only:
 * `createORPCClient` needs no runtime contract, and importing it would ship zod to the browser.
 */
type RevealBrowserContract = {
  session: { bootstrap: typeof contract.session.bootstrap };
  animals: { reveal: typeof contract.animals.reveal };
};

/**
 * S8, the saved page. Its own link, not `link` below: DR1-Q2's spec is
 * `credentials: 'omit'` specifically for this one call - the saved list is
 * never tied to a session, so sending the cookie would be pointless at best
 * and, since the server's shared route handler calls `validateSession` on
 * whatever cookie header it receives, an unnecessary session lookup at
 * worst. `revealBrowserClient` must keep the browser's default (same-origin)
 * credentials - a reveal depends on the cookie reaching the server.
 */
type SavedBrowserContract = {
  animals: { cardsByIds: typeof contract.animals.cardsByIds };
};

/**
 * `url` is a function, not the string `"/api/rpc"` directly - confirmed
 * necessary, not a style preference: oRPC's own encoder does `new URL(url)`
 * with no base, which throws `Invalid URL` on a relative path (a relative
 * string works with `fetch()` itself, but not with the `URL` constructor
 * oRPC builds on top of it). A function defers evaluation to call time,
 * which only happens client-side (a call is only ever made from an effect
 * or an event handler, never during this module's own SSR evaluation) - so
 * `window` is always defined by the time this runs, even though the module
 * itself is also evaluated server-side.
 */
const link = new RPCLink<Record<never, never>>({
  url: () => `${window.location.origin}/api/rpc`,
});

/** `credentials: "omit"` - see `SavedBrowserContract`'s own comment above. */
const savedLink = new RPCLink<Record<never, never>>({
  url: () => `${window.location.origin}/api/rpc`,
  fetch: (request, init) => fetch(request, { ...init, credentials: "omit" }),
});

export const revealBrowserClient: ContractRouterClient<RevealBrowserContract> =
  createORPCClient(link);

export const savedBrowserClient: ContractRouterClient<SavedBrowserContract> =
  createORPCClient(savedLink);
