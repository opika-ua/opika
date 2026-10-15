# Review: final kabinet copy (uncommitted on c151597, Tier 1, synchronous)

VERDICT: STOP (blocks the PR, not the commit: production sign-in is still 503, so no shelter can see the kabinet yet)

| VERIFIED | TAKEN ON TRUST |
|---|---|
| My own script: rows 1–88 of h2-copy-final.md (row 88's two lines joined with `\n`) against the live `uk` object, keys taken from h2-copy-export.md. 0 mismatches | The builder's full `pnpm check` (2330 unit, harness 222 passed, 3 skipped) |
| Placeholders, export sense vs uk: only row 70 drops `{shelter}`, row 84 drops `{operator}`, row 88 adds `{operator}`. Nothing else lost or renamed | Nowrap widths (EM-T16) |
| Every placeholder the code fills has a fill site: InviteLandingCard, SignInCard, SupportBanner title, ShelterProfile lockedNote/statusSince, email-message, invitation-reminder. Banner test asserts no brace. `adminJoined` has no renderer yet | The delivery script against real Brevo (not run, by instruction) |
| `kabinet.*`: 90 leaves, none pending. uk vs main: 88 keys differ, all `kabinet.*`. `forShelters` and `about` are byte-identical to main in uk and en | The builder's other mutations, beyond the one I re-ran |
| en parity: same key set, no kabinet placeholder mismatch, no pending kabinet strings | |
| No invented Ukrainian. Every Cyrillic run the diff adds is his text, a filled render, a fictional fixture (Тестовий/Домівка/Лапа), a grammar example, or the /pro draft already in KH-C1 | |
| The copy-status pins are literal transcriptions (23), not the uk constant. Production gate: live catalogue gives `on`; the synthetic catalogue gives `off` and names both paths | |
| Mutation: `MAGIC_LINK_TTL_SECONDS` 15→21 min fails with "MAGIC_LINK_TTL_SECONDS changed: the Ukrainian noun form «хвилин» in kabinet.email.signIn.expiry, kabinet.inviteLanding.sent and kabinet.signIn.sentBody was written for 15 … expected 21 to be 15". Restored | |
| TTL move: same value (900). `auth.ts` imports it for `expiresIn` and re-exports it; `vkhid/page.tsx` still resolves it | |
| Delivery test: reads only `BREVO_API_KEY` from .env.local, refuses without `--to`, a From name or a Reply-To, refuses on pending copy, logs only status and message id, uses the real builders. Tracked files hold only `example.com` | |
| `Intl` uk-UA long date does append «р.» (`node`: «14 березня 2025 р.»), so EM-T14 is honest | |
| `tsc --noEmit --incremental false`: apps/web and packages/i18n clean | |

## Findings (most severe first)

1. **[STOP: a claim on a user-facing surface] `uk.ts` `kabinet.profile.addressNote` (row 57) is false.**
   - What it says: «адреса показується лише як приблизне коло на мапі». In English, adopters see the address only as an approximate circle on a map.
   - What the product does: no adopter surface renders a map. The detail screen shows the city line plus `location.noMapExplanation`: «Карти тут немає…» ("There is no map here…").
   - Where it came from: the export (row 57) told him the sentence was "true", but that was checked against the shape of the code (radius = 1000) rather than its behaviour.
   - What a shelter would see: a shelter reads the caption, then opens its own card and finds no map.
2. **[note, for the same batch] Row 85, `email.invite.what`.** «переглянути профіль притулку таким, яким його бачать люди» ("view the shelter profile as people see it"). The kabinet also shows the legal name, the ЄДРПОУ code and the exact address, which adopters never see. It is arguably loose rather than false. His call.
3. **[note] Row 90: his instruction and the coordinator's disagree, and the docs don't say so.**
   - His text: "Ships with the cron", and the cron shipped in #95.
   - The coordinator's text: rows 89/90/91 ship with the production sign-in wiring.
   - EM-Q6 quotes both but doesn't name the conflict. Nothing is false meanwhile, because no shelter has production access. Ask him.
4. **[note, commitments register] Several final strings are true today only for the same reasons as register rows #6 and #7.**
   - `voiceNote` says the `{date}` filled in is «дату оновлення» (the update date). The domain fills the last confirmed date. That is the same fact as #7's «оновлювали», so add it to #7's watch list and B1.
   - The «я»/«мені» lines are the same fact as #6: `notArrived`, and `email.invite.what`/`expiry`.
   - Add these keys to the "Falsified by" cells for #6 and #7.
   - I checked `contactsNote` (vs #2 and #4) and `donationNote` (vs #5, https enforced by `DonationLinkSchema`): both are true.
5. **[minor]** `ShelterProfile.test.tsx` cites "inbox EM-T13" for the «р.» note. The entry is EM-T14.
6. **[minor]** `docs/h2-copy-sheet.md`'s A2 and /pro headers repeat "A1 goes directly before §7's last paragraph", which is A1's placement only.

## Simplifications

- `email-delivery-test.ts`: drop the second check that a built email contains `COPY_PENDING`. The builders only read `uk.kabinet.email`, which the catalogue check already covers. If this is wrong, a marker that arrives through `--operator-name` would go out in a hand-run test email to Oleksii.

## STOP reason

Oleksii needs to decide on row 57: either write a true sentence, or tell the builder to delete the caption now. Deleting needs no copy approval. A map can't be kept as the justification, because a map is a plan, not a description. Ask in the same message whether row 85's «таким, яким його бачать люди» stands, and confirm when row 90 ships.

## Tests

- packages/i18n: 4 files, 54/54 passed.
- apps/web, the touched suites (copy-plural-pins, email-delivery-test, email-message, email-senders, production-sign-in, registry, features/kabinet): 12 files, 155/155 passed.
