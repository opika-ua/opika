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
 * `RPCLink`'s `url` is relative to the page origin, which is what makes this
 * safe to construct once at module scope: unlike `anonymousRouterClient`'s
 * per-call `AppContext` (built fresh so `now` reads the clock per request),
 * there's no server-side state here to go stale between calls — every call
 * still issues its own `fetch`, through the same `/api/rpc` route and the
 * same per-IP rate limit (`apiRateLimiter`) any other HTTP caller hits.
 */
const link = new RPCLink<Record<never, never>>({ url: "/api/rpc" });

export const feedBrowserClient: ContractRouterClient<typeof browserContract> =
  createORPCClient(link);
