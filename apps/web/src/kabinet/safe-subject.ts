const SUBJECT_MAX_CHARACTERS = 200;

/** C0 and C1 controls (CR and LF among them) and the Unicode line and paragraph separators. */
const isBreaking = (char: string): boolean => {
  const code = char.codePointAt(0) ?? 0;
  return code < 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029;
};

/**
 * Applicant text reaches subjects (the shelter's name), so line breaks and control characters are
 * removed before a provider sees them (header injection, §11.3). Bodies are escaped by `emailBody` and the email kit.
 */
export function safeSubject(subject: string): string {
  const cleaned = [...subject].map((char) => (isBreaking(char) ? " " : char)).join("");
  return [...cleaned.replace(/\s+/g, " ").trim()].slice(0, SUBJECT_MAX_CHARACTERS).join("");
}
