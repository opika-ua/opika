import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inspect } from "node:util";
import type { Database } from "@opika/db";
import {
  cityRepo,
  INVITATION_TTL_MS,
  kabinetInvitationRepo,
  kabinetInviteTokenRepo,
  shelterRepo,
} from "@opika/db/repos";
import {
  authAccount,
  authInvitation,
  authMember,
  authSession,
  authUser,
  authVerification,
  superAdmins,
} from "@opika/db/schema";
import {
  failingDriverDatabase,
  makeCity,
  makeShelter,
  postgresError,
  setupTestDatabase,
  truncateAll,
} from "@opika/db/test";
import type { ShelterId } from "@opika/domain";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CleanedQueryError } from "../../../kabinet/clean-query-errors";
import { newInviteToken } from "../../../kabinet/invite-password";
import { sqlStateOf } from "../../../kabinet/sql-state";

/**
 * The invitation link's GET (PW-2). Oleksii, 2026-10-20, Q1, verbatim: "a read-only lookup by
 * the token's hash. It consumes nothing, charges no rate limit and sends nothing. An unknown,
 * expired, used or revoked link renders one identical "link no longer works" page. The address
 * is shown masked. … Tests: opening twice changes nothing, and every failure kind renders the
 * same page."
 *
 * The real page module, against this checkout's real test database. Only Better Auth (the
 * identity read, which finds no session) and the request headers are stand-ins; Better Auth's
 * handler and every limiter the page could reach count their calls, so a send or a charge
 * shows. The form's POST is `kabinet/invite-password-flows.test.ts`; the browser run of both,
 * `test/harness/kabinet-invite-password.harness.ts`.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;
/** What `getDb()` serves the page, when a test replaces the database (a forced failure). */
let served: Database | null = null;

const sends = vi.fn(async (_request: Request) => new Response(null, { status: 200 }));
const charges = vi.fn(async (_key: string, _now: Date) => true);

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("../../../api/db", () => ({ getDb: () => served ?? db }));
vi.mock("../../../kabinet/runtime", () => ({
  kabinetAuth: () => ({ handler: sends, api: { getSession: async () => null } }),
}));
vi.mock("../../../kabinet/limiters", () => {
  const limiter = { check: charges };
  return {
    signInLimiters: { perAddress: limiter, perIp: limiter },
    kabinetLimiters: { perUser: limiter, perIp: limiter },
    inviteLimiters: { perIp: limiter },
    passwordLimiters: {
      forgotPerIp: limiter,
      forgotPerAddress: limiter,
      resetPerIp: limiter,
      signInDelay: {},
    },
    photoUploadLimiters: { perHour: limiter, perDay: limiter },
  };
});

const { default: SignInPage, generateMetadata } = await import("./page");

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const NOW = new Date();
let operatorId: string;

beforeEach(async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", "s".repeat(32));
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  sends.mockClear();
  charges.mockClear();
  served = null;
  await truncateAll(db);
  operatorId = crypto.randomUUID();
  await db.insert(authUser).values({
    id: operatorId,
    name: "Оператор",
    email: "operator@example.org",
    emailVerified: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

/** `email` invited to a fresh fictional shelter at `at`, with a link issued then. */
async function invited(email: string, shelterName: string, at = NOW) {
  const city = makeCity();
  await cityRepo(db).insert(city);
  const shelter = makeShelter({
    displayName: shelterName,
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
  });
  await shelterRepo(db).insert(shelter);
  const invitationId = crypto.randomUUID();
  const result = await kabinetInvitationRepo(db).invite({
    shelterId: shelter.id as ShelterId,
    email,
    name: "Олена",
    inviterUserId: operatorId,
    ids: { invitationId, userId: crypto.randomUUID(), organizationId: crypto.randomUUID() },
    now: at,
    history: {
      id: crypto.randomUUID(),
      entry: { kind: "admin_invited", at, moderatorId: operatorId as never, email },
    },
  });
  if (result.kind !== "invited") throw new Error(`invite refused: ${result.reason}`);
  const token = newInviteToken();
  await kabinetInviteTokenRepo(db).issue({
    id: crypto.randomUUID(),
    invitationId,
    token,
    expiresAt: result.expiresAt,
    now: at,
  });
  return { token, invitationId, userId: result.userId };
}

const open = (zaproshennia: string | string[]) =>
  SignInPage({ searchParams: Promise.resolve({ zaproshennia }) });

/** The rendered tree, as text; functions by name, so two renders compare exactly. */
const rendered = async (zaproshennia: string | string[]) =>
  JSON.stringify(await open(zaproshennia), (_key, value) =>
    typeof value === "function" ? `fn:${value.name}` : value,
  );

/** Every table the link could change. */
const snapshot = async () => ({
  verification: await db.select().from(authVerification),
  invitations: await db.select().from(authInvitation),
  users: await db.select().from(authUser),
  accounts: await db.select().from(authAccount),
  sessions: await db.select().from(authSession),
  members: await db.select().from(authMember),
});

describe("the invitation link's GET (PW-2 Q1)", () => {
  it("opened twice, changes nothing: no row written or deleted, nothing sent, no budget charged", async () => {
    const { token } = await invited("olena@example.org", "Притулок «Ліс»");
    const before = await snapshot();
    const first = await rendered(token);
    const second = await rendered(token);
    expect(second).toBe(first);
    expect(await snapshot()).toEqual(before);
    expect(sends).not.toHaveBeenCalled();
    expect(charges).not.toHaveBeenCalled();
  });

  it("shows «Створіть пароль» for the shelter, with the address masked, never in full", async () => {
    const { token } = await invited("olena@example.org", "Притулок «Ліс»");
    const tree = await rendered(token);
    expect(tree).toContain('"fn:SetPasswordCard"');
    expect(tree).toContain('"shelterName":"Притулок «Ліс»"');
    expect(tree).toContain('"maskedEmail":"o•••@example.org"');
    expect(tree).not.toContain("olena@example.org");
  });

  it("every kind of link that can't be used renders one identical page", async () => {
    const live = await invited("live@example.org", "Притулок «Живий»");
    const expired = await invited(
      "expired@example.org",
      "Притулок «Старий»",
      new Date(NOW.getTime() - INVITATION_TTL_MS - 1),
    );
    const withdrawn = await invited("withdrawn@example.org", "Притулок «Відкликаний»");
    await kabinetInvitationRepo(db).revoke(withdrawn.invitationId);
    // Used: the POST deletes the link's row (`consume`), as it does after setting the password.
    const used = await invited("used@example.org", "Притулок «Використаний»");
    await kabinetInviteTokenRepo(db).consume(used.token, NOW);
    // Replaced: a resend issues a new link and the old one stops naming anything.
    const replaced = await invited("replaced@example.org", "Притулок «Замінений»");
    await kabinetInviteTokenRepo(db).issue({
      id: crypto.randomUUID(),
      invitationId: replaced.invitationId,
      token: newInviteToken(),
      expiresAt: new Date(NOW.getTime() + INVITATION_TTL_MS),
      now: NOW,
    });
    // A live invitation whose link lapsed (planted: an issued link never outlives its invitation).
    const lapsed = await invited("lapsed@example.org", "Притулок «Прострочений»");
    const lapsedLink = newInviteToken();
    await kabinetInviteTokenRepo(db).issue({
      id: crypto.randomUUID(),
      invitationId: lapsed.invitationId,
      token: lapsedLink,
      expiresAt: new Date(NOW.getTime() - 1),
      now: NOW,
    });
    const operator = await invited("operator-later@example.org", "Притулок «Опер»");
    await db
      .insert(superAdmins)
      .values({ id: crypto.randomUUID(), userId: operator.userId, grantedAt: NOW });
    // Review finding 6 (PW2-D4, PW2-Q2): a password already set, a member already, a pre-PW-2 link.
    const hasPassword = await invited("has-password@example.org", "Притулок «Пароль»");
    await db.insert(authAccount).values({
      id: crypto.randomUUID(),
      accountId: hasPassword.userId,
      providerId: "credential",
      userId: hasPassword.userId,
      password: "scrypt-hash-planted-for-the-test",
      createdAt: NOW,
      updatedAt: NOW,
    });
    const member = await invited("member@example.org", "Притулок «Учасник»");
    const [memberInvitation] = (await db.select().from(authInvitation)).filter(
      (row) => row.id === member.invitationId,
    );
    await db.insert(authMember).values({
      id: crypto.randomUUID(),
      organizationId: memberInvitation?.organizationId ?? "",
      userId: member.userId,
      role: "admin",
      createdAt: NOW,
    });
    // An invitation emailed before PW-2: its link carried the invitation id, a UUID (PW2-Q2 (a)).
    const preDeploy = await invited("pre-deploy@example.org", "Притулок «Старе посилання»");

    const unusable = {
      unknown: newInviteToken(),
      malformed: "not-a-token",
      empty: "",
      repeated: [live.token, live.token],
      expired: expired.token,
      withdrawn: withdrawn.token,
      used: used.token,
      replaced: replaced.token,
      "lapsed link": lapsedLink,
      operator: operator.token,
      "has a password": hasPassword.token,
      member: member.token,
      "pre-PW-2 id link": preDeploy.invitationId,
    };
    const pages = new Map<string, string>();
    for (const [name, value] of Object.entries(unusable)) pages.set(name, await rendered(value));
    const [first] = pages.values();
    expect(first).toContain('"fn:InviteUnusableCard"');
    for (const [name, page] of pages) expect(page, name).toBe(first);
    // And the live one is the form, so the identical pages aren't identical for every link.
    expect(await rendered(live.token)).not.toBe(first);
  });

  it("the page module calls no budget, no send and no write", () => {
    const source = readFileSync(join(import.meta.dirname, "page.tsx"), "utf8");
    for (const name of [
      "Limiters",
      "consume(",
      "issue(",
      "acceptInvitationWithPassword",
      "sendMagicLink",
      ".insert(",
      ".update(",
      ".delete(",
    ]) {
      expect(source.includes(name), name).toBe(false);
    }
  });

  it("sends no referrer from the link's page, and leaves the plain sign-in page's policy alone", async () => {
    expect(
      await generateMetadata({ searchParams: Promise.resolve({ zaproshennia: "x" }) }),
    ).toMatchObject({ referrer: "no-referrer" });
    expect(await generateMetadata({ searchParams: Promise.resolve({}) })).not.toHaveProperty(
      "referrer",
    );
  });
});

describe("a failed lookup reaches the log cleaned (PW1-F8 on PW-2's statements)", () => {
  const ADDRESS = "olena@example.org";
  let lines: string[];

  beforeEach(() => {
    lines = [];
    const spies = (["error", "warn", "log", "info", "debug", "trace"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        lines.push(
          args.map((arg) => (typeof arg === "string" ? arg : inspect(arg, { depth: 8 }))).join(" "),
        );
      }),
    );
    return () => {
      for (const spy of spies) spy.mockRestore();
    };
  });

  /**
   * The database with the link's one read refused by the server, its report quoting the token and
   * the address (as a Postgres message can quote a value). Every other statement runs, so the
   * page's identity read passes and the failure is the lookup's alone. By the statement's text.
   */
  const lookupRefused = (token: string) =>
    failingDriverDatabase(db, (query) =>
      /from "auth_verification" inner join "auth_invitation"/.test(query)
        ? postgresError({
            message: `invalid input syntax: "${token} ${ADDRESS}"`,
            code: "XX000",
            severity: "ERROR",
            detail: `Key (email)=(${ADDRESS})`,
          })
        : undefined,
    );

  /** Everything a log could show of `value`: its whole inspection, the cause chain included. */
  const shown = (value: unknown) => inspect(value, { depth: 8, showHidden: true });
  /** Which of the three is anywhere in `texts`, as booleans, so a failure prints no value. */
  const leaks = (texts: readonly string[], token: string) => ({
    token: texts.some((text) => text.includes(token)),
    address: texts.some((text) => text.includes(ADDRESS) || text.includes("olena")),
    params: texts.some((text) => /params:/i.test(text)),
  });
  const NONE = { token: false, address: false, params: false };

  it("the page throws (what Next's error log prints) a cleaned error: no token, address or params: in it or any log line", async () => {
    const { token } = await invited(ADDRESS, "Притулок «Ліс»");
    const failing = lookupRefused(token);
    // The control: the same statement on the raw handle carries all three, so the needles find a leak.
    const raw = await kabinetInviteTokenRepo(failing)
      .landingOf(token)
      .then(
        () => "resolved",
        (error: unknown) => error,
      );
    expect(leaks([shown(raw)], token)).toEqual({ token: true, address: true, params: true });

    served = failing;
    const thrown = await open(token).then(
      () => "resolved",
      (error: unknown) => error,
    );
    expect(thrown).toBeInstanceOf(CleanedQueryError);
    expect(sqlStateOf(thrown)).toBe("XX000");
    expect(leaks([shown(thrown), String(thrown), ...lines], token)).toEqual(NONE);
  });
});
