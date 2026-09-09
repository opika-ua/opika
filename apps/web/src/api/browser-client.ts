import { contract } from "@opika/contracts";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";

/**
 * The subset of the contract the deck (`/tvaryny/gortaty`) may call
 * directly, over HTTP.
 *
 * Same `pick`-not-`omit` reasoning as `server-client.ts`'s
 * `serverComponentRouter`: an explicit list, not `typeof contract` minus
 * what's excluded, so a procedure added to the contract later doesn't
 * become callable from client-side JavaScript by default.
 *
 * `feed.list` fetches and paginates the deck itself, unlike the gallery,
 * which stays server-rendered. `session.bootstrap` + `swipes.record` are
 * R1 (2026-09, Phase R): a skip or a write-intent is recorded against the
 * anonymous session so `feed.list`'s own seen-set exclusion (already
 * built at M2 — `packages/db/src/repos/feed-repo.ts`'s `buildSeenExclusion`,
 * reading `context.adopterId`) actually has something to exclude. Every
 * server-side piece of that exclusion already existed before this row;
 * nothing here duplicates it — `feed.list` above already receives
 * whatever `adopterId` the cookie resolves to on every call, automatically,
 * once one exists.
 */
const browserContract = {
  feed: { list: contract.feed.list },
  session: { bootstrap: contract.session.bootstrap },
  swipes: { record: contract.swipes.record },
} as const;

/**
 * F2's reveal flow, for the server-rendered detail page: `session.bootstrap`
 * (mint-or-return an anonymous session, only ever triggered by the reveal
 * button itself — see `docs/gallery-contract-decisions.md` §5, still true
 * here: nothing on the server-rendered detail page mints or reads a
 * session) and `animals.reveal` (the disclosure itself, session-gated
 * server-side by `context.adopterId`, not by anything this client trims).
 *
 * A second, separate `ContractRouterClient` rather than adding to
 * `browserContract` above: splitting by *use* (the deck vs. the detail
 * page's reveal flow) rather than merging into one grab-bag keeps each
 * file's contract list an honest, narrow record of what that one feature
 * actually calls. `session.bootstrap` appears in both — it's the same
 * idempotent procedure, mint-or-return, called from two different
 * features for two different reasons (R1: to have a session to record a
 * swipe against; here: to have one to reveal against), not a sign the
 * split should collapse.
 */
const revealBrowserContract = {
  session: { bootstrap: contract.session.bootstrap },
  animals: { reveal: contract.animals.reveal },
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

export const revealBrowserClient: ContractRouterClient<typeof revealBrowserContract> =
  createORPCClient(link);
