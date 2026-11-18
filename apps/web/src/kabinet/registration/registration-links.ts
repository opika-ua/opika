import { createHash, randomBytes } from "node:crypto";
import type { RegistrationTokenPurpose } from "@opika/db/repos";

/**
 * The confirmation email's two links (spec §11.2): «Підтвердити email» and «Це не я». 256 random
 * bits each; only the SHA-256 is stored. Each opens a page with one button: a GET never acts,
 * because mail scanners open every link (owner, 2026-11-18).
 */
export const REGISTRATION_LINK_PATHS: Record<RegistrationTokenPurpose, string> = {
  confirm_email: "/kabinet/zaiavka/pidtverdyty",
  not_me: "/kabinet/zaiavka/ne-ya",
};

/** As `newRegistrationToken` makes it; anything else is never looked up. */
export const REGISTRATION_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export const newRegistrationToken = (): string => randomBytes(32).toString("base64url");

export const hashRegistrationToken = (token: string): string =>
  createHash("sha256").update(token, "utf8").digest("hex");

export const registrationLinkOf = (
  baseURL: string,
  purpose: RegistrationTokenPurpose,
  token: string,
): string => {
  const url = new URL(REGISTRATION_LINK_PATHS[purpose], baseURL);
  url.searchParams.set("token", token);
  return url.toString();
};
