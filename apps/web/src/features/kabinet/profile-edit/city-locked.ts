import { fillTemplate, uk } from "@opika/i18n";
import { SITE_ORIGIN } from "../../../brand";

/** The operator's mailbox on the site's own domain; the shared config replaces it at integration. */
const OPERATOR_EMAIL = `hello@${new URL(SITE_ORIGIN).host}`;

/** What a shelter reads when its city is locked by a verified address (CITY_LOCKED). */
export const cityLockedMessage = (): string =>
  fillTemplate(uk.kabinet.profileEdit.identity.cityLocked, { email: OPERATOR_EMAIL });
