import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The registration form's signed render time (§11.3): `issuedAt.HMAC(issuedAt)`, rendered by the
 * server, so the minimum fill time is measured on the server's clock and a bot can't forge it.
 */

/** A person types seven fields; a script posts at once. */
export const MIN_FILL_MS = 3_000;
/** A stamp a bot saved once can't be replayed forever. */
export const MAX_STAMP_AGE_MS = 24 * 60 * 60 * 1000;
/** The label the stamp's key is derived under (`derivedSecretKey`). */
export const FORM_STAMP_KEY_LABEL = "registration-form-stamp";

const STAMP = /^(\d{13})\.([A-Za-z0-9_-]{43})$/;

const signatureOf = (issuedAt: number, key: string): string =>
  createHmac("sha256", key).update(`registration:${issuedAt}`, "utf8").digest("base64url");

export const issueFormStamp = (issuedAt: Date, key: string): string =>
  `${issuedAt.getTime()}.${signatureOf(issuedAt.getTime(), key)}`;

export type FormStampVerdict =
  | { kind: "ok"; issuedAt: Date }
  | { kind: "too_fast"; issuedAt: Date }
  | { kind: "invalid" };

export function formStampVerdictOf(stamp: string, key: string, now: Date): FormStampVerdict {
  const match = STAMP.exec(stamp);
  if (match === null) return { kind: "invalid" };
  const issuedAt = Number(match[1]);
  const given = Buffer.from(match[2] ?? "", "utf8");
  const expected = Buffer.from(signatureOf(issuedAt, key), "utf8");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { kind: "invalid" };
  }
  const age = now.getTime() - issuedAt;
  // A stamp from the future was not issued by this clock.
  if (age < 0 || age > MAX_STAMP_AGE_MS) return { kind: "invalid" };
  return age < MIN_FILL_MS
    ? { kind: "too_fast", issuedAt: new Date(issuedAt) }
    : { kind: "ok", issuedAt: new Date(issuedAt) };
}
