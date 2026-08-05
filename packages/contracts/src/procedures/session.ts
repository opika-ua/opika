import { oc } from "@orpc/contract";
import { z } from "zod";
import { apiErrors } from "../errors.js";
import { SessionBootstrapViewSchema } from "../views/session.js";

/**
 * Takes no session identifier.
 *
 * The session is carried in a server-issued HttpOnly cookie, so it is never
 * chosen, read, or replayed by client code. An earlier draft accepted a
 * client-supplied `deviceSessionId: z.string().min(1)`, which was the only
 * identity input in the entire surface — meaning a caller could send "1", land
 * on whichever adopter first claimed it, and read their whole reveal history
 * through `reveals.listMine`, including every exact address they had unlocked.
 *
 * That draft also had no way to return the identifier it promised to issue, so
 * a first-time visitor received nothing to persist and every launch created a
 * fresh anonymous adopter. Moving the identifier into a cookie closes both
 * holes at once, because the transport carries it in each direction.
 *
 * Handler obligations, since a contract cannot express them:
 * - Mint at least 128 bits from a CSPRNG. Never derive it from anything the
 *   client sends.
 * - Set HttpOnly, Secure, SameSite=Lax, and a path scoped to the API.
 * - Reject any session identifier the server did not issue, rather than
 *   treating an unknown value as a new session.
 */
export const sessionBootstrapContract = oc
  .input(z.object({}))
  .output(SessionBootstrapViewSchema)
  .errors({
    RATE_LIMITED: apiErrors.RATE_LIMITED,
  });
