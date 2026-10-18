import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * R-UI plan §4: "The operator's browser receives the full record (exact
 * address, evidence). Kabinet pages are already `force-dynamic`; a source scan
 * keeps `features/kabinet/operator/**` imported only from
 * `app/kabinet/prytulky/**`." So no shelter page, public page or shared
 * component can pull the operator's reads or screens in, by mistake or by a
 * barrel.
 *
 * Every module specifier counts (a static import, a re-export, a dynamic
 * `import()`, a `require`), resolved against the importing file, so a path
 * that only looks similar (`kabinet/operator.ts`, the display-name helper) is
 * not mistaken for the folder, and `../x/../operator/y` can't slip past.
 * Comments are dropped first: a doc line naming the folder is not an import.
 */
const REPO = resolve(fileURLToPath(import.meta.url), "../../../../..");
const FOLDER = "apps/web/src/features/kabinet/operator/";
const ALLOWED = "apps/web/src/app/kabinet/prytulky/";

type Source = { path: string; text: string };

function sources(): Source[] {
  const out: Source[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        if (name !== "node_modules" && name !== ".next") walk(path);
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

const withoutComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["'`]([^"'`]+)["'`]/g;

/** Whether `specifier`, written in the file at `path`, names a module in the operator folder. */
function reachesFolder(path: string, specifier: string): boolean {
  if (specifier.startsWith(".")) {
    const target = posix.normalize(posix.join(posix.dirname(path), specifier));
    return `${target}/`.startsWith(FOLDER);
  }
  // An alias or package-style path: anything naming the folder counts.
  return /features\/kabinet\/operator(\/|$)/.test(specifier);
}

const importersOutside = (files: readonly Source[]) =>
  files
    .filter((file) => !file.path.startsWith(FOLDER) && !file.path.startsWith(ALLOWED))
    .filter((file) =>
      [...withoutComments(file.text).matchAll(SPECIFIER)].some((match) =>
        reachesFolder(file.path, match[1] ?? ""),
      ),
    )
    .map((file) => file.path);

describe("only app/kabinet/prytulky/** imports features/kabinet/operator/ (R-UI plan §4)", () => {
  const files = sources();

  it("sanity: the scan sees the folder and its pages, and the pages do import it", () => {
    const paths = files.map((file) => file.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        `${FOLDER}pages.ts`,
        `${ALLOWED}page.tsx`,
        `${ALLOWED}[id]/page.tsx`,
        "apps/web/src/app/kabinet/page.tsx",
      ]),
    );
    const page = files.find((file) => file.path === `${ALLOWED}page.tsx`);
    expect(
      [...withoutComments(page?.text ?? "").matchAll(SPECIFIER)].some((match) =>
        reachesFolder(`${ALLOWED}page.tsx`, match[1] ?? ""),
      ),
    ).toBe(true);
  });

  it("no file outside the folder and those pages imports it", () => {
    expect(importersOutside(files)).toEqual([]);
  });

  it("catches each way in, and not a look-alike path or a comment", () => {
    const shelterPage = "apps/web/src/app/kabinet/page.tsx";
    const feature = "apps/web/src/features/kabinet/ShelterProfile.tsx";
    expect(
      importersOutside([
        {
          path: `${shelterPage}.1`,
          text: 'import { x } from "../../features/kabinet/operator/pages";',
        },
        { path: `${feature}.2`, text: 'export * from "./operator/ShelterScreen";' },
        { path: `${feature}.3`, text: 'const m = await import("./operator");' },
        { path: `${feature}.4`, text: 'const m = require("./x/../operator/pages");' },
        { path: `${feature}.5`, text: 'import y from "@/features/kabinet/operator/pages";' },
        {
          path: `${shelterPage}.6`,
          text: 'import { operatorDisplayName } from "../../kabinet/operator";',
        },
        { path: `${feature}.7`, text: "/** see `features/kabinet/operator/pages.ts` */" },
        { path: `${FOLDER}Inner.tsx`, text: 'import { x } from "./pages";' },
        {
          path: `${ALLOWED}layout.tsx`,
          text: 'import { x } from "../../../features/kabinet/operator/pages";',
        },
      ]),
    ).toEqual([`${shelterPage}.1`, `${feature}.2`, `${feature}.3`, `${feature}.4`, `${feature}.5`]);
  });
});
