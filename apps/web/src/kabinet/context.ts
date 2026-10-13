import type { Database } from "@opika/db";
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
};
