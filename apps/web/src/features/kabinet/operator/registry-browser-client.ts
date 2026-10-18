import { registryContract } from "@opika/contracts";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";

/**
 * What the operator's pages call from the browser in R-UI 1: the two lists'
 * «Показати ще», picked, never the whole registry contract (a procedure added
 * later isn't callable from client JavaScript by default, `browser-client.ts`'s
 * reason). Writes join in R-UI 3, each picked the same way.
 *
 * Same origin, always, as `api/kabinet-browser-client.ts`: the browser sends
 * the site's Origin (the route's K-Q8 check) and the session cookie, and the
 * access decision, the location-key 503 and the output stripping stay on the
 * server. In this folder, not `api/`, so only the operator's pages bundle it.
 */
const registryReadBrowserContract = {
  registry: {
    shelters: { list: registryContract.registry.shelters.list },
    history: { list: registryContract.registry.history.list },
  },
} as const;

export type RegistryReadClient = ContractRouterClient<typeof registryReadBrowserContract>;

const link = new RPCLink<Record<never, never>>({
  url: () => `${window.location.origin}/api/kabinet`,
});

export const registryReadBrowserClient: RegistryReadClient = createORPCClient(link);
