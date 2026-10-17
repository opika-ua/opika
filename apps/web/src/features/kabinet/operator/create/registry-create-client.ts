import { registryContract } from "@opika/contracts";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";

/**
 * What S2 (`/kabinet/prytulky/novyi`) may call from the browser: create, and
 * resend from the success state. Picked, never the whole registry contract,
 * for the reason `api/browser-client.ts` gives: a procedure added to the
 * contract later isn't callable from this page's JavaScript by default.
 *
 * Same origin, always, as K4's client (`api/kabinet-browser-client.ts`): the
 * browser sends the site's Origin header, so `/api/kabinet`'s Origin check
 * (K-Q8) passes and the session cookie goes with it. The access decision
 * (super_admin outside support mode only), the per-user limit, the 503
 * without the location key (RG-Q10) and the output parse all stay on the
 * server; nothing here trims or decides anything.
 */
export const registryCreateBrowserContract = {
  registry: {
    shelters: { create: registryContract.registry.shelters.create },
    admins: { resendInvite: registryContract.registry.admins.resendInvite },
  },
} as const;

export type RegistryCreateClient = ContractRouterClient<typeof registryCreateBrowserContract>;
export type RegistryCreateInput = Parameters<
  RegistryCreateClient["registry"]["shelters"]["create"]
>[0];

/** `url` is a function: oRPC needs an absolute address, and `window` exists only at call time. */
const link = new RPCLink<Record<never, never>>({
  url: () => `${window.location.origin}/api/kabinet`,
});

export const registryCreateBrowserClient: RegistryCreateClient = createORPCClient(link);
