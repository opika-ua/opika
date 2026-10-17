import { shelterKabinetContract } from "@opika/contracts";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";

/**
 * What K4's editor (`/kabinet`) may call from the browser: the profile
 * procedures, picked, never the whole shelter contract, for the reason
 * `browser-client.ts` gives (a procedure added later isn't callable from
 * client JavaScript by default). The animal and history procedures stay out
 * until a screen calls them from the browser.
 *
 * Same origin, always: the URL is this page's own origin, so the browser
 * sends the site's Origin header and `/api/kabinet`'s Origin check (K-Q8)
 * passes, and the session cookie goes with it (`credentials: "same-origin"`
 * is fetch's default). The access decision, the write policy (K-Q17) and the
 * output stripping all stay on the server; nothing here trims anything.
 *
 * `url` is a function for the reason `browser-client.ts` explains: oRPC builds
 * a `URL` from it, which needs an absolute address, and `window` exists only
 * at call time.
 */
const kabinetProfileBrowserContract = {
  shelter: {
    profile: {
      get: shelterKabinetContract.shelter.profile.get,
      updateContact: shelterKabinetContract.shelter.profile.updateContact,
      updateFreshnessSentence: shelterKabinetContract.shelter.profile.updateFreshnessSentence,
      proposeDonation: shelterKabinetContract.shelter.profile.proposeDonation,
      cancelDonationProposal: shelterKabinetContract.shelter.profile.cancelDonationProposal,
      pause: shelterKabinetContract.shelter.profile.pause,
      resume: shelterKabinetContract.shelter.profile.resume,
    },
  },
} as const;

export type KabinetProfileClient = ContractRouterClient<typeof kabinetProfileBrowserContract>;

const link = new RPCLink<Record<never, never>>({
  url: () => `${window.location.origin}/api/kabinet`,
});

export const kabinetProfileBrowserClient: KabinetProfileClient = createORPCClient(link);
