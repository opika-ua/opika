import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * GDPR photo retention (`docs/gdpr-analysis.md`). `r2-cleanup-repo.ts`'s
 * `referencedStorageKeys` reads exactly one column (`animals.photos`) as the
 * live reference set. Oleksii, 2026-10-25, widening that design before it was
 * built: "widen the structural test so it catches any schema field that can
 * hold a storage key (a plain string or `AnimalPhotoSchema`), not just the
 * schema import."
 *
 * This is that check. It finds every place in `packages/domain` and
 * `packages/contracts` where a schema field is typed to carry a photo's
 * storage key — either by embedding `AnimalPhotoSchema` (never just naming
 * it in an import) or by declaring a bare `z.string()` field whose name reads
 * like a storage key — and requires each to be a classified, reasoned entry
 * below. A new one (a second durable field, a bare string that bypasses
 * `AnimalPhotoSchema`) fails this test by file and line, forcing a decision
 * about whether `r2-cleanup-repo.ts`'s reference set needs to widen too,
 * rather than letting a photo quietly become unaccounted for.
 *
 * "Can hold a storage key" is a schema-shape question, not a "where is this
 * actually persisted" one — a view/projection schema counts here even though
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

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile() && path.endsWith(".ts") && !path.endsWith(".test.ts")) yield path;
  }
}

interface Hit {
  file: string;
  line: number;
  text: string;
}

function scan(root: string, pattern: RegExp): Hit[] {
  const hits: Hit[] = [];
  for (const path of walk(root)) {
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((lineText, index) => {
      if (pattern.test(lineText)) {
        hits.push({
          file: relative(resolve(root, "..", ".."), path).replaceAll("\\", "/"),
          line: index + 1,
          text: lineText.trim(),
        });
      }
    });
  }
  return hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

/** Every real reference to `AnimalPhotoSchema` that is not its own import. */
const ANIMAL_PHOTO_SCHEMA_IMPORT = /^\s*import\b|^\s*\w+,?\s*$|^\s*AnimalPhotoSchema,?\s*$/;
function animalPhotoSchemaEmbeddings(): Hit[] {
  const domain = scan(DOMAIN_ROOT, /AnimalPhotoSchema/).filter(
    (hit) =>
      !ANIMAL_PHOTO_SCHEMA_IMPORT.test(hit.text) &&
      !/^export const AnimalPhotoSchema/.test(hit.text) &&
      !/^export type AnimalPhoto\b/.test(hit.text),
  );
  const contracts = scan(CONTRACTS_ROOT, /AnimalPhotoSchema/).filter(
    (hit) => !ANIMAL_PHOTO_SCHEMA_IMPORT.test(hit.text),
  );
  return [...domain, ...contracts].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

/** A bare `z.string()` field whose name reads like a storage key, wherever it is declared. */
// A suffix match (`\w*`), not an exact one, and case-insensitive on the key
// name (Tier 1 review, PR #200, note 11) — `coverPhotoKey` has a capital
// `P`, which a case-sensitive exact match on `photoKey` would silently
// miss. `coverPhotoKey`, `thumbnailStorageKey` and the like read like a
// storage key just as much as the bare names do, and a suffix check costs
// nothing against today's one real site (`photo.ts`'s own `storageKey`).
const BARE_STORAGE_KEY_FIELD = /\b\w*(?:storageKey|photoKey|imageKey|objectKey)\s*:\s*z\.string\(/i;
function bareStorageKeyFields(): Hit[] {
  return [
    ...scan(DOMAIN_ROOT, BARE_STORAGE_KEY_FIELD),
    ...scan(CONTRACTS_ROOT, BARE_STORAGE_KEY_FIELD),
  ].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

type Kind = "storage" | "view" | "definition";
const EXPECTED_EMBEDDINGS: ReadonlyArray<Hit & { kind: Kind; why: string }> = [
  {
    file: "domain/src/animals/animal.ts",
    line: 59,
    text: "photos: z.array(AnimalPhotoSchema).max(MAX_ANIMAL_PHOTOS).readonly(),",
    kind: "storage",
    why:
      "animals.photos — the one durable reference set. r2-cleanup-repo.ts's referencedStorageKeys " +
      'reads exactly this column; a photo\'s storage key is "live" iff it appears here.',
  },
  {
    file: "domain/src/reveals/contact-reveal.ts",
    line: 44,
    text: "primaryPhoto: AnimalPhotoSchema.nullable(),",
    kind: "storage",
    why:
      "reveals.animal_snapshot.primaryPhoto — durable, but deliberately NOT a reference (Oleksii, " +
      "2026-10-25): traced every consumer of ContactRevealView and reveals.listMine has a handler " +
      "but no route or component anywhere calls it, so nothing displays this today. A deleted " +
      "object's key is nulled out of this field in the same clean-up run (r2-cleanup-repo.ts's " +
      "afterDeleted), so a dangling pointer never sits here either.",
  },
  {
    file: "contracts/src/kabinet/views.ts",
    line: 51,
    text: "coverPhoto: AnimalPhotoSchema.nullable(),",
    kind: "view",
    why:
      "KabinetAnimalRowViewSchema's own extend() field — an API response projection built per " +
      "request from the one durable animals.photos column (its first entry), never a second " +
      "stored copy.",
  },
  {
    file: "contracts/src/views/animal.ts",
    line: 69,
    text: "primaryPhoto: AnimalPhotoSchema.nullable(),",
    kind: "view",
    why:
      "FeedCardViewSchema's own extend() field — same as kabinet/views.ts's coverPhoto: a " +
      "per-request projection of animals.photos, not storage.",
  },
];

const EXPECTED_BARE_FIELDS: ReadonlyArray<Hit & { kind: Kind; why: string }> = [
  {
    file: "domain/src/animals/photo.ts",
    line: 26,
    text: "storageKey: z.string().min(1),",
    kind: "definition",
    why:
      "AnimalPhotoSchema's own field — the one place a storage key is a bare string; every " +
      "other field that can carry one wraps this schema instead of repeating its shape.",
  },
];

describe("every schema field that can hold a photo's storage key is classified (GDPR photo retention)", () => {
  it("AnimalPhotoSchema is embedded in exactly the classified places — a new site needs a new entry here", () => {
    expect(animalPhotoSchemaEmbeddings()).toEqual(
      [...EXPECTED_EMBEDDINGS]
        .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
        .map(({ file, line, text }) => ({ file, line, text })),
    );
  });

  it("no bare string field holds a storage key outside AnimalPhotoSchema's own definition", () => {
    expect(bareStorageKeyFields()).toEqual(
      [...EXPECTED_BARE_FIELDS]
        .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
        .map(({ file, line, text }) => ({ file, line, text })),
    );
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

  it("every classified entry has a real reason", () => {
    for (const entry of [...EXPECTED_EMBEDDINGS, ...EXPECTED_BARE_FIELDS]) {
      expect(entry.why.length).toBeGreaterThan(20);
    }
  });
});
