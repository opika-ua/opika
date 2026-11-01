import { type PasswordVerdict, passwordVerdictOf } from "@opika/domain";
import { WORDMARK } from "../brand";
import { commonPasswords } from "./common-passwords";

/** The person a password is for: their address and their shelter's name. */
export type ShelterPasswordSubject = { email: string; shelterName: string };

/**
 * The policy (`passwordVerdictOf`) with this app's two inputs filled in: the
 * site's name from app config (`WORDMARK`, never a literal in the domain) and
 * the bundled common list. Server only: the auth hooks call it on every
 * password write (reset and change; PW-2's invitation too), and nothing a
 * browser loads imports it (`common-passwords.test.ts`).
 */
export const shelterPasswordVerdictOf = (
  password: string,
  subject: ShelterPasswordSubject,
): PasswordVerdict =>
  passwordVerdictOf(password, { ...subject, siteName: WORDMARK }, commonPasswords);
