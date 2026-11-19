import { cityRepo, funnelRepo, kabinetActorRepo, selfRegistrationRepo } from "@opika/db/repos";
import {
  authAccount,
  authMember,
  authSession,
  authUser,
  authVerification,
  funnelEvents,
  notificationSends,
  registrationEmailTokens,
  shelterHistory,
  shelters,
} from "@opika/db/schema";
import { makeCity, setupTestDatabase, truncateAll } from "@opika/db/test";
import type { ShelterId } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inMemoryRateLimiter } from "../../api/rate-limit";
import { resolveRegistrationCity } from "../../features/registration/cities";
import { issueFormStamp } from "../../features/registration/form-stamp";
import { HONEYPOT_NAME } from "../../features/registration/form-state";
import {
  REGISTRATION_MAIL_DAILY_CAP,
  registrationLimiters,
} from "../../features/registration/limits";
import { type RegisterDeps, registerWith } from "../../features/registration/register";
import { createKabinetAuth, type KabinetAuth } from "../auth";
import type { KabinetAuthAvailability } from "../auth-route";
import type { OutgoingEmail } from "../email-provider";
import { capturingInvitationSender, type ProviderMail } from "../email-senders";
import { inviteCredentialsOf } from "../invite-password";
import { capturingSender } from "../magic-link-sender";
import { shelterPasswordVerdictOf } from "../password-checks";
import { inMemoryDelayStore } from "../password-limits";
import { capturingPasswordMail } from "../password-mail";
import { handleRegistrationLink, type RegistrationLinkDeps } from "./email-link-route";
import { registrationLinkOutcomeOf } from "./email-link-runtime";
import { hashRegistrationToken, newRegistrationToken } from "./registration-links";
import {
  confirmationDedupKey,
  type RegistrationMail,
  sendConfirmationEmail,
  sendOperatorNotification,
  takeDailyConfirmationMail,
} from "./registration-mail";

/**
 * Self-registration end to end on a real Better Auth instance and real Postgres: the form's POST
 * (`registerWith` wired as the server action wires it), the confirmation email, and its two links
 * (`handleRegistrationLink`, real `Request`s). Only the mail provider is a stand-in.
 */

const BASE = "http://localhost:3000";
const SECRET = "test-only-secret-that-is-long-enough-0123456789";
const STAMP_KEY = "stamp-key";
const PASSWORD = "ялинка-під-вікном-у-грудні";

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;
let auth: KabinetAuth;
let cityId: string;
let sent: OutgoingEmail[];
let now: Date;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const generous = () => inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 100_000 });

const providerMail = (): ProviderMail => ({
  sender: {
    async send(email) {
      sent.push(email);
      return { status: 200, messageId: null };
    },
  },
  blockedStatus: async () => ({ kind: "unknown", why: "provider_suppresses" }),
  refuseCopyPending: false,
});

const mail = (): RegistrationMail => ({
  deps: { db, mail: providerMail(), now: () => now, log: () => undefined },
  baseURL: BASE,
  operatorName: "Оператор",
});

beforeEach(async () => {
  await truncateAll(db);
  now = new Date();
  sent = [];
  const city = makeCity();
  await cityRepo(db).insert(city);
  cityId = city.id;
  auth = createKabinetAuth({
    db,
    sender: capturingSender(),
    schedule: () => undefined,
    baseURL: BASE,
    secret: SECRET,
    secureCookies: false,
    now: () => now,
    limiters: { perUser: generous(), perIp: generous() },
    passwordLimiters: {
      forgotPerIp: generous(),
      forgotPerAddress: generous(),
      resetPerIp: generous(),
      signInDelay: inMemoryDelayStore(),
    },
    passwordMail: capturingPasswordMail(),
    log: () => undefined,
    logError: () => undefined,
  });
});

const available: Extract<KabinetAuthAvailability, { kind: "available" }> = {
  kind: "available",
  sender: capturingSender(),
  invites: capturingInvitationSender(),
  passwordMail: capturingPasswordMail(),
  secret: "unused-here",
  baseURL: BASE,
};

function deps(overrides: Partial<RegisterDeps> = {}): RegisterDeps {
  const credentials = inviteCredentialsOf(
    auth,
    BASE,
    new Headers({ "x-forwarded-for": "198.51.100.7" }),
  );
  return {
    now,
    stampKey: STAMP_KEY,
    issueStamp: (issuedAt) => issueFormStamp(issuedAt, STAMP_KEY),
    allowIp: async () => ({ kind: "ok" }),
    allowAddress: async () => ({ kind: "ok" }),
    resolveCity: (by) => resolveRegistrationCity(db, by),
    passwordVerdict: shelterPasswordVerdictOf,
    hasAccount: (email) => selfRegistrationRepo(db).hasAccount(email),
    takeDailyMail: async () => true,
    hashPassword: async (password) => (await auth.$context).password.hash(password),
    write: (input) => selfRegistrationRepo(db).register(input),
    newId: () => crypto.randomUUID(),
    newToken: newRegistrationToken,
    hashToken: hashRegistrationToken,
    afterRegistration: async (application) => {
      await funnelRepo(db).record("registered", application.shelterId, now);
      await sendConfirmationEmail(mail(), application, confirmationDedupKey(application.userId));
    },
    signIn: (email, password) => credentials.signIn(email, password),
    setCookies: async () => undefined,
    log: () => undefined,
    ...overrides,
  };
}

function form(email = "olena@example.org"): FormData {
  const data = new FormData();
  const fields: Record<string, string> = {
    name: "Притулок «Тестовий хвіст»",
    cityId,
    link: "instagram.com/prytulok_test",
    contact: "@prytulok_test",
    email,
    password: PASSWORD,
    passwordRepeat: PASSWORD,
    [HONEYPOT_NAME]: "",
    formStamp: issueFormStamp(new Date(now.getTime() - 60_000), STAMP_KEY),
  };
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

/** Signs up and returns the account, its shelter, the cookies and the two links from the email. */
async function register(data = form()) {
  let cookies: readonly string[] = [];
  const state = await registerWith(
    data,
    deps({
      setCookies: async (setCookies) => {
        cookies = setCookies;
      },
    }),
  );
  expect(state.result).toEqual({ kind: "registered", next: "/kabinet" });
  const user = (await db.select().from(authUser)).find((u) => u.email === "olena@example.org");
  if (user === undefined) throw new Error("no account");
  const application = await selfRegistrationRepo(db).applicationOf(user.id);
  if (application === null) throw new Error("no application");
  const confirmation = sent.find((email) => email.text.includes("/kabinet/zaiavka/pidtverdyty"));
  const linkOf = (path: string) => {
    const match = new RegExp(`${BASE}${path}\\?token=([A-Za-z0-9_-]{43})`).exec(
      confirmation?.text ?? "",
    );
    if (match?.[1] === undefined) throw new Error(`no ${path} link in the email`);
    return match[1];
  };
  return {
    userId: user.id,
    shelterId: application.shelterId,
    cookies,
    confirmToken: linkOf("/kabinet/zaiavka/pidtverdyty"),
    notMeToken: linkOf("/kabinet/zaiavka/ne-ya"),
  };
}

/** Every table a link could touch, as rows: equal before and after means nothing changed. */
async function everything() {
  return {
    users: await db.select().from(authUser),
    accounts: await db.select().from(authAccount),
    sessions: await db.select().from(authSession),
    members: await db.select().from(authMember),
    verifications: await db.select().from(authVerification),
    shelters: await db.select().from(shelters),
    history: await db.select().from(shelterHistory),
    tokens: await db.select().from(registrationEmailTokens),
    funnel: await db.select().from(funnelEvents),
    sends: await db.select().from(notificationSends),
  };
}

const deleted: ShelterId[] = [];
function linkDeps(): RegistrationLinkDeps {
  return {
    availability: available,
    enabled: true,
    now,
    repo: selfRegistrationRepo(db),
    newId: () => crypto.randomUUID(),
    afterConfirm: async ({ application }) => {
      if (application === null) return;
      await funnelRepo(db).record("email_confirmed", application.shelterId, now);
      await sendOperatorNotification(mail(), application);
    },
    deleteApplication: async (shelterId) => {
      deleted.push(shelterId);
      return { kind: "deleted", shelterId, photoKeys: 0 };
    },
  };
}

const get = (path: string, token: string) =>
  handleRegistrationLink(
    new Request(`${BASE}${path}?token=${token}`),
    path.endsWith("pidtverdyty") ? "confirm_email" : "not_me",
    linkDeps(),
  );

const post = (path: string, token: string, origin: string | null) => {
  const headers = new Headers({ "content-type": "application/x-www-form-urlencoded" });
  if (origin !== null) headers.set("origin", origin);
  return handleRegistrationLink(
    new Request(`${BASE}${path}`, {
      method: "POST",
      headers,
      body: new URLSearchParams({ token }).toString(),
    }),
    path.endsWith("pidtverdyty") ? "confirm_email" : "not_me",
    linkDeps(),
  );
};

const CONFIRM = "/kabinet/zaiavka/pidtverdyty";
const NOT_ME = "/kabinet/zaiavka/ne-ya";

describe("the registration form's POST, end to end", () => {
  it("creates a signed-in shelter admin of a new application, its funnel step and one email", async () => {
    const registered = await register();
    expect(registered.cookies.some((cookie) => cookie.startsWith("kabinet.session_token="))).toBe(
      true,
    );
    // The cookie is a real session of the new account, and the account administers the shelter.
    const cookie = registered.cookies.map((c) => c.split(";")[0]).join("; ");
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user.id).toBe(registered.userId);
    expect(await kabinetActorRepo(db).roleOf(registered.userId)).toMatchObject({
      kind: "shelter_admin",
      shelterId: registered.shelterId,
    });
    expect((await db.select().from(funnelEvents)).map((row) => row.kind)).toEqual(["registered"]);
    expect(sent.map((email) => email.to)).toEqual(["olena@example.org"]);
    // The links' tokens are in the email; only their hashes are stored.
    const stored = (await db.select().from(registrationEmailTokens)).map((row) => row.tokenHash);
    expect(stored.sort()).toEqual(
      [
        hashRegistrationToken(registered.confirmToken),
        hashRegistrationToken(registered.notMeToken),
      ].sort(),
    );
    expect(stored).not.toContain(registered.confirmToken);
  });

  it("the same address again is email_taken, with nothing written and nothing sent", async () => {
    await register();
    const before = await everything();
    sent = [];
    const state = await registerWith(form(" OLENA@example.org"), deps());
    expect(state.result).toEqual({ kind: "email_taken" });
    expect(await everything()).toEqual(before);
    expect(sent).toEqual([]);
  });

  it("a sign-in that doesn't go through leaves the account to sign in to by hand", async () => {
    const state = await registerWith(form(), deps({ signIn: async () => ({ kind: "refused" }) }));
    expect(state.result).toEqual({ kind: "registered", next: "/kabinet/vkhid" });
    const signedIn = await inviteCredentialsOf(auth, BASE, new Headers()).signIn(
      "olena@example.org",
      PASSWORD,
    );
    expect(signedIn.kind).toBe("signed_in");
  });
});

describe("the confirmation email's links act only on an origin-checked POST", () => {
  it.each([
    ["«Підтвердити email»", CONFIRM, "confirmToken"],
    ["«Це не я»", NOT_ME, "notMeToken"],
  ] as const)(
    "a GET of %s, valid or not, changes nothing in any table",
    async (_name, path, which) => {
      const registered = await register();
      const before = await everything();
      const shown = await get(path, registered[which]);
      expect(shown.status).toBe(200);
      const html = await shown.text();
      expect(html).toContain(`<form method="post" action="${path}">`);
      // The POST reads the token from the form body; the form's own URL carries none.
      expect(html).not.toContain(`action="${path}?`);
      expect((await get(path, newRegistrationToken())).status).toBe(400);
      expect((await get(path, "not-a-token")).status).toBe(400);
      await get(path, registered[which]);
      expect(await everything()).toEqual(before);
      expect(deleted).toEqual([]);
    },
  );

  it("each live link's page says what its button does; the confirm one names its address", async () => {
    const registered = await register();
    expect(await (await get(CONFIRM, registered.confirmToken)).text()).toContain(
      "Натисніть кнопку, щоб підтвердити адресу olena@example.org.",
    );
    expect(await (await get(NOT_ME, registered.notMeToken)).text()).toContain(
      "Якщо ви не реєстрували притулок, натисніть кнопку\u00a0– я видалю заявку, створену з вашою адресою.",
    );
  });

  it.each([
    ["«Підтвердити email»", CONFIRM, "Посилання застаріло. Увійдіть у кабінет", true],
    [
      "«Це не я»",
      NOT_ME,
      'Посилання вже не діє. Якщо хтось зареєстрував притулок з вашою адресою\u00a0– напишіть мені на <a href="mailto:hello@opika.org.ua">hello@opika.org.ua</a>.',
      false,
    ],
  ] as const)(
    "%s with a dead link: its own sentence, and a way into the kabinet only on the confirm link",
    async (_name, path, sentence, kabinetLink) => {
      const html = await (await get(path, newRegistrationToken())).text();
      expect(html).toContain(sentence);
      expect(html.includes("Увійдіть у кабінет")).toBe(kabinetLink);
      expect(html.includes('href="/kabinet"')).toBe(kabinetLink);
    },
  );

  it.each([
    ["no Origin", null],
    ["Origin: null", "null"],
    ["another site's Origin", "https://evil.example"],
  ])("a POST with %s is refused and changes nothing", async (_name, origin) => {
    const registered = await register();
    const before = await everything();
    expect((await post(CONFIRM, registered.confirmToken, origin)).status).toBe(403);
    expect((await post(NOT_ME, registered.notMeToken, origin)).status).toBe(403);
    expect(await everything()).toEqual(before);
    expect(deleted).toEqual([]);
  });

  it("«Підтвердити email»: verifies the address once, records the step, tells hello@ once", async () => {
    const registered = await register();
    sent = [];
    const confirmed = await post(CONFIRM, registered.confirmToken, BASE);
    expect(confirmed.status).toBe(200);
    const user = (await db.select().from(authUser)).find((u) => u.id === registered.userId);
    expect(user?.emailVerified).toBe(true);
    expect((await db.select().from(funnelEvents)).map((row) => row.kind).sort()).toEqual([
      "email_confirmed",
      "registered",
    ]);
    expect(sent.map((email) => email.to)).toEqual(["hello@opika.org.ua"]);

    // Used up: the second POST is the expired page and sends nothing more.
    const again = await post(CONFIRM, registered.confirmToken, BASE);
    expect(again.status).toBe(400);
    expect(sent).toHaveLength(1);
  });

  it("an application with no contact tells hello@ «Контакти: не вказано»", async () => {
    const data = form();
    data.set("contact", "");
    const registered = await register(data);
    sent = [];
    expect((await post(CONFIRM, registered.confirmToken, BASE)).status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.text).toContain("Контакти: не вказано");
  });

  it("an expired link confirms nothing", async () => {
    const registered = await register();
    now = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000 + 1);
    expect((await post(CONFIRM, registered.confirmToken, BASE)).status).toBe(400);
    const user = (await db.select().from(authUser)).find((u) => u.id === registered.userId);
    expect(user?.emailVerified).toBe(false);
  });

  it("«Це не я» withdraws the application through the deletion service", async () => {
    deleted.length = 0;
    const registered = await register();
    const withdrawn = await post(NOT_ME, registered.notMeToken, BASE);
    expect(withdrawn.status).toBe(200);
    expect(deleted).toEqual([registered.shelterId]);
  });

  it("«Це не я» after approval deletes nothing, says so, and tells the operator once", async () => {
    deleted.length = 0;
    const registered = await register();
    // The only shelter here: the operator approved it.
    await db.update(shelters).set({ verificationStatus: "pending" });
    const answer = await post(NOT_ME, registered.notMeToken, BASE);
    expect(answer.status).toBe(200);
    expect(await answer.text()).toContain(
      'Притулок уже схвалено, тому заявку не можна видалити за посиланням. Якщо ви не реєстрували цей притулок, напишіть мені на <a href="mailto:hello@opika.org.ua">hello@opika.org.ua</a>.',
    );
    expect(deleted).toEqual([]);
    const lines = async () =>
      (await db.select().from(shelterHistory)).filter(
        (row) => row.kind === "not_me_after_approval",
      );
    expect((await lines()).map((row) => row.shelterId)).toEqual([registered.shelterId]);
    // The link is used up: a second click records nothing more.
    expect((await post(NOT_ME, registered.notMeToken, BASE)).status).toBe(400);
    expect(await lines()).toHaveLength(1);
  });

  it("«Це не я» on a refused application deletes nothing and records nothing", async () => {
    deleted.length = 0;
    const registered = await register();
    await db.update(shelters).set({ verificationStatus: "rejected" });
    expect((await post(NOT_ME, registered.notMeToken, BASE)).status).toBe(400);
    expect(deleted).toEqual([]);
    expect(
      (await db.select().from(shelterHistory)).filter(
        (row) => row.kind === "not_me_after_approval",
      ),
    ).toEqual([]);
  });

  it("is a 404 with the flag off, GET or POST", async () => {
    const registered = await register();
    const off = { ...linkDeps(), enabled: false };
    expect(
      (
        await handleRegistrationLink(
          new Request(`${BASE}${CONFIRM}?token=${registered.confirmToken}`),
          "confirm_email",
          off,
        )
      ).status,
    ).toBe(404);
  });
});

describe("the day's cap on confirmation emails", () => {
  it(`the ${REGISTRATION_MAIL_DAILY_CAP + 1}st is refused; the operator is told once, with nothing about anyone`, async () => {
    // A day of its own, so no other test's counts reach this key.
    const day = new Date("2031-03-04T12:00:00.000Z");
    const scheduled: Promise<void>[] = [];
    const schedule = (work: () => Promise<void>) => {
      scheduled.push(work());
    };
    const cap = registrationLimiters.mailDailyCap;
    for (let n = 1; n <= REGISTRATION_MAIL_DAILY_CAP; n += 1) {
      expect(await takeDailyConfirmationMail(cap, mail(), day, schedule)).toBe(true);
    }
    expect(scheduled).toEqual([]);
    sent = [];
    // Two refusals at once: both refused, one alarm.
    const refusals = await Promise.all([
      takeDailyConfirmationMail(cap, mail(), day, schedule),
      takeDailyConfirmationMail(cap, mail(), day, schedule),
    ]);
    expect(refusals).toEqual([false, false]);
    await Promise.all(scheduled);
    expect(sent.map((email) => email.to)).toEqual(["hello@opika.org.ua"]);
    const [alarm] = sent;
    expect(alarm?.subject).toBe("Ліміт листів реєстрації на сьогодні вичерпано");
    expect(alarm?.text).toContain(
      `Сьогодні надіслано ${REGISTRATION_MAIL_DAILY_CAP} листів реєстрації та повторного підтвердження – це ліміт на добу. До кінця доби нові реєстрації бачать повідомлення «Зараз забагато заявок». Перевір «Заявки» на ознаки зловживання: багато заявок з однаковими назвами, посиланнями чи доменами пошти.`,
    );
    // The button opens the live site's S1, plainly: no tracking redirect in the way.
    expect(alarm?.html).toContain('href="https://opika.org.ua/kabinet/prytulky"');
    expect(alarm?.html).toContain("Відкрити «Заявки»");
    expect(alarm?.text).not.toContain("@example.org");
    expect((await db.select().from(notificationSends)).map((row) => row.dedupKey)).toEqual([
      "registration_cap_hit:2031-03-04",
    ]);
  });

  it("a failed alarm never turns the refusal into anything else", async () => {
    const day = new Date("2031-03-05T12:00:00.000Z");
    const full = inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 0 });
    const broken: RegistrationMail = {
      ...mail(),
      deps: {
        ...mail().deps,
        mail: {
          ...providerMail(),
          sender: {
            send: async () => {
              throw new Error("provider down");
            },
          },
        },
      },
    };
    const scheduled: Promise<void>[] = [];
    expect(
      await takeDailyConfirmationMail(full, broken, day, (work) => {
        scheduled.push(work());
      }),
    ).toBe(false);
    await expect(Promise.all(scheduled)).resolves.toBeDefined();
  });
});

/**
 * R3: the pages' server action rebuilds the POST from its own Origin and the form body
 * (`registrationLinkOutcomeOf`); the served path, not the route-shaped wrapper above.
 */
describe("the email-link pages' action adapter", () => {
  const press = (
    purpose: "confirm_email" | "not_me",
    origin: string | null,
    fields: Record<string, string>,
  ) => {
    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) form.set(name, value);
    return registrationLinkOutcomeOf(purpose, { method: "POST", origin, form }, linkDeps());
  };
  const verified = async (userId: string) =>
    (await db.select().from(authUser)).find((u) => u.id === userId)?.emailVerified;

  it("a same-origin press confirms the address and shows the confirmed card", async () => {
    const registered = await register();
    expect(await press("confirm_email", BASE, { token: registered.confirmToken })).toEqual({
      kind: "page",
      state: { kind: "confirmed" },
      status: 200,
    });
    expect(await verified(registered.userId)).toBe(true);
  });

  it("a same-origin «Це не я» deletes the application", async () => {
    deleted.length = 0;
    const registered = await register();
    expect(await press("not_me", BASE, { token: registered.notMeToken })).toMatchObject({
      state: { kind: "withdrawn" },
    });
    expect(deleted).toEqual([registered.shelterId]);
  });

  it.each([
    ["another site's Origin", "https://evil.example"],
    ["no Origin", null],
  ])("with %s, a press writes nothing", async (_name, origin) => {
    deleted.length = 0;
    const registered = await register();
    const before = await everything();
    expect((await press("confirm_email", origin, { token: registered.confirmToken })).kind).toBe(
      "forbidden",
    );
    expect((await press("not_me", origin, { token: registered.notMeToken })).kind).toBe(
      "forbidden",
    );
    expect(await everything()).toEqual(before);
    expect(deleted).toEqual([]);
  });

  it("reads the token from the form body only", async () => {
    const registered = await register();
    const before = await everything();
    const outcome = await press("confirm_email", BASE, { other: registered.confirmToken });
    expect(outcome).toMatchObject({ state: { kind: "expired" }, status: 400 });
    expect(await everything()).toEqual(before);
  });

  it("a GET through it reads only: the form card, nothing written", async () => {
    const registered = await register();
    const before = await everything();
    expect(
      await registrationLinkOutcomeOf(
        "confirm_email",
        { method: "GET", token: registered.confirmToken },
        linkDeps(),
      ),
    ).toEqual({
      kind: "page",
      state: { kind: "form", token: registered.confirmToken, email: "olena@example.org" },
      status: 200,
    });
    // «Це не я» doesn't need the address, so its card isn't handed it.
    expect(
      await registrationLinkOutcomeOf(
        "not_me",
        { method: "GET", token: registered.notMeToken },
        linkDeps(),
      ),
    ).toEqual({
      kind: "page",
      state: { kind: "form", token: registered.notMeToken, email: null },
      status: 200,
    });
    expect(await everything()).toEqual(before);
  });
});
