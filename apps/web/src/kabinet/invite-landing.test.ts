import {
  cityRepo,
  kabinetInvitationRepo,
  kabinetInviteLandingRepo,
  shelterRepo,
} from "@opika/db/repos";
import { authInvitation, authUser, authVerification } from "@opika/db/schema";
import { makeCity, makeShelter, setupTestDatabase, truncateAll } from "@opika/db/test";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inMemoryRateLimiter } from "../api/rate-limit";
import { createKabinetAuth, FORWARDED_AUTH_PATHS, type KabinetAuth } from "./auth";
import {
  type InviteLandingDeps,
  inviteLandingOf,
  MAGIC_LINK_REQUEST_PATH,
  sendMagicLinkThroughAuth,
  submitInviteLanding,
} from "./invite-landing";
import { capturingSender } from "./magic-link-sender";
import { SIGN_IN_LIMITS } from "./sign-in-limit";

/**
 * IN-T10: the invite landing (`/kabinet/vkhid?zaproshennia=<id>`). Real
 * Postgres, real Better Auth, its real magic-link endpoint reached through
 * `auth.handler`; only the email provider is a capture (IN-Q9: no real
 * sends). Since EM-Q3 only the button's POST runs any of this
 * (`submitInviteLanding`, called by the `sendInviteLink` server action); the
 * page's GET renders the button and nothing else
 * (`app/kabinet/vkhid/invite-landing-get.test.ts`, and the harness drives it
 * in a browser). Both answer 404 while sign-in is unavailable, as K1 does.
 */

const BASE = "http://localhost:3000";
const OPERATOR = "0ec0ec0e-0000-4000-8000-000000000002";

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;
let sender: ReturnType<typeof capturingSender>;
let pending: Promise<void>[];
let auth: KabinetAuth;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

beforeEach(async () => {
  await truncateAll(db);
  sender = capturingSender();
  pending = [];
  auth = createKabinetAuth({
    db,
    sender,
    schedule: (work) => {
      pending.push(work());
    },
    baseURL: BASE,
    secret: "test-only-secret-that-is-long-enough-0123456789",
    secureCookies: false,
  });
  await db.insert(authUser).values({
    id: OPERATOR,
    name: "Оператор",
    email: "op@example.org",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
});

const limiters = (perAddress = 1000, perIp = 1000) => ({
  perAddress: inMemoryRateLimiter({ windowMs: 3_600_000, maxRequests: perAddress }),
  perIp: inMemoryRateLimiter({ windowMs: 3_600_000, maxRequests: perIp }),
});

/** A shelter and one pending invitation for `email`, written the way the registry writes it. */
async function invitation(email = "olena@example.org", now = new Date()) {
  const city = makeCity();
  await cityRepo(db).insert(city);
  const shelter = makeShelter({
    displayName: "Лапа допомоги",
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id } as never,
  });
  await shelterRepo(db).insert(shelter);
  const invitationId = crypto.randomUUID();
  const result = await kabinetInvitationRepo(db).invite({
    shelterId: shelter.id,
    email,
    name: "Олена",
    inviterUserId: OPERATOR,
    ids: { invitationId, userId: crypto.randomUUID(), organizationId: crypto.randomUUID() },
    now,
    history: {
      id: crypto.randomUUID(),
      entry: { kind: "admin_invited", at: now, moderatorId: OPERATOR as never, email },
    },
  });
  if (result.kind !== "invited") throw new Error(`invite refused: ${result.kind}`);
  return { invitationId, shelter };
}

/**
 * Sets one invitation's status. This package doesn't depend on drizzle-orm
 * (no `eq` here), so the table is rewritten: every invitation write in the
 * app stays in kabinetInvitationRepo, and this is test setup only.
 */
async function setStatus(invitationId: string, status: string) {
  const rows = await db.select().from(authInvitation);
  await db.delete(authInvitation);
  await db
    .insert(authInvitation)
    .values(rows.map((row) => (row.id === invitationId ? { ...row, status } : row)));
}

/** The landing's dependencies; `ip` is both the page's own per-IP key and the browser's forwarded header. */
function deps(overrides: Partial<InviteLandingDeps> = {}): InviteLandingDeps {
  const ip = overrides.ip ?? "203.0.113.7";
  return {
    lookup: (id) => kabinetInviteLandingRepo(db).invitationOf(id),
    limiters: limiters(),
    ip,
    now: new Date(),
    sendMagicLink: (email) =>
      sendMagicLinkThroughAuth(auth, BASE, email, new Headers({ "x-forwarded-for": ip })),
    ...overrides,
  };
}

async function open(invitationId: string, d = deps()) {
  const landing = await inviteLandingOf(invitationId, d);
  await Promise.all(pending);
  return landing;
}

describe("the invite landing's POST sends a fresh magic link to the invited address (IN-Q11, EM-Q3)", () => {
  it("sends exactly one link, to the invitation's address, and says so with the address masked", async () => {
    const { invitationId } = await invitation("Olena@Example.org");
    const landing = await open(invitationId);
    expect(landing).toEqual({
      kind: "sent",
      shelterName: "Лапа допомоги",
      maskedEmail: "o•••@example.org",
    });
    expect(sender.sent.map((m) => m.email)).toEqual(["olena@example.org"]);
    expect(sender.sent[0]?.url).toMatch(
      /^http:\/\/localhost:3000\/kabinet\/vkhid\/pidtverdzhennia\?token=[A-Za-z]+$/,
    );
  });

  it("changes nothing else: the invitation stays pending, only Better Auth's verification row is written", async () => {
    const { invitationId } = await invitation();
    const before = await db.select().from(authInvitation);
    await open(invitationId);
    expect(await db.select().from(authInvitation)).toEqual(before);
    expect(await db.select().from(authVerification)).toHaveLength(1);
  });

  it("goes through a path the auth route forwards (the same one K1's form uses)", () => {
    expect(FORWARDED_AUTH_PATHS).toContain(MAGIC_LINK_REQUEST_PATH);
  });
});

describe("what the landing reveals (IN-T10)", () => {
  it("an id nobody issued, a malformed one, an expired and a withdrawn invitation all read the same: unusable, nothing sent", async () => {
    const { invitationId: expiredId } = await invitation(
      "expired@example.org",
      new Date(Date.now() - 73 * 3_600_000),
    );
    const { invitationId: withdrawnId } = await invitation("withdrawn@example.org");
    await setStatus(withdrawnId, "canceled");
    for (const id of [
      crypto.randomUUID(),
      "not-an-id",
      "",
      `${crypto.randomUUID()}x`,
      expiredId,
      withdrawnId,
    ]) {
      expect(await open(id), id).toEqual({ kind: "unusable" });
    }
    expect(sender.sent).toEqual([]);
  });

  it("an accepted invitation says so and sends nothing", async () => {
    const { invitationId } = await invitation();
    await setStatus(invitationId, "accepted");
    expect(await open(invitationId)).toEqual({ kind: "already_accepted" });
    expect(sender.sent).toEqual([]);
  });

  it("a link Better Auth refuses to send reads as send_failed, never as sent", async () => {
    const { invitationId } = await invitation();
    expect(await open(invitationId, deps({ sendMagicLink: async () => false }))).toEqual({
      kind: "send_failed",
      shelterName: "Лапа допомоги",
    });
    expect(
      await open(
        invitationId,
        deps({
          sendMagicLink: async () => {
            throw new Error("down");
          },
        }),
      ),
    ).toEqual({ kind: "send_failed", shelterName: "Лапа допомоги" });
  });
});

describe("rate limits: the existing sign-in budgets (IN-Q11, HS-Q5)", () => {
  it("the per-address budget is K1's: five links an hour, the sixth sends nothing", async () => {
    const { invitationId } = await invitation();
    const shared = limiters(SIGN_IN_LIMITS.perAddress.maxRequests);
    const results = [];
    for (let i = 0; i < 6; i++)
      results.push((await open(invitationId, deps({ limiters: shared }))).kind);
    expect(results).toEqual(["sent", "sent", "sent", "sent", "sent", "rate_limited"]);
    expect(sender.sent).toHaveLength(5);
  });

  it("charges the same `address:` key K1's form charges, so the two share one budget", async () => {
    const { invitationId } = await invitation("Olena@Example.org");
    const shared = limiters(1);
    // K1's form spends the address's one link (signInAllowed's key format).
    expect(await shared.perAddress.check("address:olena@example.org", new Date())).toBe(true);
    expect(await open(invitationId, deps({ limiters: shared }))).toEqual({ kind: "rate_limited" });
    expect(sender.sent).toEqual([]);
  });

  it("charges the per-IP budget on every POST, before the lookup, and reads the same for a guessed id", async () => {
    const { invitationId } = await invitation();
    const shared = limiters(1000, 2);
    expect((await open(crypto.randomUUID(), deps({ limiters: shared }))).kind).toBe("unusable");
    expect((await open(crypto.randomUUID(), deps({ limiters: shared }))).kind).toBe("unusable");
    // The budget ran out on guesses: the real id now reads exactly as a guessed one does.
    expect(await open(invitationId, deps({ limiters: shared }))).toEqual({ kind: "rate_limited" });
    expect(await open(crypto.randomUUID(), deps({ limiters: shared }))).toEqual({
      kind: "rate_limited",
    });
    expect(sender.sent).toEqual([]);
  });
});

/**
 * Better Auth's own limit on its magic-link path (5 per 60 s per client IP)
 * is on in production (`rateLimit.enabled ?? isProduction`) and off under a
 * test runner, so it is switched on here. The landing's request is built on
 * the server: without the visitor's forwarded IP, Better Auth would count
 * every landing open in the instance against one bucket (email-track review,
 * finding 2; its probe: six invitees from six IPs gave five sent and one
 * send_failed).
 */
describe("Better Auth's own limit counts each visitor, not the instance (email-track review, finding 2)", () => {
  beforeEach(async () => {
    (await auth.$context).rateLimit.enabled = true;
  });
  // Off again for anything after this block: it shares the auth instance (merge-fixes review, finding 2).
  afterEach(async () => {
    (await auth.$context).rateLimit.enabled = false;
  });

  it("six invitees opening from six IPs all get their link", async () => {
    const results = [];
    for (let i = 1; i <= 6; i++) {
      const { invitationId } = await invitation(`invitee${i}@example.org`);
      results.push((await open(invitationId, deps({ ip: `198.51.100.${i}` }))).kind);
    }
    expect(results).toEqual(["sent", "sent", "sent", "sent", "sent", "sent"]);
    expect(sender.sent).toHaveLength(6);
  });

  it("six opens from one IP: Better Auth refuses the sixth, so it is limited per visitor", async () => {
    const results = [];
    for (let i = 1; i <= 6; i++) {
      const { invitationId } = await invitation(`same-ip${i}@example.org`);
      results.push((await open(invitationId, deps({ ip: "192.0.2.44" }))).kind);
    }
    expect(results).toEqual(["sent", "sent", "sent", "sent", "sent", "send_failed"]);
    expect(sender.sent).toHaveLength(5);
  });
});

/**
 * EM-Q3 (Oleksii, 2026-10-14, verbatim: "(b). The invite landing shows one
 * «Надіслати посилання» button; only its POST sends. A GET sends nothing."):
 * the POST's own guard. The confirm page's same-origin rule (IN-T7), reused
 * rather than copied, so a cross-site post can neither send nor spend.
 */
describe("submitInviteLanding: the button's POST (EM-Q3)", () => {
  const submit = (origin: string | null, invitationId: unknown, d = deps()) =>
    submitInviteLanding({ origin, invitationId }, { ...d, baseURL: BASE }).then(async (r) => {
      await Promise.all(pending);
      return r;
    });

  it("a same-origin POST sends exactly one link and answers as the landing does", async () => {
    const { invitationId } = await invitation();
    expect(await submit(BASE, invitationId)).toEqual({
      kind: "sent",
      shelterName: "Лапа допомоги",
      maskedEmail: "o•••@example.org",
    });
    expect(sender.sent.map((m) => m.email)).toEqual(["olena@example.org"]);
  });

  it("a cross-site, origin-less or `null`-origin POST is forbidden: nothing sent, no budget spent", async () => {
    const { invitationId } = await invitation();
    const shared = limiters(1, 1);
    for (const origin of ["https://attacker.example", null, "null", "http://localhost:3001"]) {
      expect(
        await submit(origin, invitationId, deps({ limiters: shared })),
        String(origin),
      ).toEqual({ kind: "forbidden" });
    }
    expect(sender.sent).toEqual([]);
    // Both budgets (one each) are untouched: the real POST still sends.
    expect((await submit(BASE, invitationId, deps({ limiters: shared }))).kind).toBe("sent");
  });

  it("a missing or non-text id reads as unusable and still costs the per-IP budget", async () => {
    const shared = limiters(1000, 1);
    expect(await submit(BASE, null, deps({ limiters: shared }))).toEqual({ kind: "unusable" });
    expect(await submit(BASE, crypto.randomUUID(), deps({ limiters: shared }))).toEqual({
      kind: "rate_limited",
    });
    expect(sender.sent).toEqual([]);
  });
});
