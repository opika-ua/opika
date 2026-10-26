import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { en, uk } from "@opika/i18n";
import { describe, expect, it } from "vitest";
import { SITE_TITLE, TITLE_TEMPLATE, titled, WORDMARK } from "./brand";

/**
 * Owner's dash rule, 2026-10-26 (`docs/standing-constraints.md`): no em dash (U+2014)
 * and no en dash (U+2013) anywhere a user can see one - UI copy, metadata, email. A
 * verbatim quote of someone's own words, or of an external source, is exempt and stays
 * character-exact - that's why this only scans for a dash *outside* a comment in the
 * source-scanned files below (`isCodeLine`), and why the catalogue check below walks
 * actual string values rather than the module's source text, which still carries two
 * intentionally preserved verbatim quotes (`packages/i18n/src/messages/uk.ts`).
 *
 * `TITLE_TEMPLATE`'s separator is an en dash on purpose - a title-bar/search-result
 * convention, not prose. The test below checks it's *exactly* that en dash, not merely
 * "not a hyphen or em dash". **Not a named exception to the rule above, an instance of
 * it** - #208 (`docs/standing-constraints.md`'s Code section, same day, later) corrected
 * the general rule to make en dash the clause separator, superseding the "hyphen
 * everywhere, ban en dash" wording this file's other assertions below were written
 * against. Those other assertions are therefore known-wrong pending a follow-up PR (see
 * that doc); this one - the exact-character check on `TITLE_TEMPLATE` - already asserts
 * the corrected behaviour and needs no change.
 */
const EM_DASH = "—";
const EN_DASH = "–";
const HAS_EM_OR_EN_DASH = /[—–]/u;

function leafStrings(value: unknown, path: string): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    leafStrings(child, path ? `${path}.${key}` : key),
  );
}

const REPO = resolve(fileURLToPath(import.meta.url), "../../../..");

/** A comment line carries no live copy - the written rule, not this test, governs it. */
function isCodeLine(line: string): boolean {
  const trimmed = line.trim();
  return !(trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*"));
}

function offendingLines(absolutePath: string): string[] {
  const relativePath = relative(REPO, absolutePath).replaceAll("\\", "/");
  const text = readFileSync(absolutePath, "utf8");
  return text
    .split("\n")
    .map((line, index): [number, string] => [index + 1, line])
    .filter(([, line]) => isCodeLine(line) && HAS_EM_OR_EN_DASH.test(line))
    .map(([lineNumber]) => `${relativePath}:${lineNumber}`);
}

const EMAIL_TEMPLATE_FILES = [
  "apps/web/src/kabinet/email-message.ts",
  "apps/web/src/kabinet/email-senders.ts",
  "apps/web/src/kabinet/invitation-reminder.ts",
  "apps/web/src/kabinet/magic-link-sender.ts",
  "apps/web/src/kabinet/password-mail.ts",
  "apps/web/src/kabinet/production-mail.ts",
  "apps/web/src/kabinet/email-links.ts",
];

/** Every file under `apps/web/src/app` that defines page metadata. */
function metadataFiles(): string[] {
  const appDir = join(REPO, "apps/web/src/app");
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        walk(path);
      } else if (
        /\.tsx?$/.test(name) &&
        !name.endsWith(".test.ts") &&
        !name.endsWith(".test.tsx")
      ) {
        const text = readFileSync(path, "utf8");
        if (text.includes("generateMetadata") || text.includes("export const metadata")) {
          out.push(relative(REPO, path).replaceAll("\\", "/"));
        }
      }
    }
  };
  walk(appDir);
  return out;
}

describe("no em dash or en dash anywhere a user can see one (owner's rule, 2026-10-26)", () => {
  it("no catalogue value (uk or en) contains an em or en dash", () => {
    const offending = [...leafStrings(uk, "uk"), ...leafStrings(en, "en")]
      .filter(([, text]) => HAS_EM_OR_EN_DASH.test(text))
      .map(([path]) => path);
    expect(offending).toEqual([]);
  });

  it("brand.ts's title strings contain no em or en dash, except the title template's separator", () => {
    expect(HAS_EM_OR_EN_DASH.test(WORDMARK)).toBe(false);
    expect(HAS_EM_OR_EN_DASH.test(SITE_TITLE)).toBe(false);
  });

  it("TITLE_TEMPLATE's separator is exactly the en dash, never a hyphen or em dash", () => {
    expect(TITLE_TEMPLATE).toBe(`%s ${EN_DASH} ${WORDMARK}`);
    expect(TITLE_TEMPLATE.includes(EM_DASH)).toBe(false);
    expect(TITLE_TEMPLATE.includes("-")).toBe(false);
    expect(titled(SITE_TITLE)).toBe(`${SITE_TITLE} ${EN_DASH} ${WORDMARK}`);
  });

  it("no email template's non-comment source contains an em or en dash", () => {
    const offending = EMAIL_TEMPLATE_FILES.flatMap((path) => offendingLines(join(REPO, path)));
    expect(offending).toEqual([]);
  });

  it("no metadata/generateMetadata file's non-comment source contains an em or en dash", () => {
    const files = metadataFiles();
    expect(files.length).toBeGreaterThan(10);
    const offending = files.flatMap((path) => offendingLines(join(REPO, path)));
    expect(offending).toEqual([]);
  });

  it("would fail on either character - the assertion is not vacuous", () => {
    expect(HAS_EM_OR_EN_DASH.test(`a${EM_DASH}b`)).toBe(true);
    expect(HAS_EM_OR_EN_DASH.test(`a${EN_DASH}b`)).toBe(true);
    expect(HAS_EM_OR_EN_DASH.test("a-b")).toBe(false);
    expect(isCodeLine("// a — b")).toBe(false);
    expect(isCodeLine('  const x = "a — b";')).toBe(true);
  });
});
