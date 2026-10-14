# H2 copy sheet: Ukrainian for Oleksii to write in one sitting

Inbox H2-8. Every string below ships as `[COPY PENDING]` until it's written here, and
`copy-status.test.ts` pins each placeholder. **Rows A–C block the merge of whichever PR ships
self-serve**: they are `/prytulkam` commitments (#6, #7), and a false commitment sentence must
never be live. Rows D–F block nothing but their own screens.

For each string: the key, where it shows, the current text if there is any, and the English
sense of what is true once H2 ships. The English is a description of the facts, not a draft
to translate.

---

## A. `/prytulkam` §7/§9/§10 — commitment #6 (blocks the self-serve merge)

### A1. `forShelters.whatToPrepare` (§7)
**Current (last paragraph is the part that goes false):**
> Заповнювати анкету не треба: ви розкажете, а я внесу все сам.

**True after H2:**
- The shelter adds and edits its own animals in the cabinet.
- The operator still creates the shelter, enters the verification evidence (S2) and sends
  the invite.
- The operator script still exists for a shelter that hands over a spreadsheet. Whether to
  *offer* "send it and I'll enter it" is your call, not a fact.

The rest of §7 (photos, a few sentences per animal, a contact, a donation link, the update
sentence) stays true.

**Added line.** **Final (Oleksii, 2026-10-14); ships in the commit that turns production sign-in on; A1 goes directly before §7's last paragraph.** Not in `uk.ts` until that commit. His answer (row 91 of the PR #94 copy
export, 2026-10-14, relayed by the coordinating session), verbatim: "Yes, include it: «Доступ до
кабінету я надсилаю сам — листом на адресу, яку ви мені вкажете.» Place it directly before the
current last paragraph of §7, and ship it in the same commit as row 89."
> Доступ до кабінету я надсилаю сам — листом на адресу, яку ви мені вкажете.

(Earlier: answer 3 offered it as optional, not blocking, with its position open.)

### A2. `forShelters.whenAnimalFindsHome` (§9)
**Current (last paragraph goes false):**
> Поки що це просто: напишіть, і я приберу. Окремої кнопки ще немає — не хочу обіцяти кабінет,
> якого не існує.

**Oleksii's replacement.** **Final (Oleksii, 2026-10-14); ships in the commit that turns production sign-in on; A1 goes directly before §7's last paragraph.** Not in `uk.ts` until that commit. His answer (row 89 of the
PR #94 copy export, 2026-10-14, relayed by the coordinating session), verbatim: "FINAL YES as
drafted: «Поки що це просто: напишіть, і я приберу. Кабінет притулку вже є, але лише для перегляду —
змінити чи прибрати щось у ньому поки не можна.» Ships in the commit that turns production sign-in
on (EM-Q1 b)." History: provisional, slated for the wiring commit (EM-Q1,
2026-10-14, verbatim: "(b). A2 keeps the current text; the new paragraph ships in the commit that
turns production sign-in on." The live text stays the "Current" above until then;
`docs/h2-next-prs.md` carries it.) **His paragraph (answer 3, verbatim:
"A2: «Поки що це просто: напишіть, і я приберу. Кабінет притулку вже є, але лише для перегляду —
змінити чи прибрати щось у ньому поки не можна.» (replacing A2's third paragraph)" and "Copy: put
my A2 paragraph and the /pro sentence in as provisional. I'll give the final yes before #94
merges."):**
> Поки що це просто: напишіть, і я приберу. Кабінет притулку вже є, але лише для перегляду —
> змінити чи прибрати щось у ньому поки не можна.

It describes the read-only kabinet, not the K2 editing below; when K2 ships, the paragraph changes
again.

**True after H2 (K2, later):**
- The cabinet has a «Уже вдома» action per animal (K2). It takes the animal out of the gallery
  and keeps the record.
- Writing to you still works, too.

The first two paragraphs (why a homed animal left listed poisons every card) stay true.

### /pro `about.data`: the addition (KH-C1)
**Final (Oleksii, 2026-10-14); ships in the commit that turns production sign-in on; A1 goes directly before §7's last paragraph.** Not in `uk.ts` until that commit (the coordinating session's instruction for #94: rows
89/90/91 ship together in it). Appended to `about.data`. His answer (row 90 of the PR #94 copy
export, 2026-10-14, relayed by the coordinating session), verbatim: "FINAL YES as drafted
(«…видаляються протягом двох діб.»). The ~50h worst case with one skipped run is accepted:
«протягом двох діб» describes the normal cycle. Ships with the cron." The text as drafted (KH-C1,
Hobby):
> Для притулків із доступом до кабінету реєстр зберігає ім'я та адресу пошти адміністратора — щоб
> надсилати посилання для входу, — а також технічний запис про браузер і пристрій, з якого виконано
> вхід. IP-адреси не зберігаються. Адреси, введені у формі входу, і записи про входи, що втратили
> силу, видаляються протягом двох діб.

On Vercel Pro the last clause would revert to «протягом доби» (KH-C1).

### A3. `forShelters.whoIsBehindThis` (§10)
**Current:**
> Opika робить одна людина — я, поза основною роботою. Немає команди, немає інвестора, немає
> відділу підтримки: коли ви пишете на цю адресу, відповідаю я.

**After H2:** as far as I can see, **still true** (one operator, answering personally).
Commitment #6 lists it, so it's here for you to confirm rather than for me to judge.

**Oleksii, 2026-10-14, answer 3, verbatim: "A3: keep as is."** The kabinet's support banner is
renamed instead (`docs/h2-invite-copy-sheet.md` S).

### A4. `forShelters.howToLeave`: not in commitment #6, listed because it's next door
> …напишіть, і я приберу все: тварин, фотографії, ваш запис.

**After H2:** still true. Removing a shelter remains the operator's action, and H2 adds no
self-delete.

---

## B. Commitment #7: the freshness date now means confirmation (blocks the self-serve merge)

H2-3 = yes: freshness reads `last_confirmed_at`. That is set when the shelter publishes an
animal or taps «Ще шукає» / «Ще домовляються» (K2, one animal per tap, no bulk). Edits never
move it.

### B1. `forShelters.whyThatSentence` (§8)
**Current (the sentence that changes):**
> …Тому на картці видно, коли інформацію востаннє оновлювали, а на сторінці тварини — ваше
> речення про те, як часто ви це робите, вашими словами.
>
> Дата ставиться сама. …

**True after H2:**
- The card shows when the shelter last confirmed the animal is still looking. Fixing a typo
  doesn't move it.
- "The date is set automatically" is still true in the sense that nobody types it: it's
  stamped by the confirm tap.

### B2. `freshness.updatedAgo` («Оновлено {days}»), on every gallery card, the deck and the detail page
**After H2:** the number is the time since the last *confirmation*, not the last edit.
- Whether «Оновлено» still reads honestly for that, or should become a "confirmed" wording,
  is your call.
- Listed because it's the most-seen string the change touches.
- `docs/design/README.md:238/307/869` use the same wording and follow whatever you pick.

### B3. `freshness.attribution` («Слова притулку · дата автоматична»)
**After H2:** still true. No change expected; listed for completeness.

---

## C. K5: the rejected shelter's own view (blocks K5 only)

KABINET's draft text, which is the designer's, not approved copy: «Перевірку не пройдено» ·
«Ваші тварини поки не в галереї. Ось що написав оператор реєстру:» · «Написати оператору
реєстру» · «Подати ще раз».

**H2-2 adds a requirement:** the copy must say plainly that **a person** reviews the
resubmission, with no implied automatic re-check.
- **True after H2:** pressing «Подати ще раз» sends the same evidence back for the operator to
  look at again.
- If something was missing, the operator adds it, usually after you've talked.
- The shelter is told the outcome the same way as the first time.

---

## D. Reason-code labels (each blocks only its own dialog or row)

Codes are fixed (`packages/domain/src/shelters/verification/reasons.ts`,
`animals/listing.ts`). Labels are new keys. Where the design gave draft text it's quoted;
otherwise there is none.

| List | Code | English sense | Design draft |
|---|---|---|---|
| Rejection | `insufficient_evidence` | not enough to verify yet | — |
| | `identity_unverifiable` | couldn't confirm who you are | — |
| | `duplicate_submission` | already registered / duplicate | — |
| | `out_of_service_area` | outside the oblast we cover | — |
| | `spam` | not a shelter application | — |
| | `other` | other (see note) | — |
| Suspension | `unresponsive` | not answering adopters | — |
| | `complaint_upheld` | a complaint was checked and upheld | — |
| | `listing_quality` | listings not kept accurate | — |
| | `suspected_fraud` | suspected fraud | — |
| | `other` | other (see note) | — |
| Pause (shelter's own) | `seasonal_closure` | seasonal break | «Сезонна перерва» |
| | `relocation` | moving | «Переїзд» |
| | `capacity_reached` | no room | «Немає місця» |
| | `staff_shortage` | not enough people | «Брак людей» |
| | `other` | other | «Інше» |
| Withdrawal (animal) | `adopted_elsewhere` | adopted through another route | — |
| | `transferred` | moved to another shelter | — |
| | `deceased` | died | — |
| | `listing_error` | listed by mistake | — |
| | `other` | other (see note) | — |

The rejection reason is shown to the shelter verbatim (K5); suspension and pause reasons also
reach the shelter (K2's banner, S4). Tone matters most for those two lists. A rejection is a
decision, not an alert (KABINET's hard constraint 6).

---

## E. N19: the medical control's third option (blocks K3 only)

**Key:** `kabinet.medical.declareConfirmed` (new).
**English sense:** the shelter asserting "this is done", as an action label on a segmented
control whose other two options reuse `medical.unknown` («Не записано») and
`medical.inProgress` («У процесі»).
**After saving**, the adopter sees the existing badge «Слова притулку», unchanged. So the
action and the provenance badge are allowed to read differently.
**Current:** none.

---

## E2. The operator's reject/suspend note: the dialog's helper text (blocks S3/S4's dialog only)

**Key:** `registry.verificationNote.helper` (new; ships `[COPY PENDING]` with the S-screen dialog).
**Where:** under the note field in the reject and suspend dialogs (S3/S4). The note is required
(H2-4), trimmed, and a whitespace-only note is refused (S3-Q2).
**English sense:** the shelter will read this note exactly as written. Oleksii's S3-Q2 addition:
the note follows `docs/marketing/brand-voice.md` (first person «я», plain words, no officialese),
so the helper text is what reminds whoever is writing it.
**Current:** none.

---

## E3. Refusing to delete a draft: one message per reason (blocks K2/K3's delete only)

`shelter.animals.deleteDraft` answers `WAS_PUBLISHED` with `data.reason` (HS-T10, Oleksii). The
kabinet picks the message by reason. **The `has_activity` message must not claim the animal was
published**: a draft's id can be swiped without the draft ever being public.

**Key:** `kabinet.deleteDraft.refused.wasPublished` (new, `[COPY PENDING]`).
**English sense:** this animal was public before, so it can't be deleted; withdraw it instead.
That way its link and its record stay.

**Key:** `kabinet.deleteDraft.refused.hasActivity` (new, `[COPY PENDING]`).
**English sense:** this animal can't be deleted because people have already interacted with it on
the site; withdraw it instead. It makes no claim about having been published.
**Current:** none, for either.

---

## F. Not on this sheet, by design

The cabinet's own UI strings (K1–K5, S1–S5) are the designer's draft text in
`docs/design/KABINET.md`. They'll ship `[COPY PENDING]` with their screens and get their own
sheet as each UI PR lands, so this one stays short enough for one sitting.
