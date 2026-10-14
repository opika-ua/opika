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
 * B1 now gates a later merge (Oleksii, 2026-10-14, verbatim: "Yes, B1 moves
 * to the edit-screens merge gate"): «оновлювали» stays true until the kabinet
 * can edit or confirm a listing, and this PR ships neither. The messages
 * below still name it, so whoever trips one sees the whole HS-Q3 set.
 *
 * A shelter can sign in only once someone holds a membership, so this file
 * pins where one can come from: **exactly one module**, the automatic
 * invitation accept (IN-Q12/IN-Q13; Oleksii, verbatim: "Order and the guard
 * replacement: approved as described"), named by its full path, and only the
 * app's accept wrapper may call it. Everything else is still refused. The
 * accept runs only after a sign-in, which production refuses (503) until the
 * wiring commit. These scans match the shapes code actually takes (direct and
 * namespaced table writes, raw SQL, Better Auth's server API); they guard
 * against accident, not against someone deliberately aliasing a table to
 * slip past them. **If you are deleting or changing an assertion here, you
 * are widening self-serve: A1–A3 in docs/h2-copy-sheet.md must already be
 * live in the same PR, and B1 before the edit screens merge.**
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

/** The one module allowed to write `auth_member` (IN-Q12/IN-Q13), by full path: moving or splitting it fails here. */
const ACCEPT_MODULE = "packages/db/src/repos/kabinet-invitation-accept-repo.ts";
/** The one module allowed to call it: the app's accept wrapper, which only ever passes the session's user. */
const ACCEPT_CALLER = "apps/web/src/kabinet/invitation-accept.ts";

const COPY_GATE =
  "/prytulkam A1–A3 (§7 whatToPrepare, §9 whenAnimalFindsHome, §10 whoIsBehindThis) and B1 " +
  "(whyThatSentence) must be live before this changes: see docs/h2-copy-sheet.md (HS-Q3)";

describe(`a shelter membership is created by the automatic accept only — ${COPY_GATE}`, () => {
  it("sanity: the scan sees the source tree", () => {
    expect(sourceFiles()).toContain("packages/db/src/repos/kabinet-invitation-repo.ts");
    expect(sourceFiles().length).toBeGreaterThan(50);
  });

  it("exactly the accept module writes auth_member", () => {
    expect(
      filesMatching(
        /\.(insert|update)\(\s*(?:\w+\.)*authMember\b|(INSERT\s+INTO|UPDATE)\s+(?:"?auth_member\b|\$\{\s*(?:\w+\.)*authMember\s*\})/i,
      ),
      `Only ${ACCEPT_MODULE} may write auth_member (IN-Q12/IN-Q13). ${COPY_GATE}`,
    ).toEqual([ACCEPT_MODULE]);
  });

  it("only the app's accept wrapper calls the accept module", () => {
    const importers = filesMatching(
      // An import of it, not a mention: comments may name it.
      /import\s*\{[^}]*kabinetInvitationAcceptRepo[^}]*\}\s*from|from\s+["'][^"']*kabinet-invitation-accept-repo["']/,
    ).filter((file) => file !== "packages/db/src/repos/index.ts");
    expect(importers, `Only ${ACCEPT_CALLER} may call ${ACCEPT_MODULE}. ${COPY_GATE}`).toEqual([
      ACCEPT_CALLER,
    ]);
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
   * 503 (no email provider) **and** accept-invitation isn't forwarded. The
   * automatic accept (IN-Q12) runs only after a sign-in, so the first
   * condition covers it too. If either flips, the allowlisted import fails on
   * its own, independently of the assertions above: that is the self-serve
   * day, and the copy below has to be live first.
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

/**
 * HS-Q7 named one writer of `auth_invitation`. IN-Q13 (Oleksii, verbatim:
 * "This supersedes HS-Q7 for the automatic accept only") adds the accept,
 * which marks the invitation accepted inside its own statement, and IN-T12
 * (Oleksii, 2026-10-14: "accept the newest and mark the older ones
 * status=canceled in the same statement") lets that statement also cancel
 * the address's other pending invitations to the shelter; nothing else.
 */
const AUTH_INVITATION_WRITE =
  /\.(insert|update|delete)\(\s*(?:\w+\.)*authInvitation\b|(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:"?auth_invitation\b|\$\{\s*(?:\w+\.)*authInvitation\s*\})/gi;

describe("Better Auth's invitation table has exactly two writers (HS-Q7, IN-Q13)", () => {
  it("is kabinetInvitationRepo, and the automatic accept", () => {
    expect(filesMatching(new RegExp(AUTH_INVITATION_WRITE.source, "i"))).toEqual([
      ACCEPT_MODULE,
      "packages/db/src/repos/kabinet-invitation-repo.ts",
    ]);
  });

  /**
   * IN-Q13 lets the accept mark an invitation accepted and nothing more; the
   * file allowlist above would stay green if it later inserted or deleted
   * invitations too (accept review, finding 3).
   */
  it("the accept's only write to it is .update(authInvitation)", () => {
    const writes = [
      ...readFileSync(join(REPO, ACCEPT_MODULE), "utf8").matchAll(AUTH_INVITATION_WRITE),
    ].map((match) => match[0].replace(/\s+/g, ""));
    expect(writes.length, `${ACCEPT_MODULE} no longer writes auth_invitation`).toBeGreaterThan(0);
    expect(
      [...new Set(writes)],
      `${ACCEPT_MODULE} may only update invitations (IN-Q13, IN-T12). ${COPY_GATE}`,
    ).toEqual([".update(authInvitation"]);
  });

  /**
   * The updates may set exactly two statuses: `accepted` for the one
   * accepted (IN-Q13) and `canceled` for the duplicates it supersedes
   * (IN-T12). A third (`rejected`, or `pending` written back) would be a new
   * decision.
   */
  it("the accept sets only `accepted` and `canceled`", () => {
    const source = readFileSync(join(REPO, ACCEPT_MODULE), "utf8");
    const statuses = [...source.matchAll(/\.set\(\s*\{\s*status:\s*"([^"]*)"\s*\}\s*\)/g)].map(
      (match) => match[1],
    );
    const sets = [...source.matchAll(/\.set\(/g)].length;
    expect(sets, "every .set( in the accept is a plain status write").toBe(statuses.length);
    expect([...new Set(statuses)].sort(), `${ACCEPT_MODULE}'s status writes`).toEqual([
      "accepted",
      "canceled",
    ]);
  });
});
