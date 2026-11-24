import type { ShelterPremises } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { OPERATOR_CONTACT } from "../../../brand";

/**
 * What a shelter reads when its recorded premises lock its city (CITY_LOCKED, D4). Foster homes
 * have no address, so they read the city sentence (owner, 2026-11-24).
 */
export const cityLockedMessage = (premises: ShelterPremises): string =>
  fillTemplate(
    premises.kind === "foster_homes"
      ? uk.kabinet.profileEdit.identity.cityLockedFosterHomes
      : uk.kabinet.profileEdit.identity.cityLocked,
    { email: OPERATOR_CONTACT.email },
  );
