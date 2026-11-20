// Renders every email template (src/kabinet/emails) with its fixture to HTML and text, and screenshots it in
// light and dark (Chromium, emulated prefers-color-scheme) and at phone width, into <out>/<template>/.
// Development only, never a route. Images resolve to public/email/ on disk, the files production
// serves under SITE_ORIGIN/email/.
//   pnpm --filter @opika/web email:preview --out "<folder outside the repo>"
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";
import { EMAIL_FIXTURES } from "../src/kabinet/emails/fixtures";
import { renderEmail } from "../src/kabinet/emails/render";
import { EMAIL_TEMPLATES, emailChromeCopy, emailModelOf } from "../src/kabinet/emails/templates";

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
const browser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
try {
  const sizes: string[] = [];
  for (const template of EMAIL_TEMPLATES) {
    const email = await renderEmail(emailModelOf(EMAIL_FIXTURES[template]), copy, assetBase);
    const dir = join(out, template);
    mkdirSync(dir, { recursive: true });
    const htmlPath = join(dir, "email.html");
    writeFileSync(htmlPath, email.html);
    writeFileSync(join(dir, "email.txt"), `${email.subject}\n\n${email.text}\n`);
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
      await page.screenshot({ path: join(dir, shot.file), fullPage: true });
      await page.close();
    }
    sizes.push(`${template.padEnd(28)} ${(Buffer.byteLength(email.html) / 1024).toFixed(1)} KB`);
  }
  process.stdout.write(`${sizes.join("\n")}\nwrote ${EMAIL_TEMPLATES.length} emails to ${out}\n`);
} finally {
  await browser.close();
}
