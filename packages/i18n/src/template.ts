/**
 * Fills a catalogue string's `{slot}`s. The catalogue isn't ICU (next-intl
 * isn't wired until H3), so every slot is filled here, in one pass:
 *
 * - **Slot names are ASCII letters only** (`{time}`, `{max}`, `{token}`). The
 *   kabinet copy also carries literal Cyrillic braces the shelter types,
 *   `{імʼя}` and `{дата}` (`kabinet.profileEdit.errors.*`), which can never
 *   match a slot, so no value can be substituted into them.
 * - **One pass, with a function replacer.** A filled value is never scanned
 *   again, so a `{token}` value the shelter typed as «{max}» stays as typed,
 *   and `$&` in a value is inserted literally, not read as a pattern.
 * - A slot with no value is left as written, so a missing value shows up as a
 *   visible `{slot}` in a test rather than as silently empty text.
 */
const SLOT = /\{([A-Za-z]+)\}/g;

export function fillTemplate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(SLOT, (whole, name: string) =>
    Object.hasOwn(values, name) ? (values[name] as string) : whole,
  );
}
