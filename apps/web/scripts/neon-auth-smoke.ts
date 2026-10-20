import { createHash, createHmac, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspect } from "node:util";
import { createDatabase, type Database } from "@opika/db";
import { cityRepo, kabinetActorRepo, kabinetInvitationRepo, shelterRepo } from "@opika/db/repos";
import {
  authAccount,
  authInvitation,
  authMember,
  authSession,
  authUser,
  authVerification,
  invitationCreatedUsers,
  shelters,
  superAdmins,
} from "@opika/db/schema";
import {
  makeCity,
  makeShelter,
  passwordRevokeCatalog,
  passwordRevokeIsInPlace,
  productionEndpoint,
  smokeTarget,
  statementName,
  steppedDatabase,
  writeCredentialPassword,
} from "@opika/db/test";
import {
  type ModeratorId,
  publicLocationOf,
  type ShelterId,
  testOnlyLocationPolicy,
} from "@opika/domain";
import { inMemoryRateLimiter } from "../src/api/rate-limit";
import { createKabinetAuth, kabinetCookieName } from "../src/kabinet/auth";
import { handleKabinetAuth, type KabinetAuthAvailability } from "../src/kabinet/auth-route";
import { withQueryErrorsCleaned } from "../src/kabinet/clean-query-errors";
import { handleKabinetConfirm } from "../src/kabinet/confirm-route";
import { capturingInvitationSender } from "../src/kabinet/email-senders";
import { invitationAccepter } from "../src/kabinet/invitation-accept";
import { capturingSender } from "../src/kabinet/magic-link-sender";
import { generousPasswordLimiters } from "../src/kabinet/password-limits";
import { capturingPasswordMail } from "../src/kabinet/password-mail";
import { kabinetIdentityOf } from "../src/kabinet/principal";

/**
 * Better Auth's own write paths on real Neon, through the production driver
 * (neon-http), before the production 503 lifts (HS-T4, HS-Q12; IN-Q9,
 * verbatim: "Provider test/sandbox mode only; no real sends from the Neon
 * run."). `db:neon-smoke` (packages/db) covers our own statements; this
 * covers what only Better Auth writes, driven exactly as the routes drive it:
 *
 *   1. sign-in: the «Увійти»-link request through the auth route (the
 *      verification row, written by Better Auth's adapter);
 *   2. verify: the confirm page's POST, which runs Better Auth's verify
 *      server-side (consumes the token, creates the session, marks the email
 *      verified, and our `session.create.after` hook stamps the invited
 *      user's first session);
 *   3. the automatic accept on that sign-in (IN-Q12/IN-Q13): invitation,
 *      membership and `admin_joined` in one statement, the path that replaced
 *      Better Auth's accept-invitation;
 *   4. getSession: Better Auth reading the session back, and the principal
 *      the kabinet resolves from it;
 *   5. sign-out: the session row deleted;
 *   6–9. PW-1: «Забули пароль?» (the reset token stored hashed), the reset (the token
 *      consumed, a credential account created), the password sign-in, and «Змінити пароль»
 *      (the hash updated, other sessions revoked).
 *   10–11. PW1-F1: a reset, then a change, each deleting the user's other reset links (our
 *      DELETE, right after Better Auth's write) and nothing else: the user's own sign-in link
 *      row stays, and the statement names only this run's user, so no other row on the
 *      branch is touched.
 *   12–13. PW1-F5: migration 0013's function and both triggers are in place and enabled; then
 *      our own UPDATE of this run's user's password hash, over this driver and with no Better
 *      Auth call at all, ends every session of theirs in that statement (the new password then
 *      signs in). Steps 7, 9, 10 and 11 above already run with the triggers in place: step 9's
 *      one renewed session is the change keeping the caller signed in.
 *   14. PW1-F6: a password sign-in held at its session insert (a second auth instance over a
 *      stepped database: by order, never by timing) while our own statement writes the password
 *      (as step 13's does, whose trigger ends the sessions there are); released, it inserts after
 *      that revoke, and its own after-hook deletes that session and answers what a wrong
 *      password gets. Every password sign-in from step 8 on also runs PW1-F6's two reads over
 *      this driver, the second with `FOR SHARE`; the last sign-in here is the check's success
 *      path. The forced case (a write held uncommitted) needs a transaction held open, which
 *      neon-http doesn't have: it is tested locally (`password-flows.test.ts`, "forced: …").
 *   15. PW1-F7: the operator's password sign-in (a grant for this run's fixture operator) is
 *      refused with a wrong password's answer, after the same statements in the same order:
 *      the guard's own call of Better Auth's two reads, over this driver.
 *   16. PW1-F8: through the cleaned handle (`withQueryErrorsCleaned`, the one Better Auth is
 *      given), one constraint violation (this run's own address again: `auth_user_email_unique`)
 *      and one failing query (a word bound to an integer column: `22P02`, whose driver message
 *      quotes the value), each over this driver: the error keeps its name, SQLSTATE and constraint, and
 *      carries no message text, no parameters and no SQL. Neither statement writes a row.
 *
 * Nothing is sent anywhere: the magic link is captured in memory, never
 * printed. Refuses unless the target's compute is exactly `--expect`, and
 * refuses production outright (`smokeTarget`, the same guard as
 * `db:neon-smoke`). Prints the host and one line per step, never a URL, a
 * token or a connection string. Rows it writes stay on the disposable branch.
 *
 *   PROD_NEON_ENDPOINT=ep-… DATABASE_URL=<the child branch's URL> \
 *     pnpm --filter @opika/web kabinet:neon-auth-smoke --expect ep-…
 */

type Outcome = { name: string; ok: boolean; detail: string };

/** The site's origin as the routes see it; nothing is served here, so any origin works. */
const BASE = "https://smoke.invalid";
const CONFIRM_PATH = "/kabinet/vkhid/pidtverdzhennia";

export async function runAuthSmoke(db: Database): Promise<Outcome[]> {
  const out: Outcome[] = [];
  const check = (name: string, ok: boolean, detail: string) => out.push({ name, ok, detail });
  const now = new Date();
  const tag = randomUUID().slice(0, 8);

  // Fixtures: a city, a shelter, the operator's user, and the operator's
  // invitation, which creates the invitee's (roleless) user, as in real use.
  const city = makeCity({ id: randomUUID() as never });
  await cityRepo(db).insert(city);
  const base = makeShelter({ id: randomUUID() as ShelterId, displayName: `Auth smoke ${tag}` });
  const address = { ...base.exactAddress, cityId: city.id };
  await shelterRepo(db).insert({
    ...base,
    exactAddress: address,
    publicLocation: publicLocationOf(base.id, address, testOnlyLocationPolicy(`auth-smoke-${tag}`)),
  });
  const operator = randomUUID();
  await db.insert(authUser).values({
    id: operator,
    name: `auth-smoke-${tag}`,
    email: `auth-smoke-operator-${tag}@example.invalid`,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  const email = `auth-smoke-${tag}@example.invalid`;
  const invited = await kabinetInvitationRepo(db).invite({
    shelterId: base.id,
    email,
    name: "Auth smoke",
    inviterUserId: operator,
    ids: { invitationId: randomUUID(), userId: randomUUID(), organizationId: randomUUID() },
    now,
    history: {
      id: randomUUID(),
      entry: { kind: "admin_invited", at: now, moderatorId: operator as ModeratorId, email },
    },
  });
  if (invited.kind !== "invited") {
    check("fixtures", false, `invitation not written: ${invited.kind}`);
    return out;
  }

  const sender = capturingSender();
  const passwordMail = capturingPasswordMail();
  const scheduled: Promise<void>[] = [];
  const unlimited = () => inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 100_000 });
  // One secret for both instances (step 14's second one too), so a cookie signed for a session
  // by either reads the same through `auth`.
  const secret = randomUUID() + randomUUID();
  const authOver = (database: Database) =>
    createKabinetAuth({
      db: database,
      sender,
      schedule: (work) => {
        scheduled.push(work());
      },
      baseURL: BASE,
      secret,
      secureCookies: true,
      passwordLimiters: generousPasswordLimiters(),
      passwordMail,
      limiters: { perUser: unlimited(), perIp: unlimited() },
    });
  const auth = authOver(db);
  const availability: KabinetAuthAvailability = {
    kind: "available",
    passwordMail,
    sender,
    invites: capturingInvitationSender(),
    secret: "unused-here",
    baseURL: BASE,
  };

  // 1. sign-in: Better Auth writes the verification row; the sender gets the link.
  const requested = await handleKabinetAuth(
    new Request(`${BASE}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({ email }),
    }),
    {
      availability,
      auth: () => auth,
      limiters: { perAddress: unlimited(), perIp: unlimited() },
      now,
    },
  );
  await Promise.all(scheduled);
  const link = sender.sent.find((sent) => sent.email === email)?.url ?? "";
  const token = link === "" ? "" : (new URL(link).searchParams.get("token") ?? "");
  // apps/web takes no direct drizzle-orm dependency, so rows are filtered here
  // (the auth tables are tiny on a fresh child branch).
  // The token is stored hashed (`storeToken: "hashed"`, IN-E1), so the row
  // is found by its address in the stored value, not by the token.
  const verificationRows = async () =>
    (await db.select({ value: authVerification.value }).from(authVerification)).filter((row) =>
      row.value.includes(email),
    );
  const sessionsOf = async (userId: string) =>
    (await db.select({ userId: authSession.userId }).from(authSession)).filter(
      (row) => row.userId === userId,
    );
  const pendingRows = await verificationRows();
  check(
    "sign-in request (verification row through Better Auth's adapter)",
    requested.status === 200 &&
      link.startsWith(`${BASE}${CONFIRM_PATH}?token=`) &&
      pendingRows.length === 1,
    `status ${requested.status}, link captured ${link !== ""}, verification rows ${pendingRows.length}`,
  );

  // 2 + 3. verify (the confirm page's POST) and the automatic accept on it.
  const confirmed = await handleKabinetConfirm(
    new Request(`${BASE}${CONFIRM_PATH}`, {
      method: "POST",
      headers: { origin: BASE, "x-forwarded-for": "198.51.100.77", "user-agent": "auth-smoke" },
      body: new URLSearchParams({ token }),
    }),
    {
      availability,
      auth: () => auth,
      acceptInvitation: invitationAccepter(db, () => new Date()),
    },
  );
  const cookieName = kabinetCookieName("session_token", true);
  const sessionCookie =
    confirmed.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith(`${cookieName}=`))
      ?.split(";")[0] ?? "";
  const consumed = await verificationRows();
  const user = (
    await db
      .select({ id: authUser.id, email: authUser.email, emailVerified: authUser.emailVerified })
      .from(authUser)
  ).find((row) => row.email === email);
  const sessions = user ? await sessionsOf(user.id) : [];
  const created = user
    ? (
        await db
          .select({
            userId: invitationCreatedUsers.userId,
            firstSessionAt: invitationCreatedUsers.firstSessionAt,
          })
          .from(invitationCreatedUsers)
      ).find((row) => row.userId === user.id)
    : undefined;
  check(
    "verify (token consumed, session created, email verified, first session stamped)",
    confirmed.status === 303 &&
      confirmed.headers.get("location") === "/kabinet" &&
      sessionCookie !== "" &&
      consumed.length === 0 &&
      user?.emailVerified === true &&
      sessions.length === 1 &&
      created?.firstSessionAt instanceof Date,
    `status ${confirmed.status}, cookie ${sessionCookie !== ""}, token rows left ${consumed.length}, sessions ${sessions.length}, first session stamped ${created?.firstSessionAt instanceof Date}`,
  );

  const members = user
    ? (await db.select({ userId: authMember.userId }).from(authMember)).filter(
        (row) => row.userId === user.id,
      )
    : [];
  const invitation = (
    await db
      .select({
        email: authInvitation.email,
        inviterId: authInvitation.inviterId,
        status: authInvitation.status,
      })
      .from(authInvitation)
  ).find((row) => row.email === email && row.inviterId === operator);
  check(
    "automatic accept on sign-in (invitation + membership, one statement)",
    members.length === 1 && invitation?.status === "accepted",
    `memberships ${members.length}, invitation ${invitation?.status}`,
  );

  // 4. getSession, as the browser asks it, and the principal the kabinet resolves.
  const headers = new Headers({
    cookie: sessionCookie,
    origin: BASE,
    "x-forwarded-for": "198.51.100.77",
  });
  const read = await auth.handler(new Request(`${BASE}/api/auth/get-session`, { headers }));
  const readBody = (await read.json().catch(() => null)) as { user?: { email?: string } } | null;
  const identity = await kabinetIdentityOf(auth, db, headers, new Date(), true);
  check(
    "getSession (Better Auth reads the session back; the kabinet resolves a shelter admin)",
    read.status === 200 &&
      readBody?.user?.email === email &&
      identity.principal.kind === "shelter_admin",
    `status ${read.status}, email matches ${readBody?.user?.email === email}, principal ${identity.principal.kind}`,
  );

  // 5. sign-out: the session row goes.
  const signedOut = await auth.handler(
    new Request(`${BASE}/api/auth/sign-out`, {
      method: "POST",
      headers: { cookie: sessionCookie, origin: BASE, "content-type": "application/json" },
      body: "{}",
    }),
  );
  const left = user ? await sessionsOf(user.id) : [];
  check(
    "sign-out (session row deleted)",
    signedOut.status === 200 && left.length === 0,
    `status ${signedOut.status}, sessions left ${left.length}`,
  );

  // PW-1's write paths (docs/shelter-passwords.md §8, "Neon smoke (new SQL paths: credential
  // create, reset-token consume)"), driven through the route as the browser drives them.
  const route = async (path: string, body: unknown, cookie = "", via = auth) => {
    const response = await handleKabinetAuth(
      new Request(`${BASE}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: BASE,
          "x-forwarded-for": "198.51.100.77",
          ...(cookie === "" ? {} : { cookie }),
        },
        body: JSON.stringify(body),
      }),
      {
        availability,
        auth: () => via,
        limiters: { perAddress: unlimited(), perIp: unlimited() },
        now,
      },
    );
    await Promise.all(scheduled);
    return response;
  };
  const cookieOf = (response: Response) =>
    response.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith(`${cookieName}=`))
      ?.split(";")[0] ?? "";
  // Fictional passwords, generated per run; never printed.
  const firstPassword = `smoke-${randomUUID()}`;
  const secondPassword = `smoke-${randomUUID()}`;

  // 6. «Забули пароль?»: the reset token, written hashed (`storeIdentifier`), and the reset email.
  const asked = await route("/api/auth/request-password-reset", { email });
  const resetMail = passwordMail.sent.find((m) => m.kind === "reset" && m.email === email);
  const resetToken =
    resetMail?.kind === "reset" ? (new URL(resetMail.url).searchParams.get("token") ?? "") : "";
  const hashedIdentifier = createHash("sha256")
    .update(`reset-password:${resetToken}`)
    .digest("base64url");
  const identifiers = async () =>
    (await db.select({ identifier: authVerification.identifier }).from(authVerification)).map(
      (row) => row.identifier,
    );
  const hashedRows = async () => (await identifiers()).filter((id) => id === hashedIdentifier);
  const plainRows = (await identifiers()).filter(
    (id) => resetToken !== "" && id.includes(resetToken),
  );
  const stored = await hashedRows();
  check(
    "forgot password (the reset token stored hashed, the email captured)",
    asked.status === 200 && resetToken !== "" && stored.length === 1 && plainRows.length === 0,
    `status ${asked.status}, email captured ${resetToken !== ""}, hashed rows ${stored.length}, plain rows ${plainRows.length}`,
  );

  // 7. the reset: the token consumed, a credential account created through Better Auth's adapter.
  const reset = await route("/api/auth/reset-password", {
    token: resetToken,
    newPassword: firstPassword,
  });
  const credentials = user
    ? (
        await db
          .select({
            userId: authAccount.userId,
            providerId: authAccount.providerId,
            password: authAccount.password,
          })
          .from(authAccount)
      ).filter((row) => row.userId === user.id && row.providerId === "credential")
    : [];
  const hash = credentials[0]?.password ?? null;
  const hasPassword = user ? await kabinetActorRepo(db).hasPassword(user.id) : false;
  const tokenRowsLeft = (await hashedRows()).length;
  check(
    "reset (token consumed, credential created with a hash, the notice captured)",
    reset.status === 200 &&
      tokenRowsLeft === 0 &&
      credentials.length === 1 &&
      hash !== null &&
      !hash.includes(firstPassword) &&
      hasPassword &&
      passwordMail.sent.some((m) => m.kind === "changed" && m.email === email),
    `status ${reset.status}, token rows left ${tokenRowsLeft}, credentials ${credentials.length}, hasPassword ${hasPassword}`,
  );

  // 8. sign in with the password (the operator-grant join runs on every attempt), twice.
  const first = await route("/api/auth/sign-in/email", { email, password: firstPassword });
  const second = await route("/api/auth/sign-in/email", { email, password: firstPassword });
  const signedInSessions = user ? await sessionsOf(user.id) : [];
  const firstBody = await first.clone().text();
  check(
    "password sign-in (session created, no token in the body)",
    first.status === 200 &&
      cookieOf(first) !== "" &&
      firstBody === '{"status":true}' &&
      second.status === 200 &&
      signedInSessions.length === 2,
    `status ${first.status}/${second.status}, cookie ${cookieOf(first) !== ""}, sessions ${signedInSessions.length}`,
  );

  // 9. «Змінити пароль»: the hash updated, the other session revoked, this one renewed.
  const changed = await route(
    "/api/auth/change-password",
    { currentPassword: firstPassword, newPassword: secondPassword },
    cookieOf(first),
  );
  const afterChange = user ? await sessionsOf(user.id) : [];
  const oldRefused = await route("/api/auth/sign-in/email", { email, password: firstPassword });
  check(
    "change password (hash updated, other sessions revoked, one renewed session)",
    changed.status === 200 &&
      cookieOf(changed) !== "" &&
      afterChange.length === 1 &&
      oldRefused.status === 401,
    `status ${changed.status}, sessions after ${afterChange.length}, old password ${oldRefused.status}`,
  );

  // 10–11. PW1-F1: a new password voids the user's other reset links. Fresh tokens are read
  // from the captured mail, never printed; a row is found by its hash, as in step 6.
  const thirdPassword = `smoke-${randomUUID()}`;
  const fourthPassword = `smoke-${randomUUID()}`;
  const resetTokensSince = (from: number) =>
    passwordMail.sent
      .slice(from)
      .flatMap((m) =>
        m.kind === "reset" && m.email === email
          ? [new URL(m.url).searchParams.get("token") ?? ""]
          : [],
      );
  const rowsOfToken = async (resetLink: string) => {
    const hashed = createHash("sha256").update(`reset-password:${resetLink}`).digest("base64url");
    return (await identifiers()).filter((id) => id === hashed).length;
  };

  // 10. two reset links and a sign-in link; the first reset link used: the second is refused
  // and its row gone, the sign-in link's row kept.
  const beforeTwo = passwordMail.sent.length;
  await route("/api/auth/request-password-reset", { email });
  await route("/api/auth/request-password-reset", { email });
  const [linkA = "", linkB = ""] = resetTokensSince(beforeTwo);
  await route("/api/auth/sign-in/magic-link", { email });
  const signInRowsBefore = (await verificationRows()).length;
  const otherRowsBefore = linkB === "" ? 0 : await rowsOfToken(linkB);
  const usedA = await route("/api/auth/reset-password", {
    token: linkA,
    newPassword: thirdPassword,
  });
  const otherRowsAfter = linkB === "" ? -1 : await rowsOfToken(linkB);
  const refusedB = await route("/api/auth/reset-password", {
    token: linkB,
    newPassword: fourthPassword,
  });
  const signInRowsAfter = (await verificationRows()).length;
  check(
    "reset voids the other reset links (the other link refused, the sign-in link's row kept)",
    linkA !== "" &&
      linkB !== "" &&
      linkA !== linkB &&
      otherRowsBefore === 1 &&
      usedA.status === 200 &&
      otherRowsAfter === 0 &&
      refusedB.status === 400 &&
      signInRowsBefore === 1 &&
      signInRowsAfter === 1,
    `links captured ${linkA !== "" && linkB !== ""}, reset ${usedA.status}, other link rows ${otherRowsBefore} then ${otherRowsAfter}, other link ${refusedB.status}, sign-in link rows ${signInRowsBefore} then ${signInRowsAfter}`,
  );

  // 11. a reset link asked for before a change: refused after it, its row gone; the sign-in
  // link's row still kept.
  const signedInAgain = await route("/api/auth/sign-in/email", { email, password: thirdPassword });
  const beforeOne = passwordMail.sent.length;
  await route("/api/auth/request-password-reset", { email });
  const [linkC = ""] = resetTokensSince(beforeOne);
  const earlierRowsBefore = linkC === "" ? 0 : await rowsOfToken(linkC);
  const changedAgain = await route(
    "/api/auth/change-password",
    { currentPassword: thirdPassword, newPassword: fourthPassword },
    cookieOf(signedInAgain),
  );
  const earlierRowsAfter = linkC === "" ? -1 : await rowsOfToken(linkC);
  const refusedC = await route("/api/auth/reset-password", {
    token: linkC,
    newPassword: thirdPassword,
  });
  const signInRowsAtEnd = (await verificationRows()).length;
  check(
    "change voids the reset links (a link asked for before it refused after it, the sign-in link's row kept)",
    signedInAgain.status === 200 &&
      linkC !== "" &&
      earlierRowsBefore === 1 &&
      changedAgain.status === 200 &&
      earlierRowsAfter === 0 &&
      refusedC.status === 400 &&
      signInRowsAtEnd === 1,
    `sign-in ${signedInAgain.status}, link captured ${linkC !== ""}, change ${changedAgain.status}, earlier link rows ${earlierRowsBefore} then ${earlierRowsAfter}, earlier link ${refusedC.status}, sign-in link rows ${signInRowsAtEnd}`,
  );

  // 12. PW1-F5: the catalog, read through the query builder (the same shape on both drivers).
  const catalog = await passwordRevokeCatalog(db);
  check(
    "password-write revoke in place (the function and both triggers, enabled)",
    passwordRevokeIsInPlace(catalog),
    `function ${catalog.functions.map((f) => f.security).join(", ") || "missing"}, triggers ${catalog.triggers.map((t) => `${t.name} ${t.enabled}`).join(", ") || "none"}`,
  );

  // 13. Two more sessions, then the hash written by our own statement: no Better Auth revoke runs.
  const fifthPassword = `smoke-${randomUUID()}`;
  const phone = await route("/api/auth/sign-in/email", { email, password: fourthPassword });
  const laptop = await route("/api/auth/sign-in/email", { email, password: fourthPassword });
  const sessionsBeforeWrite = user ? (await sessionsOf(user.id)).length : 0;
  if (user) {
    const hasher = (await auth.$context).password;
    await writeCredentialPassword(db, user.id, await hasher.hash(fifthPassword), new Date());
  }
  const sessionsAfterWrite = user ? (await sessionsOf(user.id)).length : -1;
  const phoneRead = await auth.handler(
    new Request(`${BASE}/api/auth/get-session`, {
      headers: new Headers({
        cookie: cookieOf(phone),
        origin: BASE,
        "x-forwarded-for": "198.51.100.77",
      }),
    }),
  );
  const phoneBody = (await phoneRead.json().catch(() => null)) as { user?: unknown } | null;
  const phoneSignedIn = phoneBody?.user !== undefined;
  const newPassword = await route("/api/auth/sign-in/email", { email, password: fifthPassword });
  check(
    "own password write ends every session in its statement (no Better Auth revoke)",
    phone.status === 200 &&
      laptop.status === 200 &&
      sessionsBeforeWrite >= 2 &&
      sessionsAfterWrite === 0 &&
      !phoneSignedIn &&
      newPassword.status === 200,
    `sign-ins ${phone.status}/${laptop.status}, sessions ${sessionsBeforeWrite} then ${sessionsAfterWrite}, a device still signed in ${phoneSignedIn}, new password ${newPassword.status}`,
  );

  // 14. PW1-F6: a sign-in held at its session insert while our own statement writes the password.
  const sixthPassword = `smoke-${randomUUID()}`;
  const wrong = await route("/api/auth/sign-in/email", {
    email,
    password: `smoke-${randomUUID()}`,
  });
  const wrongBody = await wrong.clone().text();
  const stepped = steppedDatabase(db, {
    holdWhen: (statement) => statementName(statement) === "insert:auth_session",
  });
  const racingAuth = authOver(stepped.db);
  const raceName =
    "a sign-in racing a password write keeps no session (deleted after its insert; a wrong password's answer)";
  const signingIn = route(
    "/api/auth/sign-in/email",
    { email, password: fifthPassword },
    "",
    racingAuth,
  );
  // A sign-in that answers (or fails) before its insert is never held: the step fails rather
  // than wait for a hold that can't come.
  const heldOrNot = await Promise.race([
    stepped.hold.reached.then(() => "held"),
    signingIn.then(
      (response) => `answered ${response.status} before its insert`,
      () => "failed before its insert",
    ),
  ]);
  if (heldOrNot !== "held") {
    check(raceName, false, `the sign-in ${heldOrNot}, so the race never ran`);
    return out;
  }
  if (user) {
    const hasher = (await auth.$context).password;
    await writeCredentialPassword(db, user.id, await hasher.hash(sixthPassword), new Date());
  }
  const sessionsAtTheWrite = user ? (await sessionsOf(user.id)).length : -1;
  stepped.hold.release();
  const raced = await signingIn;
  const racedBody = await raced.clone().text();
  // The sessions the stepped instance inserted, found by what it wrote: the raced one is in no
  // response, which is the point. Never printed.
  const insertedTokens = () =>
    stepped.trace
      .filter((statement) => statementName(statement) === "insert:auth_session")
      .map((statement) => (statement.values as { token?: unknown }).token)
      .filter((value): value is string => typeof value === "string");
  const [racedToken = ""] = insertedTokens();
  const signedCookieFor = (value: string) =>
    `${cookieName}=${encodeURIComponent(
      `${value}.${createHmac("sha256", secret).update(value).digest("base64")}`,
    )}`;
  const racedRead = await auth.handler(
    new Request(`${BASE}/api/auth/get-session`, {
      headers: new Headers({
        cookie: racedToken === "" ? "" : signedCookieFor(racedToken),
        origin: BASE,
        "x-forwarded-for": "198.51.100.77",
      }),
    }),
  );
  const racedReadBody = (await racedRead.json().catch(() => null)) as { user?: unknown } | null;
  const racedSignedIn = racedReadBody?.user !== undefined;
  const sessionsAfterRace = user ? (await sessionsOf(user.id)).length : -1;
  // The check's success path, through the same instance (its hold is spent): and the cookie
  // built above is the one Better Auth sets, so the raced session's null read is a real one.
  const afterRace = await route(
    "/api/auth/sign-in/email",
    { email, password: sixthPassword },
    "",
    racingAuth,
  );
  const [, afterToken = ""] = insertedTokens();
  const builtCookieMatches =
    afterToken !== "" && signedCookieFor(afterToken) === cookieOf(afterRace);
  const racedCookies = raced.headers.getSetCookie().length;
  check(
    raceName,
    wrong.status === 401 &&
      raced.status === 401 &&
      racedBody === wrongBody &&
      racedCookies === 0 &&
      racedToken !== "" &&
      sessionsAtTheWrite === 0 &&
      !racedSignedIn &&
      sessionsAfterRace === 0 &&
      afterRace.status === 200 &&
      builtCookieMatches,
    `status ${raced.status}, a wrong password's answer ${racedBody === wrongBody}, cookies set ${racedCookies}, session inserted ${racedToken !== ""}, sessions at the write ${sessionsAtTheWrite} then ${sessionsAfterRace}, raced session signed in ${racedSignedIn}, new password ${afterRace.status}, built cookie matches ${builtCookieMatches}`,
  );

  // 15. PW1-F7: the operator's password sign-in, refused, runs a wrong password's statements in
  // the same order (its guard makes Better Auth's two reads itself), over this driver. The grant
  // is this run's fixture operator's, on the disposable branch, as its user is.
  await db.insert(superAdmins).values({ id: randomUUID(), userId: operator, grantedAt: now });
  const traced = async (to: string, password: string) => {
    const tracing = steppedDatabase(db);
    const answer = await route(
      "/api/auth/sign-in/email",
      { email: to, password },
      "",
      authOver(tracing.db),
    );
    return { answer, body: await answer.clone().text(), names: tracing.trace.map(statementName) };
  };
  const wrongTraced = await traced(email, `smoke-${randomUUID()}`);
  const operatorTraced = await traced(
    `auth-smoke-operator-${tag}@example.invalid`,
    `smoke-${randomUUID()}`,
  );
  const sameWork =
    operatorTraced.names.length === wrongTraced.names.length &&
    operatorTraced.names.every((name, i) => name === wrongTraced.names[i]);
  const operatorCookies = operatorTraced.answer.headers.getSetCookie().length;
  check(
    "the operator's refused sign-in does a wrong password's work (the same statements, in order; the same answer)",
    wrongTraced.answer.status === 401 &&
      operatorTraced.answer.status === 401 &&
      operatorTraced.body === wrongTraced.body &&
      operatorCookies === 0 &&
      sameWork,
    `status ${operatorTraced.answer.status}, a wrong password's answer ${operatorTraced.body === wrongTraced.body}, cookies set ${operatorCookies}, statements ${operatorTraced.names.length} against ${wrongTraced.names.length}, the same in order ${sameWork}`,
  );

  // 16. PW1-F8: query errors through the cleaned handle, over this driver. Only names, codes,
  // the constraint's name and booleans are printed; the marker and the address never are.
  const cleanDb = withQueryErrorsCleaned(db);
  const marker = `auth-smoke-${tag}-${randomUUID()}`;
  const failureOf = async (work: Promise<unknown>): Promise<unknown> => {
    try {
      await work;
      return null;
    } catch (error) {
      return error;
    }
  };
  const duplicate = await failureOf(
    cleanDb.insert(authUser).values({
      id: randomUUID(),
      name: marker,
      email,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    }),
  );
  // A word bound to an integer column: Postgres refuses the parameter itself (22P02, its message
  // quoting the value) before the row is built, on either driver.
  const badValue = await failureOf(
    cleanDb.insert(shelters).values({ id: randomUUID(), version: marker } as never),
  );
  type Facts = { name?: unknown; message?: unknown; code?: unknown; constraint?: unknown };
  const factsOf = (error: unknown) => {
    const outer = (typeof error === "object" && error !== null ? error : {}) as Facts & {
      cause?: Facts;
    };
    const kept = inspect(error, { depth: 8, showHidden: true });
    return {
      name: `${String(outer.name)}/${String(outer.cause?.name)}`,
      code: String(outer.code),
      constraint: String(outer.constraint),
      noText: outer.message === "" && outer.cause?.message === "",
      noValues:
        !kept.includes(marker) &&
        !kept.includes(email) &&
        !/params|insert into|"auth_user"|"shelters"/i.test(kept) &&
        !["query", "params", "detail", "where"].some(
          (key) => Object.hasOwn(outer, key) || Object.hasOwn(outer.cause ?? {}, key),
        ),
    };
  };
  const duplicateFacts = factsOf(duplicate);
  const badValueFacts = factsOf(badValue);
  check(
    "query errors through the cleaned handle keep name, SQLSTATE and constraint, and no message, parameters or SQL",
    duplicate !== null &&
      badValue !== null &&
      duplicateFacts.code === "23505" &&
      duplicateFacts.constraint === "auth_user_email_unique" &&
      badValueFacts.code === "22P02" &&
      duplicateFacts.noText &&
      badValueFacts.noText &&
      duplicateFacts.noValues &&
      badValueFacts.noValues,
    `duplicate ${duplicateFacts.name} ${duplicateFacts.code} ${duplicateFacts.constraint}, bad value ${badValueFacts.name} ${badValueFacts.code}, no message text ${duplicateFacts.noText && badValueFacts.noText}, no values or SQL ${duplicateFacts.noValues && badValueFacts.noValues}`,
  );
  return out;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }
  const at = process.argv.indexOf("--expect");
  const target = smokeTarget(url, at > -1 ? process.argv[at + 1] : undefined, productionEndpoint());
  if (target.kind === "refused") {
    console.error(`REFUSED: ${target.reason}. Nothing was run.`);
    process.exit(1);
  }
  console.log(`Target host: ${target.host}`);
  const outcomes = await runAuthSmoke(createDatabase(url));
  for (const o of outcomes) console.log(`${o.ok ? "PASS" : "FAIL"}  ${o.name}: ${o.detail}`);
  const failed = outcomes.filter((o) => !o.ok).length;
  console.log(`${outcomes.length - failed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
