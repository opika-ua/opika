import type { Database } from "@opika/db";
import type { LocationPrivacyPolicy } from "@opika/domain";
import type { KabinetPrincipal } from "./actor";

/**
 * What every kabinet request starts with, before access is decided. `now`
 * and `newId` are injected so handlers stay deterministic under test, the
 * same "`now` is a parameter" rule the domain follows.
 */
export type KabinetContext = {
  db: Database;
  now: Date;
  newId: () => string;
  principal: KabinetPrincipal;
  /** `CURSOR_HMAC_SECRET`, injected rather than read in a handler. */
  cursorSecret: string;
  /** The history actor label for the operator (`operatorDisplayName`, RS-Q2). */
  operatorDisplayName: string;
  /**
   * The keyed location policy (`LOCATION_HMAC_SECRET`), or null when the key
   * isn't configured. The route answers 503 to every `registry.*` call then
   * (RG-Q10), so a registry handler never sees null.
   */
  locationPolicy: LocationPrivacyPolicy | null;
  /** Set-Cookie values the route appends to the response (support mode's cookie). */
  setCookies: string[];
  /** The request's Cookie header, for leaving support mode. */
  cookieHeader: string | null;
  /** `__Host-` cookies and Secure only in production. */
  production: boolean;
};
