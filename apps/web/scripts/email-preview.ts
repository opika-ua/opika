// Renders every email template (src/kabinet/emails) with its fixture to HTML and text, and screenshots it in
// light and dark (Chromium, emulated prefers-color-scheme) and at phone width, into <out>/<template>/.
// The wired emails are rendered a second time from their real send paths (the senders Better Auth
// and the registration flow call), as `wired-*` files beside them. Development only, never a route.
// Images resolve to public/email/ on disk, the files production serves under SITE_ORIGIN/email/.
//   pnpm --filter @opika/web email:preview --out "<folder outside the repo>"
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";
import type { OutgoingEmail } from "../src/kabinet/email-provider";
import {
  type ProviderMail,
  providerMagicLinkSender,
  providerPasswordMail,
} from "../src/kabinet/email-senders";
import { LIVE_ASSET_BASE } from "../src/kabinet/emails/assets";
import { EMAIL_FIXTURES } from "../src/kabinet/emails/fixtures";
import { renderEmail } from "../src/kabinet/emails/render";
import { EMAIL_TEMPLATES, emailChromeCopy, emailModelOf } from "../src/kabinet/emails/templates";
import { registrationEmailFor } from "../src/kabinet/registration-email";

const { values } = parseArgs({ options: { out: { type: "string" } } });
if (values.out === undefined) throw new Error("--out <folder> is required");
const out = resolve(values.out);
const repo = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
if (out.startsWith(repo))
  throw new Error("--out must be outside the repository: outputs are never committed");

const assetBase = pathToFileURL(
  fileURLToPath(new URL("../public/email/", import.meta.url)),
).toString();
const copy = emailChromeCopy();
const OPERATOR = "Олексій";
const TO = "olena@example.org";

/** What a production sender hands the provider, captured instead of sent. */
async function captured(send: (mail: ProviderMail) => Promise<unknown>): Promise<OutgoingEmail> {
  const sent: OutgoingEmail[] = [];
  await send({
    sender: {
      send: async (email) => {
        sent.push(email);
        return { status: 200, messageId: "preview" };
      },
    },
    blockedStatus: async () => ({ kind: "not_blocked" }),
    refuseCopyPending: true,
  });
  const [email] = sent;
  if (email === undefined) throw new Error("the sender sent nothing");
  return email;
}

const f = EMAIL_FIXTURES;
const wired: Partial<Record<(typeof EMAIL_TEMPLATES)[number], () => Promise<OutgoingEmail>>> = {
  application_confirm: () =>
    registrationEmailFor({ ...f.application_confirm, operatorName: OPERATOR }, TO),
  application_approved: () => registrationEmailFor(f.application_approved, TO),
  application_rejected: () => registrationEmailFor(f.application_rejected, TO),
  sign_in: () =>
    captured((mail) =>
      providerMagicLinkSender(mail, { ttlMinutes: 15, operatorName: OPERATOR, log: () => {} }).send(
        { email: TO, url: f.sign_in.url },
      ),
    ),
  password_reset: () =>
    captured((mail) =>
      providerPasswordMail(mail, {
        ttlMinutes: 60,
        operatorName: OPERATOR,
        contact: "hello@opika.org.ua",
        log: () => {},
      }).sendReset({ email: TO, url: f.password_reset.url }),
    ),
};

const browser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
async function write(dir: string, prefix: string, email: OutgoingEmail): Promise<void> {
  const htmlPath = join(dir, `${prefix}email.html`);
  writeFileSync(htmlPath, email.html);
  writeFileSync(join(dir, `${prefix}email.txt`), `${email.subject}\n\n${email.text}\n`);
  const shots = [
    { file: "light.png", colorScheme: "light", width: 680 },
    { file: "dark.png", colorScheme: "dark", width: 680 },
    { file: "phone-light.png", colorScheme: "light", width: 375 },
  ] as const;
  for (const shot of shots) {
    const page = await browser.newPage({
      colorScheme: shot.colorScheme,
      viewport: { width: shot.width, height: 800 },
    });
    await page.goto(pathToFileURL(htmlPath).toString(), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(dir, `${prefix}${shot.file}`), fullPage: true });
    await page.close();
  }
}

try {
  const sizes: string[] = [];
  for (const template of EMAIL_TEMPLATES) {
    const email = await renderEmail(emailModelOf(EMAIL_FIXTURES[template]), copy, assetBase);
    const dir = join(out, template);
    mkdirSync(dir, { recursive: true });
    await write(dir, "", { to: TO, ...email });
    let line = `${template.padEnd(28)} ${(Buffer.byteLength(email.html) / 1024).toFixed(1)} KB`;
    const build = wired[template];
    if (build !== undefined) {
      const sent = await build();
      line += `, wired ${(Buffer.byteLength(sent.html) / 1024).toFixed(1)} KB`;
      // The live site doesn't serve /email/ until this deploys: point the images at the files.
      await write(dir, "wired-", {
        ...sent,
        html: sent.html.replaceAll(LIVE_ASSET_BASE, assetBase),
      });
    }
    sizes.push(line);
  }
  process.stdout.write(`${sizes.join("\n")}\nwrote ${EMAIL_TEMPLATES.length} emails to ${out}\n`);
} finally {
  await browser.close();
}
