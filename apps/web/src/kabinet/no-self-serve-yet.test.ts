import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { uk } from "@opika/i18n";
import { describe, expect, it } from "vitest";
import { FORWARDED_AUTH_PATHS } from "./auth";
import { kabinetAuthAvailability } from "./auth-route";
import { productionSignInOf } from "./production-sign-in";

/**
 * What self-serve may and may not do, after PR 6 of the K milestone opened
 * shelter writes for every shelter (commitment #6 in
 * `docs/standing-constraints.md`). The name is its history (HS-Q3, Oleksii:
 * "self-serve shipped" is the first PR in which a real shelter can sign in);
 * it stays, because the register and the messages below cite it (PC-T2).
 *
 * The /prytulkam copy self-serve made false had to land with it, and all of
 * it is live since PR 6, which is the edit-screens gate B1 moved to (Oleksii,
 * 2026-10-14, verbatim: "Yes, B1 moves to the edit-screens merge gate"):
 *
 *   §7  `forShelters.whatToPrepare`        A1, and his PR 6 last paragraph (the shelter keeps its own cards)
 *   §9  `forShelters.whenAnimalFindsHome`  his PR 6 ¶1 and ¶3 («Уже вдома» is the shelter's own)
 *   §10 `forShelters.whoIsBehindThis`      A3 («відповідаю я»), kept
 *   §8  `forShelters.whyThatSentence`      B1, his PR 6 text (what moves the date)
 *
 * What PR 6 did not open, and this file still pins: a shelter can sign in
 * only once someone holds a membership, and the operator alone decides who
 * does. So this file pins where one can come from: **exactly one module**,
 * the automatic invitation accept (IN-Q12/IN-Q13; Oleksii, verbatim: "Order
 * and the guard replacement: approved as described"), named by its full
 * path, and only the app's accept wrapper may call it. Everything else is
 * still refused. The accept runs only after a sign-in, which production
 * allows since the wiring commit (when `productionSignInOf` is on). These
 * scans match the shapes code actually takes (direct and namespaced table
 * writes, raw SQL, Better Auth's server API); they guard
 * against accident, not against someone deliberately aliasing a table to
 * slip past them. **If you are deleting or changing an assertion here, you
 * are widening self-serve past what commitment #6 says** (only the operator
 * creates a shelter and sends cabinet access): rewrite §7 and the register
 * in the same PR.
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
  "/prytulkam §7 whatToPrepare, §9 whenAnimalFindsHome, §10 whoIsBehindThis and §8 " +
  "whyThatSentence describe this: see docs/standing-constraints.md, commitments 6 and 7";

describe(`a shelter membership is created by the automatic accept only - ${COPY_GATE}`, () => {
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
   * The server API calls added on purpose (PW1-D29), each with why it can't
   * write a membership:
   * - `requestPasswordReset`, in the kabinet's auth config only: «Забули
   *   пароль?»'s work after the response (contract §4.4, PW-1). It writes an
   *   `auth_verification` row (the reset token) for a shelter admin, never an
   *   `auth_member` or an organization.
   */
  const SERVER_API_ON_PURPOSE = new Set(["apps/web/src/kabinet/auth.ts: requestPasswordReset"]);

  /**
   * Better Auth's server API (`auth.api.addMember`, `createOrganization`,
   * `acceptInvitation`, …) writes memberships without going through the
   * route, so `FORWARDED_AUTH_PATHS` can't see it (reviewer, row 3, finding
   * 3). Source may call `getSession` only; anything else is a new path to a
   * membership and has to be added here on purpose: `SERVER_API_ON_PURPOSE`,
   * one file and one call per entry.
   */
  it("source calls no Better Auth server API but getSession", () => {
    const calls = new Set<string>();
    for (const file of sourceFiles()) {
      for (const match of readFileSync(join(REPO, file), "utf8").matchAll(/\.api\.(\w+)/g)) {
        calls.add(`${file}: ${match[1]}`);
      }
    }
    expect(
      [...calls].filter(
        (call) => !call.endsWith(": getSession") && !SERVER_API_ON_PURPOSE.has(call),
      ),
      COPY_GATE,
    ).toEqual([]);
  });

  /**
   * RG-Q9 (Oleksii): exactly one module may call the invitation writer, named
   * by its full path (no glob, so moving or splitting it fails here). Its
   * first form also required that nobody could act on an invitation
   * (production sign-in 503, accept-invitation not forwarded), and failed on
   * its own the day either flipped: the self-serve day.
   *
   * The wiring commit is that day: production sign-in turns on when
   * `productionSignInOf` is on. IN-Q4 (Oleksii, verbatim: "Q4: accepted.")
   * replaces the conditional allowlist with its successor in the same commit
   * as the copy: the allowlist stays exactly one module, and the /prytulkam
   * copy self-serve made false is live (A1 and A2, final 2026-10-14; A3 kept
   * as is, his answer 3; B1 at the edit-screens gate). Accept-invitation is
   * still not forwarded: the automatic accept (IN-Q13) replaced it, so the
   * successor keeps "no organization path forwarded" (above) rather than
   * Q4's "exactly one".
   */
  it("only the registry's invitation module calls the invitation writer", () => {
    const importers = filesMatching(
      // An import of it, not a mention: comments may name it.
      /import\s*\{[^}]*kabinetInvitationRepo[^}]*\}\s*from|from\s+["'][^"']*kabinet-invitation-repo["']/,
    ).filter((file) => file !== "packages/db/src/repos/index.ts");
    expect(
      importers,
      `Only ${INVITATION_MODULE} may call the invitation writer (RG-Q9). ${COPY_GATE}`,
    ).toEqual([INVITATION_MODULE]);
  });

  /**
   * The successor's own condition (IN-Q4): production sign-in can be on, so
   * the copy that said a shelter can't open a kabinet must be gone and his
   * replacements live. Transcribed from his answers, not read from `uk.ts`.
   */
  it("production sign-in can be on, and the /prytulkam copy that had to land with it is live", () => {
    const production = {
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "example",
      EMAIL_FROM_ADDRESS: "noreply@mail.example.org",
      EMAIL_REPLY_TO: "hello@example.org",
      PRODUCTION_ORIGIN: "https://example.org",
      BETTER_AUTH_SECRET: "s".repeat(32),
      BETTER_AUTH_URL: "https://example.org",
    };
    // Wired: with the copy gate clear, production is available. (The live
    // catalogue's gate is `production-sign-in.test.ts`'s to pin.)
    expect(
      kabinetAuthAvailability(production, { signIn: (env) => productionSignInOf(env, []) }).kind,
    ).toBe("available");
    // §9 (A2's successor, pr6-copy-uk.md §1.2): the shelter marks an animal
    // home itself; the read-only paragraph, and the one before it that said
    // there is no kabinet, are gone.
    expect(uk.forShelters.whenAnimalFindsHome, COPY_GATE).toContain(
      "Кожна опублікована картка в кабінеті має кнопку «Уже вдома». Після неї картка одразу зникає з галереї та стрічки, а у вашому списку лишається з позначкою «Удома».",
    );
    for (const gone of [
      "лише для перегляду",
      "напишіть, і я приберу",
      "не хочу обіцяти кабінет, якого не існує",
    ]) {
      expect(uk.forShelters.whenAnimalFindsHome, `${gone}. ${COPY_GATE}`).not.toContain(gone);
    }
    // A1 (row 91): his line, in §7, and §7's last paragraph his PR 6 text
    // (pr6-copy-uk.md §1.1) in place of «ви розкажете, а я внесу все сам».
    expect(uk.forShelters.whatToPrepare, COPY_GATE).toContain(
      "Доступ до кабінету я надсилаю сам - листом на адресу, яку ви мені вкажете.",
    );
    expect(uk.forShelters.whatToPrepare, COPY_GATE).toContain(
      "Тварин і профіль притулку ви ведете самі в кабінеті: додаєте картку, публікуєте - і її одразу видно. Якщо тварин багато, на старті можу внести перші картки сам - надішліть список і фото.",
    );
    expect(uk.forShelters.whatToPrepare, COPY_GATE).not.toContain("я внесу все сам");
    // B1 (pr6-copy-uk.md §1.3): what moves the date, named, and a text edit not among it.
    expect(uk.forShelters.whyThatSentence, COPY_GATE).toContain(
      "Дату ніхто не вписує вручну: вона оновлюється, коли ви публікуєте картку, натискаєте «Ще шукає» чи «Ще домовляються» або змінюєте фото. Правки в тексті дату не змінюють - так вона показує саме те, що обіцяє. Речення пишете ви, коли вам зручно, і можете змінити його будь-коли: «оновлюємо щосуботи», «дзвоніть, ми скажемо точно», «влітку рідше».",
    );
    expect(uk.forShelters.whyThatSentence, COPY_GATE).not.toContain(
      "коли інформацію востаннє оновлювали",
    );
    // A3: kept as is (answer 3), and still true: one person answers.
    expect(uk.forShelters.whoIsBehindThis, COPY_GATE).toContain(
      "коли ви пишете на цю адресу, відповідаю я.",
    );
  });
});

/**
 * HS-Q7 named one writer of `auth_invitation`. IN-Q13 (Oleksii, verbatim:
 * "This supersedes HS-Q7 for the automatic accept only") adds the accept,
 * which marks the invitation accepted inside its own statement, and IN-T12
 * (Oleksii, 2026-10-14: "accept the newest and mark the older ones
 * status=canceled in the same statement") lets that statement also cancel
 * the address's other pending invitations to the shelter; nothing else.
 * GDPR erasure (Oleksii, 2026-10-24, the STOP decision on the `/pro`
 * sentence: "A: scrub auth_invitation.email in the same statement as the
 * rest") adds a fourth: `eraseUsersAndScrubHistory`'s own `invitations_
 * scrubbed` CTE, an in-place edit of the `email` field alone on every row a
 * deleted user's address was ever sent - the one place outside the accept
 * and `demo:remove` that may touch this table at all.
 */
const AUTH_INVITATION_WRITE =
  /\.(insert|update|delete)\(\s*(?:\w+\.)*authInvitation\b|(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:"?auth_invitation\b|\$\{\s*(?:\w+\.)*authInvitation\s*\})/gi;

/**
 * `demo:remove` deletes the demo shelters' invitations with their
 * organizations (inbox DR-B1, Oleksii's answer 1: "Scope: yes, exactly as
 * listed", the list naming each demo shelter's organization "with its
 * memberships and invitations"). It is an operator script, never a request
 * path, and it may only delete.
 */
const DEMO_REMOVE_MODULE = "packages/db/src/demo-remove.ts";

/** GDPR erasure's own shared mechanism (`docs/gdpr-analysis.md` §5 item 4). */
const ERASURE_MODULE = "packages/db/src/repos/admin-erasure-repo.ts";

describe("Better Auth's invitation table has exactly four writers (HS-Q7, IN-Q13, DR-B1, GDPR-F1)", () => {
  it("is kabinetInvitationRepo, the automatic accept, demo:remove, and the GDPR erasure", () => {
    expect(filesMatching(new RegExp(AUTH_INVITATION_WRITE.source, "i"))).toEqual([
      DEMO_REMOVE_MODULE,
      ERASURE_MODULE,
      ACCEPT_MODULE,
      "packages/db/src/repos/kabinet-invitation-repo.ts",
    ]);
  });

  /**
   * The erasure may only scrub the `email` field in place - never insert or
   * delete an invitation row, which would be a new decision, not this one.
   */
  it("the erasure's only write to auth_invitation is UPDATE ... SET email", () => {
    const writes = [
      ...readFileSync(join(REPO, ERASURE_MODULE), "utf8").matchAll(AUTH_INVITATION_WRITE),
    ].map((match) => match[0].replace(/\s+/g, ""));
    expect(writes.length, `${ERASURE_MODULE} no longer scrubs invitations`).toBeGreaterThan(0);
    expect(
      [...new Set(writes)],
      `${ERASURE_MODULE} may only update invitations' email (GDPR-F1)`,
    ).toEqual(['UPDATE"auth_invitation']);
  });

  it("demo:remove's only write to it is .delete(authInvitation)", () => {
    const writes = [
      ...readFileSync(join(REPO, DEMO_REMOVE_MODULE), "utf8").matchAll(AUTH_INVITATION_WRITE),
    ].map((match) => match[0].replace(/\s+/g, ""));
    expect(writes.length, `${DEMO_REMOVE_MODULE} no longer deletes invitations`).toBeGreaterThan(0);
    expect(
      [...new Set(writes)],
      `${DEMO_REMOVE_MODULE} may only delete invitations (DR-B1)`,
    ).toEqual([".delete(authInvitation"]);
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
