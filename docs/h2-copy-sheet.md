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

### A2. `forShelters.whenAnimalFindsHome` (§9)
**Current (last paragraph goes false):**
> Поки що це просто: напишіть, і я приберу. Окремої кнопки ще немає — не хочу обіцяти кабінет,
> якого не існує.

**True after H2:**
- The cabinet has a «Уже вдома» action per animal (K2). It takes the animal out of the gallery
  and keeps the record.
- Writing to you still works, too.

The first two paragraphs (why a homed animal left listed poisons every card) stay true.

### A3. `forShelters.whoIsBehindThis` (§10)
**Current:**
> Opika робить одна людина — я, поза основною роботою. Немає команди, немає інвестора, немає
> відділу підтримки: коли ви пишете на цю адресу, відповідаю я.

**After H2:** as far as I can see, **still true** (one operator, answering personally).
Commitment #6 lists it, so it's here for you to confirm rather than for me to judge.

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

## F. Not on this sheet, by design

The cabinet's own UI strings (K1–K5, S1–S5) are the designer's draft text in
`docs/design/KABINET.md`. They'll ship `[COPY PENDING]` with their screens and get their own
sheet as each UI PR lands, so this one stays short enough for one sitting.
