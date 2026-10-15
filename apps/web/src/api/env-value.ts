/**
 * How every build-checked and boot-checked variable is read (WI-Q1's
 * whitespace note, Oleksii, 2026-10-15: "make the build and startup checks
 * share one rule so a value can't pass one and fail the other").
 *
 * - **Missing**: unset, empty, or whitespace only. A value of spaces is never
 *   a secret anyone meant to set.
 * - **Padded**: a real value with a space or a line break before or after it,
 *   the usual trace of pasting into a dashboard. Refused, never trimmed: the
 *   code that reads these at run time reads them as they are (Vercel sends
 *   `CRON_SECRET` exactly as set; `LOCATION_HMAC_SECRET` has to equal the
 *   onboarding script's byte for byte), so a trimmed check would pass a value
 *   the running code then uses padded.
 * - **Set**: the value, exactly as it is.
 *
 * The build check (`assertBuildEnv`), the boot check (`validateEnv`) and
 * production sign-in's own predicate (`signInConfigOf`) all read through this,
 * so a value one of them accepts, the others accept too.
 *
 * A leaf on purpose: `next.config.ts` loads it through `build-env.ts`.
 */
export type EnvValue = { kind: "missing" } | { kind: "padded" } | { kind: "set"; value: string };

export function envValueOf(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
): EnvValue {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return { kind: "missing" };
  if (raw !== raw.trim()) return { kind: "padded" };
  return { kind: "set", value: raw };
}

/** Names the variable, never its value. */
export const paddedValueMessage = (names: readonly string[]): string =>
  `${names.join(", ")} ${names.length === 1 ? "has" : "have"} a space or a line break before ` +
  "or after the value — set it again in Vercel without one";
