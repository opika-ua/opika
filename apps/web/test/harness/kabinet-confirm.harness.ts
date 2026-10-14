/**
 * The emailed sign-in link, opened in a real browser (IN-Q11, IN-T7, IN-T8).
 *
 * Why a browser: the confirm page's POST is refused unless `Origin` is our own
 * origin (login CSRF, IN-T7). What a browser actually sends there depends on
 * the page's `Referrer-Policy`: under `no-referrer` Chromium sends
 * `Origin: null`, so every real sign-in was a 403 while every unit test, which
 * sets `Origin` by hand, passed (review of 9bd1411). Only a real browser
 * pressing the real button can tell the two apart.
 *
 * **Why a second server.** The harness's main server runs `next start` in
 * production mode, where kabinet sign-in is unavailable and the confirm page
 * is a 404 (`kabinetAuthAvailability`): the first test below pins that, and
 * the main server carries full `BETTER_AUTH_*` config, so only the production
 * branch can produce that 404. Sign-in
 * runs only outside `NODE_ENV=production`, with the development console
 * sender. So this file starts the same build a second time, on its own port,
 * with `NODE_ENV=test` and `BETTER_AUTH_*` set, and reads the link from the
 * console sender's line on that server's stdout, exactly the channel local
 * development uses. Nothing in the app is patched or bypassed; the production
 * gate is untouched (and asserted).
 *
 * The link is never printed: it is a credential, even a test one, and nothing
 * here logs it or includes it in a failure message. Tracing is off in this
 * file, since a retained trace would record the link and CI uploads them
 * (review of f86c7cd, finding 2).
 */

import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { createDatabase } from "@opika/db";
import { kabinetInvitationRepo } from "@opika/db/repos";
import { authMember, authUser, shelters } from "@opika/db/schema";
import { assertDisposableTestDatabase, testDatabaseUrl } from "@opika/db/test";
import { expect, test } from "@playwright/test";
import {
  CURSOR_HMAC_SECRET,
  HARNESS_BETTER_AUTH_SECRET,
  HARNESS_PRELAUNCH_GATE_SECRET,
  R2_PUBLIC_BASE_URL,
} from "../harness-env";

/** Transcribed from `src/kabinet/auth.ts` (`CONFIRM_PATH`), not imported. */
const CONFIRM_PATH = "/kabinet/vkhid/pidtverdzhennia";
/** Over plain HTTP the cookie has no `__Host-` prefix (`kabinetCookieName`). */
const SESSION_COOKIE = "kabinet.session_token";

const HARNESS_DATABASE_URL = assertDisposableTestDatabase(testDatabaseUrl("harness"));

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

let server: ChildProcess | undefined;
let origin = "";
let stdout = "";

test.use({ trace: "off" });

test.describe("kabinet confirm page, in a real browser", () => {
  test("the production-mode server answers 404: sign-in stays dark there", async ({ request }) => {
    const response = await request.get(`${CONFIRM_PATH}?token=${"A".repeat(32)}`);
    expect(response.status()).toBe(404);
  });

  test.describe("with sign-in available (NODE_ENV=test)", () => {
    test.beforeAll(async () => {
      test.setTimeout(90_000);
      const port = await freePort();
      origin = `http://127.0.0.1:${port}`;
      const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
      server = spawn(
        process.execPath,
        [nextBin, "start", "--port", String(port), "--hostname", "127.0.0.1"],
        {
          env: {
            ...process.env,
            NODE_ENV: "test",
            DATABASE_URL: HARNESS_DATABASE_URL,
            CURSOR_HMAC_SECRET,
            NEXT_PUBLIC_R2_PUBLIC_BASE_URL: R2_PUBLIC_BASE_URL,
            PRELAUNCH_GATE_SECRET: HARNESS_PRELAUNCH_GATE_SECRET,
            BETTER_AUTH_SECRET: HARNESS_BETTER_AUTH_SECRET,
            BETTER_AUTH_URL: origin,
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      server.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      server.stderr?.resume();

      await expect
        .poll(
          async () => {
            try {
              return (await fetch(`${origin}${CONFIRM_PATH}`)).status;
            } catch {
              return 0;
            }
          },
          { timeout: 60_000, intervals: [250] },
        )
        // A missing token renders the "link not valid" state: 400, not the 404
        // the production-mode server gives. So sign-in is really on here.
        .toBe(400);
    });

    // Waits for the exit rather than only signalling it, so the run never
    // ends with this server still shutting down. `next start` serves in this
    // one process (no child), so killing it ends the whole server.
    test.afterAll(async () => {
      if (server === undefined || server.exitCode !== null || server.signalCode !== null) return;
      const exited = new Promise<void>((resolve) => server?.once("exit", () => resolve()));
      server.kill();
      await exited;
    });

    test("«Увійти» signs in; the GET leaves the token valid; no Referer ever carries it", async ({
      browser,
    }) => {
      const email = `harness-confirm-${randomUUID()}@example.test`;
      const db = createDatabase(HARNESS_DATABASE_URL);
      const now = new Date();
      const userId = randomUUID();
      // The console sender only sends to an existing user (`auth.ts`); the
      // operator's invitation is what creates one in real use.
      await db.insert(authUser).values({
        id: userId,
        name: "Harness",
        email,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      });
      // A shelter admin of one seeded (fictional) shelter, so the redirect's
      // target, /kabinet, has a shelter to show rather than the 404 a roleless
      // account gets (`kabinetHomeOf`). Accepting an invitation, the real way
      // to become one, isn't built yet (IN-Q12-Q14).
      const shelter = (
        await db.select({ id: shelters.id, organizationId: shelters.organizationId }).from(shelters)
      ).find((row) => row.organizationId === null);
      if (shelter === undefined) throw new Error("no seeded shelter without an organization");
      const organizationId = await kabinetInvitationRepo(db).ensureOrganization(
        shelter.id,
        { organizationId: randomUUID() },
        now,
      );
      await db
        .insert(authMember)
        .values({ id: randomUUID(), organizationId, userId, role: "admin", createdAt: now });
      // Not closed here: `Database` doesn't expose its client, and a cast to
      // reach it isn't worth it for one test connection. The worker's exit ends
      // it; teardown drops the database WITH (FORCE) regardless.

      const requested = await fetch(`${origin}/api/auth/sign-in/magic-link`, {
        method: "POST",
        headers: { "content-type": "application/json", origin },
        body: JSON.stringify({ email }),
      });
      expect(requested.status).toBe(200);

      const marker = `[kabinet] magic link for ${email}: `;
      await expect.poll(() => stdout.includes(marker), { timeout: 10_000 }).toBe(true);
      const link = stdout.slice(stdout.indexOf(marker) + marker.length).split(/\s/, 1)[0] ?? "";
      expect(link.startsWith(`${origin}${CONFIRM_PATH}?token=`), "link is the confirm page").toBe(
        true,
      );

      // A fresh context: no pre-launch gate cookie (the kabinet is exempt) and
      // no session from anywhere else.
      const context = await browser.newContext();
      const referers: string[] = [];
      const pending: Promise<void>[] = [];
      context.on("request", (request) => {
        pending.push(
          request.allHeaders().then((headers) => {
            if (headers.referer !== undefined) referers.push(headers.referer);
          }),
        );
      });
      const page = await context.newPage();

      const shown = await page.goto(link);
      expect(shown?.status()).toBe(200);
      // Opened twice, as a mail scanner and then the person would: still valid.
      const reloaded = await page.reload();
      expect(reloaded?.status()).toBe(200);

      const postResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === CONFIRM_PATH,
      );
      const landingResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "GET" && new URL(response.url()).pathname === "/kabinet",
      );
      await page.getByRole("button").click();
      const posted = await postResponse;
      const landing = await landingResponse;
      const postHeaders = await posted.request().allHeaders();

      expect(
        {
          status: posted.status(),
          location: posted.headers().location,
          origin: postHeaders.origin,
          // `strict-origin`: the bare origin, never the path or query. The
          // token's value is masked so a failure here never prints it.
          referer: postHeaders.referer?.replace(/token=[^&]*/, "token=<masked>"),
        },
        "the POST carried our real Origin and answered the redirect",
      ).toEqual({ status: 303, location: "/kabinet", origin, referer: `${origin}/` });

      const session = (await context.cookies(origin)).find((c) => c.name === SESSION_COOKIE);
      expect(session, "session cookie set in the browser").toBeDefined();
      expect(session?.httpOnly).toBe(true);

      // The redirect lands on the signed-in shelter's own page, not a 404.
      expect(landing.status(), "/kabinet after sign-in").toBe(200);

      // The session is real, not just a cookie: Better Auth resolves it.
      const me = await page.request.get(`${origin}/api/auth/get-session`);
      expect(((await me.json()) as { user?: { email?: string } } | null)?.user?.email).toBe(email);

      await Promise.all(pending);
      // Every request of the run: the two page loads, the POST, the redirect
      // and /kabinet's own assets (whose Referer is `/kabinet`, under Next's
      // default policy, which is fine: no token there).
      expect(referers.length, "the POST, at least, carried a Referer").toBeGreaterThan(0);
      // A count, not the list: a failing list would print the token.
      expect(
        referers.filter((referer) => referer.includes("token=")).length,
        "no Referer carries the token",
      ).toBe(0);
      expect(referers.filter((referer) => referer.includes(CONFIRM_PATH)).length).toBe(0);

      await context.close();
    });

    /**
     * EM-Q3 (Oleksii, 2026-10-14, verbatim: "(b). The invite landing shows one
     * «Надіслати посилання» button; only its POST sends. A GET sends nothing.
     * Test: a GET doesn't consume the per-address send budget."). A mail
     * scanner's six GETs and a HEAD send nothing; six is one past the
     * address's five links an hour, so had any of them charged that budget the
     * button's POST would answer rate-limited and send nothing. The POST is
     * the real button in a real browser, so its Origin and Referer are what a
     * browser sends under the landing's Referrer-Policy.
     */
    test("the invite landing: GETs and a HEAD send nothing; the button's POST sends exactly one link", async ({
      browser,
    }) => {
      const email = `harness-invite-${randomUUID()}@example.test`;
      const db = createDatabase(HARNESS_DATABASE_URL);
      const now = new Date();
      const operatorId = randomUUID();
      await db.insert(authUser).values({
        id: operatorId,
        name: "Harness operator",
        email: `harness-operator-${randomUUID()}@example.test`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      });
      const shelter = (
        await db.select({ id: shelters.id, organizationId: shelters.organizationId }).from(shelters)
      ).find((row) => row.organizationId === null);
      if (shelter === undefined) throw new Error("no seeded shelter without an organization");
      const invitationId = randomUUID();
      const invited = await kabinetInvitationRepo(db).invite({
        shelterId: shelter.id as never,
        email,
        name: "Harness invitee",
        inviterUserId: operatorId,
        ids: { invitationId, userId: randomUUID(), organizationId: randomUUID() },
        now,
        history: {
          id: randomUUID(),
          entry: { kind: "admin_invited", at: now, moderatorId: operatorId as never, email },
        },
      });
      expect(invited.kind).toBe("invited");

      const landingPath = `/kabinet/vkhid?zaproshennia=${invitationId}`;
      const marker = `[kabinet] magic link for ${email}: `;
      const sentCount = () => stdout.split(marker).length - 1;

      for (let i = 0; i < 6; i++) {
        expect((await fetch(`${origin}${landingPath}`)).status, `GET ${i + 1}`).toBe(200);
      }
      expect((await fetch(`${origin}${landingPath}`, { method: "HEAD" })).status).toBe(200);

      const context = await browser.newContext();
      const page = await context.newPage();
      expect((await page.goto(`${origin}${landingPath}`))?.status()).toBe(200);
      expect(await page.getByRole("button").count(), "one button").toBe(1);
      // Still nothing sent: eight GETs and a HEAD so far, the browser's included.
      expect(sentCount(), "no link sent by any GET or HEAD").toBe(0);

      const postResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/kabinet/vkhid",
      );
      await page.getByRole("button").click();
      const posted = await postResponse;
      const postHeaders = await posted.request().allHeaders();
      expect(
        { status: posted.status(), origin: postHeaders.origin, referer: postHeaders.referer },
        "the POST carried our real Origin, and a Referer without the invitation id",
      ).toEqual({ status: 200, origin, referer: `${origin}/` });

      // The answer card names the masked address (`maskAddress`: first letter, •••, the domain).
      await expect(page.getByText("h•••@example.test")).toBeVisible();
      await expect.poll(sentCount, { timeout: 10_000 }).toBe(1);
      const link = stdout.slice(stdout.indexOf(marker) + marker.length).split(/\s/, 1)[0] ?? "";
      expect(link.startsWith(`${origin}${CONFIRM_PATH}?token=`), "link is the confirm page").toBe(
        true,
      );

      await context.close();
    });
  });
});
