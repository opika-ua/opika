# Shelter passwords: copy sheet (for Oleksii's Ukrainian)

**His Ukrainian for every row is in `docs/shelter-passwords-copy-uk.md`** (2026-10-19, verbatim, the source the build copies from). This sheet keeps the keys, the English sense and where each string appears.

One row per new string for the passwords work (`docs/shelter-passwords.md`). The **Ukrainian**
column is yours. Rows already filled hold your own words from the scope or the §9 answers, quoted
verbatim. Everything else gives the **English sense** only: nothing here is drafted in
Ukrainian. Keys are proposals and can be renamed freely. `{…}` are placeholders the code fills.

Conventions as in your other sheets: ʼ (U+02BC), «…» at the top level and „…" nested, no «ми»
in your voice, no «реєстр».

## A. Sign-in page (`/kabinet/vkhid`) — PW-1

| Key | English sense / where | Ukrainian |
|---|---|---|
| `kabinet.signIn.passwordLabel` | the password field's label | |
| `kabinet.signIn.showPassword` / `hidePassword` | the eye toggle's accessible names | |
| `kabinet.signIn.submitPassword` | the main button: sign in | |
| `kabinet.signIn.useLink` | the secondary way in, the existing magic link | «Надіслати посилання для входу» (yours, scope item 3) |
| `kabinet.signIn.forgot` | link to the reset page | «Забули пароль?» (yours, scope item 3) |
| `kabinet.signIn.wrongCredentials` | the **one** generic error for every failure: wrong email, wrong password, no password yet, the operator. It must not hint which | |
| `kabinet.signIn.throttled` | the delay message, the same for every address | «Забагато спроб входу. Спробуйте ще раз через {minutes} хв.» (yours, §9 Q5; pinned for several values) |

## B. Invitation: «Створіть пароль» (`/kabinet/vkhid?zaproshennia=…`) — PW-2

| Key | English sense / where | Ukrainian |
|---|---|---|
| `kabinet.setPassword.title` | the page heading | «Створіть пароль» (yours, scope item 2) |
| `kabinet.setPassword.intro` | one line naming the shelter, `{shelter}`, and the address the access is for (masked, `{email}`) | |
| `kabinet.setPassword.newLabel` | the password field | |
| `kabinet.setPassword.repeatLabel` | the repeat field | |
| `kabinet.setPassword.hint` | the live hint under the field: the length so far against the minimum (`{count}` of 10). Shown while typing | |
| `kabinet.setPassword.submit` | the button: set the password and enter the kabinet | |
| `kabinet.password.tooShort` | the refusal: fewer than 10 characters (`{min}`) | |
| `kabinet.password.tooLong` | the refusal: more than 128 characters (`{max}`) | |
| `kabinet.password.common` | the refusal: on the common-password list. Say plainly that it's too easy to guess | |
| `kabinet.password.personal` | the refusal: contains the email's local part, the shelter's name, or "opika" (your §9 Q2) | |
| `kabinet.password.mismatch` | the two fields differ | |
| (reused) | an expired, used or unknown invitation: today's `inviteLanding` unusable and already-accepted states | — |

## C. Forgot password (`/kabinet/vkhid/zabuly`) — PW-1

| Key | English sense / where | Ukrainian |
|---|---|---|
| `kabinet.forgot.title` | the page heading | |
| `kabinet.forgot.intro` | one line: enter the address you sign in with | |
| `kabinet.forgot.submit` | the button: send a reset link | |
| `kabinet.forgot.sent` | the **always-same** answer, true whether or not the address belongs to anyone: if it is a shelter admin's address, a link is on its way, valid for 1 hour (`{minutes}`) | |
| `kabinet.forgot.throttled` | too many requests for now (the same for every address) | |

## D. New password from a reset link (`/kabinet/vkhid/novyi-parol`) — PW-1

| Key | English sense / where | Ukrainian |
|---|---|---|
| `kabinet.reset.title` | the page heading | |
| `kabinet.reset.submit` | the button: save the new password | |
| `kabinet.reset.done` | success: the password is changed, every other session has ended, sign in now | |
| `kabinet.reset.invalidLink` | the link expired or was already used; ask for a new one (link to the forgot page) | |
| (shared) | the four refusals, the hint and the mismatch from §B | — |

## E. Kabinet: change password — PW-1

| Key | English sense / where | Ukrainian |
|---|---|---|
| `kabinet.changePassword.title` | the section heading | «Змінити пароль» (yours, scope item 7) |
| `kabinet.changePassword.currentLabel` | the current password field | |
| `kabinet.changePassword.submit` | the button | |
| `kabinet.changePassword.done` | success: changed; other devices are signed out, this one stays | |
| `kabinet.changePassword.wrongCurrent` | the current password is wrong | |
| `kabinet.changePassword.noPasswordYet` | an admin who signed in by link and has no password yet: set one through «Забули пароль?» (your scope item 9) | |
| (shared) | the four refusals, the hint and the mismatch from §B | — |

## F. Emails — PW-1 (both sent through Resend, no tracking, the exact-payload test)

**F1. The reset link**

| Key | English sense | Ukrainian |
|---|---|---|
| `kabinet.email.reset.subject` | the subject: resetting the kabinet password | |
| `kabinet.email.reset.intro` | someone asked to reset the password for this address | |
| `kabinet.email.reset.action` | the button | |
| `kabinet.email.reset.expiry` | the link works once and for `{minutes}` minutes | |
| `kabinet.email.reset.notYou` | if you didn't ask, ignore this; the password stays as it was. Signed `— {operator}` like the other emails | |

**F2. The notice, after a reset and after a change (your §9 Q4)**

| Key | English sense | Ukrainian |
|---|---|---|
| `kabinet.email.passwordChanged.subject` | the subject: the password was changed | «пароль змінено» is yours (scope item 6); the subject line around it is yours to write |
| `kabinet.email.passwordChanged.body` | the kabinet password for this address was just changed; other devices were signed out | |
| `kabinet.email.passwordChanged.notYou` | if it wasn't you, write to me | «…якщо це не ви — напишіть мені» (yours, scope item 6), with `{contact}` and `— {operator}` |

## G. Public pages — public claims

| Key | English sense / where | Ukrainian |
|---|---|---|
| `forShelters.signInLink` | /prytulkam: a link to the kabinet sign-in | «Увійти в кабінет» (yours, scope item 1) |
| `about.data` (one new sentence) | /pro: for kabinet admins only an irreversible hash of the password is stored, never the password itself | «зберігається лише незворотний хеш» is yours (scope item 10); the full sentence is yours to write |
| `about.data` (one new sentence) | /pro: how long a kabinet session lasts, 30 days of inactivity and at most 90 days (F-B9) | |

## Notes for writing

- **The generic error (A) must not differ by cause.** The tests pin one string for all four
  causes.
- **«Забули пароль?» exists only for shelter admins.** The operator never gets a reset email, but
  the forgot page's answer (C, `sent`) must still be the same for every address, the operator's
  included.
- **Counting:** "10 characters" is counted as a reader counts (a flag emoji is one), the same rule
  as the shelter-name cap.
- **Plurals:** `{minutes}` in A's delay message and F1's expiry, and `{count}` in B's hint, get
  pins for each Ukrainian plural form a value can take, as your other numbered strings do.
