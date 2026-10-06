# Review: e96c3cf (D-6 + O-10/C6), Tier 2, async

VERDICT: PASS WITH NOTES

| VERIFIED | TAKEN ON TRUST |
|---|---|
| Ran `sharp().metadata()` on all 6 JPEGs. 5 have no EXIF, IPTC or XMP. `cat-exif-rotated…` has 186 B of EXIF (orientation=6, resolution and version tags only; no Model or date strings) plus an sRGB ICC profile | Manual dev-server check that the 16:9 and 9:16 photos crop acceptably (no screenshot) |
| Commons API, 2026-10-06: all 6 file pages report `LicenseShortName: CC0` (source `commons-desc-page`). The originals carried device Models (motorola edge 5G UW, DMC-FZ1000, 22120RN86G), all gone from the committed files. William's original orientation is 6, so the reapplied tag is correct | Whole-suite pnpm check (summarised in the commit body, not pasted raw) |
| Thumbnail+dot onClick mutated to no-op: both swap tests went red (`expected '…%2Fa.jpg…' to contain '%2Fb.jpg'` / `'%2Fc.jpg'`). Restored | Seed-wiring revert mutation (not re-run) |
| Read the slice/filter logic: swap and displacement work as described. `SIX_PHOTO_INDEX`=41 resolves to dog (`41%3≠0`); `makeD6Photos` is used only at that index | |
| `uk.detail` is not covered by copy-status.test.ts, so nothing in that suite breaks. All 3 keys start with `COPY_PENDING` | |

## FINDINGS (most severe first)

1. **[high] DetailPhotoGallery.tsx:503-518 does not match the mock.** In D1 (Frames.dc.html) the thumbnail strip *includes* the active photo, with the first thumbnail outlined `3px #101112 offset 3`. The implementation leaves the active photo out of the strip and has no active outline at all. Its only outline is focus-visible `rg-registry`. Because of this, the "cap of 4 is the frame's own count" claim is wrong too: the frame shows 3 photos. The commit says "builds exactly", but it doesn't. With 4 photos, the mock doesn't say what happens to the 4th. Record that as an inbox row instead of taking a default.
2. **[high] The mobile photo now has two dot clusters.** In D2, the right-16/bottom-16 cluster (8px, active `#101112` filled, inactive outlined 2px `#63676B`) *is* the photo indicator described in README:688. The existing `pipsOverlay` sits in that exact spot, and the new dots are an extra row at bottom-centre. Also, the comment at :468 says the pips are "top-right". The code puts them at `right-4 bottom-4`.
3. **[high] :487: the dot buttons are `size-4` (16px).** The minimum is 48px. No test covers target size or focus-visible styling on either control.
4. **[med] Comments make false claims.** DetailPhotoGallery.tsx:428 says the crops are "verified … in the harness", but the diff changes no harness file. seed.ts:1092 lists "EXIF-rotated" among index 41's photos, but that file is a cat and isn't wired. uk.ts says the copy is "flagged in the decisions inbox", but the inbox has no row for it.
5. **[med] Copy paperwork is incomplete.** CLAUDE.md requires an inbox row with the key names and English sense for the 3 new keys. There isn't one, and no test pins them.
6. **[low] Duplicate React keys.** The code uses `key={photo.storageKey}`, and seed.ts says shelters upload duplicates. Duplicate photos would produce duplicate keys. Use the index.
7. **[low] The build-plan D-6 row is stale.** It still says "nothing downloaded" and "exiftool". The switch to sharp is disclosed in SOURCES.md, not in the row. SOURCES.md doesn't say the 2 cat files are unwired. Only seed.ts:1092 says so.

## SIMPLIFICATIONS
- None worth doing. The `pipsOverlay` prop can go away if finding 2 is resolved by removing the overlay.

## TESTS
- apps/web (DetailPhotoGallery + AnimalDetailScreen): 2 files, 11/11 passed
- packages/db seed-corpus.test.ts: 14/14 passed
- packages/i18n: 4 files, 20/20 passed
