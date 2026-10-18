import { registryContract } from "@opika/contracts";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";

const { verification, donation, admins, support } = registryContract.registry;

/**
 * What S4's action controls may call from the browser: the registry writes
 * R-UI 3 needs, picked, never the whole registry contract, for the reason
 * `api/kabinet-browser-client.ts` gives (a procedure added to the contract
 * later is not callable from client JavaScript by default).
 *
 * No read is here. S4 reads on the server, through the page's own guard
 * (r-ui-plan §4: "each page guards itself"), and a control that needs the
 * record again asks the page to re-render (`use-router-reread.ts`) rather
 * than fetching it from the browser. `shelters.create` and the edit forms
 * belong to R-UI 2 and R-UI 4, and `support.enter`'s counterpart
 * (`session.exitSupport`) is the support banner's.
 *
 * Every procedure here is the contract's own object, so each keeps its
 * `registry` access meta: the served route refuses it to anyone but a
 * super_admin (`kabinet-registry-access.test.ts`, all nineteen). Same origin,
 * so the Origin check and the per-user limit of `/api/kabinet` apply as they
 * do to K4's editor.
 */
export const registryActionsBrowserContract = {
  registry: {
    verification: {
      startReview: verification.startReview,
      approve: verification.approve,
      reject: verification.reject,
      suspend: verification.suspend,
      reinstate: verification.reinstate,
      resubmit: verification.resubmit,
    },
    donation: {
      approve: donation.approve,
      reject: donation.reject,
    },
    admins: {
      invite: admins.invite,
      resendInvite: admins.resendInvite,
      remove: admins.remove,
    },
    support: {
      enter: support.enter,
    },
  },
} as const;

export type RegistryActionsClient = ContractRouterClient<typeof registryActionsBrowserContract>;

const link = new RPCLink<Record<never, never>>({
  url: () => `${window.location.origin}/api/kabinet`,
});

export const registryActionsBrowserClient: RegistryActionsClient = createORPCClient(link);
