import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AnimalPhotoSchema } from "@opika/domain";
import { describe, expect, it } from "vitest";
import { type Anchor, compareSites, type Site, scanSites } from "./source-sites";

/**
 * GDPR photo retention (`docs/gdpr-analysis.md`). `r2-cleanup-repo.ts`'s
 * `referencedStorageKeys` reads `animals.photos` and (since pet card PR 4)
 * `shelters.logo` as the live reference set. Oleksii, 2026-10-25, widening
 * that design before it was built: "widen the structural test so it catches
 * any schema field that can hold a storage key (a plain string or
 * `AnimalPhotoSchema`), not just the schema import."
 *
 * This is that check. It finds every place in `packages/domain` and
 * `packages/contracts` where a schema field is typed to carry a photo's
 * storage key - either by embedding `AnimalPhotoSchema` (never just naming
 * it in an import) or by declaring a bare `z.string()` field whose name reads
 * like a storage key - and requires each to be a classified, reasoned entry
 * below. A new one (a second durable field, a bare string that bypasses
 * `AnimalPhotoSchema`) fails this test by file, line and enclosing symbol
 * (anchored by symbol, not line, in `source-sites.ts`), forcing a decision
 * about whether `r2-cleanup-repo.ts`'s reference set needs to widen too,
 * rather than letting a photo quietly become unaccounted for.
 *
 * "Can hold a storage key" is a schema-shape question, not a "where is this
 * actually persisted" one – a view/projection schema counts here even though
 * it carries no second copy of the data, because the point is to catch every
 * place the *type* could carry a key, before anyone asks whether a given
 * occurrence is durable.
 */
const DOMAIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "domain", "src");
const CONTRACTS_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "contracts",
  "src",
);

function scan(root: string, pattern: RegExp): Site[] {
  // .tsx too: a page reading a repository is code like any other (review of #490).
  return scanSites(
    root,
    pattern,
    (path) => relative(resolve(root, "..", ".."), path).replaceAll("\\", "/"),
    /\.tsx?$/,
  );
}

/** Every real reference to `AnimalPhotoSchema` that is not its own import. */
const ANIMAL_PHOTO_SCHEMA_IMPORT = /^\s*import\b|^\s*\w+,?\s*$|^\s*AnimalPhotoSchema,?\s*$/;
function animalPhotoSchemaEmbeddings(): Site[] {
  const domain = scan(DOMAIN_ROOT, /AnimalPhotoSchema/).filter(
    (hit) =>
      !ANIMAL_PHOTO_SCHEMA_IMPORT.test(hit.text) &&
      !/^export const AnimalPhotoSchema/.test(hit.text) &&
      !/^export type AnimalPhoto\b/.test(hit.text),
  );
  const contracts = scan(CONTRACTS_ROOT, /AnimalPhotoSchema/).filter(
    (hit) => !ANIMAL_PHOTO_SCHEMA_IMPORT.test(hit.text),
  );
  return [...domain, ...contracts];
}

/**
 * The same embedding scan, for `ShelterLogoSchema` (pet card PR 4 widening -
 * the TODO left in this file's own `EXPECTED_BARE_FIELDS` entry for
 * `shelters/logo.ts`, now that `r2-cleanup-repo.ts` reads `shelters.logo` as
 * a live reference too). A separate function, not a merged pattern: the two
 * schemas' own import/definition lines need separate exclusion patterns, and
 * keeping them apart keeps each failure's "which schema, which site" obvious.
 */
const SHELTER_LOGO_SCHEMA_IMPORT = /^\s*import\b|^\s*\w+,?\s*$|^\s*ShelterLogoSchema,?\s*$/;
function shelterLogoSchemaEmbeddings(): Site[] {
  const domain = scan(DOMAIN_ROOT, /ShelterLogoSchema/).filter(
    (hit) =>
      !SHELTER_LOGO_SCHEMA_IMPORT.test(hit.text) &&
      !/^export const ShelterLogoSchema/.test(hit.text) &&
      !/^export type ShelterLogo\b/.test(hit.text),
  );
  const contracts = scan(CONTRACTS_ROOT, /ShelterLogoSchema/).filter(
    (hit) => !SHELTER_LOGO_SCHEMA_IMPORT.test(hit.text),
  );
  return [...domain, ...contracts];
}

/**
 * A `.pick({ …, photos: true, … })` that carries the whole `photos` array
 * through to a new schema, without ever writing `AnimalPhotoSchema` as a
 * token (Tier 1 review, PR #200, note 11) - the textual embedding scan
 * above can't see this, since nothing here literally names the schema;
 * `pick` just selects an existing field by name.
 */
const PICKED_PHOTOS_FIELD = /\bphotos\s*:\s*true\b/;
function pickedPhotosFields(): Site[] {
  return [...scan(DOMAIN_ROOT, PICKED_PHOTOS_FIELD), ...scan(CONTRACTS_ROOT, PICKED_PHOTOS_FIELD)];
}

/** The same `.pick` blind spot, for `logo` (pet card PR 4 widening - see `pickedPhotosFields` above). */
const PICKED_LOGO_FIELD = /\blogo\s*:\s*true\b/;
function pickedLogoFields(): Site[] {
  return [...scan(DOMAIN_ROOT, PICKED_LOGO_FIELD), ...scan(CONTRACTS_ROOT, PICKED_LOGO_FIELD)];
}

/**
 * `.shape.photos` reaches into an existing object schema's `photos` field
 * directly (never through `.pick`/`.extend`, so `PICKED_PHOTOS_FIELD` above
 * can't see it either) - the same unclassified-widening risk `.pick({
 * photos: true })` was, by a different route (round 3 Tier 1 delta review,
 * finding 5). Today's one real occurrence is in a `.test.ts` file
 * (`photo.test.ts`, reading `DraftAnimalSchema.shape.photos` to build a
 * fixture), which `sourceFiles()` already excludes from every scan in this file -
 * so this is expected to find nothing live outside a test, and a new
 * non-test site needs a new entry below, same as the other three scans.
 */
const SHAPE_PHOTOS_ACCESS = /\.shape\.photos\b/;
function shapePhotosAccesses(): Site[] {
  return [...scan(DOMAIN_ROOT, SHAPE_PHOTOS_ACCESS), ...scan(CONTRACTS_ROOT, SHAPE_PHOTOS_ACCESS)];
}

/** A bare `z.string()` field whose name reads like a storage key, wherever it is declared. */
// A suffix match (`\w*`), not an exact one, and case-insensitive on the key
// name (Tier 1 review, PR #200, note 11) - `coverPhotoKey` has a capital
// `P`, which a case-sensitive exact match on `photoKey` would silently
// miss. `coverPhotoKey`, `thumbnailStorageKey` and the like read like a
// storage key just as much as the bare names do, and a suffix check costs
// nothing against today's one real site (`photo.ts`'s own `storageKey`).
const BARE_STORAGE_KEY_FIELD = /\b\w*(?:storageKey|photoKey|imageKey|objectKey)\s*:\s*z\.string\(/i;
function bareStorageKeyFields(): Site[] {
  return [
    ...scan(DOMAIN_ROOT, BARE_STORAGE_KEY_FIELD),
    ...scan(CONTRACTS_ROOT, BARE_STORAGE_KEY_FIELD),
  ];
}

type Kind = "storage" | "view" | "definition";
const EXPECTED_EMBEDDINGS: ReadonlyArray<Anchor & { kind: Kind; why: string }> = [
  {
    file: "domain/src/animals/animal.ts",
    symbol: "animalCoreShape",
    text: "photos: z.array(AnimalPhotoSchema).max(MAX_ANIMAL_PHOTOS).readonly(),",
    kind: "storage",
    why:
      "animals.photos - the one durable reference set. r2-cleanup-repo.ts's referencedStorageKeys " +
      'reads exactly this column; a photo\'s storage key is "live" iff it appears here.',
  },
  {
    file: "domain/src/reveals/contact-reveal.ts",
    symbol: "AnimalRevealSnapshotSchema",
    text: "primaryPhoto: AnimalPhotoSchema.nullable(),",
    kind: "storage",
    why:
      "reveals.animal_snapshot.primaryPhoto - durable, but deliberately NOT a reference (Oleksii, " +
      "2026-10-25): traced every consumer of ContactRevealView and reveals.listMine has a handler " +
      "but no route or component anywhere calls it, so nothing displays this today. A deleted " +
      "object's key is nulled out of this field in the same clean-up run (r2-cleanup-repo.ts's " +
      "afterDeleted), so a dangling pointer never sits here either.",
  },
  {
    file: "contracts/src/kabinet/views.ts",
    symbol: "animalRowExtras",
    text: "coverPhoto: AnimalPhotoSchema.nullable(),",
    kind: "view",
    why:
      "KabinetAnimalRowViewSchema's own extend() field - an API response projection built per " +
      "request from the one durable animals.photos column (its first entry), never a second " +
      "stored copy.",
  },
  {
    file: "contracts/src/views/animal.ts",
    symbol: "FeedCardViewSchema",
    text: "primaryPhoto: AnimalPhotoSchema.nullable(),",
    kind: "view",
    why:
      "FeedCardViewSchema's own extend() field - same as kabinet/views.ts's coverPhoto: a " +
      "per-request projection of animals.photos, not storage.",
  },
];

const EXPECTED_PICKED_PHOTOS: ReadonlyArray<Anchor & { kind: Kind; why: string }> = [
  {
    file: "contracts/src/kabinet/views.ts",
    symbol: "ANIMAL_VIEW_FIELDS",
    text: "photos: true,",
    kind: "view",
    why:
      "KabinetDraftAnimalViewSchema/KabinetListedAnimalViewSchema (K3's edit form) - the whole " +
      "photos array picked straight from DraftAnimalSchema/ListedAnimalSchema, a per-request " +
      "projection of animals.photos, not a second stored copy.",
  },
  {
    file: "contracts/src/views/animal.ts",
    symbol: "AnimalDetailViewSchema",
    text: "photos: true,",
    kind: "view",
    why:
      "AnimalDetailViewSchema (the animal detail page) - same shape as kabinet/views.ts's pick: " +
      "a per-request projection of animals.photos, not storage.",
  },
];

const EXPECTED_LOGO_EMBEDDINGS: ReadonlyArray<Anchor & { kind: Kind; why: string }> = [
  {
    file: "domain/src/shelters/shelter.ts",
    symbol: "ShelterSchema",
    text: "logo: ShelterLogoSchema.nullable(),",
    kind: "storage",
    why:
      "shelters.logo - the one durable reference (pet card PR 4). r2-cleanup-repo.ts's " +
      'referencedStorageKeys reads exactly this column; a logo\'s storage key is "live" iff ' +
      "it appears here.",
  },
  {
    file: "domain/src/shelters/history.ts",
    symbol: "ShelterHistoryEntrySchema",
    text: "previous: ShelterLogoSchema.nullable(),",
    kind: "storage",
    why:
      "shelter_history's logo_changed entry (pet card PR 3b) - durable, but deliberately " +
      "NOT a reference, the same reasoning as reveals.animal_snapshot.primaryPhoto above: no " +
      "history-list rendering shows a past logo image, so a stale previous/next value here " +
      "never keeps an object alive past the grace period.",
  },
  {
    file: "domain/src/shelters/history.ts",
    symbol: "ShelterHistoryEntrySchema",
    text: "next: ShelterLogoSchema.nullable(),",
    kind: "storage",
    why: "logo_changed's own next field - same durable-but-not-a-reference reasoning as previous above.",
  },
  {
    file: "domain/src/shelters/history-shelter-facing.ts",
    symbol: "ShelterFacingHistoryItemSchema",
    text: "previous: ShelterLogoSchema.nullable(),",
    kind: "view",
    why:
      "ShelterFacingHistoryItemSchema's own logo_changed projection - a per-request view of " +
      "the history entry above, never a second stored copy.",
  },
  {
    file: "domain/src/shelters/history-shelter-facing.ts",
    symbol: "ShelterFacingHistoryItemSchema",
    text: "next: ShelterLogoSchema.nullable(),",
    kind: "view",
    why: "The same projection's next field - same reasoning as previous above.",
  },
];

const EXPECTED_PICKED_LOGO: ReadonlyArray<Anchor & { kind: Kind; why: string }> = [
  {
    file: "contracts/src/views/shelter.ts",
    symbol: "PublicShelterViewSchema",
    text: "logo: true,",
    kind: "view",
    why:
      "PublicShelterViewSchema - a per-request projection of shelters.logo, not a second " +
      "stored copy.",
  },
  {
    file: "contracts/src/views/shelter.ts",
    symbol: "ShelterSummaryViewSchema",
    text: "logo: true,",
    kind: "view",
    why:
      "ShelterSummaryViewSchema (the card view) - same shape as PublicShelterViewSchema's " +
      "pick above: a per-request projection, not storage.",
  },
  {
    file: "contracts/src/kabinet/views.ts",
    symbol: "KabinetShelterViewSchema",
    text: "logo: true,",
    kind: "view",
    why:
      "KabinetShelterViewSchema (K4, pet card PR 3b) - the shelter's own view of its logo, " +
      "a per-request projection of shelters.logo, not storage.",
  },
];

const EXPECTED_BARE_FIELDS: ReadonlyArray<Anchor & { kind: Kind; why: string }> = [
  {
    file: "domain/src/animals/photo.ts",
    symbol: "AnimalPhotoSchema",
    text: "storageKey: z.string().min(1),",
    kind: "definition",
    why:
      "AnimalPhotoSchema's own field - the one place a storage key is a bare string; every " +
      "other field that can carry one wraps this schema instead of repeating its shape.",
  },
  {
    file: "domain/src/shelters/logo.ts",
    symbol: "ShelterLogoSchema",
    text: "storageKey: z.string().min(1),",
    kind: "definition",
    why:
      "ShelterLogoSchema's own field (pet card PR 3a) - separate from AnimalPhotoSchema " +
      "because it needs no alt text (displayName is the accessible name). PR 4 widened " +
      "r2-cleanup-repo.ts's referencedStorageKeys to also read shelters.logo, and widened " +
      "this file's embedding and .pick scans (shelterLogoSchemaEmbeddings, pickedLogoFields) " +
      "the same way this entry already covered the bare-field one - no write path exists yet " +
      "(PR 3b's upload), so no live key anywhere today, but a future embedding or " +
      "`logo: true` pick elsewhere no longer passes silently.",
  },
  {
    file: "contracts/src/kabinet/views.ts",
    symbol: "PhotoCropSourceViewSchema",
    text: "objectKey: z.string().min(1),",
    kind: "view",
    why:
      "PhotoCropSourceViewSchema's kept source (crop frame): the source's R2 object key, read per " +
      "request from animal_photo_sources for the owning shelter's kabinet only, never a public " +
      "view. A child of its photo's storage key, so the clean-up's parent-path rule keeps it alive " +
      "exactly while animals.photos names that key; it adds no reference of its own.",
  },
  {
    file: "contracts/src/kabinet/views.ts",
    symbol: "KabinetPhotoCropViewSchema",
    text: "storageKey: z.string().min(1),",
    kind: "view",
    why:
      "KabinetPhotoCropViewSchema (crop frame): which photo an entry describes, a per-request echo " +
      "of a key already in the same view's photos array, never a second stored copy.",
  },
];

const exact = { unexpected: [], missing: [] };

describe("every schema field that can hold a photo's storage key is classified (GDPR photo retention)", () => {
  it("AnimalPhotoSchema is embedded in exactly the classified places - a new site needs a new entry here", () => {
    expect(compareSites(animalPhotoSchemaEmbeddings(), EXPECTED_EMBEDDINGS)).toEqual(exact);
  });

  it("ShelterLogoSchema is embedded in exactly the classified places - a new site needs a new entry here", () => {
    expect(compareSites(shelterLogoSchemaEmbeddings(), EXPECTED_LOGO_EMBEDDINGS)).toEqual(exact);
  });

  it("every bare-string storage-key field is one of the classified ones - a new one needs a new entry here", () => {
    expect(compareSites(bareStorageKeyFields(), EXPECTED_BARE_FIELDS)).toEqual(exact);
  });

  it("every .pick({ photos: true }) site is classified - a new one needs a new entry here", () => {
    expect(compareSites(pickedPhotosFields(), EXPECTED_PICKED_PHOTOS)).toEqual(exact);
  });

  it("every .pick({ logo: true }) site is classified - a new one needs a new entry here", () => {
    expect(compareSites(pickedLogoFields(), EXPECTED_PICKED_LOGO)).toEqual(exact);
  });

  it("no non-test .shape.photos access exists outside this scan's own awareness of it", () => {
    expect(shapePhotosAccesses()).toEqual([]);
  });

  it("exactly one embedding is classified as a live reference, and it's the one the clean-up repo reads", () => {
    const storageSites = EXPECTED_EMBEDDINGS.filter(
      (e) => e.kind === "storage" && e.file.endsWith("animal.ts"),
    );
    expect(storageSites).toHaveLength(1);

    const repoPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "src",
      "repos",
      "r2-cleanup-repo.ts",
    );
    const repoText = readFileSync(repoPath, "utf8");
    expect(repoText).toMatch(/FROM\s+"animals"/i);
    expect(repoText).toMatch(/"animals"\."photos"/);
  });

  it("exactly one embedding is classified as a live reference for shelters, and it's the one the clean-up repo reads", () => {
    const storageSites = EXPECTED_LOGO_EMBEDDINGS.filter(
      (e) => e.kind === "storage" && e.file.endsWith("shelter.ts"),
    );
    expect(storageSites).toHaveLength(1);

    const repoPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "src",
      "repos",
      "r2-cleanup-repo.ts",
    );
    const repoText = readFileSync(repoPath, "utf8");
    expect(repoText).toMatch(/FROM\s+"shelters"/i);
    expect(repoText).toMatch(/"logo"->>'storageKey'/);
  });

  it("every classified entry has a real reason", () => {
    for (const entry of [
      ...EXPECTED_EMBEDDINGS,
      ...EXPECTED_PICKED_PHOTOS,
      ...EXPECTED_BARE_FIELDS,
      ...EXPECTED_LOGO_EMBEDDINGS,
      ...EXPECTED_PICKED_LOGO,
    ]) {
      expect(entry.why.length).toBeGreaterThan(20);
    }
  });
});

/**
 * Crop frame (shape §5, condition 1): a photo's kept source sits in the public bucket under an
 * unguessable key, so that key must never reach a public view, an API response or the reveal snapshot.
 */
describe("a photo source's object key stays in the owning shelter's kabinet", () => {
  const DB_SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");
  const WEB_SRC = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "apps",
    "web",
    "src",
  );
  const filesUnderSrc = (root: string, pattern: RegExp): string[] =>
    [...new Set(scan(root, pattern).map((hit) => hit.file))]
      .map((file) => file.slice(file.indexOf("/src/") + "/src/".length))
      .sort();

  it("the photo record every public view embeds has no field a source key could ride in", () => {
    expect(Object.keys(AnimalPhotoSchema.shape).sort()).toEqual([
      "alt",
      "height",
      "storageKey",
      "width",
    ]);
  });

  it("only the kabinet's photo code in packages/db names the sources table; no public read does", () => {
    // gallery-repo, animal-repo, reveal-repo, mappers and r2-cleanup-repo stay off this list: the
    // clean-up must never read it either, or a leftover row would keep an object alive.
    // demo-remove.ts: the operator's removal counts the cascade and prints the source keys it leaves.
    expect(filesUnderSrc(DB_SRC, /\banimalPhotoSources\b|\banimal_photo_sources\b/)).toEqual([
      "demo-remove.ts",
      "full-reset.ts",
      "repos/kabinet-animal-repo.ts",
      "repos/photo-sources-repo.ts",
      "schema/animal-photo-sources.ts",
      "schema/index.ts",
      "test-utils/setup.ts",
    ]);
  });

  // Exact files, not a folder or the table's name alone: review of #490 planted a gallery-repo
  // read and an app page read, and both passed. The source key then reaches only K3's view.
  const USES_SOURCES = /\bphotoSourcesRepo\b|\bsourceRowSelect\b|\blistForAnimal\b/;

  it("in packages/db only the photo write, the operator scripts and the repo itself use the sources", () => {
    // backfill-avif-variants.ts: the operator's CLI reads every row to cut AVIF from kept sources.
    expect(filesUnderSrc(DB_SRC, USES_SOURCES)).toEqual([
      "backfill-avif-variants.ts",
      "onboard-shelter.ts",
      "repos/index.ts",
      "repos/kabinet-animal-repo.ts",
      "repos/photo-sources-repo.ts",
    ]);
  });

  it("in apps/web only the two kabinet handlers read them, pages (.tsx) included", () => {
    expect(filesUnderSrc(WEB_SRC, USES_SOURCES)).toEqual([
      "kabinet/handlers/animals.ts",
      "kabinet/handlers/photos.ts",
    ]);
    // The walk really reads pages: this one is a .tsx file.
    expect(filesUnderSrc(WEB_SRC, /export default async function AboutPage/)).toEqual([
      "app/pro/page.tsx",
    ]);
  });

  it("catches the two leaks the review planted: a public repo and an app page", () => {
    const root = mkdtempSync(join(tmpdir(), "opika-scan-"));
    try {
      const src = join(root, "pkg", "src");
      mkdirSync(join(src, "repos"), { recursive: true });
      mkdirSync(join(src, "app", "x"), { recursive: true });
      const read = "const rows = await photoSourcesRepo(db).listForAnimal(a, s);\n";
      writeFileSync(join(src, "repos", "gallery-repo.ts"), read);
      writeFileSync(join(src, "app", "x", "page.tsx"), read);
      expect(filesUnderSrc(src, USES_SOURCES)).toEqual(["app/x/page.tsx", "repos/gallery-repo.ts"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("no domain schema, and no contract outside kabinet/, declares a source-key field", () => {
    const SOURCE_KEY_FIELD = /\b\w*(?:source\w*Key|objectKey)\s*:/i;
    expect(scan(DOMAIN_ROOT, SOURCE_KEY_FIELD)).toEqual([]);
    expect(
      scan(CONTRACTS_ROOT, SOURCE_KEY_FIELD).filter(
        (hit) => !hit.file.startsWith("contracts/src/kabinet/"),
      ),
    ).toEqual([]);
  });
});
