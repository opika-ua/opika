import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type AuthLogConsole, maskedLogValue, writeMaskedAuthLine } from "./auth-log";
import { cleanedQueryError } from "./clean-query-errors";
import { ERROR_CLASS_NAMES, errorClassNameOf } from "./error-class-name";

/**
 * F8-F1, note 4: an error's name is shown only from one explicit list. Oleksii, 2026-10-21,
 * verbatim: "(c), an explicit list, which our own classes join by name."
 */

/** A name shaped exactly like a class's, but a person's: on no list. */
const PERSON = "OlenaPetrenkoError";
const errorNamed = (name: string) => Object.assign(new Error(""), { name });

/** Each place a name can be shown: a cleaned error, `maskedLogValue`, and a whole log line. */
const shownBy = {
  cleanedError: (error: Error) => cleanedQueryError(error).name,
  maskedLogValue: (error: Error) => maskedLogValue(error),
  logLine: (error: Error) => {
    const lines: string[] = [];
    const out: AuthLogConsole = {
      error: (line: string) => lines.push(line),
      warn: (line: string) => lines.push(line),
      log: (line: string) => lines.push(line),
    };
    writeMaskedAuthLine(out, "error", "API error", [error]);
    return lines.join("\n");
  },
};

describe("error names come from the explicit list only", () => {
  it(`${PERSON} comes out as Error through all three callers`, () => {
    expect(shownBy.cleanedError(errorNamed(PERSON))).toBe("Error");
    expect(shownBy.maskedLogValue(errorNamed(PERSON))).toBe("Error");
    const line = shownBy.logLine(errorNamed(PERSON));
    expect(line).toBe("[kabinet] Better Auth error: API error · Error");
    expect(line).not.toContain("Olena");
  });

  it("each listed name survives, through all three callers", () => {
    // `APIError` is read by `isAPIError` in the log masking (status and code, not the bare name),
    // so it is checked through the cleaned error and the helper only.
    const plainNames = ERROR_CLASS_NAMES.filter((name) => name !== "APIError");
    expect(ERROR_CLASS_NAMES.map((name) => errorClassNameOf(errorNamed(name)))).toEqual([
      ...ERROR_CLASS_NAMES,
    ]);
    expect(ERROR_CLASS_NAMES.map((name) => shownBy.cleanedError(errorNamed(name)))).toEqual([
      ...ERROR_CLASS_NAMES,
    ]);
    expect(plainNames.map((name) => shownBy.maskedLogValue(errorNamed(name)))).toEqual(plainNames);
    expect(plainNames.map((name) => shownBy.logLine(errorNamed(name)))).toEqual(
      plainNames.map((name) => `[kabinet] Better Auth error: API error · ${name}`),
    );
  });

  it("a value that isn't an Error is `Error`, whatever its name", () => {
    expect(errorClassNameOf({ name: "PostgresError" })).toBe("Error");
    expect(errorClassNameOf("PostgresError")).toBe("Error");
  });
});

const REPO = resolve(fileURLToPath(import.meta.url), "../../../../..");
const ROOTS = ["apps", "packages"];
/** Dependencies and build or test output, none of it our source. */
const SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  ".next",
  "dist",
  "coverage",
  "test-results",
  "playwright-report",
  ".turbo",
]);
const CODE = /\.(?:[cm]?js|tsx?)$/;

type Declaration = { name: string; parent: string; path: string };

/** Every `class X extends Y` in `text`. */
function declarationsIn(path: string, text: string): Declaration[] {
  const pattern = /\bclass\s+([A-Za-z_$][\w$]*)\s+extends\s+([A-Za-z_$][\w$.]*)/g;
  return [...text.matchAll(pattern)].map((match) => ({
    name: match[1] ?? "",
    // `errors.DrizzleError` counts as `DrizzleError`.
    parent: (match[2] ?? "").split(".").at(-1) ?? "",
    path,
  }));
}

/**
 * The error classes among `declarations`: those extending a listed error, or (transitively)
 * another error class declared here.
 */
function errorClassesIn(declarations: readonly Declaration[]): Declaration[] {
  const errorNames = new Set<string>(ERROR_CLASS_NAMES);
  const found = new Map<string, Declaration>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const declaration of declarations) {
      if (!found.has(declaration.name) && errorNames.has(declaration.parent)) {
        found.set(declaration.name, declaration);
        errorNames.add(declaration.name);
        grew = true;
      }
    }
  }
  return [...found.values()];
}

/** The error classes `declarations` hold that are not on the list. */
const unlisted = (declarations: readonly Declaration[]) =>
  errorClassesIn(declarations)
    .filter((declaration) => !(ERROR_CLASS_NAMES as readonly string[]).includes(declaration.name))
    .map((declaration) => `${declaration.path}: ${declaration.name}`);

function ourDeclarations(): Declaration[] {
  const out: Declaration[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(name)) walk(path);
      } else if (CODE.test(name)) {
        const key = relative(REPO, path).replaceAll("\\", "/");
        out.push(...declarationsIn(key, readFileSync(path, "utf8")));
      }
    }
  };
  for (const root of ROOTS) walk(join(REPO, root));
  return out;
}

/** Source text for the detector's own checks, assembled so this file declares no class. */
const source = (name: string, parent: string) =>
  ["class", name, "extends", `${parent} {}`].join(" ");

describe("every error class in apps/ and packages/ is on the list", () => {
  const declarations = ourDeclarations();

  it("finds our own error classes (the scan is not looking at nothing)", () => {
    expect(errorClassesIn(declarations).map((declaration) => declaration.name)).toEqual(
      expect.arrayContaining([
        "CleanedQueryError",
        "ProviderSendError",
        "EmptyRemovalTarget",
        "DemoRemovalDrift",
      ]),
    );
  });

  it("each one is listed by name", () => {
    expect(unlisted(declarations)).toEqual([]);
  });

  it("the detector: a new class extending Error, or extending a listed or found error, is caught", () => {
    const fresh = [
      ...declarationsIn("a.ts", source("ShelterImportError", "Error")),
      ...declarationsIn("b.ts", source("RevealRefusal", "APIError")),
      ...declarationsIn("c.ts", source("DeeperRefusal", "RevealRefusal")),
      ...declarationsIn("d.ts", source("CardView", "Component")),
    ];
    expect(unlisted(fresh)).toEqual([
      "a.ts: ShelterImportError",
      "b.ts: RevealRefusal",
      "c.ts: DeeperRefusal",
    ]);
  });
});
