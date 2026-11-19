import type { AnchorHTMLAttributes } from "react";
import { type ButtonSize, type ButtonVariant, buttonClass } from "../../ui/Button";
import { cx } from "../../ui/cx";
import { FORGOT_PATH as FORGOT, OPERATOR_HOME, SHELTER_HOME, SIGN_IN_PAGE_PATH } from "./routes";

/** Where a public page may send someone into the kabinet. */
// One line: guard 8 reads a constant's value from its declaration line. `forgot` is the
// registration form's «Відновити пароль»; `operator` is /prytulkam's «До заявок».
// biome-ignore format: guard 8 reads the value from this one line
const KABINET_ENTRIES = { home: SHELTER_HOME, signIn: SIGN_IN_PAGE_PATH, forgot: FORGOT, operator: OPERATOR_HOME } as const;

export type KabinetEntry = keyof typeof KABINET_ENTRIES;

export const kabinetEntryHref = (entry: KabinetEntry): string => KABINET_ENTRIES[entry];

type KabinetEntryLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: KabinetEntry;
  /** The kit's button look, as `LinkButton` draws it; without one, the caller's classes alone. */
  variant?: ButtonVariant;
  size?: ButtonSize;
};

/**
 * The one way from a public page into /kabinet (owner, 2026-11-16): a plain `<a>`, a new document
 * with the kabinet's own headers (strict-origin, no CSP reporting). A next/link would keep the
 * public document, its report-only policy and its referrer policy. `ui-guards.test.ts` guard 8.
 */
export function KabinetEntryLink({
  to,
  variant,
  size,
  className,
  ...props
}: KabinetEntryLinkProps) {
  const look = variant === undefined ? className : cx(buttonClass(variant, size), className);
  return <a href={kabinetEntryHref(to)} className={look} {...props} />;
}
