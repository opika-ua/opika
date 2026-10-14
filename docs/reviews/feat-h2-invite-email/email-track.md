# Review: feat/h2-invite-email, uncommitted email track (Tier 1, synchronous)

VERDICT: STOP (blocks #94's merge to main, not this commit or the merge into feat/h2-invite)

VERIFIED | TAKEN ON TRUST
---|---
12 touched apps/web test files: 234/234 pass. i18n 36/36, contracts kabinet 172/172 | Builder's full `pnpm check` (2038 unit, harness 221/3 skipped), log not re-run
`tsc --noEmit --incremental false`: apps/web, i18n, contracts, db all exit 0 | page.tsx shell: 404 while unavailable, the `clientIp` derivation, the signed-in redirect (no rendered test of the page itself)
Reply-To on Resend/Postmark/Brevo request bodies; apex `hello@example.org` accepted on `https://example.org`; `mail.` subdomain and look-alike domains rejected (tests read) | That Brevo's blockedContacts behaves as the fake does (never called, by instruction)
A2: paragraphs 1–2 byte-identical to origin/main; paragraph 3 exactly the provisional text; only `whenAnimalFindsHome` changed in forShelters | Oleksii's answers as relayed (the inbox says so honestly)
Mutation spot-check: copy gate disabled → 2 tests red ("expected { kind: 'on' … } to deeply equal { kind: 'off' … }", names `kabinet.email.invite.notYou`). Restored. The other 14 mutation lines are present and each describes a real break |
Probe (reverted): Better Auth `rateLimit` on → 6 invitees, 6 IPs → `sent×5, send_failed` |
`git merge-tree` with feat/h2-invite: clean; no-self-serve-yet scans skip test files |

FINDINGS (most severe first)
1. [STOP] uk.ts `forShelters.whenAnimalFindsHome` — «Кабінет притулку вже є» goes live on /prytulkam when #94 merges, but production sign-in stays off (404) until every `kabinet.*` string is final. A shelter told the cabinet exists can't open it. That is commitment 6 made false for that window (EM-Q1 names it). The commitments-table row calls it "accurate" and doesn't mention the window.
2. [High] invite-landing.ts:`sendMagicLinkThroughAuth` — the request it builds carries no client-IP header. In production (`rateLimit.enabled ?? isProduction`), Better Auth keys it to its shared `no-trusted-ip` bucket: the magic-link rule allows 5 per 60 s for every landing open in the instance put together.
   Failure scenario: a mail scanner opens 5 invite links → every other invitee gets `send_failed` for a minute, and their per-address unit is still spent. Evidence: the probe above. Tests run with NODE_ENV=test, so this can't fail today. Fix: forward `x-forwarded-for` from the page's headers, plus a test with rateLimit enabled.
3. [Medium] page.tsx — every scanner GET or HEAD sends an email and spends one of the 5 per-address units an hour. That is bounded, as Oleksii accepted, but the volunteer's own open can then read `rate_limited`, and K1's form silently sends nothing for up to an hour. Record it in the inbox. PR #95: the landing goes around the auth route, so a limit #95 adds at the route won't apply here unless it also lands in `inviteLandingOf`.
4. [Low] registry-email-status.ts — "paged at most once per cache window" only holds if the wiring commit builds `cachedBlockList` once, at module scope. Nothing is wired yet, so it is unverified. Carry it into the IN-E11 wiring checklist.
5. [Low] `BlockListScan.complete` also means "stopped early" (`stopWhen`). Safe today, since only `blockedStatusOf` passes it. A later `stopWhen` passed through `cachedBlockList` would cache a partial list as complete.

Checked, no finding: registry-only access through `implement` (19/20 counts updated); unknown results never cached; matching filtered per shelter; no logging; reminder on every `sent` for create, invite and resend; the copy gate reads the live catalogue, covers `kabinet.email.*`, and leaves development alone; IN-T9 takes its address from config.

SIMPLIFICATIONS
- views.ts `InvitationReminderSchema.text`: return `{ kind, sender }` and let the operator UI render the catalogue string. That keeps UI copy out of the contract. What breaks: the API no longer returns paste-ready text.

STOP REASON
Needed from Oleksii, before #94 merges: (a) his final yes on A2, and (b) whether A2 waits until production sign-in is on (or the sentence is qualified), or he accepts the window where the cabinet "exists" but can't be opened. Finding 2 is ordinary work and doesn't need him.

TESTS
apps/web touched: 12 files, 234 passed. i18n: 4 files, 36 passed. contracts kabinet: 172 passed.
