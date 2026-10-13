import {
  kabinetSessionContract,
  registryAdminsContract,
  registryDonationContract,
  registryHistoryContract,
  registrySheltersContract,
  registrySupportContract,
  registryVerificationContract,
  shelterAnimalsContract,
  shelterHistoryContract,
  shelterProfileContract,
  shelterVerificationContract,
} from "./procedures";

/**
 * The kabinet is two contracts, not one (HS-Q1, Oleksii): `implement(...)`'s
 * router requires every procedure in a contract to be served, and the two
 * surfaces ship in different PRs. Splitting them means each router is
 * complete when it's mounted: no stub ever answers a real route.
 *
 * The shelter's own cabinet. Every procedure takes its `shelterId` from the
 * actor.
 */
export const shelterKabinetContract = {
  shelter: {
    profile: shelterProfileContract,
    verification: shelterVerificationContract,
    animals: shelterAnimalsContract,
    history: shelterHistoryContract,
  },
} as const;

export type ShelterKabinetContract = typeof shelterKabinetContract;

/**
 * The operator's side, plus leaving support mode (the one call a support
 * view makes that isn't a read of the shelter it's viewing). Unserved until
 * the registry PR serves all of it.
 */
export const registryContract = {
  registry: {
    shelters: registrySheltersContract,
    verification: registryVerificationContract,
    donation: registryDonationContract,
    admins: registryAdminsContract,
    history: registryHistoryContract,
    support: registrySupportContract,
  },
  session: kabinetSessionContract,
} as const;

export type RegistryContract = typeof registryContract;
