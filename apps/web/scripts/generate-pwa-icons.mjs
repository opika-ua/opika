// Regenerates public/icons/*.png from the logo's mark (the wordmark group is dropped).
// Run: pnpm --filter @opika/web run icons:generate. Background is --color-page (globals.css).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const PAGE = /--color-page:\s*(#[0-9a-fA-F]{6})/.exec(
  readFileSync(join(root, "src/app/globals.css"), "utf8"),
)?.[1];
if (!PAGE) throw new Error("--color-page not found in globals.css");

const logo = readFileSync(join(root, "public/brand-v3/logo.svg"), "utf8");
const markSvg = logo.replace(/<g id="Opika">[\s\S]*?<\/g>\s*(?=<\/g>\s*<\/svg>)/, "");
if (markSvg === logo) throw new Error("wordmark group not found in logo.svg");

const mark = await sharp(Buffer.from(markSvg), { density: 1200 }).trim().png().toBuffer();

async function icon(file, size, markShare) {
  const fitted = await sharp(mark)
    .resize({
      width: Math.round(size * markShare),
      height: Math.round(size * markShare),
      fit: "inside",
    })
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: PAGE } })
    .composite([{ input: fitted, gravity: "center" }])
    .png()
    .toFile(join(root, "public/icons", file));
}

await icon("icon-192.png", 192, 0.78);
await icon("icon-512.png", 512, 0.78);
// Maskable: the mark stays inside the central 60% so any mask shape keeps it.
await icon("icon-maskable-512.png", 512, 0.56);
await icon("apple-touch-icon.png", 180, 0.78);
