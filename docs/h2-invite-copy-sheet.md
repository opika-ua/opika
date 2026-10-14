# H2 invite copy sheet: keys and context, for Oleksii's Ukrainian

Inbox IN-Q5 (Oleksii, verbatim: "Q5: accepted. Draft the second copy sheet with keys and
context only; I'll bring the Ukrainian."). The `/prytulkam` commitment sentences (A1–A3, B1)
stay on the first sheet, `docs/h2-copy-sheet.md`; this sheet is the emails and the invite
landing only.

Every key below ships as `[COPY PENDING]` until its Ukrainian is written here, and an email
refuses to send in production while any of its text is still `[COPY PENDING]` (IN-Q5's
recommendation, accepted). For each string you get the key, where it shows, and the English
sense of what is true. The English describes the facts. It is not a draft to translate.

The product name is not final ("the name is not final" in CLAUDE.md), so no string here may
name it. A sender name, where one is needed, comes from app config, never from a key.

---

## E1. The magic-link email (sign-in)

Sent when a person asks to sign in (K1) or, once, when the invite landing sends the invited
address its link (IN-Q3). The only email whose link signs someone in.

| Key | Where | English sense |
|---|---|---|
| `kabinet.email.signIn.subject` | Subject line | A sign-in link for the shelters' cabinet. |
| `kabinet.email.signIn.intro` | First line of the body | Someone asked to sign in with this address. |
| `kabinet.email.signIn.action` | The link's label in the HTML part: a label, never the URL (IN-E8); the plain-text part shows the raw URL | Open the sign-in page. **Oleksii's draft (IN-E8, given as "e.g.", not final):** «Відкрити сторінку входу» |
| `kabinet.email.signIn.expiry` | Under the link | The link works once and expires in 15 minutes (`MAGIC_LINK_TTL_SECONDS`; the value is filled in, never typed into the string). |
| `kabinet.email.signIn.notYou` | Last line | If you didn't ask for this, ignore the email: nothing happens without the link. |

## E2. The invite email

Sent when the operator invites an admin (`registry.admins.invite`, or the first admin on
`registry.shelters.create`). **It is not a sign-in link** (IN-Q3): it links to the invite
landing, which sends a fresh magic link to the invited address only.

| Key | Where | English sense |
|---|---|---|
| `kabinet.email.invite.subject` | Subject line | You're invited to manage a shelter's listings in the registry. |
| `kabinet.email.invite.intro` | Body | The operator (by display name, from config) invited this address to administer «shelter name» (filled in). |
| `kabinet.email.invite.what` | Body | What the cabinet lets them do (the read-only "your shelter" view in the first screens PR; editing comes later). State only what exists when this ships. |
| `kabinet.email.invite.action` | The link's label in the HTML part: a label, never the URL (IN-E8); the plain-text part shows the raw URL | Open the invitation. |
| `kabinet.email.invite.expiry` | Under the link | The invitation stays valid for 72 hours; the operator can send it again (`INVITATION_TTL_MS`, filled in). |
| `kabinet.email.invite.notYou` | Last line | If this isn't expected, ignore it: nobody gets access without signing in from this address. |

**How the invite email is written (IN-E14; Oleksii, verbatim, relayed by the coordinating
session):** "it's written as a short personal note from me; it names the shelter; plain
sentences, no campaign verbs (запрошуємо / приєднуйтесь / керуйте)." Why (IN-E6): the
delivery test's invite landed in Gmail's Promotions tab with the same authentication headers as
the magic link, which reached the Inbox, so the wording is what Gmail classified as marketing.
The English senses above describe facts, not tone; this note governs the tone.

## R. After an invite is sent: the operator's reminder (planned, not built)

Planned for the next email track (IN-E13), not in `uk.ts` yet. Shown in the procedure result
and, later, in the operator UI, after a successful invite send.

| Key | Where | English sense |
|---|---|---|
| `kabinet.registry.inviteSent.tellPersonally` | Operator's screen, after a successful invite send | A reminder to tell the shelter personally that the invitation was sent, from which address, and that it may be in the Promotions tab. The sender address should be filled from config, never typed into the string (the name is not final). **Oleksii's draft (IN-E13, verbatim, relayed):** «Надіслав вам запрошення з noreply@mail.opika.org.ua — якщо не бачите, гляньте у вкладці "Промоакції"» |

## C. The sign-in card's fallback line (screens PR)

The "check your email" card is the same for every address (anti-enumeration), so it can't say
a send failed or was blocked. This line gives the person a human to write to instead (IN-E7).

| Key | Where | English sense |
|---|---|---|
| `kabinet.signInCard.notArrived` | Under «check your email», in the «я» voice | If the email hasn't arrived in a few minutes, write to me at {contact} (the address is filled from config, never typed into the string). **Oleksii's draft (IN-E7, "draft; final copy via the copy sheet"):** «Якщо лист не прийшов за кілька хвилин, напишіть мені на hello@opika.org.ua» |

## L. The invite landing (screens PR)

The page the invite email links to. It sends a magic link to the invited address only, never
to an address typed on the page. The invitation is accepted automatically on that address's
first sign-in, so there is no accept screen (IN-Q3).

| Key | Where | English sense |
|---|---|---|
| `kabinet.inviteLanding.title` | Heading | An invitation to administer «shelter name». |
| `kabinet.inviteLanding.body` | Under the heading | We'll send a sign-in link to the invited address (masked, e.g. o•••@gmail.com); signing in with it accepts the invitation. |
| `kabinet.inviteLanding.send` | Button | Send the sign-in link. |
| `kabinet.inviteLanding.sent` | After sending | Check that inbox; the link works once and expires in 15 minutes. |
| `kabinet.inviteLanding.expired` | Invitation expired or withdrawn | This invitation is no longer valid; ask the operator to send a new one. |
| `kabinet.inviteLanding.alreadyAccepted` | Already a member | This invitation was already accepted; sign in as usual. |
| `kabinet.inviteLanding.rateLimited` | Too many requests | Too many links were requested; try again later (the sign-in limits already in place). |

**Changed by IN-Q11** (Oleksii, 2026-10-13): opening the invite page *sends* the link, so there
is no Send button. `kabinet.inviteLanding.send` goes, and `body` + `sent` merge into one
"we've sent a sign-in link to o•••@gmail.com" message. Not built yet; the keys above don't
exist in code.

## C. The confirm page (IN-Q11)

The page every emailed sign-in link opens. Its GET only shows the button; pressing it signs in
(a mail scanner opening the link changes nothing). Once acceptance is built (IN-Q12), the same
press also accepts a pending invitation, and the page may name the shelter it's for. In code
now as `[COPY PENDING]`, pinned in `copy-status.test.ts`.

| Key | Where | English sense |
|---|---|---|
| `kabinet.confirm.title` | Heading and tab title | Sign in to the shelters' cabinet. |
| `kabinet.confirm.intro` | Under the heading | Press the button to finish signing in. |
| `kabinet.confirm.submit` | The one button | Sign in (Oleksii's working label in IN-Q11: «Увійти»). |
| `kabinet.confirm.invalid` | After a failed press, or a malformed link | This link has already been used or has expired. |
| `kabinet.confirm.requestNew` | Link under it, to K1 | Request a new link. |
| `kabinet.confirm.invitationFor` | Under the heading, when a pending invitation exists (after IN-Q12) | You're joining «shelter name» (filled in). Not in code yet. |
| `kabinet.confirm.joinFailed` | `/kabinet`, signed in but the invitation couldn't be completed (after IN-Q12) | Joining didn't finish; reload, or ask the operator. Not in code yet. |

## H. The shelter's history: an admin joined (IN-Q14)

One line in the shelter's history (operator S3/S4 and the shelter's own view) when an invited
person signs in and the invitation is accepted. The email is the one stored at join time, never
looked up again. In code now as `[COPY PENDING]` with both drafts quoted inside it, pinned in
`copy-status.test.ts`. No history renderer exists yet, so nothing shows it.

| Key | Where | English sense | Oleksii's draft (IN-Q14, not final) |
|---|---|---|---|
| `kabinet.history.adminJoined` | One history line; `{email}` filled in | This address now has access to the shelter's cabinet. | «{email} отримує доступ до кабінету» · alternative: «Новий адміністратор: {email}» |

Ukrainian past tense is gendered, so neither draft uses «приєднався/приєдналася» (Oleksii,
IN-Q14).

---

The sending domain (`mail.opika.org.ua`, IN-Q2a) is config, never part of a string: the name is not final.
