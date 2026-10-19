import { shelterKabinetContract } from "@opika/contracts";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import { type UploadProgress, xhrFetch } from "./xhr-fetch";

/**
 * What K4's editor (`/kabinet`) may call from the browser: the profile
 * procedures, picked, never the whole shelter contract, for the reason
 * `browser-client.ts` gives (a procedure added later isn't callable from
 * client JavaScript by default). K3's animal form has its own picked client
 * below; the history procedures stay out until a screen calls them from the
 * browser.
 *
 * Same origin, always: the URL is this page's own origin, so the browser
 * sends the site's Origin header and `/api/kabinet`'s Origin check (K-Q8)
 * passes, and the session cookie goes with it (`credentials: "same-origin"`
 * is fetch's default). The access decision, the write policy and the
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

/**
 * What K3's animal form (`/kabinet/tvaryny/*`) may call from the browser,
 * picked for the same reason as the profile's: reading one animal, creating
 * a draft, saving, publishing, and the three photo procedures. Nothing else
 * of the shelter contract is callable from this client.
 */
const kabinetAnimalBrowserContract = {
  shelter: {
    animals: {
      byId: shelterKabinetContract.shelter.animals.byId,
      createDraft: shelterKabinetContract.shelter.animals.createDraft,
      update: shelterKabinetContract.shelter.animals.update,
      transition: shelterKabinetContract.shelter.animals.transition,
    },
    photos: {
      add: shelterKabinetContract.shelter.photos.add,
      reorder: shelterKabinetContract.shelter.photos.reorder,
      remove: shelterKabinetContract.shelter.photos.remove,
    },
  },
} as const;

/**
 * Per call: an upload passes `onUploadProgress` and travels over
 * `XMLHttpRequest` (`xhrFetch`), which can report how much has been sent;
 * every other call uses `fetch`, as the profile's client does.
 */
export type KabinetAnimalClientContext = {
  onUploadProgress?: (progress: UploadProgress) => void;
};

export type KabinetAnimalClient = ContractRouterClient<
  typeof kabinetAnimalBrowserContract,
  KabinetAnimalClientContext
>;

const animalLink = new RPCLink<KabinetAnimalClientContext>({
  url: () => `${window.location.origin}/api/kabinet`,
  fetch: (request, init, options) => {
    const onProgress = options.context.onUploadProgress;
    return onProgress === undefined ? fetch(request, init) : xhrFetch(request, onProgress);
  },
});

export const kabinetAnimalBrowserClient: KabinetAnimalClient = createORPCClient(animalLink);

/**
 * What K2's list (`/kabinet/tvaryny`) may call from the browser, picked like
 * the others: the list itself (filters, «Показати ще», the counts after a
 * move), one animal (the re-read after a lost answer, K4-T16's pattern), the
 * listing moves, «Ще шукає» and its undo, deleting a draft, and resuming
 * intake from the paused banner (N18). Nothing else of the shelter contract.
 */
const kabinetAnimalListBrowserContract = {
  shelter: {
    animals: {
      list: shelterKabinetContract.shelter.animals.list,
      byId: shelterKabinetContract.shelter.animals.byId,
      transition: shelterKabinetContract.shelter.animals.transition,
      confirm: shelterKabinetContract.shelter.animals.confirm,
      undoConfirm: shelterKabinetContract.shelter.animals.undoConfirm,
      deleteDraft: shelterKabinetContract.shelter.animals.deleteDraft,
    },
    profile: {
      resume: shelterKabinetContract.shelter.profile.resume,
    },
  },
} as const;

export type KabinetAnimalListClient = ContractRouterClient<typeof kabinetAnimalListBrowserContract>;

export const kabinetAnimalListBrowserClient: KabinetAnimalListClient = createORPCClient(link);
