import { COPY_PENDING } from "./messages/uk";

/**
 * Which strings in a catalogue group are still placeholders.
 *
 * Exists because "the copy isn't written yet" is a real state this project
 * passes through — `docs/prytulkam-argument.md` is deliberately structure-
 * first, with the Ukrainian written from it afterwards — and an unwritten
 * string should be *counted*, not discovered when someone reads the live
 * page. Returns key names rather than a boolean so a failure or a report
 * says which ones, not merely how many.
 *
 * Nested groups are not walked: every group this is used on is flat, and a
 * recursive version would return ambiguous bare key names instead of ones a
 * reader can find.
 */
export function pendingCopyKeys(group: Readonly<Record<string, string>>): string[] {
  return Object.entries(group)
    .filter(([, value]) => value.startsWith(COPY_PENDING))
    .map(([key]) => key)
    .sort();
}
