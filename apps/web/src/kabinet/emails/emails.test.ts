import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { COPY_PENDING } from "@opika/i18n";
import { describe, expect, it } from "vitest";
import { EMAIL_LOGO, LIVE_ASSET_BASE } from "./assets";
import { EMAIL_FIXTURES } from "./fixtures";
import { renderEmail } from "./render";
import { EMAIL_TEMPLATES, emailChromeCopy, emailModelOf, leadOf } from "./templates";
import { emailTokensFromCss, emailTokensJson } from "./token-bridge";

/** U+2014, written as an escape so this file holds none. */
const EM_DASH = String.fromCodePoint(0x2014);
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "../..");
const WEB = resolve(SRC, "..");

/** What a reader sees: no tags, comments, doctype or the head's stylesheet. */
const visibleText = (html: string): string =>
  html
    .replace(/<!DOCTYPE[^>]*>/i, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ");

const rendered = await Promise.all(
  EMAIL_TEMPLATES.map(async (template) => ({
    template,
    email: await renderEmail(emailModelOf(EMAIL_FIXTURES[template]), emailChromeCopy()),
  })),
);

describe("every email the kit renders", () => {
  it.each(rendered)(
    "$template: under 30 KB, one h1, lang uk, a title, a text part",
    ({ email }) => {
      expect(Buffer.byteLength(email.html, "utf8")).toBeLessThan(30 * 1024);
      expect(email.text.trim()).not.toBe("");
      expect(email.html).toMatch(/<html[^>]*\blang="uk"/);
      expect(email.html).toMatch(/<title>[^<]+<\/title>/);
      expect(email.html.match(/<h1\b/g)).toHaveLength(1);
    },
  );

  it.each(rendered)("$template: no em dash and no exclamation mark", ({ email }) => {
    for (const part of [email.subject, email.text, visibleText(email.html)]) {
      expect(part).not.toContain(EM_DASH);
      expect(part).not.toContain("!");
    }
  });

  it.each(rendered)("$template: its subject is the title and the h1", ({ email }) => {
    expect(email.html).toContain(`<title>${email.subject}</title>`);
    expect(visibleText(email.html)).toContain(email.subject);
  });

  it("carries the Outlook head and never embeds an image", () => {
    for (const { email } of rendered) {
      expect(email.html).toContain("<!--[if mso]>");
      expect(email.html).not.toMatch(/data:image/);
      expect(email.html).toContain(`${LIVE_ASSET_BASE}${EMAIL_LOGO.file}`);
    }
  });

  it("puts each button's raw link in the text part and never as an HTML link's text", () => {
    const { email } = rendered.find((entry) => entry.template === "sign_in") ?? {};
    const url = EMAIL_FIXTURES.sign_in.url;
    expect(email?.text).toContain(`\n${url}`);
    expect(email?.html).not.toMatch(/<a[^>]*>\s*https?:\/\//);
  });

  it("refuses to send its unapproved strings: they carry the pending marker", () => {
    const confirm = rendered.find((entry) => entry.template === "application_confirm");
    expect(confirm?.email.text).toContain(COPY_PENDING);
  });

  it("names a sign-in email's reason nowhere, since operator and shelters both get it", () => {
    const signIn = emailModelOf(EMAIL_FIXTURES.sign_in);
    expect(signIn.recipient).toBeNull();
  });

  it("shows the switch-off link only when a mail has one", async () => {
    const model = emailModelOf(EMAIL_FIXTURES.freshness_reminder);
    const copy = emailChromeCopy();
    const without = await renderEmail(model, copy);
    const withLink = await renderEmail({ ...model, switchOffUrl: "https://example.org/off" }, copy);
    expect(without.text).not.toContain(copy.switchOffAction);
    expect(withLink.text).toContain(`${copy.switchOffPrompt} https://example.org/off`);
    expect(withLink.html).toContain('href="https://example.org/off"');
  });
});

describe("the preheader", () => {
  it("skips the greeting and stops once there is enough to read", () => {
    expect(leadOf("Добрий день. Притулок «Х» пройшов перевірку. Тепер картки видно всім.")).toBe(
      "Притулок «Х» пройшов перевірку.",
    );
    expect(leadOf("Дякую за заявку. Зараз я не можу її схвалити. Причина: так.")).toBe(
      "Дякую за заявку. Зараз я не можу її схвалити.",
    );
  });

  it("never takes the signature line", () => {
    expect(leadOf("Якщо це не ви – напишіть мені.\nОлексій")).toBe(
      "Якщо це не ви – напишіть мені.",
    );
  });
});

describe("the token bridge", () => {
  it("matches globals.css: run `pnpm --filter @opika/web email:tokens` after a token change", () => {
    const css = readFileSync(join(SRC, "app/globals.css"), "utf8");
    const onDisk = readFileSync(join(HERE, "tokens.generated.json"), "utf8").replaceAll(
      "\r\n",
      "\n",
    );
    expect(onDisk).toBe(emailTokensJson(emailTokensFromCss(css)));
  });

  it("names a missing token instead of guessing", () => {
    expect(() => emailTokensFromCss("--color-ink: #000;")).toThrow(/--color-page/);
  });
});

describe("the kit stays on the server", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === "node_modules" ? [] : files(path);
      return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
    });
  const source = files(SRC);
  const rel = (file: string) => relative(WEB, file).replaceAll("\\", "/");

  it("has no client file", () => {
    const client = source.filter(
      (file) => file.startsWith(HERE) && /^\s*["']use client["']/.test(readFileSync(file, "utf8")),
    );
    expect(client.map(rel)).toEqual([]);
  });

  it("is imported only from the kit itself: wiring a sender adds its server module here", () => {
    const importers = source.filter((file) => {
      if (file.startsWith(HERE)) return false;
      return /from\s+["'](?:react-email|@react-email\/[\w-]+|[./@][^"']*\/emails(?:\/[^"']*)?)["']/.test(
        readFileSync(file, "utf8"),
      );
    });
    expect(importers.map(rel)).toEqual([]);
  });
});
