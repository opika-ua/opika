import type { Database } from "@opika/db";
import type { LocationPrivacyPolicy } from "@opika/domain";
import type { ShelterWritePolicy } from "./access";
import type { KabinetPrincipal } from "./actor";
import type { InvitationSender } from "./email-senders";
import type { PhotoUploads } from "./photo-uploads";

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
  /** How an invitee hears of an invitation (IN-Q3); its outcome goes back to the operator (IN-E7). */
  invites: InvitationSender;
  /** The origin emailed links point at (`BETTER_AUTH_URL`), the same one the magic link uses. */
  linkBaseURL: string;
  /**
   * `shelterWritePolicyOf(process.env)` on the served route and the `/kabinet`
   * page (KH-Q1, K-Q17); the test-only open policy only in the handler tests.
   */
  shelterWrites: ShelterWritePolicy;
  /** Where `shelter.photos.add` stores, or why it can't on this deployment (P-Q10). */
  photoUploads: PhotoUploads;
};
