# K4 copy sheet: the shelter profile editor (`/kabinet/profil`)

Every user-facing string K4 (PR 2 of the K milestone) needs. Under `kabinet.*` a `[COPY PENDING]`
string turns production sign-in off (`productionSignInOf`), so these must be final before PR 2
merges (K-Q13: one sheet per PR, at its start).

**PR numbering** (K milestone, inbox K-Q1..K-Q16, 2026-10-15): PR 1 write-path groundwork, **PR 2
K4 profile**, PR 3 photo upload, PR 4 K3 animal form, PR 5 K2 animal list, **PR 6 opens shelter
writes for everyone** (with the /prytulkam and invite rewrites). From PR 2 until PR 6, writes are
open only for Oleksii's own test shelter (allowlist, K-Q4), so nothing a real shelter reads goes
false before PR 6. The English is a description of what is true, not a draft to translate. "Mock" means a
designer's draft, not approved copy.

**Sources and line refs.** `KAB` = `docs/design/KABINET.md`. `MOCK:30` = `docs/design/Opika
Kabinet.dc.html` line 30, which holds both K4 frames (1440 and 360, same text). `MOCK:26` = that
file's N-pattern table. `MOCK:33` = the S3 reason dialog. `H2CS` = `docs/h2-copy-sheet.md`.
`uk.*` = `packages/i18n/src/messages/uk.ts`.

**Superseded in the mock (VH-Q2, no `{дата}` token).** The mock's sample sentence «Ми оновлювали
цю картку {дата}…» (MOCK:30), its hint «{дата} і {імʼя} підставляємо ми» (MOCK:30), N11's
«`{дата}` `{імʼя}` tokens» (KAB:236, KAB:384, MOCK:26), and the preview caption
«Слова притулку · дата автоматична» *as a description of the editor's tokens* (KAB:237) are all
superseded. The mock's «Зберегти» bar caption «Зміни з'являться на всіх картках одразу після
збереження.» (MOCK:30) is now false for the donation link, which waits for the operator (N20).

**Proposed namespace:** `kabinet.profileEdit.*`, with sub-objects `actions`, `state`, `errors`,
`contacts`, `voice`, `donation`, `pause`. Read-only labels already in `kabinet.profile.*`,
`kabinet.profileChannel.*`, `kabinet.profileStatus.*` and `freshness.*` are reused, not duplicated.

---

## 1. Reused as-is (no new key)

| Existing key | Current uk | Used in K4 for |
|---|---|---|
| `kabinet.profile.pageTitle` / `title` / `phoneTitle` / `intro` | «Профіль притулку» / «Профіль» / «Те, що бачать про вас…» | page header |
| `kabinet.profile.contactsTitle` / `contactsNote` | «Контакти» / «Ці контакти бачить людина…» | contacts card title and caption |
| `kabinet.profileChannel.phone` / `.telegram` | «Телефон» / «Telegram» | field labels |
| `kabinet.profileChannel.viber` / `.email` / `.website` | «Viber» / «Ел. пошта» / «Сайт» | the "other contact" kind picker (see Q3) |
| `kabinet.profile.donationTitle` / `donationLink` / `donationNote` | «Збір коштів» / «Посилання на збір» / «Лише https. Реєстр не приймає…» | donation card, field label, hint |
| `kabinet.profile.donationPending` | «Запропоноване посилання — чекає на підтвердження оператора.» | pending block heading (see 6; KAB:233 drafts «Очікує підтвердження оператора», which differs) |
| `detail.donateShelter` | «Підтримати притулок» | the adopter-view preview button (MOCK:30 shows it there) |
| `kabinet.profile.voiceTitle` / `voiceLabel` | «Голос притулку» / «Ваші слова на картках» | voice card, textarea label |
| `kabinet.profile.lockedTitle` / `lockedNote` / `legalName` / `edrpou` / `contactPerson` / `registrationStatus` / `statusSince` / `address` / `addressNote` | (as shipped) | N10 locked block, unchanged and read-only |
| `kabinet.profileStatus.*` | «Перевірено», «На паузі»… | locked-block chip |
| `kabinet.profileNotRecorded` | «Не записано» | empty values |
| `freshness.updatedAgo` | «Оновлено {days}» (Intl) | preview's day count |
| `freshness.attribution` | «Слова притулку» (since #102, VH-Q2) | preview caption, since it is the real public block |
| `kabinet.profile.signOut` etc. | | header, unchanged |

`kabinet.profile.voiceNote` («Одне речення від першої особи, написане вами.», since #102) stays true
and stays on the read-only page; the editor adds its own hint (section 5).

---

## 2. Controls: edit, save, cancel

Mock has one page-level «Зберегти» (MOCK:30) and no cancel. Contacts and voice go live on save;
the donation is a separate propose action. Whether K4 saves per section or once per page is Q1.

| Key | English sense | Where | Vars | Mock draft |
|---|---|---|---|---|
| `profileEdit.actions.save` | Save | contacts / voice section (or page bar) | — | «Зберегти» (MOCK:30) |
| `profileEdit.actions.cancel` | Discard my changes, back to the saved values | next to save, shown only when the section has unsaved changes | — | no draft |
| `profileEdit.actions.liveOnSave` | Contacts and your sentence change on every card as soon as you save. | caption by the save button | — | «Зміни з'являться на всіх картках одразу після збереження.» (MOCK:30), true only if the donation is excluded |
| `profileEdit.actions.unsavedLeave` | You have unsaved changes; leave anyway? | browser leave guard / in-app nav | — | no draft (needed only if Q1 = per-page form) |

## 3. Saving states

| Key | English sense | Where | Vars | Mock draft |
|---|---|---|---|---|
| `profileEdit.state.saving` | Saving… | save button busy label / live region | — | no draft |
| `profileEdit.state.saved` | Saved. It is on the cards now. | live region after success | — | no draft |
| `profileEdit.state.savedAt` | Saved at {time} | persistent status line (as K3's «Чернетку збережено 14:32» pattern, MOCK:30) | `{time}` Intl HH:mm, Kyiv | no draft for K4 |
| `profileEdit.state.failed` | Didn't save. Nothing changed on the cards. Check the connection and try again. | inline under the section, edits kept in the form | — | no draft |
| `profileEdit.state.retry` | Try again | button in the failed state | — | no draft |

## 4. Errors

| Key | English sense | Where | Vars | Mock draft |
|---|---|---|---|---|
| `profileEdit.errors.conflict` | Someone changed this profile after you opened it. Your edits are not saved. Here is the current version; make your change again. | `CONFLICT` (409) from `updateContact` / `updateFreshnessSentence` (compare-and-set on `version`) | — | no draft |
| `profileEdit.errors.conflictReload` | Show the current version | button with the conflict message | — | no draft |
| `profileEdit.errors.illegalTransitionPause` | Intake can't be paused right now: the shelter's status has changed. Reload the page to see it. | `ILLEGAL_TRANSITION` on `pause` (e.g. the operator suspended the shelter meanwhile) | — | no draft |
| `profileEdit.errors.illegalTransitionResume` | Intake can't be resumed from here right now: the shelter's status has changed. | `ILLEGAL_TRANSITION` on `resume` (e.g. now suspended; only the operator can reinstate) | — | no draft |
| `profileEdit.errors.notAvailable` | Changes from the cabinet aren't available yet. | `SHELTER_WRITES_NOT_YET_AVAILABLE` (403): every shelter except the allowlisted test shelter, until PR 6 (K-Q4) | — | no draft |
| `profileEdit.errors.phoneFormat` | Enter the number with the country code, e.g. +380 67 123 45 67. | phone field (`E164Schema`: `+`, 8–15 digits; spaces/dashes normalised before checking) | — | no draft; example number from MOCK:30 |
| `profileEdit.errors.phoneRequired` | (if the phone is the required primary channel) Add a phone number. | phone field | — | no draft (depends on Q3) |
| `profileEdit.errors.telegramFormat` | A Telegram username: 5–32 Latin letters, digits or underscores. The @ is optional. | Telegram field (`^[A-Za-z0-9_]{5,32}$`; leading `@` / `t.me/` stripped first) | — | no draft; mock shows «@domivka_brovary» (MOCK:30) |
| `profileEdit.errors.viberFormat` | As phone, for a Viber number. | other-contact field, kind = viber | — | no draft |
| `profileEdit.errors.emailFormat` | That doesn't look like an email address. | other-contact field, kind = email | — | no draft |
| `profileEdit.errors.httpsOnly` | Only https:// links. | website field and donation field (`z.url({ protocol: /^https$/ })`) | — | no draft; hint «Лише https.» exists in `donationNote` |
| `profileEdit.errors.notAUrl` | That isn't a web address. | website and donation fields, unparseable input | — | no draft |
| `profileEdit.errors.sentenceTooLong` | The sentence is over 280 characters. | voice textarea, on save attempt | `{max}` = 280 | no draft |
| `profileEdit.errors.unknownToken` | Only {імʼя} is filled in. Remove "{token}", or write it without braces. | voice textarea: any `{…}` other than the name token (incl. `{дата}`) | `{token}` the offending text | no draft |
| `profileEdit.errors.dateTokenGone` | (optional, if Q5 says yes) The date is shown above your sentence automatically, so {дата} isn't needed. | voice textarea when `{дата}` is present | — | no draft |
| `profileEdit.errors.strayBrace` | A brace without its pair. Braces are only for {імʼя}. | voice textarea: unmatched `{` or `}` | — | no draft |

## 5. Voice editor (N11, VH-Q1/VH-Q2)

| Key | English sense | Where | Vars | Mock draft |
|---|---|---|---|---|
| `profileEdit.voice.hint` | One sentence in your own words, first person. The registry fills in only the animal's name, where you write {імʼя}. Nothing else changes. | caption under the textarea; replaces `profile.voiceNote` here | — | «Одне речення від першої особи, яке ви написали самі. {дата} і {імʼя} підставляємо ми — більше нічого.» (MOCK:30), **superseded: no `{дата}`** |
| `profileEdit.voice.nameStaysHint` | **VH-Q1, Oleksii writing now.** The name goes in as it is, in its base form; it isn't declined, so write the sentence so the base form reads right. | under the textarea / next to the token | — | no draft |
| `profileEdit.voice.insertName` | Insert {імʼя} | optional button that inserts the token at the cursor (Q7) | — | no draft |
| `profileEdit.voice.counter` | {count} / 280 | under the textarea, live; `aria-live="polite"` only near the limit | `{count}`, `{max}` | no draft |
| `profileEdit.voice.counterOver` | {over} characters too many | counter when over 280 | `{over}` | no draft |
| `profileEdit.voice.emptyMeans` | Leave it empty and cards show only the date. | caption, or shown when cleared (sentence is nullable) | — | no draft; fact from `FreshnessSentenceSchema` / README "falls back to the marker plus day count alone" |
| `profileEdit.voice.previewLabel` | How it looks on {name}'s page | heading above the live freshness block | `{name}` the real animal's name | no draft (mock shows the block with no label, MOCK:30) |
| `profileEdit.voice.previewNoAnimals` | The preview needs an animal. Once you have one, your sentence is shown here as it will appear on its page. | in place of the preview when the shelter has no animal | — | no draft |
| `profileEdit.voice.previewEmpty` | No sentence: the card shows only the date. | preview when the textarea is empty | — | no draft |

Preview body reuses `freshness.updatedAgo` + the sentence with `{імʼя}` (and `{ім'я}`, `{ім’я}`,
normalised) replaced by the animal's name + `freshness.attribution`. The mock's filled example
«Ми оновлювали цю картку 25 червня…» (MOCK:30) is a sample, not copy.

## 6. Donation link (N20)

| Key | English sense | Where | Vars | Mock draft |
|---|---|---|---|---|
| `profileEdit.donation.optional` | · optional | after the field label | — | «· необов'язково» (MOCK:30); no generic key exists yet, so one shared key is worth it (also contacts) |
| `profileEdit.donation.previewLabel` | This is how people will see it: | above the adopter-view row | — | «Так це виглядатиме для адоптера:» (MOCK:30; "адоптер" wording, see `contactsNote`'s precedent) |
| `profileEdit.donation.previewHost` | {host} ↗ | preview row, host from `donationHost` | `{host}` | «dobro.ua ↗» (MOCK:30, KAB hard constraint 5) |
| `profileEdit.donation.propose` | Send to the operator for approval | submit button (not «Зберегти»: it doesn't go live) | — | no draft |
| `profileEdit.donation.proposeNote` | A new link goes live only after the operator approves it. Until then people see the current one. | caption by the propose button | — | no draft; fact from KAB:226–233 |
| `profileEdit.donation.pendingTitle` | Waiting for the operator's approval | pending block (`#F2F2F0`) title; or reuse `profile.donationPending` | — | «Очікує підтвердження оператора» (KAB:233) vs. shipped `donationPending` «…чекає на підтвердження оператора.» (Q8) |
| `profileEdit.donation.pendingHost` | Proposed: {host} | pending block, the proposed domain | `{host}` | no draft beyond "+ the proposed domain" (KAB:233) |
| `profileEdit.donation.pendingSince` | Sent {date} | pending block, from `proposedAt` | `{date}` Intl | no draft |
| `profileEdit.donation.cancelProposal` | Withdraw the proposal | text button in the pending block | — | «Скасувати пропозицію» (KAB:233) |
| `profileEdit.donation.proposed` | Sent. The operator will look at it. | live region after propose | — | no draft |
| `profileEdit.donation.cancelled` | Proposal withdrawn. The current link stays. | live region after cancel | — | no draft |
| `profileEdit.donation.replaceNote` | Sending another link replaces the one waiting. | caption while pending (one proposal at a time, inbox H2-7) | — | no draft |
| `profileEdit.donation.failed` | Didn't send. Check the connection and try again. | propose/cancel failure | — | no draft (or reuse `state.failed`) |

No approve/reject strings: those are S4's.

## 7. Contacts

| Key | English sense | Where | Vars | Mock draft |
|---|---|---|---|---|
| `profileEdit.contacts.otherLabel` | Another way to reach you | third field label | — | «Інший спосіб зв'язку» + «· необов'язково» (MOCK:30) |
| `profileEdit.contacts.otherKind` | Which kind | kind picker for the other contact (Viber / Ел. пошта / Сайт via `profileChannel.*`) | — | no draft. Mock placeholder «Viber, e-mail, Instagram…» (MOCK:30) **is false: Instagram is not a channel kind** (`ContactChannelSchema`) |
| `profileEdit.contacts.phonePlaceholder` | +380 … | phone placeholder | — | «+380 67 123 45 67» shown as value (MOCK:30) |
| `profileEdit.contacts.telegramPlaceholder` | @username | Telegram placeholder | — | «@domivka_brovary» shown as value (MOCK:30) |
| `profileEdit.contacts.removeOther` | Remove | removes the optional contact | — | no draft |

## 8. Pause / resume intake (N21)

| Key | English sense | Where | Vars | Mock draft |
|---|---|---|---|---|
| `profileEdit.pause.button` | Pause taking animals | secondary 48, verified and not paused | — | «Призупинити прийом тварин» (KAB:238) |
| `profileEdit.pause.resumeButton` | Resume taking animals | secondary 48, paused | — | «Відновити прийом тварин» (KAB:239) |
| `profileEdit.pause.pausedLine` | Intake paused since {date} · {reason} | status line near the button while paused, so K4 says why the button reads "resume" | `{date}`, `{reason}` (label + note) | no draft for K4; N18's «Прийом тварин на паузі · {причина}» (KAB:136) is K2's |
| `profileEdit.pause.dialogTitle` | Pause taking animals? | N15-template dialog title | — | no draft (S3 pattern «Відхилити «…»?», KAB:333) |
| `profileEdit.pause.dialogBody` | While paused, your animals aren't shown to people looking. You can resume here at any time. | dialog body. **A user-facing claim, checked true everywhere public:** the feed, the gallery and its counts, and the animal page (404) all show verified shelters only (`FEED_VISIBLE_VERIFICATION_STATUSES`); a reveal is refused too | — | no draft (S4 suspended frame says «Тварини лишаться прихованими, доки притулок сам не зніме паузу.», `MOCK:34`) |
| `profileEdit.pause.reasonLabel` | Reason | select label | — | no draft |
| `profileEdit.pause.reasonPlaceholder` | Choose a reason | select's empty option | — | no draft |
| `profileEdit.pause.reason.seasonal_closure` | seasonal break | option | — | «Сезонна перерва» (KAB:241, H2CS D) |
| `profileEdit.pause.reason.relocation` | moving | option | — | «Переїзд» (KAB:241, H2CS D) |
| `profileEdit.pause.reason.capacity_reached` | no room | option | — | «Немає місця» (KAB:241–242, H2CS D) |
| `profileEdit.pause.reason.staff_shortage` | not enough people | option | — | «Брак людей» (KAB:242, H2CS D) |
| `profileEdit.pause.reason.other` | other | option | — | «Інше» (KAB:242, H2CS D) |
| `profileEdit.pause.noteLabel` | Note | textarea label, plus the optional suffix | — | no draft |
| `profileEdit.pause.noteHint` | Who reads it: the operator (and you, on the banner). | note hint; audience to confirm (Q9) | — | no draft |
| `profileEdit.pause.confirm` | Pause intake | dialog primary (black) | — | no draft |
| `profileEdit.pause.cancel` | Cancel | dialog secondary | — | «Скасувати» (S3 dialog, MOCK:33) |
| `profileEdit.pause.close` | Close | ✕ 48 aria-label | — | no draft |
| `profileEdit.pause.paused` | Intake paused. | live region after pause | — | no draft |
| `profileEdit.pause.resumed` | Intake resumed. Your animals are shown again. | live region after resume (same claim check as dialogBody) | — | no draft |

Resume has no confirmation (KAB:242–243). Reason labels sit under `profileEdit.pause.reason.*` here
but H2CS D lists them as shared with S1/S4 and N18; a shared `kabinet.pauseReason.*` key is the
better home if S4 reads them too.

**N18 (paused banner) is K2's** (KAB:130–138, N18 row KAB:391: "Paused banner (K2)"), not K4's. Listed
for reference only: «Прийом тварин на паузі · {причина}» (KAB:136) + «Відновити».

---

## 9. Existing strings that go false once shelters can edit

None of these goes false for a real shelter in PR 2: writes are open only for the allowlisted test
shelter (K-Q4). They are rewritten in **PR 6**, which opens writes for everyone; listed here so the
K4-related ones can be written together with this sheet.

| Key | Live text (excerpt) | What goes false | Rewritten in |
|---|---|---|---|
| `forShelters.whenAnimalFindsHome` §9, A2 (commitment #6) | «Кабінет притулку вже є, але лише для перегляду — змінити чи прибрати щось у ньому поки не можна.» | "nothing can be changed": contacts, sentence, donation, pause, and (PR 4/5) animals | PR 6 |
| `kabinet.email.invite.what` | «Змінювати їх там ще не можна — для цього напишіть мені.» | false for contacts, sentence, donation, pause; still true for the locked block | PR 6 |
| `forShelters.whyThatSentence` §8 | «Речення пишете ви — один раз, як вам зручно» | "once" weakens when it's editable any time (Q10). The date-meaning half is B1 | PR 6 (with B1) |
| `forShelters.whatToPrepare` §7, last paragraph | «Заповнювати анкету не треба: ви розкажете, а я внесу все сам.» | false once shelters enter their own animals | PR 6 |
| `freshness.updatedAgo` (B2) | «Оновлено {days}» | meaning moves to confirmation once «Ще шукає» ships | decide by PR 6 (K-Q14) |
| `/pro` `about.data` | admin name/email, sign-in records | K4 records who changed contacts, sentence, donation (N23); the data list becomes incomplete (Q11) | PR 6, check |

Still true: `kabinet.profile.voiceNote`, `lockedNote`, `contactsNote`, `donationNote`, `addressNote`,
`freshness.attribution` («Слова притулку»), `kabinet.support.*`, §10 A3, commitment #2.

---

## 10. Questions for Oleksii

1. **Save granularity.** The mock has one page «Зберегти»; the contract has separate `updateContact`
   and `updateFreshnessSentence`, each compare-and-set on the same `version`. One save per section,
   or one page save that calls both (a second call can then hit CONFLICT from the first)?
2. *(Answered, K-Q4: allowlist for the test shelter from PR 2; everyone at PR 6.)*
3. **Contacts shape.** The domain stores `primary` + `additional[]` of five kinds (phone, telegram,
   viber, email, website); seed shelters have email-primary contacts. K4 offers phone, Telegram,
   other. Which is the required primary? What does K4 show for a shelter whose stored contacts don't
   fit (e.g. two emails)? Is "other" limited to Viber / email / website, and can there be more than one?
4. **Telegram and phone input.** OK to accept «@handle», `t.me/handle` and spaced numbers and
   normalise them silently, so the only errors are real ones?
5. **`{дата}` typed by habit.** Its own explanation (`errors.dateTokenGone`), or the generic
   unknown-token error? (No stored sentence contains a token or exceeds 280 today.)
6. *(Answered, VH-Q2: «Слова притулку».)*
7. **Insert button.** A button that inserts `{імʼя}` (most shelters can't type `ʼ`), or rely on the
   apostrophe normalisation alone?
8. **Pending wording.** Shipped `donationPending` («…чекає на підтвердження оператора.») vs. KAB:233
   «Очікує підтвердження оператора». Reuse the shipped key as the pending block's title?
   And: can a shelter propose *removing* the link? `proposeDonation` takes a URL only, so today no.
9. **Pause note audience.** Who reads the pause note: the operator only, or also adopters (it isn't in
   any public view today)? And should K4 itself show the current pause reason, or leave that to N18?
10. **§8 «один раз».** Still accurate once the sentence is editable any time?
11. **Audit log disclosure.** Should `/pro` mention that profile changes are recorded with who made
    them (N23)?
12. **Rejected / operator-declined proposal.** KAB says K4's next state shows the outcome with no
    message. Is silence right, or should K4 say "the operator didn't approve the last link"?
13. **English sentence.** `FreshnessSentence` is `{ uk, en }`. When the shelter edits `uk`, is `en`
    cleared (stale translation) or kept? No string unless it's shown.
