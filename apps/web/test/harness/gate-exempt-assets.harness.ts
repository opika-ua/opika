/**
 * Every gate-exempt page, opened in a real browser that has never seen the pre-launch gate cookie:
 * each same-origin file the page pulls in (images, fonts, css, js, icons, manifest) must answer 200.
 * A 403 there is the pre-launch gate shutting out an asset the exempt page needs (the broken logo
 * on sign-in); an unlisted asset fails here instead of in front of the first shelter.
 *
 * The routes are enumerated from `src/app/kabinet` (every static page) and checked against
 * `proxy.ts`, using its own `isGateExemptPath`, not typed from memory. Runs on the sign-in server
 * (`sign-in-server.ts`), which keeps the gate on. Tracing off: sign-in links are credentials.
 */

import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase, productionLocationPolicy } from "@opika/db";
import { kabinetInvitationRepo, kabinetInviteTokenRepo, kabinetShelterRepo } from "@opika/db/repos";
import { authMember, authUser, cities, superAdmins } from "@opika/db/schema";
import { assertDisposableTestDatabase, testDatabaseUrl } from "@opika/db/test";
import { type ModeratorId, publicLocationOf, type Shelter, type ShelterId } from "@opika/domain";
import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import { HARNESS_LOCATION_HMAC_SECRET } from "../harness-env";
import { type SignInServer, startSignInServer } from "./sign-in-server";

const FORWARDED_FOR = "198.51.100.61";
test.use({ extraHTTPHeaders: { "x-forwarded-for": FORWARDED_FOR }, trace: "off" });

const HARNESS_DATABASE_URL = assertDisposableTestDatabase(testDatabaseUrl("harness"));
const KABINET_APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../src/app/kabinet");

/**
 * `GATE_EXEMPT_PREFIXES` read out of `proxy.ts` itself. The module can't be imported here (Playwright's
 * loader doesn't resolve `next/server`), and a copy typed into this spec would go stale silently.
 */
function proxyExemptPrefixes(): string[] {
  const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../src/proxy.ts"),
    "utf8",
  );
  const list = /const GATE_EXEMPT_PREFIXES = \[([^\]]*)\]/.exec(source)?.[1];
  const prefixes = [...(list ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1] ?? "");
  expect(prefixes, "could not read GATE_EXEMPT_PREFIXES from proxy.ts").toContain("/kabinet");
  return prefixes;
}

/** Static page routes under `app/kabinet` (a `page.tsx`, no dynamic segment), as URL paths. */
function staticKabinetPages(dir = KABINET_APP_DIR): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name.startsWith("[") ? [] : staticKabinetPages(full);
    if (name !== "page.tsx") return [];
    const rel = relative(KABINET_APP_DIR, dirname(full)).split(sep).join("/");
    return [rel === "" ? "/kabinet" : `/kabinet/${rel}`];
  });
}

async function signedInContext(
  browser: Browser,
  server: SignInServer,
  email: string,
): Promise<BrowserContext> {
  const { origin } = server;
  const requested = await fetch(`${origin}/api/auth/sign-in/magic-link`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, "x-forwarded-for": FORWARDED_FOR },
    body: JSON.stringify({ email }),
  });
  expect(requested.status).toBe(200);
  const link = await server.linkFor(email);
  // A new context: no storage state, so no gate cookie.
  const context = await browser.newContext({
    baseURL: origin,
    extraHTTPHeaders: { "x-forwarded-for": FORWARDED_FOR },
  });
  const page = await context.newPage();
  expect((await page.goto(link))?.status()).toBe(200);
  await Promise.all([
    page.waitForURL(
      (url) => url.pathname.startsWith("/kabinet") && !url.pathname.startsWith("/kabinet/vkhid"),
    ),
    page.getByRole("button").click(),
  ]);
  await page.close();
  return context;
}

/** Opens `path`, lets the page settle, and returns every same-origin sub-resource that is not 200. */
async function nonOkAssets(page: Page, path: string, origin: string): Promise<string[]> {
  const bad: string[] = [];
  let seen = 0;
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin !== origin) return;
    // Vercel's own analytics scripts: served by the platform in front of the app, never by `next start`.
    if (url.pathname.startsWith("/_vercel/")) return;
    // The document itself is judged below (a not-found page is a 404 on purpose).
    if (response.request().isNavigationRequest()) return;
    seen += 1;
    if (response.status() !== 200) bad.push(`${response.status()} ${url.pathname}`);
  });
  const document = await page.goto(path, { waitUntil: "networkidle" });
  expect(document?.status(), `document ${path}`).not.toBe(403);
  // The confirm route answers a bare document with no sub-resources; every other page loads some.
  if (!path.startsWith("/kabinet/vkhid/pidtverdzhennia")) {
    expect(seen, `${path} loaded no same-origin assets at all`).toBeGreaterThan(0);
  }
  return bad;
}

test.describe("gate-exempt pages load every same-origin asset without the gate cookie", () => {
  let server: SignInServer | undefined;
  let admin: BrowserContext | undefined;
  let operator: BrowserContext | undefined;
  let shelterId = "";
  let inviteToken = "";
  const db = createDatabase(HARNESS_DATABASE_URL);

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    const now = new Date();
    const operatorId = randomUUID();
    const [city] = await db.select({ id: cities.id }).from(cities).limit(1);
    if (city === undefined) throw new Error("no seeded city");

    // Fictional verified shelters with no animals: the admin's list shows its empty state.
    const newShelter = (displayName: string): Shelter => {
      const id = randomUUID() as ShelterId;
      const exactAddress = {
        line1: "вул. Тестова, 1",
        line2: null,
        postalCode: null,
        cityId: city.id as never,
        district: null,
        coordinates: { lat: 50.45, lng: 30.52 },
      };
      const shelter: Shelter = {
        id,
        displayName,
        description: { uk: "Вигаданий притулок для перевірки екранів.", en: null },
        legalEntity: { kind: "unregistered_initiative", contactPersonName: "Олена Тестова" },
        publicLocation: publicLocationOf(
          id,
          exactAddress,
          productionLocationPolicy(HARNESS_LOCATION_HMAC_SECRET),
        ),
        exactAddress,
        contact: { primary: { kind: "phone", e164: "+380671234567" }, additional: [] },
        donation: null,
        logo: null,
        pendingDonation: null,
        version: 0,
        freshnessSentence: null,
        verification: {
          status: "verified",
          verifiedAt: now,
          verifiedBy: operatorId as ModeratorId,
          evidence: {
            submittedAt: now,
            items: [
              {
                kind: "site_visit",
                visitedAt: new Date("2026-10-01T00:00:00Z"),
                visitedBy: operatorId as ModeratorId,
                notes: "Чисто, вольєри з навісом.",
              },
            ],
          },
        },
        createdAt: now,
        lastUpdatedAt: now,
      };
      return shelter;
    };
    const shelter = newShelter("Вигаданий притулок для перевірки");
    await kabinetShelterRepo(db).createWithHistory(shelter, {
      id: randomUUID(),
      entry: {
        kind: "shelter_created",
        at: now,
        moderatorId: operatorId as ModeratorId,
        via: "registry",
      },
    });
    shelterId = shelter.id;

    server = await startSignInServer(HARNESS_DATABASE_URL, {
      LOCATION_HMAC_SECRET: HARNESS_LOCATION_HMAC_SECRET,
    });

    const adminEmail = `harness-assets-admin-${randomUUID()}@example.test`;
    const adminId = randomUUID();
    await db.insert(authUser).values({
      id: adminId,
      name: "Harness admin",
      email: adminEmail,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    const organizationId = await kabinetInvitationRepo(db).ensureOrganization(
      shelter.id,
      { organizationId: randomUUID() },
      now,
    );
    await db.insert(authMember).values({
      id: randomUUID(),
      organizationId,
      userId: adminId,
      role: "admin",
      createdAt: now,
    });
    const operatorEmail = `harness-assets-operator-${randomUUID()}@example.test`;
    await db.insert(authUser).values({
      id: operatorId,
      name: "Harness operator",
      email: operatorEmail,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(superAdmins).values({ id: randomUUID(), userId: operatorId, grantedAt: now });

    // A live invitation for the create-password page, to a second shelter of its own without an
    // organization (the one seeded pending shelter belongs to the invite-password spec).
    const invitedShelter = newShelter("Вигаданий притулок для запрошення");
    await kabinetShelterRepo(db).createWithHistory(invitedShelter, {
      id: randomUUID(),
      entry: {
        kind: "shelter_created",
        at: now,
        moderatorId: operatorId as ModeratorId,
        via: "registry",
      },
    });
    const invitationId = randomUUID();
    const inviteeEmail = `harness-assets-invitee-${randomUUID()}@example.test`;
    const invited = await kabinetInvitationRepo(db).invite({
      shelterId: invitedShelter.id,
      email: inviteeEmail,
      name: "Harness invitee",
      inviterUserId: operatorId,
      ids: { invitationId, userId: randomUUID(), organizationId: randomUUID() },
      now,
      history: {
        id: randomUUID(),
        entry: {
          kind: "admin_invited",
          at: now,
          moderatorId: operatorId as never,
          email: inviteeEmail,
        },
      },
    });
    if (invited.kind !== "invited") throw new Error("the invitation was refused");
    inviteToken = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
    await kabinetInviteTokenRepo(db).issue({
      id: randomUUID(),
      invitationId,
      token: inviteToken,
      expiresAt: invited.expiresAt,
      now,
    });

    admin = await signedInContext(browser, server, adminEmail);
    operator = await signedInContext(browser, server, operatorEmail);
  });

  test.afterAll(async () => {
    await admin?.close();
    await operator?.close();
    await server?.stop();
  });

  async function expectAllOk(context: BrowserContext | undefined, path: string) {
    if (context === undefined || server === undefined) throw new Error("not set up");
    const page = await context.newPage();
    try {
      expect(await nonOkAssets(page, path, server.origin), path).toEqual([]);
    } finally {
      await page.close();
    }
  }

  async function anonymous(browser: Browser, path: string) {
    if (server === undefined) throw new Error("no server");
    const context = await browser.newContext({
      baseURL: server.origin,
      extraHTTPHeaders: { "x-forwarded-for": FORWARDED_FOR },
    });
    try {
      await expectAllOk(context, path);
    } finally {
      await context.close();
    }
  }

  test("every static kabinet page is gate-exempt by the proxy's own rule", () => {
    const prefixes = proxyExemptPrefixes();
    for (const path of staticKabinetPages()) {
      expect(
        prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)),
        path,
      ).toBe(true);
    }
  });

  // Sign-in, forgot, reset (dummy token), confirm, a live invitation, a dead one (the one page for
  // a used, expired or unknown link), and an unknown path under /kabinet (the not-found page).
  test("signed-out pages", async ({ browser }) => {
    test.setTimeout(120_000);
    const paths = [
      "/kabinet/vkhid",
      "/kabinet/vkhid/zabuly",
      "/kabinet/vkhid/novyi-parol?token=dummy-token",
      "/kabinet/vkhid/pidtverdzhennia",
      `/kabinet/vkhid?zaproshennia=${inviteToken}`,
      "/kabinet/vkhid?zaproshennia=dummy-token",
      "/kabinet/ne-isnuie",
    ];
    for (const path of paths) await anonymous(browser, path);
  });

  test("a shelter admin's pages, including the empty animal list and a missing animal", async () => {
    test.setTimeout(120_000);
    for (const path of [
      "/kabinet/tvaryny",
      "/kabinet/tvaryny/nova",
      "/kabinet/prytulok",
      "/kabinet/akaunt",
      `/kabinet/tvaryny/${randomUUID()}`,
    ]) {
      await expectAllOk(admin, path);
    }
  });

  test("the operator's pages", async () => {
    test.setTimeout(120_000);
    for (const path of [
      "/kabinet/prytulky",
      "/kabinet/prytulky/novyi",
      `/kabinet/prytulky/${shelterId}`,
      "/kabinet/akaunt",
    ]) {
      await expectAllOk(operator, path);
    }
  });

  test("the pages above cover every static kabinet page", () => {
    const covered = new Set([
      "/kabinet/vkhid",
      "/kabinet/vkhid/zabuly",
      "/kabinet/vkhid/novyi-parol",
      "/kabinet/tvaryny",
      "/kabinet/tvaryny/nova",
      "/kabinet/prytulok",
      "/kabinet/akaunt",
      "/kabinet/prytulky",
      "/kabinet/prytulky/novyi",
    ]);
    // `/kabinet` itself only redirects into one of the pages above.
    for (const path of staticKabinetPages().filter((p) => p !== "/kabinet")) {
      expect(covered.has(path), `${path} is not opened by this spec`).toBe(true);
    }
  });
});
