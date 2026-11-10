# Operator runbook: a shelter leaving, and a personal-data deletion request

For the owner, the only operator. A companion to `docs/operator-playbook.md` (section numbers below
are that file's). Same rules: steps only, no real shelter, person, number or address here, ever; case
notes live off-repo (playbook section 12). Checked against the code on the default branch when written;
if code and this page disagree, the code wins, then fix the page.

Not legal advice. Everything that touches Neon, R2 or Vercel is yours to run; nothing here asks an
agent to.

## What exists today (read first)

- **Hide a shelter at once:** «Призупинити…» (verified or paused) or «Відхилити…» (pending or under
  review). Both answer 404 on the shelter page and every animal page and take the animals out of the
  gallery; suspension also takes a live donation link off the pages (playbook sections 2 and 6).
- **Close an admin's access and erase the account:** «Прибрати» under «Адміністратори». When the
  address has no access to another shelter and no live invitation elsewhere, the account is deleted and
  the address is replaced by a placeholder in every history line and invitation, in the same operation
  (playbook section 7; `docs/gdpr-analysis.md`, fix 4, "Decided, 2026-10-24: A").
- **Delete a shelter with everything attached:** only the owner-run `demo:remove --shelter <id>`
  (animals, reveals on its animals, history, organisation and invitations). No screen deletes a shelter.
- **Photo files:** only the R2 clean-up job deletes them, once unreferenced for 7 days (daily scheduled
  run, or the `r2:cleanup` CLI). Nothing else deletes R2 objects.
- **Not built:** a soft archive (item 7 on the owner's list); any scrub of a value from history,
  evidence or reveal snapshots; any way to find or erase an adopter's rows. Each is marked **GAP** or
  **NEEDS TOOL** where it bites.

## A. A shelter wants to leave

1. **Log the request** in your own records (template line at the end). Do nothing public yet.
2. **Check who is asking.** Only a joined admin of that shelter may ask (under «Адміністратори», status
   «Має доступ»). Always send template E **to the admin address on file**, even when the request came
   from it (a matching From address alone can be forged), and tell the sender nothing about the shelter
   if it came from anywhere else. **Nothing changes until a reply to that mail arrives**, and no
   `--commit` (step 7) without it. A shelter with no joined admin: confirm by a call to the phone in its
   contacts and note the call.
3. **Open complaint or investigation on this shelter?** Then do steps 4 and 5 only and stop: hide, do not
   delete, until the matter is closed (playbook sections 11 and 14).
4. **Hide it now.**
   - Verified or paused: «Призупинити…», code «Інше», explanation = template F.
   - Pending or under review: «Відхилити…», code «Інше», explanation = template F (it also ends any
     early listing).
   - Suspended or rejected: already hidden; nothing to do.
   - Check: the shelter's public page answers 404.
5. **Remove every admin and pending invitation:** «Прибрати» on each, and confirm. Sessions end at once;
   erasure happens as described above. Check «Історія»: each removal is there, the address shown as
   «адреса видалена».
6. **Keep or delete?** The `/prytulkam` promise (`howToLeave`) is «напишіть, і я приберу все: тварин,
   фотографії, ваш запис», so delete unless the shelter asked to keep its record (for a later return).
   - **Keep:** stop here. The shelter stays suspended or rejected, which in your screens looks the same
     as a disciplinary decision. **GAP: soft archive (item 7) is not built.**
   - **Delete:** go on.
7. **Delete with `demo:remove`** (`docs/onboarding-a-shelter.md`, "Removing your own test shelters").
   1. Rehearse first on a **fresh Neon child branch** of production, `PROD_NEON_ENDPOINT` set, the
      child's direct URL in your shell, `--expect <child ep- id>` and no `--prod`: dry run, `--commit`,
      dry run again. Delete the child branch afterwards.
   2. Production, from the repo root checkout: dry run
      `pnpm --filter @opika/db demo:remove --expect <production ep- id> --prod --shelter <id>`.
      Check the name it prints, and that it lists no refusal. It also refuses when no other shelter
      would remain (playbook section 7); then the site would be empty, so stop and decide.
   3. **Refused for a support session** (you once used «Переглянути як притулок» on it): stop. Support
      records are never deleted, so this shelter cannot be deleted today, and the promise in step 6
      cannot be kept in full. It stays hidden; do not send template G; decide with the count in front
      of you. **GAP.**
   4. Same command with `--commit`. Then the dry run again: it must refuse with "no shelter has id".
8. **Photos and logo.** After step 7 nothing references them; the daily clean-up deletes them once they
   have sat unreferenced for 7 days. Each photo is 5 objects, and a run due to delete more than 100
   deletes none (`refused_over_cap` in the log). So for a shelter with more than 20 photos, after the
   grace: `pnpm --filter @opika/db r2:cleanup --expect <production ep- id> --prod` (dry run, read the
   count), then the same with `--commit --max-delete <that count>`. Never `--grace-days 0` here: it
   would also take other shelters' photos still inside their grace. Do not delete files by hand.
   The CDN edge drops a deleted file within 4 hours only for objects uploaded after the `s-maxage`
   change (`docs/onboarding-a-shelter.md`, "Image caching"); a browser that already loaded one may keep
   it for up to a year (`max-age=31536000`).
9. **Send template G** to the admin address once step 7 has passed (it was erased from the database,
   not from your mailbox). Put in it the date by which step 8 will be done. Keep its bracketed sentence
   about the address **only when step 5's history shows «адреса видалена» for every admin**: an admin
   with another shelter, a live invitation elsewhere or an operator role keeps the account.
10. **Close the log line.** Delete your own notes on the shelter when no dispute is open (playbook
    section 14).

**What stays after a deletion, and why:**

| What | Why |
|---|---|
| Contacts adopters already received | They are in those people's hands; nothing in the product reaches adopters |
| Adopter rows that pointed at the shelter | Only the anonymous `adopters` rows; the 6-hourly clean-up removes them once nothing hangs off them |
| Neon restore history | Deleted rows stay restorable for the plan's retention window (`docs/runbook.md`, section 4) |
| The mail provider's own sending logs | Its own retention (`docs/gdpr-analysis.md`, G2) |
| Your mailbox and your notes | Yours to delete (step 10) |

## B. A personal-data deletion request from a person

**Response time: 30 calendar days from the request** (owner decision 2026-11-10). GDPR Art. 12(3) gives
one month; the owner also cites Art. 16 of the Ukrainian personal data law. The privacy policy (Phase H5)
will state the same number when it is written.

1. **Log the request** (template line at the end).
2. **Who may ask:** the person the data is about, for their own data only. A shelter's admin may also
   ask about the shelter's own records (that is scenario A).
3. **Identity check:** reply only to an address or phone that is already on file for that person (the
   admin address, the contact channel), never only to the sender: a matching From address alone can be
   forged. **Nothing changes until that channel confirms.** Never ask for an identity document, and
   never ask an adopter for their cookie value or a session token.
4. **Find the case in the table and do what it says.**

| Person | Where their data is | What you can do today |
|---|---|---|
| Shelter admin (account holder) | `auth_user`, `auth_account`, `auth_session`; their address in history lines and invitations | «Прибрати» on every shelter they belong to. Erasure follows automatically once no shelter remains (playbook section 7). If they are the shelter's only admin, invite the replacement first, or the shelter loses its cabinet |
| Invitee who never joined | Same | «Прибрати» withdraws it; an expired one is erased by the 6-hourly clean-up |
| A shelter's contact person (phone, name, email in its public contacts) | `shelters.contact`; the old value in `contact_changed` history lines; `reveals.shelter_snapshot` | The shelter's admin replaces the contact in its cabinet (it goes off the public pages at once). **NEEDS TOOL** for the history lines and snapshots |
| Named person in legal data (an initiative's contact person, a sole proprietor's name) | `shelters.legal_entity`; `verified_data_changed` history lines | No screen edits it: the API call exists (`registry.shelters.updateVerifiedData`), its form is not built, and a change keeps the old value in history. **NEEDS TOOL** |
| A reference, a bank account holder, video-call notes (evidence) | `shelters.verification` | Evidence can only be added, never edited or removed. **NEEDS TOOL** |
| A person shown in a photo or a logo | R2, referenced from `animals.photos` / `shelters.logo` | The shelter removes the photo or logo in its cabinet; the clean-up job deletes the files after 7 days. Not faster: nothing else deletes R2 objects |
| Adopter | `sessions`, `adopters`, `reveals` (no name, email or phone); the saved list only in their browser | Nothing to look up by: you cannot find their rows without their cookie, and must not ask for it. Without reveals, the clean-up deletes their rows within about 31 days. With a reveal, the rows are kept (G3). Send template I. **NEEDS TOOL** |

5. **Locate, read-only, if you need to know where a value sits** (an address, a phone in E.164, a name
   exactly as stored). Owner-run, **on a fresh Neon child branch of production**, never on production,
   and paste nothing from the result anywhere outside your own notes:

   ```sql
   -- READ ONLY. Replace <value>; counts only, no rows printed.
   WITH n AS (SELECT '<value>'::text AS v)
   SELECT 'shelters' AS place, count(*) FROM shelters, n
     WHERE contact::text ILIKE '%' || n.v || '%'
        OR legal_entity::text ILIKE '%' || n.v || '%'
        OR verification::text ILIKE '%' || n.v || '%'
   UNION ALL SELECT 'shelter_history', count(*) FROM shelter_history, n
     WHERE entry::text ILIKE '%' || n.v || '%'
   UNION ALL SELECT 'reveals', count(*) FROM reveals, n
     WHERE shelter_snapshot::text ILIKE '%' || n.v || '%'
   UNION ALL SELECT 'auth_user', count(*) FROM auth_user, n
     WHERE lower(email) = lower(n.v)
   UNION ALL SELECT 'auth_invitation', count(*) FROM auth_invitation, n
     WHERE lower(email) = lower(n.v);
   ```

   There are **no write statements** here on purpose: no documented safe path exists for a scrub, so a
   hand-written UPDATE on production is not an option. Where the table says NEEDS TOOL, tell the person
   plainly what was removed and what stays (template H).
6. **Answer** with template H (or I for an adopter), then close the log line.

## Gaps (owner to build or decide)

1. **Soft archive** (item 7): "leave but keep the record" is an indefinite suspension today (A, step 6).
2. **Support session blocks deletion:** a shelter you ever viewed in support mode cannot be deleted, so
   the `/prytulkam` promise «приберу все» fails for it (A, step 7.3). Decide: allow deleting or
   anonymising the support record, or narrow the promise. The future «Увійти як притулок · зі змінами»
   mode must not block `demo:remove` the same way.
3. **NEEDS TOOL, value scrub:** an owner-run script, dry run then `--commit`, that replaces one exact
   value (phone, email, name) with a placeholder in `shelters`, `shelter_history`, evidence and
   `reveals.shelter_snapshot`, in one transaction, the same shape as the admin erasure. Tier 1.
4. **NEEDS TOOL, adopter erasure:** a «forget this device» action on the site that deletes that
   session's reveals, session and adopter row, in that order (`docs/gdpr-analysis.md`, G4). Tier 1.
5. **Legal data edit form:** not built, so a wrong or withdrawn name in legal data cannot be corrected
   from a screen (B, table).
6. **Clean-up cap:** a leaving shelter with more than 20 photos always needs the manual
   `r2:cleanup --max-delete` run (A, step 8).

## Log line (your own records, never the repo)

```
<date> | <leave / data request> | from: <channel> | identity: <how confirmed, date>
  | shelter: <id> | done: <hide, admins removed, demo:remove counts, r2 run date>
  | reply: <template, date> | open: <none / what>
```

## Messages

**Proposed, pending the owner's approval in the PR that added this page.** Same voice as playbook
section 13: «я», lowercase «ви», no «ми», no exclamation marks, apostrophe ʼ. Square brackets are slots.
They go out from your own mailbox; F goes into the suspend or reject dialog and the shelter reads it.

**E. Confirming a leave request (to the admin address on file)**

> Добрий день. До мене надійшов запит прибрати притулок [назва] із сайту.
> Підтвердіть, будь ласка, відповіддю на цей лист, що це ваше рішення.
> Після цього я приберу притулок із сайту і видалю тварин, фотографії та запис притулку.
> Якщо вам потрібна лише перерва, у кабінеті є «Призупинити прийом звернень», і тоді нічого видаляти не треба.
> Якщо ви цього не просили, напишіть мені, і я нічого не змінюватиму.

**F. Note in the suspend or reject dialog**

> Притулок прибрано із сайту на ваше прохання.

**G. Shelter removed**

> Добрий день. Притулку [назва] більше немає на сайті.
> Тварин, історію та запис притулку видалено, доступ до кабінету закрито. [Лише якщо так, див. крок 9: вашу адресу пошти видалено.]
> Файли фотографій зникнуть зі сховища до [дата].
> Контакти, які люди вже отримали на сайті, лишаються в них, і забрати їх я не можу.
> Якщо захочете повернутися, напишіть мені.

**H. Data request answered**

> Добрий день. Ваш запит щодо ваших даних виконано.
> Видалено: [що саме].
> Лишається: [що саме і чому, наприклад «запис в історії притулку, що адміністратора додано і прибрано, без вашої адреси»].
> Якщо маєте питання, напишіть мені на цю адресу.

**I. Adopter's request**

> Добрий день. Сайт не зберігає ні імені, ні пошти, ні телефону тих, хто шукає тварину, тож знайти ваші дані за листом я не можу.
> Збережені тварини є лише у вашому браузері. Щоб прибрати їх і позначку вашого пристрою, очистьте дані сайту в налаштуваннях браузера.
> Якщо маєте питання, напишіть мені на цю адресу.
