import type { Database } from "@opika/db";
import { kabinetInviteTokenRepo } from "@opika/db/repos";
import { withQueryErrorsCleaned } from "./clean-query-errors";

/**
 * The invitation link's statements (PW-2: the registry's issue, the page's read, the POST's
 * consume) on the cleaned handle (PW1-F8, `clean-query-errors.ts`). A failed one reaches Next's
 * error log with its name and SQLSTATE only: Drizzle's raw error quotes the statement and its
 * `params:` (the token's hash, the invitation id), and Postgres's own message can quote a value.
 * Every caller goes through here, so none can read or write a link on the raw handle.
 */
export const inviteTokensOf = (db: Database) => kabinetInviteTokenRepo(withQueryErrorsCleaned(db));
