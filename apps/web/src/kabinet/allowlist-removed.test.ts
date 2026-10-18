import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * K-Q17's allowlist is gone (PR 6 of the K milestone). His words on it,
 * verbatim: "K-Q17: (a). Allowlist from PR 2 … PR 6 deletes all of it.
 * Approved as a temporary mode with that fixed end." (abridged with …), and
 * on how PR 6 proves it (0.3e): "0.3e: the source scan. Deleting the Vercel
 * variable is my post-deploy step 8.1."
 *
 * So no file under `apps/` or `packages/` may name the variable, in code, a
 * test, the harness, a script, config or a doc: a value left behind in Vercel
 * until his step 8.1 can then never be read again, whatever the deploy order.
 * The name is assembled below rather than written out, so this file is no
 * exception to its own rule.
 *
 * Environment files (`.env`, `.env.local`, …) are never opened: they hold
 * secrets, and they are untracked, so they can't ship a read anyway.
 */
const VARIABLE = ["KABINET", "WRITE", "ALLOWLIST"].join("_");

const REPO = resolve(fileURLToPath(import.meta.url), "../../../../..");
const ROOTS = ["apps", "packages"];
/** Dependencies and build or test output, none of it source. */
const SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  ".next",
  "test-results",
  "playwright-report",
  "coverage",
  "dist",
  ".turbo",
]);
/** Every text format the two trees hold: source, config, SQL, docs. Images and fonts are skipped. */
const TEXT_FILE = /\.(?:[cm]?[jt]sx?|json|md|ya?ml|sql|css|html|toml|txt)$/;

type Source = { path: string; text: string };

function sources(): Source[] {
  const out: Source[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(name)) walk(path);
      } else if (!name.startsWith(".env") && TEXT_FILE.test(name)) {
        out.push({
          path: relative(REPO, path).replaceAll("\\", "/"),
          text: readFileSync(path, "utf8"),
        });
      }
    }
  };
  for (const root of ROOTS) walk(join(REPO, root));
  return out;
}

const naming = (files: readonly Source[]) =>
  files.filter((file) => file.text.includes(VARIABLE)).map((file) => file.path);

/** The callers that build a request context for the served kabinet procedures. */
const SERVED_CALLERS = [
  "apps/web/src/app/api/kabinet/[...rpc]/route.ts",
  "apps/web/src/app/kabinet/page.tsx",
  "apps/web/src/app/kabinet/prytulky/operator-request.ts",
  "apps/web/src/app/kabinet/tvaryny/load.ts",
];

describe("the K-Q17 allowlist is deleted (0.3e)", () => {
  const files = sources();

  it("sanity: the scan reads source, tests, the harness, scripts and docs in both trees", () => {
    const paths = files.map((file) => file.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "apps/web/src/kabinet/access.ts",
        "apps/web/src/kabinet/no-self-serve-yet.test.ts",
        "apps/web/test/harness/sign-in-server.ts",
        "apps/web/next.config.ts",
        "apps/web/package.json",
        "packages/i18n/src/messages/uk.ts",
        "packages/db/package.json",
      ]),
    );
    expect(paths.length).toBeGreaterThan(300);
    expect(paths.some((path) => path.split("/").some((part) => part.startsWith(".env")))).toBe(
      false,
    );
  });

  it("no file under apps/ or packages/ names the variable", () => {
    expect(naming(files)).toEqual([]);
  });

  it("catches a read in any spelling, a harness variable and a doc line", () => {
    expect(
      naming([
        { path: "a.ts", text: `const v = process.env.${VARIABLE};` },
        { path: "b.ts", text: `const v = process.env["${VARIABLE}"];` },
        { path: "c.ts", text: `startSignInServer(url, { ${VARIABLE}: shelter.id });` },
        { path: "d.md", text: `Set \`${VARIABLE}\` in Vercel.` },
        { path: "e.ts", text: "const v = process.env.KABINET_OPERATOR_DISPLAY_NAME;" },
      ]),
    ).toEqual(["a.ts", "b.ts", "c.ts", "d.md"]);
  });

  /**
   * What replaced it: one served policy, the frozen constant, read from no
   * environment variable. Each caller that hands the kabinet procedures a
   * request context passes it by name.
   */
  it("every served caller passes the one constant policy, and nothing reads a policy from the environment", () => {
    for (const path of SERVED_CALLERS) {
      const file = files.find((candidate) => candidate.path === path);
      expect(file, path).toBeDefined();
      expect(file?.text, path).toContain("shelterWrites: SHELTER_WRITE_POLICY,");
    }
    expect(
      files
        .filter((file) => /shelterWrites:\s*[^,\n]*process\.env/.test(file.text))
        .map((file) => file.path),
    ).toEqual([]);
  });
});
