import { z } from "zod";
import { LocalizedTextSchema } from "../primitives/localized-text";

/**
 * A storage key, never a URL: variant naming and CDN host belong to the image
 * pipeline, and baking either into stored data would make changing them a data
 * migration.
 *
 * Intrinsic dimensions travel with the record so a card can reserve its space
 * before the image loads. A deck that reflows mid-swipe feels broken, and that
 * is not a discovery worth postponing until there is a deck to discover it in.
 *
 * H1: `width`/`height` are the ORIGINAL uploaded photo's real dimensions
 * (`packages/db/src/image-pipeline/resolve-local-photo.ts` for the onboarding
 * script, `prepare-uploaded-photo.ts` for a kabinet upload, which is the
 * device-compressed file of at most `PHOTO_MAX_EDGE_PX`; both EXIF-orientation
 * corrected), retained for provenance — not the dimensions of what the
 * browser actually receives. Every real `<Image>` in the app uses
 * `object-fit: cover` inside a fixed-ratio box (`AnimalCard`/
 * `AnimalDetailScreen`), so the served variant is always 4:5 or 1:1
 * regardless of the source's own aspect ratio. `aspectRatio()` below
 * describes the source photo, not any rendered box — it has no call sites
 * today; if one is added, confirm which of the two it actually needs.
 */
export const AnimalPhotoSchema = z.object({
  storageKey: z.string().min(1),
  width: z.int().positive(),
  height: z.int().positive(),
  alt: LocalizedTextSchema.nullable(),
});
export type AnimalPhoto = z.infer<typeof AnimalPhotoSchema>;

/**
 * At most ten photos per animal (K-Q11, Oleksii: "a cap of 10 photos per
 * animal"). Enforced on the stored type so every write path (the kabinet's
 * upload, the onboarding script) meets the same ceiling, and the kabinet's
 * screens can lay out a fixed grid.
 */
export const MAX_ANIMAL_PHOTOS = 10;

/**
 * The longest edge a stored source photo may have, in pixels (K-Q2: "browser-side
 * compression to 2000 px is mandatory"). The device scales to this before
 * uploading, and the server refuses anything larger rather than scaling it
 * itself, so an oversized upload is a client fault that shows up, not a cost
 * the server silently absorbs. The largest variant served (`detail`,
 * 1120×1400) needs no more than this.
 */
export const PHOTO_MAX_EDGE_PX = 2000;

/**
 * How long an R2 photo object may sit unreferenced before the clean-up job
 * may delete it (GDPR photo retention, `docs/gdpr-analysis.md`). Oleksii's
 * R2-B1 design approval (`docs/decisions-inbox/feat-r2-photo-cleanup.md`)
 * confirms, verbatim, "the 7-day grace matching Neon's restore window" —
 * 7 is his own number, matched to Neon's Launch-plan point-in-time-restore
 * window (checked directly against Neon's own docs, 2026-10-25, not
 * assumed — `docs/stack-decision.md` names Neon's Launch plan, §6, but
 * doesn't itself state the window's length in days, so this isn't cited
 * back to that doc): if the database is ever restored a few days back,
 * the restored rows still find their photos. The same window also
 * covers two smaller, real races: an edit racing a concurrent one (both
 * touch the same animal's `photos` array within the grace window), and a
 * photo uploaded but never saved (the upload and the `animals.photos` write
 * are two separate steps; a crash between them leaves an object nothing yet
 * references, briefly, by design — never a reason to delete it within a day).
 */
export const R2_CLEANUP_GRACE_PERIOD_DAYS = 7;

/**
 * Whether an object first seen unreferenced at `firstSeenUnreferencedAt` may
 * be deleted at `now`, under `graceDays`. `now` and `firstSeenUnreferencedAt`
 * are both parameters — this function never reads the clock — so the manual
 * post-reset run (`--grace-days 0`, `docs/launch-sequence.md`) can ask the
 * same question the scheduled job does, just with a different bound.
 */
export function isPastGracePeriod(
  firstSeenUnreferencedAt: Date,
  now: Date,
  graceDays: number = R2_CLEANUP_GRACE_PERIOD_DAYS,
): boolean {
  const graceMs = graceDays * 24 * 60 * 60 * 1000;
  return now.getTime() - firstSeenUnreferencedAt.getTime() >= graceMs;
}

/**
 * Why the server refused an uploaded file as a photo. The server decides by
 * the file's own bytes, never by its name or the type the browser declared:
 * - `unsupported_type`: its magic bytes are not JPEG, PNG or WebP (GIF, SVG,
 *   HEIC, PDF, text…). HEIC is converted on the device where the browser can
 *   decode it (P-Q6), so one arriving here is a client that skipped that step;
 * - `format_mismatch`: the decoder reads a different format than the bytes
 *   claim, which only a crafted file does;
 * - `dimensions_exceeded`: a side longer than `PHOTO_MAX_EDGE_PX`, refused from
 *   the header alone, before any pixel is decoded;
 * - `unreadable`: the header or the pixels fail to decode.
 */
export const PHOTO_REJECTION_REASONS = [
  "unsupported_type",
  "format_mismatch",
  "dimensions_exceeded",
  "unreadable",
] as const;
export type PhotoRejectionReason = (typeof PHOTO_REJECTION_REASONS)[number];

export const aspectRatio = (photo: AnimalPhoto): number => photo.width / photo.height;
