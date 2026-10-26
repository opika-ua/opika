import { COPY_PENDING } from "./messages/uk";

/**
 * Which strings in a catalogue group are still placeholders.
 *
 * Exists because "the copy isn't written yet" is a real state this project
 * passes through - `docs/prytulkam-argument.md` is deliberately structure-
 * first, with the Ukrainian written from it afterwards - and an unwritten
 * string should be *counted*, not discovered when someone reads the live
 * page. Returns key names rather than a boolean so a failure or a report
 * says which ones, not merely how many.
 *
 * Nested groups are not walked: every group this is used on is flat, and a
 * recursive version would return ambiguous bare key names instead of ones a
 * reader can find.
 */
export function pendingCopyKeys(group: Readonly<Record<string, unknown>>): string[] {
  return Object.entries(group)
    .filter(([, value]) => typeof value === "string" && value.startsWith(COPY_PENDING))
    .map(([key]) => key)
    .sort();
}

/**
 * Every placeholder in a nested catalogue group, as dotted paths from
 * `prefix` (`kabinet.email.signIn.subject`), sorted. The recursive companion
 * to `pendingCopyKeys`, for gates that must see a whole subtree at once:
 * production sign-in stays off while any `kabinet.*` string, the email
 * templates included, is still pending (Oleksii, 2026-10-14, answer 7).
 * Full paths, so a failure names exactly where to look.
 */
export function pendingCopyPaths(
  group: Readonly<Record<string, unknown>>,
  prefix: string,
): string[] {
  const found: string[] = [];
  const walk = (node: unknown, path: string) => {
    if (typeof node === "string") {
      if (node.startsWith(COPY_PENDING)) found.push(path);
    } else if (typeof node === "object" && node !== null) {
      for (const [key, value] of Object.entries(node)) walk(value, `${path}.${key}`);
    }
  };
  walk(group, prefix);
  return found.sort();
}
