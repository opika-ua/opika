/** Joins class names, skipping falsy parts. The kit's only class helper. */
export function cx(...parts: ReadonlyArray<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
