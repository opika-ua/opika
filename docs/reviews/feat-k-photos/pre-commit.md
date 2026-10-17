# Review: feat/k-photos, PR 3 (photo upload), pre-commit, Tier 1

Diff reviewed: `git diff a921138` plus 15 untracked files, in `D:\opika-worktrees\kp`.

VERDICT: STOP (blocks the merge, not the commit: commit and push now, keep the PR in draft)

| VERIFIED | TAKEN ON TRUST |
|---|---|
| Touched suites green: 690 tests in 19 files (counts below) | Full `pnpm check` (2962 unit + 226 harness): the builder's run. No commit body yet, so nothing pasted |
| 11 mutations of my own, results below. 10 went red, 1 survived (finding 4) | The builder's 23 mutations: no list was provided, so I ran my own instead |
| GPS canary precondition is real: the fixture's EXIF holds the IFD0 and GPS canaries and its XMP holds the XMP canary, checked before the strip test | P-B1's wording: reached the builder through an agent brief, and no copy exists in the repo |
| Order: per-IP, Origin, body (413), registry, session, per-user. Read the code, and the body tests pin "no session on 413" | R2 honours If-None-Match; sharp loads on Vercel; Hobby's body limit; Upstash's 1 h and 24 h windows |
| proxy.ts matcher covers /api/kabinet/*, so the 10 MB proxy-buffer argument applies, and a test pins it | The token's scope, and whether it can delete (P-T15) |
| No callers of the index-based key remain (grep). The env names match across code, .env.example, h1-decisions and onboarding | P-Q15 result; the Neon smoke run |
| Env messages print names only (tests + M10) | browserPlatform canvas behaviour; whether format_mismatch can be reached |
| Smoke step 24 compares against [] (fixtures.ts:126) | |
| The 9+2 concurrency test passed 5 of 5 runs | |

Mutations (each one restored, checksums verified):
- **M1.** Removed IfNoneMatch. Red: r2-client.test failed with "expected {Bucket: photos, ...} to match object".
- **M2.** Added .keepMetadata() in generateVariants. Red: "thumb exif: expected Buffer[69,120,105,102...] to be undefined", and the scan named generate-variants.ts.
- **M3.** Disabled the 2000 px check. Red: 3 tests (2001 wide, 2001 tall, the pixel bomb).
- **M4.** Skipped the byte count when there is no Content-Length. Red: "Error: reached the session lookup", twice.
- **M5.** Trusted a declared Content-Length. **Survived: 35 of 35 green.**
- **M6.** Removed the hourly limit. Red: "expected 200 to be 429".
- **M7.** Removed the cap check inside the retry. Red: "expected [200, 500] to deeply equal [200, 409]" (the database held 11 photos).
- **M8.** Removed reserved from the visible states. Red: "expected 200 to be 409".
- **M9.** Replaced the compare-and-set with sql true. Red: 2 repo tests and the smoke test "passes every statement".
- **M10.** Made the env check always return null. Red: the boot and padded-value tests.
- **M11.** Removed logOrphan. Red: "expected error to be called with {event: photo_orphaned, ...}".

## FINDINGS (most severe first)

1. **[Medium] packages/db/test/neon-smoke.ts:950-1004.** Step 24's successful compare-and-set only ever compares against []. The comparison every reorder, remove and add-to-non-empty makes is a list of photo objects with alt: null, and that is never exercised through neon-http.
   - Failure scenario: if neon-http reads that list back in a form that doesn't stringify to an equal jsonb, every such write 500s in production while step 24 still passes.
   - Fix: add a second write with expected = afterPhotos.animal.photos and expect ok. This must land before the Neon run.
2. **[Medium] docs/onboarding-a-shelter.md, takedown and probe sections.**
   - The takedown section says the key comes "from the animal's history or the database". The history records field names only (K-Q7), and a removed photo's key has already left the database. The only source left is listing animals/{animalId}/ in the bucket.
   - Probe step 1 offers a kabinet upload as one way to run it. That can't test an overwrite (every upload gets a random key), and production refuses writes anyway.
   - Step 3 deletes a production object. Say that Oleksii's OK covers that step too.
3. **[Low] Provenance.** The P-Q1..P-Q16 recommendations that P-B1 accepts "as you recommend" are not in the repo. So the tests that call 4 MiB and 60/300 "the approved answer" cite a source nobody can check. Record one line per P-Q in the inbox. This is paperwork, not a STOP on its own.
4. **[Low] rpc-route.ts:44-46.** The comment says "a declared length is not trusted", but no test holds it (M5 survived). Add a test: a small declared length with a larger body must get 413.
5. **[Low] photo-pipeline-scan.test.ts checks less than it claims.** UploadPartCopyCommand or CompleteMultipartUploadCommand inside r2-client.ts, or @aws-sdk/lib-storage anywhere, would pass it. Pin r2-client.ts's import to exactly { PutObjectCommand, S3Client }, and match "@aws-sdk/" broadly.
6. **[Low] docs/stack-decision.md:23,312** still records Vercel Pro as the decision, with no pointer. P-Q7 says "correct the record".
7. **[Low] Comments that are now wrong or vacuous.**
   - test-harness.ts:77-92: the createTestHarness JSDoc is now orphaned above rpcRequestInit.
   - rate-limits.ts: "passed access" should say "passed the write policy, before ownership" (P-T4).
   - The IPTC assertion is vacuous: the fixture carries no IPTC.
8. **[Info, for the PR body]** As far as I know, R2's "Object Read & Write" permission also allows DeleteObject (unverified). The code still never deletes. But a compromised deployment, the threat behind the old rule, would be able to.

## SIMPLIFICATIONS

- handlers/photos.ts:207: replace the hand-rolled published || reserved with isDiscoverable(animal.listing) (domain listing.ts:105). Nothing breaks, and it can't drift if a new visible state is added later.
- image-pipeline/server.ts: drop the PreparedPhoto, UPLOAD_PIXEL_LIMIT, SniffedImageType and sniffImageType re-exports. Nothing outside the package uses them.
- photo-uploads.ts: the off arm repeats the one in PhotoUploadConfig. Derive it with Extract on kind "off".

## STOP REASON

The merge needs these from Oleksii, ranked:
1. Create the upload token (photo bucket only) and confirm whether it can delete (P-T15). Set the four R2_* variables in Vercel Production only. Without them the production build fails (P-T10). The PR body must say this first.
2. Run P-Q15's read-only count; it must return zero rows.
3. Authorize the Neon smoke run after finding 1 is fixed; expect 24 passed.
4. Run the overwrite probe (P-Q11) before uploads open to any shelter, including PR 2's test-shelter allowlist.
5. Confirm that P-B1 is his wording, and confirm P-T4: upload units are charged before the ownership check.

## TESTS (touched suites only, not the workspace total)

- domain: 2 passed (1 file)
- contracts: 241 passed (2 files)
- db pipeline: 47 passed (4 files)
- db repo/smoke/onboarding: 54 passed (3 files)
- web: 346 passed (9 files)
- Total: 690 passed, 19 files
