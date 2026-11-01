import type { CommonPasswordList } from "@opika/domain";
import { COMMON_PASSWORDS_TEXT } from "./common-passwords-list";

/**
 * The bundled list as `passwordVerdictOf` asks it (`common-passwords-list.ts`
 * has its source, licence and filtering). Server only (§9 answer 2): the
 * password checks run in the auth hooks, never in a browser, so the list never
 * ships to one; `common-passwords.test.ts` fails if anything else imports it.
 *
 * The set is built on first use, not at module load, so a route that never
 * checks a password never pays for it.
 */
let entries: ReadonlySet<string> | undefined;

export const commonPasswords: CommonPasswordList = {
  has: (folded) => {
    entries ??= new Set(COMMON_PASSWORDS_TEXT.split("\n"));
    return entries.has(folded);
  },
};
