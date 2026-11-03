import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isRealPhotoKey, r2PublicUrl } from "@opika/db/image-pipeline";
import { animalFactsParts } from "@opika/i18n";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { SITE_TITLE } from "../brand";
import type { AnimalPageView } from "../features/animal-detail/animal-page-load";

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

// Colours repeat the tokens in globals.css: an image has no CSS variables.
const INK = "#270041";
const PAGE = "#faf7f6";
const MUTED = "#735263";
const SPECIES_PANEL = { dog: "#794eba", cat: "#f26427" } as const;
const SPECIES_TEXT = { dog: "#794eba", cat: "#c2410c" } as const;

// A preview crawler gives up after a few seconds; a missing photo must not cost the card.
const PHOTO_TIMEOUT_MS = 2500;
const PHOTO_WIDTH = 504;
// 1200 - photo - 2 x 64 padding; Climate Crisis is wide, about 0.8 em per Cyrillic capital.
const TEXT_COLUMN_WIDTH = OG_SIZE.width - PHOTO_WIDTH - 128;
const DISPLAY_EM_PER_CHAR = 0.8;
// Short: a name, photo or city can change, and a preview cache must not hold the old one for long.
const ANIMAL_CACHE = "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400";
const SITE_CACHE = "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800";

// satori reads TTF, not the woff2 the page fonts ship as; see fonts/og/README.md. Static
// `new URL(..., import.meta.url)` so the bundler traces exactly these files into the function.
function loadFonts() {
  const read = (url: URL) => readFile(url);
  return Promise.all([
    read(new URL("../app/fonts/og/ClimateCrisis-og.ttf", import.meta.url)),
    read(new URL("../app/fonts/og/OpikaUi-700-og.ttf", import.meta.url)),
  ]).then(([display, ui]) => [
    { name: "Display", data: display, weight: 400 as const, style: "normal" as const },
    { name: "Ui", data: ui, weight: 700 as const, style: "normal" as const },
  ]);
}
let fontsPromise: ReturnType<typeof loadFonts> | undefined;
function fonts() {
  fontsPromise ??= loadFonts();
  return fontsPromise;
}

let logoPromise: Promise<string> | undefined;
function logoDataUri(): Promise<string> {
  logoPromise ??= readFile(new URL("../../public/brand-v3/logo.svg", import.meta.url)).then(
    (svg) => `data:image/svg+xml;base64,${svg.toString("base64")}`,
  );
  return logoPromise;
}

/**
 * The photo as a JPEG data URI at the size it is drawn, or null when it cannot be had in time: the
 * card then renders without it. Re-encoded because satori reads no WebP (the R2 variants are WebP)
 * and a smaller input keeps the render fast.
 */
async function photoDataUri(storageKey: string): Promise<string | null> {
  try {
    const source = await photoBytes(storageKey);
    if (!source) return null;
    const jpeg = await sharp(source)
      .resize(PHOTO_WIDTH, OG_SIZE.height, { fit: "cover" })
      .jpeg({ quality: 85 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return null;
  }
}

async function photoBytes(storageKey: string): Promise<Buffer | null> {
  if (isRealPhotoKey(storageKey)) {
    const base = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
    if (!base) return null;
    const res = await fetch(r2PublicUrl(base, storageKey, "card"), {
      signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS),
    });
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  }
  // The seeded demo corpus ships its photos in public/.
  if (/^seed-photos\/[\w.-]+\.jpg$/.test(storageKey)) {
    return readFile(join(/*turbopackIgnore: true*/ process.cwd(), "public", storageKey));
  }
  return null;
}

/**
 * A photo makes the PNG about 1 MB, over what some messengers fetch for a preview; a palette PNG
 * is about a quarter of that and indistinguishable at thumbnail size.
 */
async function withPaletteCompression(image: ImageResponse): Promise<Response> {
  const png = await sharp(Buffer.from(await image.arrayBuffer()))
    .png({ palette: true, quality: 80 })
    .toBuffer();
  return new Response(new Uint8Array(png), { status: 200, headers: image.headers });
}

/** Names shrink to fit the text column by their longest word, since a word never breaks nicely. */
function nameFontSize(name: string): number {
  const longestWord = Math.max(...name.split(/\s+/).map((word) => word.length), 1);
  const fitted = Math.floor(TEXT_COLUMN_WIDTH / (longestWord * DISPLAY_EM_PER_CHAR));
  return Math.max(40, Math.min(96, fitted));
}

export async function siteOgImage(): Promise<ImageResponse> {
  const [logo, loadedFonts] = await Promise.all([logoDataUri(), fonts()]);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: PAGE,
        color: INK,
      }}
    >
      <img src={logo} width={769} height={196} alt="" />
      <div style={{ marginTop: 56, fontFamily: "Ui", fontWeight: 700, fontSize: 44, color: MUTED }}>
        {SITE_TITLE}
      </div>
    </div>,
    { ...OG_SIZE, fonts: loadedFonts, headers: { "cache-control": SITE_CACHE } },
  );
}

/**
 * Only facts that cannot go stale in a cached preview: photo, name, species and sex, city.
 * No age, no reserved or adopted state.
 */
export async function animalOgImage(view: AnimalPageView): Promise<Response> {
  const { animal, cityName } = view;
  const firstPhoto = animal.photos[0];
  const [logo, photo, loadedFonts] = await Promise.all([
    logoDataUri(),
    firstPhoto ? photoDataUri(firstPhoto.storageKey) : Promise.resolve(null),
    fonts(),
  ]);
  // Only what cannot go stale in a cached preview, so no age bucket (it moves on its own).
  const facts = animalFactsParts({
    species: animal.species,
    sex: animal.sex,
    ageBucket: null,
    size: null,
  }).join(" · ");

  const image = new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", background: PAGE, color: INK }}>
      {photo ? (
        // 4:5 is the card variant's own shape, so the photo fills the height uncropped.
        <img
          src={photo}
          width={PHOTO_WIDTH}
          height={OG_SIZE.height}
          alt=""
          style={{ objectFit: "cover", width: PHOTO_WIDTH, height: OG_SIZE.height }}
        />
      ) : (
        <div
          style={{
            width: PHOTO_WIDTH,
            height: OG_SIZE.height,
            background: SPECIES_PANEL[animal.species],
            display: "flex",
          }}
        />
      )}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px 64px",
          minWidth: 0,
        }}
      >
        <img src={logo} width={231} height={59} alt="" />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontFamily: "Display",
              fontWeight: 400,
              fontSize: nameFontSize(animal.name),
              lineHeight: 1.1,
            }}
          >
            {animal.name}
          </div>
          <div
            style={{ fontFamily: "Ui", fontWeight: 700, fontSize: 40, color: MUTED, marginTop: 28 }}
          >
            {facts}
          </div>
          {cityName ? (
            <div
              style={{
                fontFamily: "Ui",
                fontWeight: 700,
                fontSize: 40,
                color: SPECIES_TEXT[animal.species],
                marginTop: 12,
              }}
            >
              {cityName}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    { ...OG_SIZE, fonts: loadedFonts, headers: { "cache-control": ANIMAL_CACHE } },
  );
  return photo ? withPaletteCompression(image) : image;
}
