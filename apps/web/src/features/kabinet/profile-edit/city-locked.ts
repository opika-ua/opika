import { fillTemplate, uk } from "@opika/i18n";
import { OPERATOR_CONTACT } from "../../../brand";

/** What a shelter reads when its city is locked by a verified address (CITY_LOCKED). */
export const cityLockedMessage = (): string =>
  fillTemplate(uk.kabinet.profileEdit.identity.cityLocked, { email: OPERATOR_CONTACT.email });
