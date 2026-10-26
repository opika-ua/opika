import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { en, uk } from "@opika/i18n";
import { describe, expect, it } from "vitest";
import { SITE_TITLE, TITLE_TEMPLATE, titled, WORDMARK } from "./brand";

/**
 * PR #206 (2026-10-26, earlier the same day) banned both the em dash (U+2014) and the
 * en dash (U+2013) anywhere a user can see one. `docs/standing-constraints.md`'s Code
 * section corrected that the same day (#208): the em dash stays banned everywhere, but
 * the en dash is now the required clause separator - a hyphen is for compound words
 * only. This file's assertions below check the corrected rule: an em dash fails every
 * check; an en dash fails none of them.
 *
 * A verbatim quote of someone's own words, or of an external source, is exempt from the
 * rule and stays character-exact (an em dash in a quote would still fail the catalogue
 * check below, since that check has no way to tell a quote from ordinary copy - there
 * is currently no catalogue value that needs one). That exemption is why this only scans
 * for a dash *outside* a comment in the source-scanned files below (`isCodeLine`), and
 * why the catalogue check below walks actual string values rather than the module's
 * source text, which carries two intentionally preserved verbatim quotes
 * (`packages/i18n/src/messages/uk.ts`) that an em-dash scan of the source itself would
 * wrongly flag.
 *
 * `TITLE_TEMPLATE`'s separator is an en dash - a title-bar/search-result convention, not
 * prose, decided (owner, verbatim) the same day as #208. It was never an exception to
 * the corrected rule, only to #206's superseded one; the test below checks it's
 * *exactly* that en dash, not merely "not a hyphen or em dash", which is why it needed
 * no change when the rest of this file's assertions were fixed to match #208.
 */
const EM_DASH = "—";
const EN_DASH = "–";
const HAS_EM_DASH = /—/u;

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
    .filter(([, line]) => isCodeLine(line) && HAS_EM_DASH.test(line))
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

describe("no em dash anywhere a user can see one (docs/standing-constraints.md's Code section)", () => {
  it("no catalogue value (uk or en) contains an em dash", () => {
    const offending = [...leafStrings(uk, "uk"), ...leafStrings(en, "en")]
      .filter(([, text]) => HAS_EM_DASH.test(text))
      .map(([path]) => path);
    expect(offending).toEqual([]);
  });

  it("brand.ts's WORDMARK and SITE_TITLE contain no em dash - TITLE_TEMPLATE has its own test, below", () => {
    expect(HAS_EM_DASH.test(WORDMARK)).toBe(false);
    expect(HAS_EM_DASH.test(SITE_TITLE)).toBe(false);
  });

  it("TITLE_TEMPLATE's separator is exactly the en dash, never a hyphen or em dash", () => {
    expect(TITLE_TEMPLATE).toBe(`%s ${EN_DASH} ${WORDMARK}`);
    expect(TITLE_TEMPLATE.includes(EM_DASH)).toBe(false);
    expect(TITLE_TEMPLATE.includes("-")).toBe(false);
    expect(titled(SITE_TITLE)).toBe(`${SITE_TITLE} ${EN_DASH} ${WORDMARK}`);
  });

  it("no email template's non-comment source contains an em dash", () => {
    const offending = EMAIL_TEMPLATE_FILES.flatMap((path) => offendingLines(join(REPO, path)));
    expect(offending).toEqual([]);
  });

  it("no metadata/generateMetadata file's non-comment source contains an em dash", () => {
    const files = metadataFiles();
    expect(files.length).toBeGreaterThan(10);
    const offending = files.flatMap((path) => offendingLines(join(REPO, path)));
    expect(offending).toEqual([]);
  });

  it("fails on an em dash, never on an en dash or a hyphen - the assertion is not vacuous", () => {
    expect(HAS_EM_DASH.test(`a${EM_DASH}b`)).toBe(true);
    expect(HAS_EM_DASH.test(`a${EN_DASH}b`)).toBe(false);
    expect(HAS_EM_DASH.test("a-b")).toBe(false);
    expect(isCodeLine("// a — b")).toBe(false);
    expect(isCodeLine('  const x = "a — b";')).toBe(true);
  });
});
