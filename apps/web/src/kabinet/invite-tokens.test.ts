import { inspect } from "node:util";
import {
  cityRepo,
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
import type { ShelterId } from "@opika/domain";
import { call } from "@orpc/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inMemoryRateLimiter } from "../api/rate-limit";
import { SHELTER_WRITE_POLICY } from "./access";
import { CleanedQueryError } from "./clean-query-errors";
import type { KabinetContext } from "./context";
import { capturingInvitationSender } from "./email-senders";
import { invitationRouter } from "./invitation-router";
import { newInviteToken } from "./invite-password";
import { PHOTO_UPLOADS_NOT_CONFIGURED } from "./photo-uploads";
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
async function invited(): Promise<string> {
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
  return token;
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

/** A signed-out visitor's context, as the served route builds it, over `handle`. */
const contextOver = (handle: KabinetContext["db"]): KabinetContext => {
  const generous = inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 100_000 });
  return {
    db: handle,
    now: new Date(),
    newId: () => crypto.randomUUID(),
    principal: { kind: "anonymous" },
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
      // Never reached: the read before them fails.
      credentials: {
        createCredential: async () => {
          throw new Error("unreachable");
        },
        signIn: async () => ({ kind: "refused" }),
      },
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
    const token = await invited();
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
});
