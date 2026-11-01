import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Node, SourceFile } from "typescript/unstable/ast";
import { SyntaxKind } from "typescript/unstable/ast";
import {
  isClassDeclaration,
  isClassExpression,
  isIdentifier,
  isImportSpecifier,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isVariableDeclaration,
} from "typescript/unstable/ast/is";
import { describe, expect, it } from "vitest";
import { nodesOf, readParsed } from "../../test/source-ast";
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
    // A cleaned error is never named APIError (F8-F1-D9): Better Auth would answer it as one.
    expect(ERROR_CLASS_NAMES.map((name) => shownBy.cleanedError(errorNamed(name)))).toEqual(
      ERROR_CLASS_NAMES.map((name) => (name === "APIError" ? "Error" : name)),
    );
    expect(plainNames.map((name) => shownBy.maskedLogValue(errorNamed(name)))).toEqual(plainNames);
    expect(plainNames.map((name) => shownBy.logLine(errorNamed(name)))).toEqual(
      plainNames.map((name) => `[kabinet] Better Auth error: API error · ${name}`),
    );
  });

  it("a name that isn't a string gives `Error` through every caller, and never throws", () => {
    const odd: unknown[] = [
      undefined,
      null,
      42,
      { name: "PostgresError" },
      Symbol("PostgresError"),
    ];
    const withName = (name: unknown) => Object.assign(new Error(""), { name }) as Error;
    for (const name of odd) {
      const label = typeof name === "symbol" ? "symbol" : String(name);
      expect([label, errorClassNameOf(withName(name))]).toEqual([label, "Error"]);
      expect([label, shownBy.cleanedError(withName(name))]).toEqual([label, "Error"]);
      expect([label, shownBy.maskedLogValue(withName(name))]).toEqual([label, "Error"]);
      expect([label, shownBy.logLine(withName(name))]).toEqual([
        label,
        "[kabinet] Better Auth error: API error · Error",
      ]);
    }
  });

  it("a name getter or a Proxy that throws gives `Error` through all four callers; its own error never escapes", () => {
    const boom = () => {
      throw new Error("boom olena@example.org");
    };
    const getter = Object.defineProperty(new Error(""), "name", { get: boom });
    const proxy = new Proxy(new Error(""), { get: boom });
    for (const [label, value] of [
      ["getter", getter],
      ["proxy", proxy],
    ] as const) {
      expect([label, errorClassNameOf(value)]).toEqual([label, "Error"]);
      expect([label, shownBy.cleanedError(value)]).toEqual([label, "Error"]);
      expect([label, shownBy.maskedLogValue(value)]).toEqual([label, "Error"]);
      expect([label, shownBy.logLine(value)]).toEqual([
        label,
        "[kabinet] Better Auth error: API error · Error",
      ]);
    }
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

/** The name `expression` (a class's parent) is written as: `Y`, `(Y)` or `errors.Y` give `Y`. */
function writtenName(expression: Node): string {
  if (isParenthesizedExpression(expression)) return writtenName(expression.expression);
  if (isIdentifier(expression)) return expression.text;
  if (isPropertyAccessExpression(expression)) return writtenName(expression.name);
  return "(expression)";
}

/** The name a class can be listed by: its own, the variable it is assigned to, or `default`. */
function classNameOf(node: Node, parent: Node | undefined): string {
  if ((isClassDeclaration(node) || isClassExpression(node)) && node.name !== undefined) {
    return node.name.text;
  }
  if (isClassExpression(node) && parent !== undefined && isVariableDeclaration(parent)) {
    return isIdentifier(parent.name) ? parent.name.text : "(anonymous)";
  }
  const isDefault =
    isClassDeclaration(node) &&
    (node.modifiers ?? []).some((modifier) => modifier.kind === SyntaxKind.DefaultKeyword);
  return isDefault ? "default" : "(anonymous)";
}

/**
 * Every class with a parent in `sourceFile`, read from the compiler's syntax tree (F8-F2, note 5),
 * in each form it can take: `class X extends Y`, with type parameters, as an expression
 * (`const X = class extends Y`), as an anonymous default export (named `default`), or with the
 * parent in parentheses. A parent imported under another name (`APIError as Refusal`) counts as
 * the original; aliases come from import specifiers only, so a cast (`x as Error`) is no alias.
 */
function declarationsOf(sourceFile: SourceFile, path: string): Declaration[] {
  const aliases = new Map<string, string>();
  for (const node of nodesOf(sourceFile)) {
    if (isImportSpecifier(node) && node.propertyName !== undefined) {
      aliases.set(node.name.text, node.propertyName.text);
    }
  }
  const out: Declaration[] = [];
  const visit = (node: Node, parent: Node | undefined) => {
    if (isClassDeclaration(node) || isClassExpression(node)) {
      const extendsClause = (node.heritageClauses ?? []).find(
        (clause) => clause.token === SyntaxKind.ExtendsKeyword,
      );
      const parentType = extendsClause?.types[0];
      if (parentType !== undefined) {
        const written = writtenName(parentType.expression);
        out.push({
          name: classNameOf(node, parent),
          parent: aliases.get(written) ?? written,
          path,
        });
      }
    }
    node.forEachChild((child) => {
      visit(child, node);
    });
  };
  visit(sourceFile, undefined);
  return out;
}

/** The declarations in each of `files` (path → text), parsed in one compiler run. */
const declarationsIn = (files: ReadonlyArray<readonly [string, string]>): Declaration[] =>
  [...readParsed(new Map(files), declarationsOf).values()].flat();

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
  const files: Array<readonly [string, string]> = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(name)) walk(path);
      } else if (CODE.test(name)) {
        files.push([relative(REPO, path).replaceAll("\\", "/"), readFileSync(path, "utf8")]);
      }
    }
  };
  for (const root of ROOTS) walk(join(REPO, root));
  return declarationsIn(files);
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

  it("the detector catches every form a class can take (the review of 73d03fa, finding 4)", () => {
    const forms: Array<readonly [string, string]> = [
      ["generic.ts", ["class", "Generic<T>", "extends", "Error {}"].join(" ")],
      ["expression.ts", ["const Expression =", "class", "extends", "Error {}"].join(" ")],
      ["default.ts", ["export default", "class", "extends", "Error {}"].join(" ")],
      [
        "aliased.ts",
        `import { APIError as Refusal } from "better-auth/api";\n${["class", "Aliased", "extends", "Refusal {}"].join(" ")}`,
      ],
      ["parenthesised.ts", ["class", "Parenthesised", "extends", "(Error) {}"].join(" ")],
    ];
    expect(unlisted(declarationsIn(forms))).toEqual([
      "generic.ts: Generic",
      "expression.ts: Expression",
      "default.ts: default",
      "aliased.ts: Aliased",
      "parenthesised.ts: Parenthesised",
    ]);
  });

  it("the detector: a new class extending Error, or extending a listed or found error, is caught", () => {
    const fresh = declarationsIn([
      ["a.ts", source("ShelterImportError", "Error")],
      ["b.ts", source("RevealRefusal", "APIError")],
      ["c.ts", source("DeeperRefusal", "RevealRefusal")],
      ["d.ts", source("CardView", "Component")],
    ]);
    expect(unlisted(fresh)).toEqual([
      "a.ts: ShelterImportError",
      "b.ts: RevealRefusal",
      "c.ts: DeeperRefusal",
    ]);
  });

  it("a type cast is no alias: `x as Error` beside a new class still finds it (the review of 72b8a3b, note 5)", () => {
    const withCast = `export const wrap = (x: unknown) => (x as Error).message;\n${source(PERSON, "Error")}`;
    expect(unlisted(declarationsIn([["cast.ts", withCast]]))).toEqual([`cast.ts: ${PERSON}`]);
  });

  it("a class written in a string or a comment is no class", () => {
    const text = `export const s = "${source("InString", "Error")}";\n// ${source("InComment", "Error")}`;
    expect(unlisted(declarationsIn([["strings.ts", text]]))).toEqual([]);
  });
});
