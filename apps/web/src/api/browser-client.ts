import { contract } from "@opika/contracts";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";

/**
 * The subset of the contract a browser may call directly, over HTTP.
 *
 * Same `pick`-not-`omit` reasoning as `server-client.ts`'s
 * `serverComponentRouter`: an explicit list, not `typeof contract` minus
 * what's excluded, so a procedure added to the contract later doesn't
 * become callable from client-side JavaScript by default. `feed.list` is
 * the one procedure a Client Component genuinely needs — the deck
 * (`/tvaryny/gortaty`) fetches and paginates itself, unlike the gallery,
 * which stays server-rendered.
 *
 * This is also the first client-side oRPC caller in the repo. Every other
 * procedure still reaches its handler either through `anonymousRouterClient`
 * (in-process, Server Components) or isn't called from the browser at all
 * yet — deliberately not adding to this list ahead of a phase that needs it,
 * same discipline `server-client.ts` documents for its own trim.
 */
const browserContract = {
  feed: { list: contract.feed.list },
} as const;

/**
 * `url` is a function, not the string `"/api/rpc"` directly — confirmed
 * necessary, not a style preference: oRPC's own encoder does `new URL(url)`
 * with no base, which throws `Invalid URL` on a relative path (a relative
 * string works with `fetch()` itself, but not with the `URL` constructor
 * oRPC builds on top of it). A function defers evaluation to call time,
 * which only happens client-side (`feed.list()` is only ever invoked from
 * an effect or an event handler, never during this module's own SSR
 * evaluation as part of `DeckScreen`'s Client Component bundle) — so
 * `window` is always defined by the time this runs, even though the module
 * itself is also evaluated server-side.
 */
const link = new RPCLink<Record<never, never>>({
  url: () => `${window.location.origin}/api/rpc`,
});

export const feedBrowserClient: ContractRouterClient<typeof browserContract> =
  createORPCClient(link);
