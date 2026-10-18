# R-UI copy sheet: the operator screens

Every user-facing string the operator screens need (`docs/r-ui-plan.md`). One sheet for all three
PRs, split by PR so R-UI 1 can start once section 1 is answered.

**Why the copy comes first.** Under `kabinet.*` a `[COPY PENDING]` string fails CI outside
`testShelterOnly` (`copy-status.test.ts`, CG-Q1) and turns production sign-in off
(`productionSignInOf`). No R-UI PR can go green with a pending string, so each section's Ukrainian
has to be final before its PR merges.

**How to read it.** The English column describes what is true in code; it's a brief, not a draft to
translate. "Mock" is the designer's draft (`M33`/`M34`/`M35` = `docs/design/Opika Kabinet.dc.html`
at that line; `K` = `docs/design/KABINET.md`), never approved copy. Flags:
- **[реєстр]**: uses «реєстр» (brand rule CB-B1; default rule CB-B2).
- **[ми]**: operator voice uses «я», never «ми» (CB-B2).
- **[gendered]**: a gendered past tense or pronoun for a person.
- **[false]**: untrue against today's code; the draft can't ship as written.
- **[plural]**: needs `Intl.PluralRules` forms (one, few, many).

**Conventions.** New keys go in `kabinet.operator.*`. Quote marks «…» (CB-B1 fix 4). Apostrophe ʼ
(U+02BC), as in his K4 strings. On his own screens the UI addresses the operator as «ви», as
`kabinet.support.title` does (EM-Q2); text he types himself (reasons, notes) is his own «я»
(question 9).

**Reused, no new key:** `kabinet.profileStatus.*` (status chips) · `kabinet.profileChannel.*` ·
`kabinet.profileNotRecorded` · `kabinet.profile.{legalName, edrpou, contactPerson, address,
addressNote, contactsTitle, donationTitle, donationLink, signOut, signOutFailed}` ·
`kabinet.profileEdit.contacts.*` and `profileEdit.errors.{phoneFormat … notAUrl}` ·
`profileEdit.state.{saving, failed, retry}` · `profileEdit.donation.previewHost` ·
`profileEdit.pause.{reason.*, close}` · `kabinet.history.adminJoined` · `kabinet.support.*` ·
`kabinet.signIn.emailLabel` · `kabinet.registry.inviteSent.tellPersonally`.

---

## 1. R-UI 1: shell, list, shelter page (read-only), history

### 1.1 Shell

| Key | English (what is true) | Mock | Flag |
|---|---|---|---|
| `shell.role` | The role label beside the operator's name. The name itself comes from `KABINET_OPERATOR_DISPLAY_NAME` | «оператор реєстру» (M33) | [реєстр] |
| `shell.nav.shelters` | Nav item: the list | «Притулки» | |
| `shell.nav.newShelter` | Nav item: create | «Новий притулок» | |
| `shell.pageTitle.list` / `.create` / `.shelter` | Browser tab titles. `.shelter` takes `{name}` | none | |

The mock's header brand «Реєстр Opika» (M33/M34) is not a key: the header reuses the existing
brand component.

### 1.2 S1 Притулки

| Key | English | Mock | Flag |
|---|---|---|---|
| `list.title` | Heading | «Притулки» | |
| `list.total` | `{count}` shelters in total | «{count} притулків · Київщина» | [plural]; the oblast is not in the data, it would be a fixed string |
| `list.create` / `list.createShort` | Button to S2, desktop / phone | «Новий притулок» / «Новий» | |
| `list.search` | Search field label. **Matches the shelter's name only** | «Назва, місто або ЄДРПОУ» | [false]: name only |
| `list.orderNote` | Shelters waiting on the operator (pending, under review, or a donation link to decide) come first | «Спочатку ті, що чекають на вас» | true |
| `list.filterAll` | Filter chip: all, `{count}` | «Усі · {count}» | |
| `list.filterStatus` | Filter chip: `{status} · {count}` | «{status} · {count}» | |
| `list.admins` | `{count}` admins who have signed in | «1 адміністратор», «2 адміністратори» (M33/M34) | [plural] |
| `list.adminsInvited` | `{count}` invited, not yet signed in (expired invitations included) | none | [plural] |
| `list.noAdmins` | No admin and no invitation | none | |
| `list.donationPending` | A donation link is waiting for the operator's decision | none | |
| `list.open` | Row link | «Відкрити» | |
| `list.empty` | No shelters yet; points to S2 | none | |
| `list.noMatch` | Nothing matches the search or filter | none | |
| `list.loadMore` | Load the next page | none | |
| `list.loadFailed` | The list didn't load; retry | none | |

### 1.3 S4 Притулок, read-only parts

| Key | English | Mock | Flag |
|---|---|---|---|
| `shelter.back` | Back to the list | «← Притулки» | |
| `shelter.meta` | `{city} · {admins}` | «{city} · {admins} · 14 тварин» (M34) | animal count not in `byId`, dropped |
| `shelter.timeInState` | How long it has been in this status, `{days}` | «2 дні» (M33) | [plural]; via `Intl` |
| `shelter.legalNote` | The shelter sees these fields read-only. A change of legal entity or ЄДРПОУ doesn't change the status; the operator decides | «Ці поля притулок бачить лише для читання. Зміна юридичної особи чи ЄДРПОУ не змінює стан автоматично — вирішуєте ви.» (M34) | true |
| — | Address note | M34: «Адоптери бачать лише приблизне коло, зсунуте приблизно на кілометр.» | [false] since EM-D1 (adopters see the city only); reuse `profile.addressNote` |
| `shelter.descriptionTitle` | The public description | none | |
| `donation.title` | Donation link section | none | |
| `donation.live` | The live link | none | |
| `donation.none` | No link | none | |
| `donation.proposed` | The shelter proposed `{host}` on `{date}`; waiting for a decision | none | |
| `admins.title` | Admins section | «Адміністратори» | |
| `admins.joined` | Signed in (no date: the view doesn't carry one) | M34: «{email} · увійшла 7 жовтня» | [gendered]; no join date in the view |
| `admins.invitedUntil` | Invited; the link is valid until `{date}` | M34: «запрошення надіслано 6 жовтня» | no sent date, only the expiry |
| `admins.invitedExpired` | Invited; the link has expired | none | |
| `admins.none` | No admins | none | |

### 1.4 Evidence (shown read-only in R-UI 1, edited in R-UI 2)

| Key | English | Mock | Flag |
|---|---|---|---|
| `evidence.title` | Evidence section | none | |
| `evidence.empty` | No evidence on file | none | |
| `evidence.kind.edrpou_registration` | ЄДРПОУ registration | «Реєстрація · ЄДРПОУ» (M33) | |
| `evidence.kind.bank_account_holder` | Bank account holder | «Банківський рахунок» | |
| `evidence.kind.reference_contact` | An independent reference | «Рекомендація» | |
| `evidence.kind.site_visit` | The operator visited the premises | «Візит на місце» | |
| `evidence.kind.supporting_document` | A document. Shown only for script-onboarded data; the form never offers it (no upload exists) | «Документ» | |
| `evidence.added` | Added on `{date}` | «додано {date}» | |
| `evidence.field.registeredName` | The name as it stands in the state register (ЄДР) | «Назва в реєстрі» | [реєстр], though it means the external ЄДР; «Назва в ЄДР»? |
| `evidence.field.holderName` | Account holder | «Власник» | |
| `evidence.field.who` / `.channel` / `.relationship` | Reference: who, how to reach them, how they know the shelter | «Хто» / «Як звʼязатися» / «Ким доводиться» | |
| `evidence.relationship.veterinary_clinic` / `.local_authority` / `.partner_organisation` / `.other` | Relationship options | «Ветклініка» / none / none / none | |
| `evidence.field.visitedOn` | Visit date | none | |
| `evidence.field.notes` / `.label` | Note / label | «Нотатка» / «Підпис» | |
| `evidence.noDocument` | No document attached; allowed for this kind | «Документ не додано. Це дозволено для цього типу доказу.» (M33) | true |
| `evidence.gaps` | Missing for approval: `{kind}`, `{provided}` of `{minimum}` | none | |

The mock's «Статус у ЄДР», «Банк», «IBAN» and the document rows «Переглянути»/«↓» are stale: K
removed them (K:325-330), and no documents exist in the system.

### 1.5 Blocked addresses

| Key | English | Mock |
|---|---|---|
| `blocked.title` | Addresses the email provider won't deliver to | none |
| `blocked.none` | Checked: none of this shelter's addresses is blocked | none |
| `blocked.line` | `{email} — {reason}` (reasons reuse the email outcomes in 2.3) | none |
| `blocked.incomplete` | Only part of the list could be checked | none |
| `blocked.unknown.provider_error` / `.timed_out` / `.unsupported_provider` / `.provider_suppresses` | Why the check couldn't run | none |
| `blocked.asOf` | As of `{time}` | none |
| `blocked.manualUnblock` | Unblocking is done in the provider's dashboard, not here (IN-E7) | none |

### 1.6 History

`{actor}` is «ви» for the current operator, the admin's name for a shelter admin, or a generic label.

| Key | English | Mock | Flag |
|---|---|---|---|
| `history.title` | Section heading | «Історія» | |
| `history.note` | Every status change and every audited field change | «Кожна зміна стану й закритих полів.» (M34) | understates: history also holds admins, donation and animal lines |
| `history.empty` / `history.more` | No entries / load more | none | |
| `history.actor.you` | The current operator | «ви» (M33) | |
| `history.actor.formerAdmin` | An admin since removed | none | |
| `history.actor.operator` | Another operator (generic) | config fallback «Оператор реєстру» | [реєстр] (CB hit 4) |
| `history.shelter_created` / `.shelter_created_script` | Shelter created, in the screens / by the script | «створили притулок» (M33) | [ми] if read as «ми створили» |
| `history.verification.start_review` / `.approve` / `.reject` / `.suspend` / `.reinstate` / `.resubmit` / `.pause` / `.resume` | One line per move; reject and suspend show the code and the note | «відкрили розгляд», «На розгляді», «Перевірено» (M33/M34) | |
| `history.admin_invited` / `.admin_invitation_resent` / `.admin_removed` / `.admin_removed_pending` | Admin lines (removed: signed-in admin vs withdrawn invitation) | none | |
| `history.contact_changed` / `.freshness_sentence_changed` / `.description_changed` | Profile edits | none | |
| `history.donation_proposed` / `.donation_proposal_cancelled` / `.donation_approved` / `.donation_rejected` | Donation lines | none | |
| `history.verified_data_changed.legal_entity` / `.exact_address` | Locked-field changes | M34: «змінив адресу приміщення» | [gendered] |
| `history.animals_imported` / `.animal_created` / `.animal_edited` / `.animal_listing_changed` / `.animal_deleted` | Animal lines (`animal_edited` lists the fields) | none | |

M33/M34's «Ірина · подала 5 доказів» / «Олена · подала 4 докази» are [gendered] and [false]: a
shelter never submits evidence.

---

## 2. R-UI 2: create a shelter

### 2.1 Form

| Key | English | Mock | Flag |
|---|---|---|---|
| `create.title` | Heading | «Новий притулок» | |
| `create.intro` | One form: the operator enters everything, including the legal data and evidence | «Одна форма. Юридичні дані й докази притулок додає сам, після входу.» (M33) | [false]: a shelter never adds evidence |
| `create.name` / `create.nameHint` | Display name: what the shelter calls itself. **It can't be changed after create** (question 8; no longer true since R-UI 4, which renames on S4 and cut the hint to «Як притулок називає себе.») | «Назва притулку» / «Як притулок називає себе. Юридичну назву додасте під час перевірки.» | hint [false]: the legal name is entered on this form |
| `create.description` / `.descriptionHint` | Description, required; shown publicly on the shelter's cards | none | |
| `create.city` | City (one of the eight) | «Місто» | |
| `create.address.line1` / `.line2` / `.postalCode` | Street address; line 2 and postcode optional | none | |
| `create.coordinates` / `.coordinatesHint` | "lat, lng", pasted from a map. Never shown publicly; the public sees the city only | none | |
| `create.legalTitle` | Legal data section | «Юридичні дані» (M34) | |
| `create.legalKind.registered_ngo` / `.sole_proprietor` / `.unregistered_initiative` | Legal form options | none | |
| `create.legalName` / `create.edrpou` / `create.contactPerson` / `create.registeredAt` | Fields per legal form | reuse `profile.*` labels where they exist | |
| `create.firstAdminTitle` / `.firstAdminHint` | The first admin; gets a sign-in link by email | «Перший адміністратор» / «Отримає лист із посиланням для входу. Інших адміністраторів притулок додасть сам.» | hint's 2nd sentence [false]: only the operator invites |
| `create.adminName` | Admin's name | «Імʼя» | |
| `create.submit` / `.submitShort` | Create and send the invitation | «Створити й надіслати запрошення» / «Створити й запросити» | |
| `create.cancel` | Cancel | «Скасувати» | |
| `create.whatHappens.title` | What happens next | «Що станеться» | |
| `create.whatHappens.step1` | It appears in the list as Pending | «Притулок зʼявиться у списку зі станом [Очікує]» | true |
| `create.whatHappens.step2` | `{name}` gets a sign-in email; the link lasts 72 hours and can be resent | «{name} отримає лист для входу. Посилання діє 72 години, його можна надіслати ще раз.» | true |
| `create.whatHappens.step3` | No animals in the gallery until the shelter is Verified | «Вона додасть докази для перевірки. Тварин у галереї не буде, доки притулок не стане «Перевірено».» | 1st sentence [false] and [gendered]; 2nd true |

### 2.2 Evidence editor

| Key | English | Mock |
|---|---|---|
| `evidence.add` / `evidence.remove` | Add an item / remove it | «+ Додати доказ» / «Прибрати» (K:291-292) |
| `evidence.typePicker` | Which kind of evidence | none |
| `evidence.siteVisitDateHint` | The visit date can't be in the future; dates are checked in UTC, so just after midnight Kyiv time "today" may be refused | none |

### 2.3 Result and invitation outcomes

| Key | English | Mock |
|---|---|---|
| `create.created` | Shelter created | «Притулок створено. Запрошення надіслано на {email}.» (M33; the second sentence is true only when sent) |
| `email.sent` | Invitation sent to `{email}` | «Запрошення надіслано на {email}.» |
| `email.sentUnchecked` | Sent; the block list couldn't be checked | none |
| `email.blocked.unsubscribed` / `.hard_bounce` / `.spam_complaint` / `.admin_blocked` | Not sent: the provider blocks this address, and why | none |
| `email.failed.provider_error` / `.copy_pending` | Not sent: the provider failed / the email's copy isn't final | none |
| `create.createdNoInvite` | Created, but no admin is attached (a race removed it); invite from the shelter page | none |
| `create.inviteValidUntil` | The link is valid until `{date}, {time}` | «{date}, {time} · посилання діє до {date}» |
| `create.resend` / `create.openShelter` | Resend / open the shelter | «Надіслати ще раз» / «Відкрити притулок» |

### 2.4 Refusals and failures

| Key | English |
|---|---|
| `create.errors.addressHasARole.shelter_admin` / `.operator` / `.invited_elsewhere` | The first admin's address already belongs to a shelter / is an operator / has a live invitation elsewhere |
| `create.errors.siteVisitInFuture` | The site-visit date is in the future |
| `create.errors.unknownCity` | The city isn't in the list |
| `create.errors.lostAnswer` | No answer came back. It may have been created: check the list before trying again |
| `create.errors.failed` | Couldn't create |
| `create.errors.required` / `.edrpouFormat` / `.coordinatesFormat` | Field errors |

---

## 3. R-UI 3: shelter page actions

### 3.1 Verification

| Key | English | Mock | Flag |
|---|---|---|---|
| `verification.decisionTitle` | Decision panel | «Рішення» | |
| `verification.decisionCaption` | What the shelter will see | «Притулок побачить рішення і причину, якщо вона є.» (M33) | [false] today: `/kabinet` shows the chip and date only (question 7) |
| `verification.startReview` | Take it under review | «Взяти на розгляд» | |
| `verification.approve` / `.approveShort` | Approve → Verified | «Схвалити → Перевірено» / «Схвалити» | |
| `verification.approveNote` | Approval opens the gallery to its animals at once; a rejection needs a reason | «Схвалення відкриває галерею для тварин притулку одразу. Відхилення потребує причини.» | true |
| `verification.approveBlocked` | Can't approve yet: evidence missing (the gap list follows) | none | |
| `verification.reject` / `.suspend` | Open the reason dialog | «Відхилити…» / «Призупинити…» | |
| `verification.reinstate` | Reinstate to `{status}`, the status it had before suspension | «Відновити → {status}» (M34) | |
| `verification.resubmit` | Back to Pending with the evidence (prefilled) | none | |
| `verification.suspended.title` | Suspended | «Притулок призупинено» | |
| `verification.suspended.reasonLabel` | The reason | «Причина, як її бачить притулок» | [false] until the shelter can see it (question 7) |
| `verification.suspended.priorLabel` / `.priorPausedSince` | Before suspension it was… / paused by the shelter since `{date}` | «До призупинення притулок був» / «з {date}, притулок сам поставив паузу» | |
| `verification.suspended.reinstateExplainPaused` | Reinstate returns it to Paused, not Verified; animals stay hidden until the shelter resumes | «„Відновити“ поверне саме цей стан — «На паузі», а не «Перевірено». Тварини лишаться прихованими, доки притулок сам не зніме паузу.» | true; „…“ → «…» |
| `verification.suspended.reinstateExplainVerified` | Reinstate returns it to Verified; animals reappear | none | |
| `verification.noConfirm` | No confirmation needed: nothing visible is taken away | «Підтвердження не потрібне — дія не забирає нічого видимого.» (M34) | |
| `verification.rejected.title` / `.reason` | Rejected, with the code and note | none | |

### 3.2 Reason dialog

| Key | English | Mock | Flag |
|---|---|---|---|
| `reasonDialog.rejectTitle` / `.suspendTitle` | Reject / suspend «{shelter}»? | «Відхилити «{shelter}»?» / «Призупинити «{shelter}»?» | |
| `reasonDialog.rejectBody` | The shelter's animals won't appear in the gallery | «Притулок побачить цю причину дослівно у своєму кабінеті. Тварини не зʼявляться в галереї.» | 1st sentence [false] until question 7 |
| `reasonDialog.suspendBody` | Its animals leave the gallery now; it can be reinstated | none | |
| `reasonDialog.codeLabel` | Reason code (required by the contract; the mock has none) | none | |
| `reasonDialog.reasonLabel` / `.reasonHint` | Note, required; written so the person knows what to do next | «Причина» / «Обовʼязково. Пишіть так, щоб людина знала, що робити далі.» | |
| `reasonDialog.confirmReject` / `.confirmSuspend` | Confirm | «Відхилити» / none | |
| `codes.rejection.insufficient_evidence` / `.identity_unverifiable` / `.duplicate_submission` / `.out_of_service_area` / `.spam` / `.other` | Rejection codes | none | |
| `codes.suspension.unresponsive` / `.complaint_upheld` / `.listing_quality` / `.suspected_fraud` / `.other` | Suspension codes | none | |

### 3.3 Donation, admins, errors, support

| Key | English | Mock |
|---|---|---|
| `donation.approve` / `.reject` | Approve / reject the proposed link | «Схвалити» / «Відхилити» (K:348-354) |
| `donation.approved` / `.rejected` / `.conflict` | Done / done / it changed meanwhile, reloaded | none |
| `admins.remove` | Remove | «Прибрати» |
| `admins.removeConfirm.title` / `.body` | Remove `{name}`? Their sessions end at once (RG-Q6) | none |
| `admins.inviteAnother` / `admins.resend` | Invite another / resend | «Запросити ще одного» / «Надіслати ще раз» |
| `admins.gone` | Already removed | none |
| `errors.illegalTransition` | That move isn't possible from the current status; reloaded | none |
| `errors.conflictReload` | It changed meanwhile; reloaded | none |
| `errors.failed` / `errors.lostAnswer` | Failed / no answer, re-checking before saying anything | none |
| `support.enter` (if question 5 is yes) | View as the shelter, read-only | «Переглянути як притулок · лише читання» (M34) |

### 3.4 The shelter's side (only if question 7 is yes)

`kabinet.*` keys for `/kabinet` (K5, N17, and its suspended counterpart) showing the shelter the
code and the operator's note, verbatim. Drafted with his K5 copy once he answers question 7.
