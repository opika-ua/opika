import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * CG-Q1 (Oleksii, verbatim: "Only one folder can read that namespace
 * (source-scan test), and it mounts only when the server allows the
 * signed-in shelter to write through the allowlist."). The namespace is
 * `uk.kabinet.testShelterOnly`, the one place a string may stay
 * `[COPY PENDING]` with production sign-in on.
 *
 * Scanned like `no-self-serve-yet.test.ts`: every non-test source file that
 * names `testShelterOnly` at all (a property read, a computed key, a
 * destructuring, a path string) must be one of:
 *
 * - a file in `apps/web/src/features/kabinet/test-shelter-only/`, the folder;
 * - the two catalogues that define it (`uk.ts`, `en.ts`);
 * - `production-sign-in.ts`, which names it only as the path prefix the
 *   sign-in gate exempts, and renders nothing.
 *
 * Generic walkers of the whole catalogue (`pendingCopyPaths`) don't name it
 * and render nothing, so they are not reads in this sense.
 */
const REPO = resolve(fileURLToPath(import.meta.url), "../../../../..");
const FOLDER = "apps/web/src/features/kabinet/test-shelter-only/";
const ALSO_ALLOWED = [
  "packages/i18n/src/messages/uk.ts",
  "packages/i18n/src/messages/en.ts",
  "apps/web/src/kabinet/production-sign-in.ts",
];
const NAME = /testShelterOnly/;

type Source = { path: string; text: string };

function sources(): Source[] {
  const out: Source[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        if (name !== "node_modules") walk(path);
      } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
        out.push({
          path: relative(REPO, path).replaceAll("\\", "/"),
          text: readFileSync(path, "utf8"),
        });
      }
    }
  };
  for (const root of ["apps/web/src", "packages"]) walk(join(REPO, root));
  return out;
}

const offenders = (files: readonly Source[]) =>
  files
    .filter((file) => NAME.test(file.text))
    .map((file) => file.path)
    .filter((path) => !path.startsWith(FOLDER) && !ALSO_ALLOWED.includes(path));

describe("only test-shelter-only/ reads kabinet.testShelterOnly (CG-Q1)", () => {
  const files = sources();

  it("sanity: the scan sees the folder, the catalogue, the gate and the profile page", () => {
    const paths = files.map((file) => file.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        `${FOLDER}AllowlistedShelterArea.tsx`,
        "packages/i18n/src/messages/uk.ts",
        "apps/web/src/kabinet/production-sign-in.ts",
        "apps/web/src/features/kabinet/ShelterProfile.tsx",
      ]),
    );
    // The folder itself does read it, so an empty match can't pass.
    expect(
      files.filter((file) => file.path.startsWith(FOLDER) && NAME.test(file.text)),
    ).not.toEqual([]);
  });

  it("no file outside the folder names it", () => {
    expect(offenders(files)).toEqual([]);
  });

  it("catches a property read, a computed key and a destructuring", () => {
    expect(
      offenders([
        { path: "apps/web/src/features/kabinet/A.tsx", text: "uk.kabinet.testShelterOnly.k3" },
        { path: "apps/web/src/features/kabinet/B.tsx", text: 'uk.kabinet["testShelterOnly"]' },
        { path: "apps/web/src/features/kabinet/C.tsx", text: "const { testShelterOnly } = k;" },
        { path: `${FOLDER}D.tsx`, text: "uk.kabinet.testShelterOnly" },
      ]),
    ).toEqual([
      "apps/web/src/features/kabinet/A.tsx",
      "apps/web/src/features/kabinet/B.tsx",
      "apps/web/src/features/kabinet/C.tsx",
    ]);
  });
});

/**
 * Review finding 3: the name scan above can't see who mounts the folder. A
 * public page could import `AllowlistedShelterArea` without naming the
 * namespace, and the only tests to notice were the live-catalogue ones, which
 * the first PR to use the namespace has to loosen. So the folder has exactly
 * the importers listed here, each of which mounts it only on an allowlist
 * write grant to the shelter's own admin (CG-Q1: "it mounts only when the
 * server allows the signed-in shelter to write through the allowlist"):
 *
 * - `ShelterProfile.tsx` (K4, PR 2);
 * - `animal-form/AnimalForm.tsx` (K3, PR 4), the form his K3 lines belong
 *   to, with its mount condition tested in `AnimalForm.test.tsx` ("mounts
 *   the test-shelter lines only for the allowlisted shelter's own admin").
 *
 * A new importer is a change to this list, which a reviewer sees, with its
 * own mount test.
 *
 * Any module specifier that reaches into the folder counts (a static import, a
 * re-export, a dynamic `import()`, a `require`), and so does the entry's name
 * in code, so a barrel re-exporting it is caught too. Comments are dropped
 * first: a doc line pointing at the folder is not an import.
 */
const MOUNTED_BY = [
  "apps/web/src/features/kabinet/ShelterProfile.tsx",
  "apps/web/src/features/kabinet/animal-form/AnimalForm.tsx",
];
const INTO_FOLDER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["'`][^"'`]*test-shelter-only\/?[^"'`]*["'`]/;
const ENTRY = /\b(AllowlistedShelterArea|DateUnchangedLine|LastPhotoKeptHiddenText)\b/;

const withoutComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const importersOutsideFolder = (files: readonly Source[]) =>
  files
    .filter((file) => !file.path.startsWith(FOLDER))
    .filter((file) => {
      const code = withoutComments(file.text);
      return INTO_FOLDER.test(code) || ENTRY.test(code);
    })
    .map((file) => file.path);

describe("only the listed screens import test-shelter-only/ (CG-Q1, review finding 3)", () => {
  const files = sources();

  it("the folder's importers outside itself are the profile page and the animal form", () => {
    expect(importersOutsideFolder(files).sort()).toEqual([...MOUNTED_BY].sort());
  });

  it("catches a static import, a re-export, a dynamic import, a require and the entry's name", () => {
    const page = "apps/web/src/features/animal-detail/AnimalDetailScreen.tsx";
    expect(
      importersOutsideFolder([
        { path: `${page}.1`, text: 'import { AllowlistedShelterArea as A } from "../x";' },
        { path: `${page}.2`, text: 'import X from "../kabinet/test-shelter-only/Other";' },
        { path: `${page}.3`, text: 'export * from "@/features/kabinet/test-shelter-only";' },
        { path: `${page}.4`, text: 'const m = await import("../kabinet/test-shelter-only/A");' },
        { path: `${page}.5`, text: 'const m = require("../kabinet/test-shelter-only");' },
        { path: `${page}.6`, text: "/** mounts `features/kabinet/test-shelter-only/` */" },
        { path: `${page}.7`, text: "// see AllowlistedShelterArea" },
        {
          path: `${FOLDER}Inner.tsx`,
          text: 'import { AllowlistedShelterArea } from "./Allowlisted";',
        },
      ]),
    ).toEqual([`${page}.1`, `${page}.2`, `${page}.3`, `${page}.4`, `${page}.5`]);
  });
});
