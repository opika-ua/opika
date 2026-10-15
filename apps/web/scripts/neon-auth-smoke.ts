import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase, type Database } from "@opika/db";
import { cityRepo, kabinetInvitationRepo, shelterRepo } from "@opika/db/repos";
import {
  authInvitation,
  authMember,
  authSession,
  authUser,
  authVerification,
  invitationCreatedUsers,
} from "@opika/db/schema";
import { makeCity, makeShelter, productionEndpoint, smokeTarget } from "@opika/db/test";
import {
  type ModeratorId,
  publicLocationOf,
  type ShelterId,
  testOnlyLocationPolicy,
} from "@opika/domain";
import { inMemoryRateLimiter } from "../src/api/rate-limit";
import { createKabinetAuth, kabinetCookieName } from "../src/kabinet/auth";
import { handleKabinetAuth, type KabinetAuthAvailability } from "../src/kabinet/auth-route";
import { handleKabinetConfirm } from "../src/kabinet/confirm-route";
import { capturingInvitationSender } from "../src/kabinet/email-senders";
import { invitationAccepter } from "../src/kabinet/invitation-accept";
import { capturingSender } from "../src/kabinet/magic-link-sender";
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
 *   5. sign-out: the session row deleted.
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
  const scheduled: Promise<void>[] = [];
  const unlimited = () => inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 100_000 });
  const auth = createKabinetAuth({
    db,
    sender,
    schedule: (work) => {
      scheduled.push(work());
    },
    baseURL: BASE,
    secret: randomUUID() + randomUUID(),
    secureCookies: true,
    limiters: { perUser: unlimited(), perIp: unlimited() },
  });
  const availability: KabinetAuthAvailability = {
    kind: "available",
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
