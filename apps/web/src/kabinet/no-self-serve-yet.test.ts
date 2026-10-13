import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FORWARDED_AUTH_PATHS } from "./auth";
import { kabinetAuthAvailability } from "./auth-route";

/**
 * HS-Q3 (Oleksii): "self-serve shipped" is the first PR in which a real
 * shelter can sign in, and the /prytulkam copy that self-serve makes false
 * must land before that merge:
 *
 *   A1 `forShelters.whatToPrepare`        (§7  «ви розкажете, а я внесу все сам»)
 *   A2 `forShelters.whenAnimalFindsHome`  (§9  «напишіть, і я приберу»)
 *   A3 `forShelters.whoIsBehindThis`      (§10 «відповідаю я»)
 *   B1 `forShelters.whyThatSentence`      (commitment #7, «оновлювали»)
 *
 * A shelter can sign in only once someone holds a membership, so this file
 * pins that nothing outside tests can create one. These scans match the
 * shapes code actually takes (direct and namespaced table writes, raw SQL,
 * Better Auth's server API); they guard against accident, not against
 * someone deliberately aliasing a table to slip past them. **If you are deleting or
 * changing an assertion here, you are shipping self-serve: A1–A3 and B1 in
 * docs/h2-copy-sheet.md must already be live in the same PR.**
 */

const REPO = resolve(fileURLToPath(import.meta.url), "../../../../..");
const SOURCE_ROOTS = [
  "apps/web/src",
  "packages/db/src",
  "packages/domain/src",
  "packages/contracts/src",
];

/** Every non-test TypeScript source file, as repo-relative paths. */
function sourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        if (name === "node_modules" || name === "test-utils") continue;
        walk(path);
      } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
        files.push(relative(REPO, path).replaceAll("\\", "/"));
      }
    }
  };
  for (const root of SOURCE_ROOTS) walk(join(REPO, root));
  return files;
}

const filesMatching = (pattern: RegExp) =>
  sourceFiles().filter((file) => pattern.test(readFileSync(join(REPO, file), "utf8")));

/** RG-Q9's one allowlisted importer of the invitation writer, by full path. */
const INVITATION_MODULE = "apps/web/src/kabinet/handlers/registry-invitations.ts";

const COPY_GATE =
  "/prytulkam A1–A3 (§7 whatToPrepare, §9 whenAnimalFindsHome, §10 whoIsBehindThis) and B1 " +
  "(whyThatSentence) must be live before this changes: see docs/h2-copy-sheet.md (HS-Q3)";

describe(`no shelter membership can be created outside tests — ${COPY_GATE}`, () => {
  it("sanity: the scan sees the source tree", () => {
    expect(sourceFiles()).toContain("packages/db/src/repos/kabinet-invitation-repo.ts");
    expect(sourceFiles().length).toBeGreaterThan(50);
  });

  it("no source file writes auth_member", () => {
    expect(
      filesMatching(
        /\.(insert|update)\(\s*(?:\w+\.)*authMember\b|(INSERT\s+INTO|UPDATE)\s+"?auth_member\b/i,
      ),
      COPY_GATE,
    ).toEqual([]);
  });

  it("the route forwards none of the organization plugin's paths, accept-invitation included", () => {
    expect(
      FORWARDED_AUTH_PATHS.filter((path) => path.includes("/organization/")),
      COPY_GATE,
    ).toEqual([]);
  });

  /**
   * Better Auth's server API (`auth.api.addMember`, `createOrganization`,
   * `acceptInvitation`, …) writes memberships without going through the
   * route, so `FORWARDED_AUTH_PATHS` can't see it (reviewer, row 3, finding
   * 3). Source may call `getSession` only; anything else is a new path to a
   * membership and has to be added here on purpose.
   */
  it("source calls no Better Auth server API but getSession", () => {
    const calls = new Set<string>();
    for (const file of sourceFiles()) {
      for (const match of readFileSync(join(REPO, file), "utf8").matchAll(/\.api\.(\w+)/g)) {
        calls.add(`${file}: ${match[1]}`);
      }
    }
    expect(
      [...calls].filter((call) => !call.endsWith(": getSession")),
      COPY_GATE,
    ).toEqual([]);
  });

  /**
   * RG-Q9 (Oleksii): exactly one module may call the invitation writer, named
   * by its full path (no glob, so moving or splitting it fails here), and
   * only while nobody can act on an invitation: production sign-in answers
   * 503 (no email provider) **and** accept-invitation isn't forwarded. If
   * either flips, the allowlisted import fails on its own, independently of
   * the two assertions above: that is the self-serve day, and the copy below
   * has to be live first.
   */
  it("only the registry's invitation module calls the invitation writer, and only while no one can accept", () => {
    const productionSignIn = kabinetAuthAvailability({
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: "s".repeat(32),
      BETTER_AUTH_URL: "https://example.org",
    });
    const acceptForwarded = FORWARDED_AUTH_PATHS.some((path) => path.includes("accept-invitation"));
    const nobodyCanAccept = productionSignIn.kind === "unavailable" && !acceptForwarded;
    const importers = filesMatching(
      // An import of it, not a mention: comments may name it.
      /import\s*\{[^}]*kabinetInvitationRepo[^}]*\}\s*from|from\s+["'][^"']*kabinet-invitation-repo["']/,
    ).filter((file) => file !== "packages/db/src/repos/index.ts");
    expect(
      importers,
      nobodyCanAccept
        ? `Only ${INVITATION_MODULE} may call the invitation writer (RG-Q9). ${COPY_GATE}`
        : `Production sign-in or accept-invitation is now live, so even ${INVITATION_MODULE} may not call the invitation writer until the copy ships. ${COPY_GATE}`,
    ).toEqual(nobodyCanAccept ? [INVITATION_MODULE] : []);
  });
});

describe("exactly one module writes Better Auth's invitation table (HS-Q7)", () => {
  it("is kabinetInvitationRepo", () => {
    expect(
      filesMatching(
        /\.(insert|update|delete)\(\s*(?:\w+\.)*authInvitation\b|(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"?auth_invitation\b/i,
      ),
    ).toEqual(["packages/db/src/repos/kabinet-invitation-repo.ts"]);
  });
});
