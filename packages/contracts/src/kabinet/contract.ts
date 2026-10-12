import {
  kabinetSessionContract,
  registryAdminsContract,
  registryDonationContract,
  registryHistoryContract,
  registrySheltersContract,
  registrySupportContract,
  registryVerificationContract,
  shelterAnimalsContract,
  shelterProfileContract,
  shelterVerificationContract,
} from "./procedures";

/**
 * The kabinet's surface (H2 S3), kept apart from `contract` until its handlers
 * exist: `implement(contract)`'s router requires every procedure to be served,
 * so merging these now would break the adopter app's build over procedures
 * nobody serves yet. The handlers slice merges them.
 */
export const kabinetContract = {
  shelter: {
    profile: shelterProfileContract,
    verification: shelterVerificationContract,
    animals: shelterAnimalsContract,
  },
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

export type KabinetContract = typeof kabinetContract;
