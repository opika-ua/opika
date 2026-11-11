# Operator playbook: a suspicious or problematic shelter

For the owner, who is the only operator. Steps only: it names no real shelter, person, number or address,
and none may ever be added (the repo is public). Evidence and case notes live outside the repo (section 9).
Every claim below was checked against the code on the default branch when this was written; the PR that
added it lists where. If code and this page disagree, the code wins, then fix the page.

Not legal advice. It is a working procedure for a small, anonymous-adopter, no-payment product.

Conventions: Ukrainian in «…» is the exact label on screen. «Притулок» pages are under `/kabinet/prytulky`
(the list) and `/kabinet/prytulky/<id>` (one shelter), signed in as the operator. Anything that touches
Neon, Vercel, R2 or DNS is yours to run; nothing here asks an agent to.

## 1. What the product can and cannot do (read this first)

Can:

- Decide a shelter's verification status, with a written reason the shelter reads (sections 3 and 4).
- Show a shelter's cards "on review" for a limited time, and take that back (section 5).
- Take a shelter off the public site at once (suspend), and put it back (section 6).
- Close a shelter admin's access and have their account erased (section 7).
- Look at a shelter's cabinet exactly as its admin sees it, read-only and logged (section 8).
- Correct a shelter's legal data or premises address: «Змінити» on «Юридичні дані» or «Адреса приміщення».
  Each change is a history line the shelter also sees; the status does not change.

Cannot (plain, so nobody plans around a feature that is not there):

- **No adopter report channel.** The contract for an anonymous "report this animal" call exists
  (`reports.create`), but no handler, no table, no screen and no queue behind it. Adopters cannot flag a
  shelter in the product. Reports reach you only as mail to the contact address printed on `/pro`, or in
  person. Section 10 says what to do with one.
- **No way to contact adopters.** Adopters are anonymous device sessions: no email, phone or name is
  stored for them, and nothing in the product writes to them. You cannot warn people who already received a
  shelter's contacts.
- **No operator screen lists contact reveals.** The record exists in the database (section 9); no
  procedure or page shows it, by design (no engagement counts in any view).
- **No check across shelters.** The list searches by shelter name only. Nothing flags a phone number, a
  bank holder name, an EDRPOU code or a reference reused by two shelters. That comparison is yours, by
  hand, in your own notes.
- **No lookup against the company registry or a bank.** The EDRPOU code and the registered name are typed
  in by you after you checked them; the product only records them and compares counts.
- **A live donation link: removable by you only, not by the shelter.** «Прибрати посилання…» (shown
  while a link is live; `DonationRemoveDialog`) asks for «Причина» and a required «Пояснення» the
  shelter reads, then clears the live link and any waiting proposal at once and writes a history line.
  The shelter can propose a new link. (Sections 11 and 15 describe the same action.)
- **No UI deletes a shelter.** Deletion is the `demo:remove` script (owner-run, section 7).
- **No email on a status change.** The product mails only sign-in links, invitations and password mails.
  A request for evidence, a suspension notice and so on go out from your own mailbox (templates, section 13).

## 2. How a shelter looks to you and to the public

| Status (what you see) | Public site | Shelter's own cabinet | You can |
|---|---|---|---|
| «Очікує перевірки» (pending) | Unknown id: 404. Early listing, if running, makes it visible with «на перевірці» | Sees «На перевірці» | «Взяти на розгляд», «Відхилити…»; allow or revoke early listing; add evidence |
| «На розгляді» (under_review) | Same as pending | Sees «На перевірці» | «Схвалити», «Відхилити…»; allow or revoke early listing; add evidence |
| «Перевірено» (verified) | Page and animals visible, in the gallery | Normal | «Призупинити…» |
| «На паузі» (paused, the shelter's own choice) | Shelter and animal pages open by direct link with a "paused" notice; animals leave the gallery; no contacts are handed out | Pause note, can resume itself | «Призупинити…» |
| «Призупинено» (suspended) | Shelter page and every animal page: 404, the same answer as an id that never existed. Animals out of the gallery | Sees «Притулок тимчасово призупинено», the code and your note | «Відновити → «…»», «Відхилити…» |
| «Відхилено» (rejected) | 404, same as unknown | Sees «Перевірку не пройдено», the code and your note | «Повернути на перевірку» |

Which moves exist is fixed by the verification state machine; the screen offers exactly what the machine
accepts and no more. Closed on purpose: no suspend from pending or under review (reject instead), no
return of a verified shelter to review, no reject from paused or verified (suspend first, then reject).
`pause` and `resume` belong to the shelter; you never get those buttons.

## 3. Verification: the moves, labels and rules

1. **«Взяти на розгляд»** (pending to under review). One click, no dialog. Changes nothing public.
2. **Evidence.** Section «Докази для перевірки» lists what is on file. Kinds, with the label you see:
   «Реєстрація · ЄДРПОУ», «Власник банківського рахунку», «Рекомендація», «Відеодзвінок», «Документ».
   The editor offers the four kinds that need no file; document upload is not built, and the server refuses
   any item carrying a document key. A video call (stored as `site_visit`) is stamped with you as the person who made it and its
   date cannot be in the future. If the connection can't carry video, a phone call plus a short video of
   the premises filmed the same day counts; say which video in the notes.
3. **Minimum to approve**, by legal form («Юридичні дані»):

   | Legal form | Required |
   |---|---|
   | «Громадська організація чи фонд», «ФОП» | 1 EDRPOU registration, 1 video call |
   | «Ініціатива без реєстрації» | 1 video call, 1 reference |

   (Owner decision, 2026-11-10. A bank account holder can still be added but counts toward no minimum, and
   a second reference is extra. You check the account holder by hand when approving a donation link, section 15.)

   When short, «Схвалити» is blocked and the screen says «Схвалити поки не можна – бракує:» and
   lists each gap: first «Юридичні дані» or «Адреса приміщення» if a minimal create left them out
   («Додати» on the shelter's page adds them), then the evidence. The server checks the same rule again at approval, so the button cannot be bypassed.
   The product counts items by kind. It does not judge whether they are true: that is your work.
4. **«Схвалити → «Перевірено»»** (under review to verified). Animals appear in the gallery at once.
   Approval is only possible from «На розгляді», never straight from «Очікує перевірки».
5. **«Відхилити…»** (from pending, under review, or suspended). Opens a dialog with «Причина» and
   «Пояснення». The explanation is required, trimmed, at most 2,000 characters.
   **The shelter reads the explanation word for word in its cabinet, signed with your display name.**
   Never put suspicion, a third party's name or an internal note there.

   Codes offered now: «Недостатньо доказів», «Не вдалося підтвердити, хто стоїть за притулком»,
   «Повторна заявка», «Заявка не схожа на звернення притулку», «Інше». The sixth code, «Поза територією, де працює сайт»
   (`out_of_service_area`), is retired: the site is nationwide, so it is no longer offered, but old
   rejections that carry it still display.
6. **«Повернути на перевірку»** (rejected to pending): you send the evidence back, amended or not. The
   history records the whole list the shelter holds from then on. The shelter's own "ask for another look"
   exists in the API, but no shelter screen calls it, so treat resubmission as yours.

Approve, reject and resubmit end any early listing (section 5). Approve, start review, reject and
resubmit are recorded in the shelter's history with you as the actor.

## 4. Adding evidence without changing status

Section «Докази для перевірки», button «+ Додати доказ», then «Додати докази» / «Додати». Allowed only while
the shelter is pending or under review (otherwise «Докази можна додати, лише поки рішення не ухвалено.»).
New items are appended; an item that duplicates one on file (same kind and same key field: EDRPOU code,
holder name, contact channel, call date) is dropped, and if nothing is new you get «Ці докази вже є.»
Limits: 30 items on a shelter, 10 per add. It writes a history line naming the kinds only, never contents,
and the shelter is not told. Approval re-reads the list, so new items count immediately.

## 5. Listing before verification ("на перевірці")

Purpose: let a shelter's cards be public while the review runs. It sits beside the state machine, not in it.

- Panel «Показ до завершення перевірки». Buttons «Дозволити показ до завершення перевірки» and
  «Зняти дозвіл». Only for pending or under review.
- **Precondition:** at least one video call or one reference on file («Щоб дозволити показ, потрібен
  хоча б відеодзвінок або одна рекомендація.»).
- **Length:** 60 days from the allow, an instant sum. At the boundary instant it is already hidden. The
  panel counts «До кінця показу: N днів» and reminds you at 7 days or fewer. Nothing needs a cron: the
  public pages check the clock on every read, so an expired permission simply stops showing.
- **Count:** two periods per shelter for its whole life (counted from the history, so it survives a
  resubmission). The second needs a written reason (field «Чому подовжуєте показ»); a third is refused
  («Показ до перевірки вже дозволяли двічі.»). A permission that is still running cannot be stacked; one that has run out can be allowed again as the
  next period.
- **What the public sees:** shelter and animal pages with the label «на перевірці». It is not in the
  sitemap. Adopters can reveal contacts for an early-listed shelter exactly as for a verified one.
- **Revoke:** «Зняти дозвіл» works on a running permission only. New reveals stop at once (the shelter
  counts as not visible); contacts already given stay with the adopters.
- **What the shelter sees:** history lines «Показ карток до завершення перевірки дозволено» / «…знято» /
  «Строк … минув» and a banner with the end date. Once the period has ended, its animals page says so
  with a dated line, «Показ ваших карток з позначкою «на перевірці» завершився {date}.», and your panel
  says when one last period is left: «Можна дозволити ще один, останній період – з поясненням.» The period number and your reason are stored but are not
  shown to the shelter, and the operator history line does not display them either: they are in the record
  only.

## 6. Pause versus suspend

| | Pause | Suspend |
|---|---|---|
| Who | The shelter, from its cabinet: «Призупинити прийом звернень», later «Відновити прийом звернень». Reason: «Сезонна перерва», «Переїзд», «Немає вільних місць», «Бракує волонтерів», «Інше», plus an optional note | You, «Призупинити…» |
| Shelter ends it | Yes, by itself | No. Only you, with «Відновити → «…»» |
| Animals in gallery and search | Out | Out |
| Shelter and animal pages | Open by direct link with a paused notice, for animals that were once shown | 404, identical to an id that never existed (no hint that a shelter was ever there) |
| New contact reveals | Refused (shelter paused) | Refused (shelter not visible) |
| What the visitor learns | Only the reason code, never the note, actor or date | Nothing |

**Suspend** is for a verified or paused shelter. Dialog «Призупинити «{shelter}»?»: «Причина», «Пояснення»
(required). The note is shown to the shelter as written (see the warning in section 3). Codes:
«Немає звʼязку з притулком», «Перевірена скарга», «Дані в картках потребують виправлення»,
«Не вдалося підтвердити дані притулку», «Інше». Effect: animals leave the gallery at once; shelter and animal pages answer
404; the shelter's admins can still sign in and read the decision. If the shelter was paused when you
suspended it, that pause is kept inside the suspension and does not show publicly.

**Reinstate: «Відновити → «{status}»».** It restores exactly what the suspension interrupted. A shelter that
was paused returns to «На паузі» and stays hidden until it resumes itself; a verified one returns to
«Перевірено» and its animals reappear. The screen says which before you press. A suspended shelter can also
be rejected («Відхилити…»), which is the "not coming back" outcome and is visible in the history as
suspension then rejection.

Suspension does not touch photo files or adopters' stored data (sections 9 and 12).

## 7. Removing a shelter admin, erasure and deleting a shelter

- **«Прибрати»** next to an admin in «Адміністратори» (confirm: «Закрити доступ для {name}?»). The person
  can no longer sign in, and their sessions end at once. A pending invitation is withdrawn the same way.
  Resend with «Надіслати ще раз»; add with «Запросити ще одного» / «Запросити адміністратора».
- **Erasure (GDPR), decided 2026-10-24:** when the removed person has no other shelter and is not an
  operator, the account is deleted in the same operation, and their email is replaced by a fixed
  placeholder in every history line and invitation of every shelter it appeared in. Expired never-accepted
  invitees are erased the same way by the 6-hourly clean-up. The history lines themselves stay (who did
  what, when) without the address. An account that has ever been an operator is outside this mechanism.
- The «Адреси, на які поштовий сервіс не доставляє листи» block shows addresses of this shelter that the
  mail provider will not deliver to, when it can be read. A hard bounce on a shelter's only admin address
  is a "cannot be reached" signal. Note the provider keeps its own suppression list that the site does
  not read; for that provider the block says so.
- **Deleting a shelter** with all its animals, history and organisation is the owner-run script
  `demo:remove --shelter <id>`: dry run first, then `--commit`, always `--expect` the production endpoint
  and `--prod`; see `docs/onboarding-a-shelter.md`. It refuses while any admin remains (remove them
  first), and **it refuses outright if you ever entered support mode on that shelter** (support records are
  never deleted), and when no other shelter would remain. It also deletes the reveal rows of that shelter's
  animals: an irreversible loss of the one record of what adopters were shown. For a shelter under
  investigation, suspend and keep; delete only after the matter is closed.

## 8. Support mode (view as the shelter)

- On the shelter's screen: «Переглянути як притулок · лише читання». You then see the shelter's cabinet
  as its admin does (profile, cards, history as the shelter sees it). A banner reads that you are viewing
  that shelter's cabinet, read-only, with «Вийти з режиму перегляду».
- **Read only:** every write is refused in this mode. Registry actions (suspend and so on) are also
  refused while it is on, so exit first. Sign-out is disabled inside it («Вихід вимкнено»).
- **Time:** the view ends after 30 minutes without use, or when you press the exit button, or when the
  browser session ends. Starting a view on another shelter ends the previous one. The cookie is separate
  from your sign-in and is only honoured for your operator account.
- **Audit:** each view is a permanent row (who, which shelter, start, last use, how it ended). It is never
  deleted, which is also why such a shelter cannot be removed with `demo:remove`. Think before using it on
  a shelter you may later want to delete.
- Use it to check what the shelter sees of a decision, or to reproduce a complaint. It shows the shelter's
  view, not the evidence; the evidence is on your screen only.

## 9. History, audit trail and contact reveals

**Your screen, section «Історія»** (newest first, impersonal lines with the actor beside). Recorded:
shelter created or loaded from file; every verification move with its reason and note; early listing
allowed, revoked, lapsed; evidence added (kinds only); admin invited, re-invited, joined, removed;
contacts, description, freshness sentence, logo, display name changes; donation proposed, cancelled,
approved, rejected; changes to legal data or the exact address; animals created, edited, listing changes,
deleted drafts, imports. Not recorded: adopter activity of any kind, and the "still looking / still
negotiating" confirmations. Entries are append-only; the one in-place edit is the erasure placeholder above.

**What the shelter sees of it:** the same lines minus these, which stay with you: evidence and its
contents, evidence additions (the line is dropped entirely), who you are by id (it sees your display name),
the early-listing period number and reason, and every internal id. It does see reject and suspend reasons
and notes word for word, and early listing allowed or revoked without a reason.

**What is not stored anywhere:** a private operator note. Apart from the early-listing reason (stored, not
displayed) and the notes on a video call (shown to you only), the product has no free-text place for your
suspicions. Keep them outside (section 12).

**Contact reveals, and what adopters saw before a suspension.** A reveal is an immutable record written
the first time an anonymous adopter session reveals an animal's shelter contacts. It stores a frozen copy:
shelter name, contact channels, exact address, public city, donation link, the shelter's status at that
moment and the animal's name and photo. The adopter is shown the name and channels (never the exact
address). While the shelter is publicly listed, the adopter sees its current contacts; once it is hidden
(paused, suspended, rejected) the stored first-reveal copy is the only source. After a suspension the
adopter can no longer open the animal page or reveal again (the page 404s), and no screen lists reveals,
so to find out how many sessions were pointed at a shelter you would need a read-only query by shelter id
on the `reveals` table, run by you. Adopters have no contact data,
so it can tell you how many sessions revealed and when, not who they were.

## 10. Signals of a suspicious shelter

Be conservative: a signal is a reason to ask, never a conclusion. Most oddities in a wartime volunteer
setting are innocent (a new SIM card, a volunteer's own bank card, a shared phone for two groups).

Observable signals, in rough order of weight:

1. **Mismatch between the documents.** The name in the registry, the bank account holder, the shelter's
   display name and its claimed legal name do not describe one identity. (The product stores all four so you
   can compare them; it does not compare them for you.)
2. **A reference that does not hold up.** The vet clinic or local authority named as reference does not
   recognise the shelter, or the contact given for them is the shelter's own.
3. **Cannot be reached.** Phone and messenger unanswered, invitation mail bounced (see the blocked
   addresses block), no admin ever joined, a promised video call keeps slipping.
4. **Any request for money before an adoption**, reported to you by an adopter: advance payment, a
   "reservation fee", payment to a private card, pressure to pay quickly. This is the central fraud
   pattern; the product never touches money and never asks adopters for any.
5. **The same phone, bank holder, EDRPOU, address or reference on two shelters.** Only you can see it, by
   comparing your own notes (section 1, no cross-shelter check).
6. **Cards that do not match reality**: photos that look reused from elsewhere, one animal listed under
   several names, details that contradict the shelter's own freshness sentence.
7. **A donation link change** on an account that was quiet (a swapped link on a compromised account is the
   realistic fraud vector; the product holds a proposed link until you approve it). Check the host, and
   that the account holder matches the organisation (section 15).
8. **A sudden contact change** (history «Змінено контакти») shortly before complaints.

If an adopter's report arrives (no in-product channel): write down only what they said and the dates,
ask which animal and shelter, ask them not to pay anything, do not forward their details, and do not tell
them what you decided about the shelter. Then apply the triage below.

## 11. Triage

Decide on evidence, write the reason a shelter can read, keep the suspicion in your own notes.

**Low (an oddity, no harm shown).** Ask for more evidence (template A). If the shelter is pending or under
review, add what they send under «Докази для перевірки». Do not change status. Set yourself a date.
No answer by the date: move up.

**Medium (a signal is unexplained, or reachability is lost).**
- Pending or under review with an early listing running: «Зняти дозвіл» (template B). It is the
  smallest public step and reversible by a later allow (counts as a period).
- Pending or under review without one: leave it unlisted; «Відхилити…» with «Недостатньо доказів» or
  «Не вдалося підтвердити, хто стоїть за притулком» if the evidence cannot be completed.
- Verified: ask the shelter to pause itself if it agrees (it ends the public listing without any finding
  against it). The product gives you no pause button; if it declines, go to high or keep watching.
- Check the donation link and the contacts against the evidence; if the proposed link is wrong, «Відхилити»
  it. A live link that is wrong you clear with «Прибрати посилання…» (section 15).

**High (money requested in advance, impersonation, a confirmed false identity).**
1. Suspend now: «Призупинити…», code «Не вдалося підтвердити дані притулку» (or «Перевірена скарга»), with a
   neutral explanation (template C). Animals and pages disappear immediately.
2. Do not delete anything. Keep the history, the reveals and the support record.
3. Save the evidence off-repo (section 12) before you write to the shelter.
4. Pending or under review: you cannot suspend; reject («Відхилити…») and revoke any early listing first.
5. Decide later: reinstate (template D), keep suspended, or reject permanently.
6. Public warning to adopters is out of scope for the product (no channel). If you decide one is needed,
   that is a separate, careful step with a lawyer's eye, not a product feature.

## 12. What to record, and where

In the product (automatic): section 9. Check «Історія» after each action to confirm it landed.

Outside the repo, in your own private store (a password-manager note, a private doc, never the repo, never
chat with an assistant that logs, never a screenshot with faces or numbers in a public place):

- Date and time of each contact, channel, what was asked, what came back.
- The evidence reviewed and where the original sits (a pointer, not a copy).
- Who said what, as quotes; separate fact from impression.
- The decision, the reason code you chose, and the date you will look again.
- Any adopter report: date, what was alleged, nothing identifying beyond what you must keep.

Do not paste any of this into a PR, an issue, a commit message or a code comment.

## 13. Messages to the shelter

These Ukrainian messages are owner-approved (2026-11-06; D has a slot for the closing thanks). No
code uses them. They go out from your own mailbox, not from the product. Voice: «я», lowercase «ви», no «ми», no
exclamation marks, apostrophe ʼ. Square brackets are slots you fill by hand. Keep the reason factual and
neutral; never name a suspicion.

**A. Asking for more evidence**

> Добрий день. Я перевіряю заявку вашого притулку, і мені бракує одного підтвердження.
> Надішліть, будь ласка, [що саме: контакт ветклініки чи місцевої влади, що вас знає / дату можливого відеодзвінка].
> Щойно я його отримаю, я продовжу перевірку.
> Якщо щось незрозуміло, напишіть мені.

**B. Revoking early listing**

> Добрий день. Я знімаю дозвіл на показ ваших карток до завершення перевірки.
> Причина: [коротко і нейтрально, наприклад «мені бракує підтверджень»].
> Картки лишаються у вашому кабінеті, але люди їх поки не бачать.
> Надішліть [що саме], і я повернуся до перевірки.

**C. Suspending**

> Добрий день. Я призупиняю притулок на сайті: ваших тварин немає в галереї, а сторінки не відкриваються.
> Причина: [коротко, без звинувачень]. Пояснення ви бачите у своєму кабінеті.
> Щоб це обговорити, напишіть мені на цю адресу.
> Я відповім, щойно зможу.

**D. Reinstating**

> Добрий день. Я відновлюю притулок на сайті.
> [Якщо був верифікований: ваші тварини знову зʼявляться в галереї. / Якщо була пауза: притулок лишається на паузі, її знімаєте ви в кабінеті.]
> [Дякую, що надіслали підтвердження. / Дякую, що відповіли.]
> Якщо щось зміниться, напишіть мені.

## 14. Legal and privacy cautions

- **Do not publish accusations.** No post, no story, no name of a shelter or a person on any channel. A
  false or unproven public claim is your liability. The product's own 404 on suspension is deliberately
  indistinguishable from "never existed"; do not undo that by talking.
- **The note you write is read by the shelter**, may be shown to its other admins, and could be demanded
  in a dispute. Write only what you could defend.
- **Erasure:** a removed admin's account and email are erased by design (section 7). Honour a data-subject
  request the same way: no staged copies, no exports kept "just in case". The history rows keep no address
  after erasure; do not keep one in your own notes longer than the matter needs.
- **Adopters hold no identity here**, so there is nothing to erase or notify on their side. Do not try to
  re-identify a session from the `reveals` table.
- **The repo is public.** No real name, phone, EDRPOU, bank holder, address, screenshot or quote of a
  conversation in `docs/`, issues, PRs, test fixtures or commit messages. Use placeholders.
- **Evidence belongs to the people who gave it.** Keep it off shared drives and assistants' logs; delete it
  from your notes when the case is closed and no dispute is open.
- **Do not act on one adopter's word alone**; do not delete data to "make it go away" while a complaint is
  open.
- If a matter looks criminal (fraud against adopters), the next step is the police and a lawyer, not more
  product work. The audit trail above is the product's contribution.

## 15. Practical limits you will hit

- **Rate limits** (a refused call answers 429; wait, do not retry in a loop): the cabinet and registry
  take 100 requests a minute per signed-in user and 300 a minute per IP; sign-in links 5 an hour per
  address and 20 an hour per IP; password reset 3 an hour per address; invitation page 20 an hour per IP;
  shelter photo uploads 60 an hour and 300 a day per shelter; an anonymous adopter may reveal contacts of
  at most 30 distinct shelters in 24 hours and at most 100 new shelters per IP a day (the IP figure is an
  environment variable with that default); the public API takes 100 a minute. When the shared store is
  unreachable the limiters fail closed, so everything limited answers 429 until it returns
  (`docs/runbook.md`, section 1).
- **Photos after a suspension.** Suspending hides pages but does not delete or unlink any photo: the files
  stay referenced, stay in the bucket, and stay reachable to anyone who already has a file URL. The only
  automatic deletion is the daily clean-up (04:00 UTC), which removes a photo or logo only after it has been
  unreferenced for 7 days, re-checks right before deleting, and refuses a run that would delete more than
  100 objects (it logs `refused_over_cap`, deletes nothing, and only the CLI can raise the cap). A photo
  that must go (for example one showing a person) goes through that job too: take it off the card, then
  the job deletes it after the 7 days; over the cap, the `r2:cleanup` dry run then `--commit --max-delete
  <n>` (`docs/operator-leaving-and-erasure.md`, A step 8). Never delete files by hand. Nothing but that job
  deletes R2 objects, and the bucket has no versioning (`docs/runbook.md`, section 8).
- **Donation link rules.** A shelter only ever proposes a link; it is held until you decide, and the live
  link does not change meanwhile. The URL must be `https`. The provider is derived from the host (known
  bank and payment hosts are recognised, anything else is "other" and is not refused, so a host that looks
  like a bank but is not will not be flagged by the product: read the host yourself). A new proposal
  replaces the pending one. Before approving, check that the account holder matches the organisation
  (for an unregistered initiative: that the holder is its contact person); the screen reminds you:
  «Перевірте, що власник рахунку збігається з організацією», or for an initiative «Перевірте, що власник
  рахунку – контактна особа ініціативи». Since 2026-11-10 «Перевірено» no longer includes the
  bank-account check; it is a hand check at donation approval. When you approve a link, add the evidence
  «Власник банківського рахунку» (section 4), as long as the shelter is pending or under review.
  «Схвалити» makes the link live, «Відхилити» clears the proposal and leaves the
  current live link as it was. Both are single clicks with no reason field and no confirmation, and
  are recorded in the history and shown to the shelter. To take a live link down, use
  «Прибрати посилання…» (section 1): it asks for «Причина» and a required «Пояснення».

  **Approving a link on an already verified shelter.** The evidence list is closed after the decision
  (section 4), so «Власник банківського рахунку» cannot be added. Check the account holder the same way
  and record the result in your own notes (section 12). The approve step has no comment field, so the
  product keeps no record of this check.

## 16. A shelter leaving, and a personal-data deletion request

Its own runbook: `docs/operator-leaving-and-erasure.md`. Scenario A, a shelter that stops participating
(identity check, hide, remove admins, `demo:remove`, photo clean-up, confirmation); scenario B, a request
from a shelter admin, a shelter's contact person or an adopter to delete their data (what can go today,
what needs a tool). It lists the gaps that only the owner can build or decide.
