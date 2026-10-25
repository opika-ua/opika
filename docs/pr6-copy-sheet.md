# PR 6 copy sheet: shelter writes open for every shelter (K milestone)

Requested early (F-B5, verbatim: "F5: send the PR 6 sheet early."). PR 6 opens `shelter.*` writes for
every shelter (K-Q4/K-Q17: the allowlist and `KABINET_WRITE_ALLOWLIST` are deleted in PR 6), publishing
goes live at once (K-Q3, verbatim: "K-Q3: live immediately. PR 6 rewrites commitment #6."), and PR 6
merges before the first real shelter's invite (F-B6, verbatim: "F6: PR 6 merges BEFORE the first real
shelter's invite.").

**Status (PR 6, `feat/pr6-open-writes`, draft):** his answers and final Ukrainian are
`D:\opika-worktrees\pr6-copy-uk.md`, applied verbatim (`docs/decisions-inbox/feat-pr6-open-writes.md`).
Correction to this sheet: §1.3's English ("Fixing a typo or changing a photo doesn't move it") and
§2's "Never set by: … a photo change" predate RH-B7. A photo change on a card people can see moves
the date (PR 4), and his B1 says so (`docs/pr6-checklist.md` 6.3).

**Second correction, 2026-10-25:** P8's "No sentence may say photos are deleted automatically or by
a tool" and "the deployed app never deletes R2 objects" were true when this sheet was written, but
are superseded by the GDPR R2 clean-up job (`docs/decisions-inbox/feat-r2-photo-cleanup.md`, R2-B1):
it is the one named exception, deleting a photo's objects automatically once they've sat
unreferenced for the grace period (~7 days). Row P8 is left as written below — it records what was
true for PR 6's own copy decisions — but any *new* commitment-#6-adjacent copy must read against
this correction, not against P8's original text.

**Read at** `origin/main` `baa629b` unless marked. `uk.ts` = `packages/i18n/src/messages/uk.ts`.
`SC` = `docs/standing-constraints.md`. `H2CS` = `docs/h2-copy-sheet.md`. `K4CS` = `docs/k4-copy-sheet.md`.
`K4UK` = `D:\opika-worktrees\k4-copy-uk.md`. It is outside the repo, headed «K4 copy — Ukrainian
drafts + answers to section 10 (Oleksii, for review)». These are drafts, not final text.
`KFD` = `origin/docs/k-future-decisions` (`6c8b303`) `:docs/decisions-inbox/docs-k-future-decisions.md`.
`KG` = `docs/decisions-inbox/feat-k-groundwork.md`.

**State today.** `SHELTER_WRITE_POLICY` is `refused_until_edit_screens` for every shelter
(`apps/web/src/kabinet/access.ts:69-71`). PR 2 adds the allowlist (K-Q17); PR 2–5 are not on main yet.

**No string on this sheet can ship as `[COPY PENDING]`.** Under `kabinet.*` a placeholder turns
production sign-in off (`productionSignInOf`, `production-sign-in.test.ts:238-264`). Under
`forShelters.*` it fails `copy-status.test.ts:37-39`. Rows 1.1–1.3 are `/prytulkam` commitment
sentences, and those block the merge.

---

## 0. What PR 6 makes true (the facts the copy must match)

| Fact | Code |
|---|---|
| A shelter admin edits contacts and the sentence (live on save), proposes or cancels a donation link (live only after the operator approves it), and pauses or resumes intake | `packages/contracts/src/kabinet/procedures.ts:195-214` |
| A shelter creates drafts, edits animals and photos, publishes (live at once, K-Q3), reserves/releases, marks adopted («Уже вдома»), withdraws (with a reason), restores to draft, confirms («Ще шукає» / «Ще домовляються»), undoes a confirm, and deletes a never-published draft | `procedures.ts:287-354`; events `:270-277` |
| The freshness date (`last_confirmed_at`) is set at publish and moved only by a confirm, one animal per call. Edits move `lastUpdatedAt`, never the confirmation | `packages/domain/src/animals/listing-transition.ts:151-153, 141-144`; `apps/web/src/kabinet/handlers/animals.ts:220-225, 342-351`; public freshness `apps/web/src/api/handlers/listing-freshness.ts:9-33`; gallery «freshest» sort `packages/db/src/repos/gallery-repo.ts:54`; deck `feed-repo.ts:75` |
| Still the operator's alone: creating a shelter, inviting admins (no shelter-side invite procedure), the verified data (legal entity, ЄДРПОУ, address), approving donation links, verification | `procedures.ts:364-567`; locked block `kabinet.profile.lockedNote` |
| Support mode writes nothing. No registry procedure and no script moves an animal's listing. `onboard:shelter` only inserts: a re-run adds new animals to an existing shelter and never edits or removes one | `access.ts:129-131`; `procedures.ts:364-567` (no animal procedure); `packages/db/src/onboard-shelter.ts:623-676` |
| Every shelter write is recorded in shelter history (§3) | `packages/domain/src/shelters/history.ts:95-267` |

---

## 1. Strings that must change

### 1.1 `forShelters.whatToPrepare` §7, last paragraph: commitment #6
- **Live** (`uk.ts:788`): «Заповнювати анкету не треба: ви розкажете, а я внесу все сам.»
- **What goes false.** «я внесу все сам» ("I'll enter everything myself"). From PR 6 the shelter enters
  its own animals (`shelter.animals.createDraft`/`update`/`transition` open) and its own profile
  (`shelter.profile.*` open). «Заповнювати анкету не треба» ("no form to fill in") may also read false,
  because the shelter now fills in K3's form for every animal (Q3).
- **His draft:** none.
- **English sense of a true replacement.** The shelter adds and edits its animals and its profile in the
  cabinet itself, and a card it publishes appears at once. The operator still creates the shelter,
  enters what verification checked, and sends the cabinet invite (the A1 line just above stays,
  `uk.ts:787`). Offering "send me a list and I'll enter it" is his call. The only tool for it is an
  `onboard:shelter` run, which adds new animals and can't change or remove existing ones (H2CS:24-25
  noted the same).
- **Pins.** `copy-status.test.ts:363` pins `paragraphs.at(-1)` to the live text, so it becomes his
  replacement, transcribed. `:360-361` (A1 second to last) and `:364` (photos paragraph third to last)
  stay as long as the paragraph count stays. `no-self-serve-yet.test.ts:191-193` (A1) stays. Update the
  comments at `uk.ts:776, 785-786`.

### 1.2 `forShelters.whenAnimalFindsHome` §9, third paragraph: commitment #6
- **Live** (`uk.ts:823-824`): «Поки що це просто: напишіть, і я приберу. Кабінет притулку вже є, але
  лише для перегляду — змінити чи прибрати щось у ньому поки не можна.»
- **What goes false.** "Read-only, nothing can be changed or removed." From PR 6 each animal has
  «Уже вдома» (`transition` with `adopt`, `procedures.ts:274, 335`; FSM `listing-transition.ts:166-167,
  185-186`) and withdraw (`:168-169`), and K4's profile writes are open. «напишіть, і я приберу» ("write
  and I'll remove it") has no tool behind it after PR 6, nor before it: support mode is read-only, and no
  registry procedure or script marks an animal adopted (Q4).
- **His draft:** none for PR 6. The live text is his A2 for the read-only cabinet (H2CS:43-59, which says
  "when K2 ships, the paragraph changes again"). H2CS:61-64 gives the English sense for K2.
- **English sense.** Each animal in the cabinet has «Уже вдома». One tap (confirmed in the reason dialog,
  KABINET.md:155) takes the animal out of the gallery and the deck at once: its page then answers that
  the card no longer exists. The shelter keeps it in its own list as adopted, and the move is recorded
  in its history. Whether "or write to me" stays depends on Q4.
- **Also check ¶1** (`uk.ts:819`): «Найважливіше, що ви можете мені сказати, — що тварина знайшла дім.»
  «мені сказати» ("tell me") is addressed to the operator, but from PR 6 «Уже вдома» notifies no one (Q4).
- **Pins.** `copy-status.test.ts:332-334` pins paragraph 3 to the live text: it becomes his
  replacement, transcribed. Keep `:335-336` (the pre-cabinet sentence stays gone) and add a `not.toContain`
  for «лише для перегляду». `:339-346` pins ¶1/¶2 verbatim and changes only if Q4 changes ¶1.
  `no-self-serve-yet.test.ts:184-186` requires the live sentence, so it inverts to `not.toContain` plus
  his text. Rewrite that file's header (`:10-37`) and `COPY_GATE` (`:76-78`): B1 is no longer "at the
  edit-screens gate later", because PR 6 is that gate for everyone. The K-Q17 conditional ("no shelter
  outside the allowlist") is deleted. Update the comment at `uk.ts:811-817`.

### 1.3 `forShelters.whyThatSentence` §8: commitment #7 (B1) and «один раз»
- **Live** (`uk.ts:804-810`):
  ¶1 «Людина, яка обирає між двома собаками, ніяк не дізнається, про кого з них писали минулого тижня, а
  про кого — позаторік. Тому на картці видно, коли інформацію востаннє оновлювали, а на сторінці тварини —
  ваше речення про те, як часто ви це робите, вашими словами.»
  ¶2 «Дата ставиться сама. Речення пишете ви — один раз, як вам зручно: «оновлюємо щосуботи», «дзвоніть,
  ми скажемо точно», «влітку рідше».»
  ¶3 «Саме це робить решту карток вартими довіри. Коли видно, що ви оновлюєте інформацію щосуботи, ваше
  «ця тварина ще шукає дім» означає рівно те, що написано.»
- **What goes false.**
  - ¶1 «коли інформацію востаннє оновлювали» ("when the information was last updated"). From PR 6 an edit
    changes the information and the date stays where it was. Only publish and a confirm move it
    (`animals.ts:220-225, 342-351`; `procedures.ts:321`). This is SC:342 #7's own "falsified by: shipping
    the kabinet's edit or confirm actions before B1's replacement copy lands".
  - ¶2 «один раз» ("once"). From PR 6 the sentence can be edited at any time (`updateFreshnessSentence`,
    `procedures.ts:200-202`).
  - ¶2 «Дата ставиться сама» ("the date sets itself"). H2CS:122-123 reads this as still true, since nobody
    types the date. But it now moves only when the shelter taps «Ще шукає» or publishes. Keeping it is his
    call (Q2).
  - ¶3 «оновлюєте інформацію» ("you update the information"). Same wording question as ¶1 (K-Q14, §2).
- **His draft for «один раз»** (K4UK:120, answer 10, verbatim): "10. Rewrite in PR 6: «Речення пишете ви,
  коли вам зручно, і можете змінити його будь-коли.»". His draft ends with a full stop, but the live
  sentence continues after a colon with the three examples (Q2).
- **English sense** (from H2CS:119-123, updated). The card shows when the shelter last confirmed the
  animal is still looking: publishing sets it, and so does «Ще шукає» / «Ще домовляються», one animal per
  tap, with no "confirm all" (KABINET.md:157-161). Fixing a typo or changing a photo doesn't move it.
  Nobody types the date. The shelter writes its sentence in its own words and can change it any time.
- **Pins.** There are none today, so add a `copy-status.test.ts` describe pinning his text, transcribed. In
  `no-self-serve-yet.test.ts`, `COPY_GATE` already names B1, so its successor asserts B1 live. Update the
  comment at `uk.ts:789-802`.

### 1.4 `kabinet.email.invite.what`: the invite email
- **Live** (`uk.ts:1006`): «Поки що в кабінеті можна переглянути дані притулку — і те, що бачать люди, і
  дані з перевірки. Змінювати їх там ще не можна — для цього напишіть мені.»
- **What goes false.** «Змінювати їх там ще не можна» ("they can't be changed there yet"), for contacts,
  the sentence, the donation proposal, pause, and all animal management. It stays true only for the
  locked verification block. The first real shelter receives this email after PR 6 (F-B6), so it must be
  true by then.
- **His draft:** none (K4CS:189 lists it for PR 6).
- **English sense.** In the cabinet you can see your shelter's details (what people see, and what
  verification checked). You can change your contacts and your sentence yourself, and they go live when
  you save. You can propose a donation link, which goes live once the operator checks it. You can add
  animals, publish them (they appear at once), confirm the ones still looking, and mark the ones that
  found a home. To change what verification checked (legal entity, ЄДРПОУ, address), write to the operator.
- **Pins.** `copy-status.test.ts:233-235` (FINAL row 85), `apps/web/src/kabinet/email-message.test.ts:177`,
  and `apps/web/src/kabinet/email-delivery-test.test.ts:106` all become his text, transcribed.
  `production-sign-in.test.ts:260` keeps it in the "screenless, written" list, and its leaf count (`:253`)
  is unchanged by a rewrite. The inbox placement (Primary vs Promotions) was tested on the current body
  (`uk.ts:983-985`), so a longer body may warrant re-running `email:delivery-test`. Update the comment at
  `uk.ts:978-992` (row 85 / EM-Q8 provenance). The `en.ts:450` mirror is not live (next-intl comes in H3).

### 1.5 `about.data` on `/pro`: becomes incomplete
- **Live** (`uk.ts:644`): «Дані, які вносить притулок — адреса, контакти, картки тварин — належать
  притулку. Точна адреса ніколи не показується публічно: той, хто шукає тварину, бачить лише наближену
  локацію. Притулок може попросити видалити свій запис у будь-який момент. Для притулків із доступом до
  кабінету реєстр зберігає ім'я та адресу пошти адміністратора — щоб надсилати посилання для входу, — а
  також технічний запис про браузер і пристрій, з якого виконано вхід. IP-адреси не зберігаються. Адреси,
  введені у формі входу, і записи про входи, що втратили силу, видаляються протягом двох діб.»
- **What goes false.** Nothing in it becomes untrue. It becomes incomplete: the cabinet now holds a
  change history with who made each change, and shelter-uploaded photos. The facts are in §3.
- **His direction** (K4UK:121, answer 11, verbatim): "11. Yes, in PR 6: /pro says profile changes are
  recorded with who made them." There is no Ukrainian draft.
- **Pins.** `copy-status.test.ts:378-387` (byte-for-byte) and `apps/web/src/app/pro/page.test.tsx:27-36`
  (`endsWith`) become his text, transcribed. `page.test.tsx:13` (`/Дані, які вносить притулок/`) stays if
  the opening stays. Update the comment at `uk.ts:630-643`. The `en.ts:308` mirror is not live.

### 1.6 `forShelters.whatHappensToAnimals` §3, fourth paragraph: depends on K-Q14 (not on K4CS §9)
- **Live** (`uk.ts:733-735`): «Порядок у списку — за датою: спочатку ті, кого оновлювали найновіше, або
  ті, хто чекає найдовше; людина обирає сама. У режимі «по одній» до дати додається повнота картки — та,
  де є фотографії, опис і відмітка про щеплення, показується раніше. Це все, що впливає на порядок.»
- **What goes false.** «кого оновлювали найновіше» ("the most recently updated first"). The «freshest» sort
  orders by `last_confirmed_at` (`gallery-repo.ts:54`). From PR 6 an edited card doesn't move up, so this
  has the same problem as B1 ¶1. The ordering inputs themselves (date; completeness in the deck,
  `DEFAULT_SCORING_POLICY`) are unchanged, and commitment #1's closing sentence stays true.
- **His draft:** none. Same family as F-T1 (KFD:22): «за датою оновлення» in K2's rule-4 sentence.
- **English sense.** The list is ordered by date: either most recently confirmed first, or longest waiting
  first (`wait_anchor_at`), and the person chooses. The deck adds completeness. Nothing else affects order.
- **Pins:** none today (commitment #1's row SC:337 tracks it). Add a pin if it changes.

### 1.7 `freshness.updatedAgo` (B2): «Оновлено {days}», the decision he owes by PR 6 (K-Q14)
See §2. It is listed here because SC:342 names it as one of commitment #7's two keys.

### 1.8 `kabinet.profileEdit.errors.notAvailable` (lands in PR 2): unreachable after PR 6
- **His draft** (K4UK:31): «Змінювати дані в кабінеті поки не можна — для цього напишіть мені.» The
  trigger is `SHELTER_WRITES_NOT_YET_AVAILABLE` (K4CS:86).
- From PR 6 nobody receives that refusal. The string isn't false, just dead. Whether PR 6 deletes it is Q8.

---

## 2. B1 and B2: what the date means from PR 6, and K-Q14

**What the number is.** «Оновлено {days}» (`uk.ts:251`, rendered by `packages/ui/src/freshness-display.ts:56`)
counts whole days since `last_confirmed_at`, through `listingFreshness` → `freshnessOf`
(`listing-freshness.ts:22-33`).
- **Set by:** publish (`listing-transition.ts:153`), and a «Ще шукає» / «Ще домовляються» tap, one animal
  per call (`procedures.ts:341-345`). An undo within 13 s puts the previous instant back
  (`UNDO_WINDOW_MS`, `listing-transition.ts:42`; the screen shows 8 s).
- **Never set by:** an animal edit (`animals.ts:342-351`), a photo change, a profile change,
  reserve/release (`listing-transition.ts:137-139, 176-184`), or a listing move.
- Withdraw → restore → publish starts over (`:134-135`).
- Existing rows were backfilled from `last_updated_at` (H2-14).
- Pips: fresh ≤7 days, aging 8–30, stale 30+ (`docs/design/README.md:240-244`).
- The code's own example of the risk (`listing-freshness.ts:12-13`): "once shelters can edit, a typo fix
  would otherwise make a four-month-old card read 'оновлено сьогодні'."

**The decision (K-Q14, KG:10, verbatim: "K-Q14: decide by PR 6."), stated neutrally.**

| Option | What it achieves | What it costs |
|---|---|---|
| (a) Keep «Оновлено {days}» for adopters | The most-seen string stays as it is. No change to the design spec (`README.md:238, 242-244, 318, 883`), `en.ts:93`, `card-text.ts:61-83` (the aria-label), or the plural-boundary suite (`packages/ui/src/freshness-display.test.ts:32-38`, `SwipeCard.test.tsx:107-117`) | The adopter's word "updated" can disagree with what happened. A card edited today but not confirmed for 40 days says «Оновлено 40 днів тому». The cabinet would show «Картки вже оновлено» (K4UK:19, `state.saved`) on cards that still say 40 days. SC:342 #7 ("says only what it measures") must then record why «Оновлено» reads as the confirmation |
| (b) A confirmation wording (his Ukrainian) | The word names what the number measures | Every card, the deck, the detail page and the aria-label change. So do the design spec lines, KABINET's stale-strip caption («Адоптери бачать на них «оновлено 41 день тому»», KABINET.md:164-165, K2's sheet), and `en.ts`. The non-negotiable plural/freshness suite is re-pinned with the new prefix: still 1, 2, 5, 11, 21, 22 days, plus «учора»/«позавчора» (`Intl.RelativeTimeFormat` output must compose with the new word) |

Either way, the same wording choice reaches:
- §8 ¶1/¶3 (B1, §1.3);
- §3 ¶4 (§1.6);
- §7 `uk.ts:783` «і одне речення про те, як часто ви оновлюєте інформацію — про нього нижче.»;
- the heading `forShelters.headings.whyThatSentence` `uk.ts:693` «Навіщо те речення про оновлення»;
- `filters.railFooter` `uk.ts:207` «Тварина, про яку давно не писали, все одно чекає.»;
- K4's `actions.liveOnSave` (K4UK:12) and `state.saved` (K4UK:19), which describe a profile save as the
  cards being «оновлено»;
- F-B3's K2 sentence (F-T1, KFD:22).

`filters.sortFreshest` «Спочатку найсвіжіші картки» (`uk.ts:203`) is neutral under both options.
`freshness.attribution` «Слова притулку» (B3, `uk.ts:256`) stays true.

---

## 3. `/pro`: facts PR 6 must state

Every new sentence is Ukrainian copy and a claim, so **each one needs his wording** (Tier 1). Each fact
needs checking against PR 2–5's code when PR 6 is built.

| # | Fact | Source | Needs his wording |
|---|---|---|---|
| P1 | **Change history.** Each change gets an entry with when and who: which administrator (a `shelter_admin` id) or the operator (`ShelterActorSchema`, `packages/domain/src/shelters/actor.ts:14-17`). The operator sees which admin; the shelter sees its own history with "the shelter" and the operator's display name, no ids (`history-shelter-facing.ts:23-40`) | `history.ts:71-94` | yes |
| P2 | **Profile changes keep the previous and the new value in full**, not field names: contacts and the sentence (`apps/web/src/kabinet/handlers/profile.ts:143-150, 167-174`). A donation proposal keeps the link (`:197`). A pause keeps its reason, and a resume is recorded too (`:261, 273`). The operator's profile edits are recorded the same way (`registry-writes.ts:201-227`). **The prompt's "field names only" holds for animal edits only** | `history.ts:103-130` | yes |
| P3 | **Animal changes:** creation and deletion (with the name at the time), every listing move (event type; a withdrawal keeps the reason code, never the shelter's note, K-Q18), and edits (**which fields changed, never their values**). «Ще шукає» and its undo are not recorded: the date is that record | `history.ts:227-266`; K-Q7 (KG:10), K-Q18 (KG:21) | yes |
| P4 | **Never anything about the people looking for animals** (K-Q7 "never adopter data") | `history.ts:228-229`; `packages/domain/src/shelters/history-no-engagement.test.ts` | yes |
| P5 | **Retention.** The history is append-only (`history.ts:73`) with no expiry in code. It is deleted only with the shelter's record, by `demo:remove --shelter` (`packages/db/src/demo-remove.ts:257, 454`), which is documented for test shelters (DR-F2) (Q6) | | yes, if stated |
| P6 | **Photos are re-encoded with all metadata removed** (EXIF GPS especially), tested with a GPS-tagged fixture. This is PR 3's condition (K-Q2, KG:10). Today's script pipeline re-encodes with sharp's default and no `withMetadata` (`packages/db/src/image-pipeline/generate-variants.ts:22-33`), untested for GPS | PR 3 | yes |
| P7 | **Photos are public files at addresses that can't be guessed** (a new random key per photo, K-Q2). From PR 3 this holds for cabinet uploads and, by P-Q13, for the onboarding script too. Only photos onboarded before PR 3 sit at `animals/{animalId}/{index}` (`variants.ts:63-64`), and animal ids are public in page URLs (Q7). A draft's photos are already public files (F-B2, KFD:13) | PR 3 | yes |
| P8 | **A removed photo stops being shown but stays reachable at its address until the operator deletes it by hand.** The deployed app never deletes R2 objects (K-Q2), and the deletion script (DR-F3, `docs/decisions-inbox/feat-test-shelter-remove.md:12`, open) **does not exist**. No sentence may say photos are deleted automatically or by a tool. Manual deletion in Cloudflare is the only path (`docs/onboarding-a-shelter.md:306-308`) | | yes |
| P9 | **Unchanged and still true:** admin name and email; a technical record of browser and device at sign-in; no IP addresses; sign-in form addresses and expired sign-in records deleted within two days (`uk.ts:644`; EM-T17). It states no cabinet session length (F-B9 note, KFD:20) | | already his (row 90) |
| P10 | «Притулок може попросити видалити свій запис у будь-який момент.» stays true as a request. It must not grow into a promise that photos disappear (P8) | | if reworded |

---

## 4. Commitment register after PR 6 (English, for SC)

**#6, replacement row (SC:343).**

| # | Commitment | Key | Falsified by |
|---|---|---|---|
| 6 | **A person stands behind the registry, and the page says exactly what that person does.** [quote his final §7 A1 line, his new §7 last paragraph, his new §9 third paragraph, and §10 «коли ви пишете на цю адресу, відповідаю я»] | `whatToPrepare`, `whenAnimalFindsHome`, `whoIsBehindThis` | **Rewritten by PR 6 of the K milestone**, which opens shelter writes for every shelter (`SHELTER_WRITE_POLICY` open; the allowlist from PR 2, K-Q17, deleted). Publishing goes live with no operator review of a card (K-Q3). From PR 6 a shelter enters and maintains its own animals and profile, and the page no longer says the operator does. What remains a person's work: verifying each shelter (§6), creating it and sending cabinet access (only `registry.admins.invite` creates an invitation), setting the verified data (read-only to the shelter), approving each donation link before it is live, and answering mail at the contact address personally. **Falsified by:** self-sign-up or any invitation the operator didn't send; donation links going live without the operator; a verification that isn't a person; an auto-reply, ticket form or second person answering the address; copy that again says the operator enters or removes a shelter's animals; [if his §9 keeps "write to me": the operator having no way to do it, see Q4]. Pinned by `copy-status.test.ts` (A1, the new §7 and §9 paragraphs) and by `no-self-serve-yet.test.ts`'s successor (memberships still only through the operator's invitation and the automatic accept; A3 still live). |

**#7 (SC:342).** Replace "Today «оновлювали» stays as true as it was … B1 blocks the self-serve merge"
with: since PR 6 shelters edit and confirm, B1's replacement is live (quote his text), and
`freshness.updatedAgo` follows K-Q14 (quote his answer). Keep the "Falsified by" list as it is.

**#2 (SC:338).** Unchanged. Add that from PR 6 every shelter has K2's list and its own history, both
inventory and the shelter's own actions only (`animals.ts:81-97`, `history-no-engagement.test.ts`). E3's
wording is still open (F-T2, KFD:23) and must not imply that anyone acted on an animal.

**#1 (SC:337).** Unchanged. Note §1.6 and F-T1.

**Code comments that cite the old state** and are invalidated in the same change: `access.ts:28-62`
(A1/A2/B1 "what lifts it"); `shelter-writes-refused.test.ts:17-26` (refusal, pinned count 13);
`access.test.ts:100`.

---

## 5. Strings that stay true (brief)

| Key (`uk.ts`) | Why |
|---|---|
| `forShelters.whatThisIs` :700, `cost` :703 (#3), `whoContactsWhom` :739 (#4), `money` :752 (#5), `verification` :757, `verificationOpenToVolunteers` :771 | Untouched by writes. The donation link is still a URL the operator approves (`procedures.ts:203-206`) |
| `forShelters.noObligation` :743 (#2) | K2 rows carry inventory only (`animals.ts:81-97`). History holds the shelter's own actions. One delete refusal (K-Q9) |
| `forShelters.whatToPrepare` ¶1–¶3 :778-784 and A1 :787 | The list still describes what to bring. Only the operator invites |
| `forShelters.whatHappensToAnimals` ¶1–¶3, ¶5 :726-737 | Per-animal pages; the list shows everyone; reserved stays visible. Q9 is about ¶3 and pause |
| `forShelters.whoIsBehindThis` :834 (A3) | One person still answers (his answer 3: "A3: keep as is.") |
| `forShelters.howToStart` :838 | It doesn't say who adds the animals |
| `forShelters.howToLeave` :831 | True only if he deletes photos in R2 by hand (Q5) |
| `about.intro/free/money/analytics/contact` :625-647 | Untouched |
| `freshness.attribution` :256 (B3) | Still the shelter's own words |
| `kabinet.profile.*` (intro, contactsNote, donationNote, voiceNote, lockedTitle, lockedNote, addressNote) :884-929 | The locked block stays read-only: no `shelter.*` procedure writes the legal entity or address. `donationPending` is rewritten in PR 2 anyway (his Q8) |
| `kabinet.support.*` :955-977 | A support view writes nothing (`access.ts:129-131`) |
| `kabinet.signIn.*` incl. `addressNote` :859-879, `signInCard`, `confirm.*`, `inviteLanding.*`, `email.signIn.*`, `email.invite.subject/intro/action/expiry/notYou`, `registry.inviteSent.tellPersonally`, `history.adminJoined` | Sign-in and invitations are unchanged by PR 6 |
| `detail.notFound.body` :311 | «Тварину вже забрали з реєстру…» is true whoever removed it |
| `resolved.sentence` :444, `myReveals.resolved` :368 | Not rendered (the gallery serves only visible listings). They would be more literally true after PR 6, since only the shelter marks an animal adopted |
| `exhausted.newAnimals` :375 | More literal after PR 6. «Зазвичай раз на кілька тижнів» is a frequency claim PR 6 doesn't change |

---

## 6. Not this sheet: the first real shelter's flip PR (F-B7, KFD:18)

Prepared for later, unchanged here:
- `demo.bannerNotice` `uk.ts:111` (the visible banner at `tvaryny/page.tsx:191` and
  `AnimalDetailScreen.tsx:125`; the root link preview at `app/layout.tsx:43`;
  `tvaryny/[animalId]/page.tsx:158`);
- `demo.deckLabel` `uk.ts:125` (`DeckScreen.tsx:104`);
- `detail.shelterVerifiedYears` `uk.ts:293` (shown only once the flag is false,
  `AnimalDetailScreen.tsx:356`);
- `verificationSuffix`'s literal « · перевірений» (`apps/web/src/seo-flags.ts`, not in the catalogue);
- the flag itself is `REGISTRY_HAS_NO_REAL_SHELTERS = true` (`seo-flags.ts:69`);
- pin: `copy-status.test.ts:73-84` (uk.demo has 2 keys).

Adjacent but a separate gate: `PENDING_R4_2_ANALYTICS_SENTENCE` (`uk.ts:33-38`, the pre-launch gate). A
cabinet session-length sentence goes on `/pro` with RO-F2 (F-B9).

PR 2–5 sheets own neighbouring strings that touch PR 6's topics: F-B2 K3 draft footer (final); F-B3/F-T1
K2 ordering sentence (open); F-B4/F-T2 E3 refusal (open); KABINET.md:164-165 stale-strip caption
(follows K-Q14).

---

## 7. Questions for Oleksii

1. **K-Q14** (owed by PR 6): option (a) or (b) in §2, and his Ukrainian if (b).
2. **§8:** where do the three examples go, given his «один раз» draft ends with a full stop? Does
   «Дата ставиться сама» stay (nobody types the date) or change (it moves only on his tap or a publish)?
3. **§7 last paragraph:** does «Заповнювати анкету не треба» go too, now that the shelter fills in K3's form
   per animal? Does the page still offer "send it and I'll enter it", backed only for *new* animals by an
   `onboard:shelter` run?
4. **§9:** keep "write to me and I'll remove it"? After PR 6, as before it, the operator has no tool to mark
   an animal adopted or withdrawn (support mode is read-only, there is no registry animal procedure, and
   `onboard:shelter` only inserts), so it would mean a direct database edit. Does ¶1 «що ви можете мені
   сказати» stay, now that «Уже вдома» reaches no one?
5. **§9b `howToLeave`:** «я приберу все: … фотографії» holds only through manual Cloudflare deletion until
   DR-F3 ("before the first real shelter"; PR 6 merges before that invite). Keep it on that basis, or does
   DR-F3 land first?
6. **/pro history scope:** your answer 11 names profile changes, and K-Q7 covers animals. Mention both? Say
   that profile changes keep old and new values while animal edits keep field names only? Say anything
   about retention, given the only deleting tool is `demo:remove --shelter`, documented for test shelters?
7. **/pro photos:** *(mostly answered: P-Q13, accepted 2026-10-17, moves the onboarding script to random
   keys in PR 3 and deletes the index-based key.)* Only photos onboarded before PR 3 keep `animals/{animalId}/{index}`,
   and production holds no real shelter's photos yet. Is an unscoped "unguessable" sentence fine on that basis?
8. **`profileEdit.errors.notAvailable`:** delete it in PR 6 with the refusal code, or keep
   `refused_until_edit_screens` as an off switch (the string then stays, shown only if the switch is
   flipped back)?
9. **§3 ¶3 / commitment #8:** «Від людини не ховається нічого, крім того, що вона сховала сама». From PR 6 a
   shelter can pause intake, which hides all its animals from both views (your K4 draft K4UK:96: «Поки
   прийом на паузі, ваших тварин не бачать ті, хто шукає.»). #8's register reads the sentence as being about
   the adopter's own hiding. Does it need a word?
