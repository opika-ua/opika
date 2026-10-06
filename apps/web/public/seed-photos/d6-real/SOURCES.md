# D-6 real photographs — deliberately awkward ratios

Six real, CC0-licensed photographs, chosen for aspect-ratio and EXIF variance rather than
visual quality — they exist to stress-test the detail page's photo gallery (O-10) and
critique item C6 ("detail-page photo crops were not checked against the real source images'
aspect ratios," `docs/design-critique.md`) against real-world awkward inputs, not to serve as
general-rotation placeholders the way `../SOURCES.md`'s nine photos do. Candidate list
originally recorded in `docs/build-plan.md`'s D-6 row (2026-09-12, sourcing only); downloaded,
EXIF/IPTC-stripped and committed here 2026-10-06.

Every file is CC0 1.0 Universal (Public Domain Dedication), confirmed on that specific file's
own Wikimedia Commons page at the time of download — not a category-level or site-wide claim.
Re-verify at the source URL before relying on the licence for anything formal; Commons pages
can and do change.

**Only four of these six are currently wired into seed data.** `packages/db/src/seed.ts`'s
`D6_REAL_DOG_PHOTOS` — the set `SIX_PHOTO_INDEX`'s animal actually renders — is dog-only:
`dog-tall-9x16-sugarbelle.jpg`, `dogs-wide-16x9-bulldogs-lifejackets.jpg`,
`dog-small-400px-joydogs.jpg`, `dog-large-4000px-chihuahua.jpg`. The two cat photos,
`cat-exif-rotated-william-blanket.jpg` and `cat-bonus-muchi.jpg`, are committed here
deliberately but intentionally **not** wired into any seeded animal — `SIX_PHOTO_INDEX`'s
animal is a dog (species-mismatch avoidance: a dog's listing showing a cat photo would be a
real content bug, not a stress test), and no other seed slot currently reaches into this
directory. They are kept in the repo as sourced, licence-clean, metadata-verified candidates
for whichever future row wants a cat-side equivalent of this stress test — not orphaned or
forgotten files.

| File | Slot | Source | Dimensions | Notes |
|---|---|---|---|---|
| `dog-tall-9x16-sugarbelle.jpg` | 9:16 tall | [File:Sugarbelle_the_Dog.jpg](https://commons.wikimedia.org/wiki/File:Sugarbelle_the_Dog.jpg) | 665×1182 (ratio 0.5626) | Single-subject outdoor portrait, own work, 2017. No humans/text in frame. |
| `dogs-wide-16x9-bulldogs-lifejackets.jpg` | 16:9 wide | [File:Two_French_bulldogs_swimming_in_life_jackets.jpg](https://commons.wikimedia.org/wiki/File:Two_French_bulldogs_swimming_in_life_jackets.jpg) | 3999×2249 (ratio 1.778) | Two dogs, Sandvik beach, Sweden, Aug 2017. No humans/branding/signage. |
| `cat-exif-rotated-william-blanket.jpg` | EXIF-rotated | [File:WilliamInHisBlanket.jpg](https://commons.wikimedia.org/wiki/File:WilliamInHisBlanket.jpg) | 4000×2250 stored, EXIF Orientation 6 (rotate 90° CW to display correctly) | The whole point of this slot: a viewer that ignores the Orientation tag renders this sideways. The tag is deliberately kept (see "What was stripped," below) — `generate-variants.ts`'s own `.rotate()` call is what should consume it once this goes through the real upload pipeline. |
| `dog-small-400px-joydogs.jpg` | ~400px small | [File:Joy_dogs.jpg](https://commons.wikimedia.org/wiki/File:Joy_dogs.jpg) | 393×387 (near-square) | **Visual check done, flagged, not substituted:** the dog's head rests on what reads as a bare human arm/forearm — no face, no other identifying detail, but a human body part is in frame, unlike every other slot here. This was the closest true small-dimension CC0 match found after checking multiple size-filtered Commons searches (recorded in `docs/build-plan.md`'s original candidate list); no better alternative was found, so it's kept with this noted rather than silently swapped. Oleksii's call whether that disqualifies it for this slot. |
| `dog-large-4000px-chihuahua.jpg` | ~4000px large | [File:Chihuahua_wikipedia.jpg](https://commons.wikimedia.org/wiki/File:Chihuahua_wikipedia.jpg) | 3000×4000 | Close-up portrait. Original EXIF Orientation tag read raw "0" (non-standard/incomplete) rather than a real rotation value — the file's actual 3000×4000 portrait dimensions already match its content, so this was a zeroed tag, not a genuine mismatch like the EXIF-rotated slot's file. |
| `cat-bonus-muchi.jpg` | bonus (species balance) | [File:Muchi_Cat.jpg](https://commons.wikimedia.org/wiki/File:Muchi_Cat.jpg) | 3072×4080 | Kitten near a doorway with a string toy. Visual check done: no humans, no text, no branding. Brings the set to 2 cats / 4 dogs instead of 1/5. |

## What was stripped, and how — verified, not assumed

`exiftool` was not available on the machine that did this work (no admin rights to install
it) — EXIF/IPTC/XMP stripping and verification were done with `sharp` (already a project
dependency, `packages/db`) instead, metadata presence checked directly via
`sharp(...).metadata()` before and after on every file, not assumed from the stripping call
alone. Real, non-trivial findings from that check, not a clean pass by default:

- The EXIF-rotated file's raw Commons download carried real identifying device metadata —
  `motorola edge 5G UW (2021)`, a capture timestamp, and a long block of proprietary HDR
  processing data — none of which is visible from the Commons page itself. A naive
  `sharp(...).withMetadata({ orientation: 6 })` call on the original file does **not** strip
  this; `withMetadata()` overlays the given fields onto the source's *existing* metadata
  rather than replacing it, which was not the expected behaviour until checked. The actual
  fix: re-encode once with no metadata options at all (drops everything), then run
  `withMetadata({ orientation: 6 })` on the already-clean output — confirmed by dumping the
  resulting EXIF buffer as text and checking for the device string, "2025"/"2024" date
  fragments, and other identifying substrings, not just checking the buffer got shorter.
- The wide (bulldogs) file carried real EXIF, IPTC *and* XMP blocks — all three confirmed
  stripped the same way as the rest (default `sharp` re-encode, no `withMetadata()` call).
- Every other file's default re-encode stripped cleanly on the first pass — `iptc`/`xmp`/
  `exif` all confirmed `false` via `sharp(...).metadata()` after writing, except the
  EXIF-rotated file's deliberately-kept orientation tag (confirmed via a hex dump that only
  the orientation value and generic resolution tags remain — no device, date, or location
  strings).

**Not done here (Tier 1 — R2 write, an operator's own credentials, per
`docs/standing-constraints.md`):** the actual upload to R2. These six files are the prepared,
licence-clean, metadata-stripped input set for that step — `docs/build-plan.md`'s D-6 row has
the decision this still needs (a second `opika-demo` bucket vs. the one shelter-onboarding
bucket) before it happens.
