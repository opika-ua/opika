/* Temporary audit spec (never committed). Runs axe, keyboard and motion probes. */
import { randomUUID } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { createDatabase } from "@opika/db";
import { kabinetInvitationRepo } from "@opika/db/repos";
import { authMember, authUser, shelters, superAdmins } from "@opika/db/schema";
import { assertDisposableTestDatabase, testDatabaseUrl } from "@opika/db/test";
import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import { HARNESS_LOCATION_HMAC_SECRET } from "../harness-env";
import { type SignInServer, startSignInServer } from "./sign-in-server";

const OUT = process.env.A11Y_OUT ?? "a11y-out.jsonl";
const AXE = readFileSync(process.env.A11Y_AXE ?? "axe.min.js", "utf8");
const FF = "198.51.100.77";
test.use({ extraHTTPHeaders: { "x-forwarded-for": FF }, trace: "off" });
const DB = assertDisposableTestDatabase(testDatabaseUrl("harness"));
const WIDTHS = [360, 1280];

function log(o: unknown) {
  appendFileSync(OUT, `${JSON.stringify(o)}\n`);
}

async function probe(page: Page, name: string, state = "") {
  await page.addScriptTag({ content: AXE }).catch(() => {});
  const res = await page.evaluate(async () => {
    const axe = (window as any).axe;
    const r = await axe.run(document, {
      runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"],
    });
    const violations = r.violations.map((v: any) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      n: v.nodes.length,
      nodes: v.nodes.slice(0, 4).map((n: any) => ({
        t: n.target.join(" "),
        h: n.html.slice(0, 140),
        s: (n.any[0]?.message ?? n.all[0]?.message ?? n.none[0]?.message ?? "").slice(0, 200),
      })),
    }));
    const doc = document.documentElement;
    return {
      violations,
      overflow: doc.scrollWidth > doc.clientWidth + 1 ? [doc.scrollWidth, doc.clientWidth] : null,
      h1: document.querySelectorAll("h1").length,
      mains: document.querySelectorAll("main,[role=main]").length,
      lang: doc.lang,
      title: document.title,
    };
  });
  log({ kind: "axe", name, state, w: page.viewportSize()?.width, ...res });
}

async function tabWalk(page: Page, name: string, max = 45) {
  const stops: unknown[] = [];
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const s = await page.evaluate(() => {
      const e = document.activeElement as HTMLElement | null;
      if (!e || e === document.body) return null;
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      const lb = e.getAttribute("aria-labelledby");
      const label =
        e.getAttribute("aria-label") ||
        (lb ? document.getElementById(lb)?.textContent : "") ||
        (e as HTMLInputElement).labels?.[0]?.textContent ||
        e.textContent ||
        e.getAttribute("title") ||
        "";
      const ring =
        (cs.outlineStyle !== "none" && Number.parseFloat(cs.outlineWidth) > 0) ||
        cs.boxShadow !== "none";
      return {
        tag: e.tagName.toLowerCase(),
        role: e.getAttribute("role"),
        name: label.trim().slice(0, 40),
        ring,
        w: Math.round(r.width),
        h: Math.round(r.height),
        offscreen: r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth,
      };
    });
    if (s === null) break;
    stops.push(s);
  }
  log({ kind: "tab", name, w: page.viewportSize()?.width, stops });
}

async function motion(page: Page, name: string) {
  const r = await page.evaluate(() => {
    const out: string[] = [];
    for (const e of Array.from(document.querySelectorAll("*")).slice(0, 4000)) {
      const cs = getComputedStyle(e);
      const dur = (v: string) => v.split(",").some((x) => Number.parseFloat(x) > 0.011);
      const cls = String((e as HTMLElement).className ?? "").slice(0, 40);
      if (cs.animationName !== "none" && dur(cs.animationDuration))
        out.push(`anim ${cs.animationName} ${e.tagName}.${cls}`);
      if (dur(cs.transitionDuration))
        out.push(`trans ${cs.transitionProperty.slice(0, 30)} ${e.tagName}.${cls}`);
      if (cs.scrollBehavior === "smooth") out.push(`smooth ${e.tagName}`);
    }
    return Array.from(new Set(out)).slice(0, 25);
  });
  log({ kind: "motion", name, items: r });
}

const firstAnimalHref = (page: Page) =>
  page
    .locator('a[href^="/tvaryny/"]')
    .evaluateAll(
      (as) =>
        (as as HTMLAnchorElement[])
          .map((a) => a.getAttribute("href"))
          .find((h) => h && /\/tvaryny\/[0-9a-f-]{36}/.test(h)) ?? "",
    );

test.describe.configure({ mode: "serial" });

test("public pages", async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto("/tvaryny");
  const animalPath = (await firstAnimalHref(page)).split("?")[0] ?? "";
  await page.goto(animalPath);
  const shelterHref =
    (await page.locator('a[href^="/prytulky/"]').first().getAttribute("href")) ?? "/prytulky/x";
  const pages: [string, string][] = [
    ["home/gallery", "/tvaryny"],
    ["gallery filtered-empty", "/tvaryny?vyd=cat&vik=senior&rozmir=large&stat=m&misto=zzz"],
    ["animal", animalPath],
    ["shelter", shelterHref],
    ["deck", "/tvaryny/gortaty"],
    ["saved", "/zberezheni"],
    ["prytulkam", "/prytulkam"],
    ["pro", "/pro"],
    ["404 animal", "/tvaryny/00000000-0000-4000-8000-000000000000"],
    ["404 shelter", "/prytulky/00000000-0000-4000-8000-000000000000"],
    ["404 generic", "/nema-takoi-storinky"],
  ];
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: w < 500 ? 780 : 800 });
    for (const [name, path] of pages) {
      await page.goto(path, { waitUntil: "load" });
      await page.waitForTimeout(600);
      await probe(page, name);
      await tabWalk(page, name);
    }
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 800 });
  for (const [name, path] of pages.filter(([n]) =>
    ["home/gallery", "animal", "deck", "shelter"].includes(n),
  )) {
    await page.goto(path, { waitUntil: "load" });
    await page.waitForTimeout(600);
    await motion(page, `${name} (reduced)`);
  }
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/tvaryny");
  await motion(page, "home/gallery (normal)");
});

test("gallery overlays", async ({ page }) => {
  test.setTimeout(300_000);
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.goto("/tvaryny", { waitUntil: "load" });
    await page.waitForTimeout(500);
    const sel = "button[aria-haspopup], button[aria-expanded]";
    const n = await page.locator(sel).count();
    for (let i = 0; i < Math.min(n, 8); i++) {
      const t = page.locator(sel).nth(i);
      if (!(await t.isVisible())) continue;
      const label = ((await t.getAttribute("aria-label")) ?? (await t.textContent()) ?? "")
        .trim()
        .slice(0, 30);
      await t.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(350);
      await probe(page, "gallery overlay", `${label} @${w}`);
      const dialogs = await page.locator("dialog[open]").count();
      const focusInside = await page.evaluate(() => {
        const a = document.activeElement;
        return !!a && !!a.closest("dialog,[role=dialog],[role=menu],[role=listbox],[popover]");
      });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      const returned = await page.evaluate(
        (args) => document.activeElement === document.querySelectorAll(args.sel)[args.idx],
        { sel, idx: i },
      );
      log({ kind: "overlay", label, w, dialogs, focusInside, focusReturnedToTrigger: returned });
    }
    await page.goto("/tvaryny", { waitUntil: "load" });
    const href = ((await firstAnimalHref(page)) as string).split("?")[0] ?? "";
    await page.goto(href, { waitUntil: "load" });
    const reveal = page.getByRole("button", { name: /Написати/ }).first();
    if (await reveal.count()) {
      await reveal.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(500);
      await probe(page, "contact reveal dialog", `@${w}`);
      log({
        kind: "overlay",
        label: "reveal",
        w,
        dialogs: await page.locator("dialog[open]").count(),
      });
      await page.keyboard.press("Escape");
    }
    await page.goto("/tvaryny", { waitUntil: "load" });
    await page
      .locator('a[href*="/tvaryny/"]')
      .nth(3)
      .click()
      .catch(() => {});
    await page.waitForTimeout(800);
    await probe(page, "animal overlay", `@${w}`);
    log({
      kind: "overlay",
      label: "animal overlay",
      w,
      dialogs: await page.locator("dialog[open]").count(),
      url: page.url(),
    });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    log({ kind: "overlay", label: "animal overlay after Esc", w, url: page.url() });
  }
});

test("deck keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/tvaryny/gortaty", { waitUntil: "load" });
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => ({
    live: Array.from(document.querySelectorAll("[aria-live],[role=status],[role=alert]")).map(
      (e) => e.getAttribute("aria-live") || e.getAttribute("role"),
    ),
    buttons: Array.from(document.querySelectorAll("button")).map((b) =>
      (b.getAttribute("aria-label") || b.textContent || "").trim().slice(0, 30),
    ),
  }));
  log({ kind: "deck", info });
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(500);
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(500);
  await probe(page, "deck after keys");
});

test.describe("kabinet", () => {
  let server: SignInServer | undefined;
  let admin: BrowserContext | undefined;
  let operator: BrowserContext | undefined;
  async function signIn(browser: Browser, email: string) {
    if (!server) throw new Error("no server");
    const { origin } = server;
    const rq = await fetch(`${origin}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, "x-forwarded-for": FF },
      body: JSON.stringify({ email }),
    });
    expect(rq.status).toBe(200);
    const link = await server.linkFor(email);
    const ctx = await browser.newContext({
      baseURL: origin,
      extraHTTPHeaders: { "x-forwarded-for": FF },
    });
    const p = await ctx.newPage();
    await p.goto(link);
    await Promise.all([
      p.waitForURL((u) => u.pathname !== new URL(link).pathname),
      p.getByRole("button").click(),
    ]);
    await p.close();
    return ctx;
  }
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(200_000);
    server = await startSignInServer(DB, { LOCATION_HMAC_SECRET: HARNESS_LOCATION_HMAC_SECRET });
    const db = createDatabase(DB);
    const now = new Date();
    const mk = async (email: string) => {
      const id = randomUUID();
      await db
        .insert(authUser)
        .values({
          id,
          name: "Harness",
          email,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        });
      return id;
    };
    const opEmail = `a11y-op-${randomUUID()}@example.test`;
    const opId = await mk(opEmail);
    await db.insert(superAdmins).values({ id: randomUUID(), userId: opId, grantedAt: now });
    const adEmail = `a11y-ad-${randomUUID()}@example.test`;
    const adId = await mk(adEmail);
    const shelter = (
      await db.select({ id: shelters.id, organizationId: shelters.organizationId }).from(shelters)
    ).find((r) => r.organizationId === null);
    if (!shelter) throw new Error("no shelter");
    const org = await kabinetInvitationRepo(db).ensureOrganization(
      shelter.id,
      { organizationId: randomUUID() },
      now,
    );
    await db
      .insert(authMember)
      .values({
        id: randomUUID(),
        organizationId: org,
        userId: adId,
        role: "admin",
        createdAt: now,
      });
    operator = await signIn(browser, opEmail);
    admin = await signIn(browser, adEmail);
  });
  test.afterAll(async () => {
    await admin?.close();
    await operator?.close();
    await server?.stop();
  });

  test("sign-in screens", async ({ browser }) => {
    test.setTimeout(200_000);
    const ctx = await browser.newContext({
      baseURL: server?.origin ?? "",
      extraHTTPHeaders: { "x-forwarded-for": FF },
    });
    const page = await ctx.newPage();
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 800 });
      for (const [n, p] of [
        ["sign-in", "/kabinet/vkhid"],
        ["forgot", "/kabinet/vkhid/zabuly"],
        ["new password", "/kabinet/vkhid/novyi-parol"],
      ] as const) {
        await page.goto(p, { waitUntil: "load" });
        await probe(page, `kabinet ${n}`);
        await tabWalk(page, `kabinet ${n}`, 15);
      }
      await page.goto("/kabinet/vkhid", { waitUntil: "load" });
      await page.getByRole("button").first().click();
      await page.waitForTimeout(600);
      await probe(page, "kabinet sign-in after empty submit");
      const live = await page.evaluate(() => ({
        alerts: document.querySelectorAll("[role=alert],[aria-live]").length,
        invalid: document.querySelectorAll("[aria-invalid=true]").length,
        focus: `${document.activeElement?.tagName}:${document.activeElement?.id ?? ""}`,
        describedby: Array.from(document.querySelectorAll("[aria-invalid=true]")).map((e) =>
          e.getAttribute("aria-describedby"),
        ),
      }));
      log({ kind: "formerror", name: "kabinet sign-in", w, live });
    }
    await ctx.close();
  });

  test("shelter admin pages", async () => {
    test.setTimeout(300_000);
    if (!admin) throw new Error("no admin");
    const page = await admin.newPage();
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 800 });
      for (const [n, p] of [
        ["Головна", "/kabinet"],
        ["animals list", "/kabinet/tvaryny"],
        ["animal form", "/kabinet/tvaryny/nova"],
        ["profile", "/kabinet/prytulok"],
      ] as const) {
        await page.goto(p, { waitUntil: "load" });
        await page.waitForTimeout(400);
        await probe(page, `kabinet ${n}`);
        await tabWalk(page, `kabinet ${n}`, 40);
      }
      await page.goto("/kabinet/tvaryny/nova", { waitUntil: "load" });
      const btns = page.getByRole("button");
      const count = await btns.count();
      for (let i = 0; i < count; i++) {
        const t = ((await btns.nth(i).textContent()) ?? "").trim();
        if (/Зберегти|Додати|Створити|Далі/.test(t)) {
          await btns.nth(i).click();
          break;
        }
      }
      await page.waitForTimeout(700);
      await probe(page, "kabinet animal form after submit");
      log({
        kind: "formerror",
        name: "animal form",
        w,
        live: await page.evaluate(() => ({
          summary: !!document.querySelector("[role=alert],[data-error-summary]"),
          invalid: document.querySelectorAll("[aria-invalid=true]").length,
          focus: `${document.activeElement?.tagName}:${(document.activeElement?.textContent ?? "").slice(0, 40)}`,
          describedby: Array.from(document.querySelectorAll("[aria-invalid=true]")).map((e) =>
            e.getAttribute("aria-describedby"),
          ),
        })),
      });
    }
    await page.close();
  });

  test("operator pages", async () => {
    test.setTimeout(200_000);
    if (!operator) throw new Error("no operator");
    const page = await operator.newPage();
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 800 });
      for (const [n, p] of [
        ["op shelters", "/kabinet/prytulky"],
        ["op new", "/kabinet/prytulky/novyi"],
      ] as const) {
        await page.goto(p, { waitUntil: "load" });
        await probe(page, `kabinet ${n}`);
        await tabWalk(page, `kabinet ${n}`, 30);
      }
      await page.goto("/kabinet/prytulky", { waitUntil: "load" });
      const href = await page
        .locator('a[href^="/kabinet/prytulky/"]:not([href$="novyi"])')
        .first()
        .getAttribute("href");
      if (href) {
        await page.goto(href, { waitUntil: "load" });
        await probe(page, "kabinet op shelter detail");
        await tabWalk(page, "kabinet op shelter detail", 40);
      }
    }
    await page.close();
  });
});
