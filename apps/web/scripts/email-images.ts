// Renders the email logo (public/brand-v3/logo.svg) as a PNG @2x on an opaque cream plate, and copies
// the UI font, into public/email/ with a version suffix (src/kabinet/emails/assets.ts names the files).
// Run again only for a new version: bump the suffix there, never overwrite a published file.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { EMAIL_FONT, EMAIL_LOGO } from "../src/kabinet/emails/assets";
import TOKENS from "../src/kabinet/emails/tokens.generated.json";

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const out = at("../public/email/");
mkdirSync(out, { recursive: true });

const refuseOverwrite = (file: string) => {
  if (existsSync(`${out}${file}`))
    throw new Error(`${file} exists: bump its version suffix instead`);
};

refuseOverwrite(EMAIL_LOGO.file);
const scale = 2;
const logo = await sharp(at("../public/brand-v3/logo.svg"), { density: 72 * scale * 4 })
  .resize({ width: EMAIL_LOGO.markWidth * scale })
  .png()
  .toBuffer();
const meta = await sharp(logo).metadata();
const plateWidth = EMAIL_LOGO.width * scale;
const plateHeight = EMAIL_LOGO.height * scale;
await sharp({
  create: {
    width: plateWidth,
    height: plateHeight,
    channels: 3,
    background: TOKENS["color-page"],
  },
})
  .composite([
    {
      input: logo,
      left: Math.round((plateWidth - (meta.width ?? 0)) / 2),
      top: Math.round((plateHeight - (meta.height ?? 0)) / 2),
    },
  ])
  .flatten({ background: TOKENS["color-page"] })
  .png({ compressionLevel: 9, palette: true })
  .toFile(`${out}${EMAIL_LOGO.file}`);

refuseOverwrite(EMAIL_FONT.file);
copyFileSync(at("../src/app/fonts/brand-ui/OpikaVariable-wght.woff2"), `${out}${EMAIL_FONT.file}`);
process.stdout.write(`wrote ${EMAIL_LOGO.file} and ${EMAIL_FONT.file} to ${out}\n`);
