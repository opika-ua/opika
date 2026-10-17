import type { ShelterId } from "@opika/domain";
import { envValueOf, paddedValueMessage } from "../api/env-value";

/**
 * `KABINET_WRITE_ALLOWLIST` (K-Q17, Oleksii, verbatim: "K-Q17: (a). Allowlist
 * from PR 2, with the three updates done in PR 2 (validated
 * KABINET_WRITE_ALLOWLIST, commitment #6 register entry +
 * no-self-serve-yet.test.ts made conditional on "no shelter outside the
 * allowlist", one open path for that id). PR 6 deletes all of it. Approved as
 * a temporary mode with that fixed end.").
 *
 * The one shelter id whose admins may write from the kabinet before PR 6
 * opens writes for everyone: his own test shelter, so each K PR can be tried
 * on production. Exactly one, because that is what he approved ("one open
 * path for that id"); a second id would widen a temporary mode past its
 * approval (Tier 1 review, finding 2). Optional: unset means every shelter's
 * writes are refused, exactly as before PR 2.
 *
 * Read strictly, with the repository's one env rule (`envValueOf`): blank is
 * unset, and a value with a space or a line break around it is refused, never
 * trimmed. The value itself is one lowercase UUID with nothing else in it, so
 * a comma (a second id, or an empty one) is refused by name. Lowercase only,
 * because Postgres hands ids back lowercase and the comparison is exact: an
 * uppercase id would be valid and never match, which is a configuration that
 * looks like it works and doesn't.
 *
 * A leaf on purpose, like `env-value.ts`: `build-env.ts` imports it, and
 * `next.config.ts` loads that, so nothing here may pull in a workspace
 * package at runtime (the `ShelterId` import is type-only).
 *
 * **PR 6 deletes this file**, its checks in `build-env.ts` and `env.ts`, and
 * allowlist policy variant in `access.ts`.
 */
export const KABINET_WRITE_ALLOWLIST = "KABINET_WRITE_ALLOWLIST";

/** RFC 9562 versions 1–8 with the RFC variant, lowercase: what `z.uuid()` accepts, minus uppercase. */
const LOWERCASE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type KabinetWriteAllowlist =
  | { readonly kind: "unset" }
  /** One id, never a list: a second id is unrepresentable here, not merely refused. */
  | { readonly kind: "set"; readonly shelterId: ShelterId }
  /** Why, in words that name the variable and never echo its value. */
  | { readonly kind: "invalid"; readonly reason: string };

const invalid = (reason: string): KabinetWriteAllowlist => ({ kind: "invalid", reason });

export function kabinetWriteAllowlistOf(
  env: Readonly<Record<string, string | undefined>>,
): KabinetWriteAllowlist {
  const value = envValueOf(env, KABINET_WRITE_ALLOWLIST);
  if (value.kind === "missing") return { kind: "unset" };
  if (value.kind === "padded") return invalid(paddedValueMessage([KABINET_WRITE_ALLOWLIST]));
  const items = value.value.split(",");
  if (items.length > 1) {
    return invalid(
      `${KABINET_WRITE_ALLOWLIST} holds ${items.length} comma-separated items; ` +
        "it takes exactly one shelter id (K-Q17)",
    );
  }
  if (!LOWERCASE_UUID.test(value.value)) {
    return invalid(
      `${KABINET_WRITE_ALLOWLIST} must be one lowercase shelter UUID, with nothing else in it`,
    );
  }
  return { kind: "set", shelterId: value.value as ShelterId };
}

/**
 * The build and boot check (`assertBuildEnv`, `validateEnv`): a value that is
 * set must be valid, everywhere it is set. Unset is fine anywhere. The served
 * route also fails closed on an invalid value (`shelterWritePolicyOf` refuses
 * every write), so a value changed after the build can't open anything; this
 * check is what makes the mistake loud instead of silent.
 */
export function kabinetWriteAllowlistProblem(
  env: Readonly<Record<string, string | undefined>>,
): string | null {
  const allowlist = kabinetWriteAllowlistOf(env);
  return allowlist.kind === "invalid" ? allowlist.reason : null;
}
