import { inspect } from "node:util";
import {
  cityRepo,
  kabinetInvitationAcceptRepo,
  kabinetInvitationRepo,
  kabinetInviteTokenRepo,
  shelterRepo,
} from "@opika/db/repos";
import { authUser } from "@opika/db/schema";
import {
  failingDriverDatabase,
  makeCity,
  makeShelter,
  postgresError,
  setupTestDatabase,
  truncateAll,
} from "@opika/db/test";
import type { ModeratorId, ShelterId } from "@opika/domain";
import { call } from "@orpc/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inMemoryRateLimiter } from "../api/rate-limit";
import { SHELTER_WRITE_POLICY } from "./access";
import { CleanedQueryError } from "./clean-query-errors";
import type { KabinetContext } from "./context";
import { capturingInvitationSender } from "./email-senders";
import { invitationRouter } from "./invitation-router";
import { type InviteCredentials, newInviteToken } from "./invite-password";
import { PHOTO_UPLOADS_NOT_CONFIGURED } from "./photo-uploads";
import { registryRouter } from "./registry-router";
import { sqlStateOf } from "./sql-state";

/**
 * PW1-F8 on PW-2's POST: the invitation procedure runs every statement on the cleaned handle
 * (`inviteTokensOf`, `withQueryErrorsCleaned`), so what its handler throws when one fails has no
 * token, address or `params:`. Called with oRPC's `call`, which hands back the handler's own
 * error: the served route turns it into a bare 500 and logs nothing, so this is the one place
 * the error itself can be seen. The page's GET: `app/kabinet/vkhid/invite-landing-get.test.ts`.
 * Failures are forced at the driver by the statement's text, never by timing.
 */

const ADDRESS = "olena@example.org";
const PASSWORD = "ялинка-під-вікном-у-грудні";

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;
let lines: string[];

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

beforeEach(async () => {
  await truncateAll(db);
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

/** `ADDRESS` invited to a fresh fictional shelter, with a link. */
async function invited(): Promise<{ token: string; userId: string }> {
  const now = new Date();
  const operatorId = crypto.randomUUID();
  await db.insert(authUser).values({
    id: operatorId,
    name: "Оператор",
    email: "operator@example.org",
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  const city = makeCity();
  await cityRepo(db).insert(city);
  const shelter = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
  });
  await shelterRepo(db).insert(shelter);
  const invitationId = crypto.randomUUID();
  const result = await kabinetInvitationRepo(db).invite({
    shelterId: shelter.id as ShelterId,
    email: ADDRESS,
    name: "Олена",
    inviterUserId: operatorId,
    ids: { invitationId, userId: crypto.randomUUID(), organizationId: crypto.randomUUID() },
    now,
    history: {
      id: crypto.randomUUID(),
      entry: { kind: "admin_invited", at: now, moderatorId: operatorId as never, email: ADDRESS },
    },
  });
  if (result.kind !== "invited") throw new Error(`invite refused: ${result.reason}`);
  const token = newInviteToken();
  await kabinetInviteTokenRepo(db).issue({
    id: crypto.randomUUID(),
    invitationId,
    token,
    expiresAt: result.expiresAt,
    now,
  });
  return { token, userId: result.userId };
}

/** The link's read refused by the server, its report quoting the token and the address. */
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

/** Better Auth's two writes and its sign-in, never reached: a statement before them fails. */
const UNREACHED: InviteCredentials = {
  markVerified: async () => {
    throw new Error("unreachable");
  },
  createCredential: async () => {
    throw new Error("unreachable");
  },
  signIn: async () => ({ kind: "refused" }),
};

/** A signed-out visitor's context, as the served route builds it, over `handle`. */
const contextOver = (
  handle: KabinetContext["db"],
  credentials: InviteCredentials = UNREACHED,
  principal: KabinetContext["principal"] = { kind: "anonymous" },
): KabinetContext => {
  const generous = inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 100_000 });
  return {
    db: handle,
    now: new Date(),
    newId: () => crypto.randomUUID(),
    principal,
    cursorSecret: "test-cursor-secret",
    operatorDisplayName: "Олексій",
    locationPolicy: null,
    setCookies: [],
    cookieHeader: null,
    production: false,
    invites: capturingInvitationSender(),
    linkBaseURL: "http://localhost:3000",
    shelterWrites: SHELTER_WRITE_POLICY,
    photoUploads: PHOTO_UPLOADS_NOT_CONFIGURED,
    invitePasswords: {
      kind: "on",
      perIp: generous,
      ip: "198.51.100.7",
      credentials,
    },
  };
};

const shown = (value: unknown) => inspect(value, { depth: 8, showHidden: true });
const leaks = (texts: readonly string[], token: string) => ({
  token: texts.some((text) => text.includes(token)),
  address: texts.some((text) => text.includes(ADDRESS) || text.includes("olena")),
  password: texts.some((text) => text.includes(PASSWORD)),
  params: texts.some((text) => /params:/i.test(text)),
});

describe("the invitation POST's statements fail cleaned (PW1-F8 on PW-2)", () => {
  it("a failed invitation lookup: the handler throws a cleaned error; no token, address, password or params: in it or any log line", async () => {
    const { token } = await invited();
    const failing = lookupRefused(token);
    // The control: the same statement on the raw handle carries the token, the address and its params.
    const raw = await kabinetInviteTokenRepo(failing)
      .landingOf(token)
      .then(
        () => "resolved",
        (error: unknown) => error,
      );
    expect(leaks([shown(raw)], token)).toEqual({
      token: true,
      address: true,
      password: false,
      params: true,
    });

    const thrown = await call(
      invitationRouter.invitation.acceptWithPassword,
      { token, password: PASSWORD },
      { context: contextOver(failing) },
    ).then(
      () => "resolved",
      (error: unknown) => error,
    );
    expect(thrown).toBeInstanceOf(CleanedQueryError);
    expect(sqlStateOf(thrown)).toBe("XX000");
    expect(leaks([shown(thrown), String(thrown), ...lines], token)).toEqual({
      token: false,
      address: false,
      password: false,
      params: false,
    });
  });

  /** A statement refused by the server, its report quoting the token and the address. */
  const refusedWhen = (matches: RegExp, token: string) =>
    failingDriverDatabase(db, (query) =>
      matches.test(query)
        ? postgresError({
            message: `invalid input syntax: "${token} ${ADDRESS}"`,
            code: "XX000",
            severity: "ERROR",
            detail: `Key (email)=(${ADDRESS})`,
          })
        : undefined,
    );
  const NONE = { token: false, address: false, password: false, params: false };

  it("a failed consume: the handler throws a cleaned error; no token, address, password or params: in it or any log line", async () => {
    const { token } = await invited();
    // The consume's delete, and only it: the reset-link void deletes by user, with no LIKE.
    const failing = refusedWhen(/^delete from "auth_verification" .* like /i, token);
    const thrown = await call(
      invitationRouter.invitation.acceptWithPassword,
      { token, password: PASSWORD },
      { context: contextOver(failing) },
    ).then(
      () => "resolved",
      (error: unknown) => error,
    );
    expect(thrown).toBeInstanceOf(CleanedQueryError);
    expect(sqlStateOf(thrown)).toBe("XX000");
    expect(leaks([shown(thrown), String(thrown), ...lines], token)).toEqual(NONE);
  });

  /**
   * The accept's write carries the invitee's address (its history entry). A failed accept never
   * throws (the person is signed in, `/kabinet` retries it): what it leaves is one log line, and
   * that line has no address, token or `params:`, whichever layer would let one through.
   */
  it("a failed accept: signed in all the same; the one log line has no token, address, password or params:", async () => {
    const { token, userId } = await invited();
    // The automatic accept takes only a verified address (IN-Q13); the POST marks it, here a
    // stand-in does, so every user here is marked (the invitee, and the operator who already is).
    await db.update(authUser).set({ emailVerified: true });
    const failing = refusedWhen(/insert into "shelter_history"/, token);
    // The control: the accept's statement on the raw handle carries the address and its params.
    const raw = await kabinetInvitationAcceptRepo(failing)
      .accept({ userId, now: new Date(), ids: { memberId: "m-1", historyId: "h-1" } })
      .then(
        () => "resolved",
        (error: unknown) => error,
      );
    expect(leaks([shown(raw)], token)).toMatchObject({ address: true, params: true });

    const credentials: InviteCredentials = {
      markVerified: async () => {},
      createCredential: async () => {},
      signIn: async () => ({ kind: "signed_in", userId, setCookies: ["kabinet.session_token=x"] }),
    };
    const answered = await call(
      invitationRouter.invitation.acceptWithPassword,
      { token, password: PASSWORD },
      { context: contextOver(failing, credentials) },
    );
    expect(answered).toEqual({ kind: "signed_in" });
    expect(lines.filter((line) => line.includes("invitation accept failed"))).toHaveLength(1);
    expect(leaks(lines, token)).toEqual(NONE);
  });

  it("a failed issue (the registry's invite): the handler throws a cleaned error; no token, address or params: in it or any log line", async () => {
    const operatorId = crypto.randomUUID();
    const now = new Date();
    await db.insert(authUser).values({
      id: operatorId,
      name: "Оператор",
      email: "operator@example.org",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    const city = makeCity();
    await cityRepo(db).insert(city);
    const shelter = makeShelter({
      publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
    });
    await shelterRepo(db).insert(shelter);
    // The issue's statement: the earlier links' delete and the new one's insert, in one.
    const failing = refusedWhen(/insert into "auth_verification"/, "no-token-yet");
    const context = contextOver(failing, UNREACHED, {
      kind: "super_admin",
      moderatorId: operatorId as ModeratorId,
    });
    const thrown = await call(
      registryRouter.registry.admins.invite,
      { shelterId: shelter.id, name: "Олена", email: ADDRESS },
      { context },
    ).then(
      () => "resolved",
      (error: unknown) => error,
    );
    expect(thrown).toBeInstanceOf(CleanedQueryError);
    expect(sqlStateOf(thrown)).toBe("XX000");
    // The token never left the handler, so the needles are the address and `params:`.
    const issued = leaks([shown(thrown), String(thrown), ...lines], "no-token-yet");
    expect(issued).toEqual(NONE);
    // Nothing was emailed: the link was never stored.
    expect((context.invites as ReturnType<typeof capturingInvitationSender>).sent).toEqual([]);
  });
});
