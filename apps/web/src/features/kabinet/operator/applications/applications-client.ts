import { registryContract } from "@opika/contracts";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";

const { applications, donation } = registryContract.registry;

/**
 * What the «Заявки» block may call from the browser: the two queue decisions and the existing
 * donation decisions, picked, never the whole registry (as `registry-actions-client.ts` does). Each
 * is the contract's own object, so each keeps its `registry` access meta: operator only.
 */
export const applicationsBrowserContract = {
  registry: {
    applications: { accept: applications.accept, reject: applications.reject },
    donation: { approve: donation.approve, reject: donation.reject },
  },
} as const;

export type ApplicationsClient = ContractRouterClient<typeof applicationsBrowserContract>;

const link = new RPCLink<Record<never, never>>({
  url: () => `${window.location.origin}/api/kabinet`,
});

export const applicationsBrowserClient: ApplicationsClient = createORPCClient(link);
