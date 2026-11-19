# Handoff, 2026-11-19 evening

Main is at `0c78d04` (#546). Today's queue is empty. Production: migration 0030 applied by the owner; nothing else was written to production today.

## Merged today
| PR | What |
|---|---|
| #530 | Guard tests anchor sites by file, symbol and text, not line numbers (night) |
| #533 | R1 kit: field errors, `ErrorSummary`, `PasswordField`, auth card footer, assistance line (night) |
| #534 | R4 date row: the month gets its own row on phones (night) |
| #531 | The adopter contact is optional at registration; publishing needs one (migration 0030, `shelters_contact_check`). No-contact banner variant, «Контакти: не вказано» |
| #536 | The animal-page HTML budget counts content only (chunk references stripped) |
| #538 | The styled 404 moves under a root catch-all; the root `not-found` stays minimal. Every page's payload lost a second header copy (−4.8 KB on the animal page) |
| #539 | Smoke-sitting template: a folder per PR and head, stop on any failed step, HEAD check before any database step |
| #544 | Budget 80,000 |
| #537 | `onboard:shelter` refuses animals for a shelter still at the application stage |
| #542 | The applications smoke restores its draft's photos |
| #535 | R2: `/prytulkam` two-step registration, content groups, signed-in states (A2/A3), sign-in page |
| #543 | R4: autosave footer. No «Зберегти» on drafts; «Зберегти зміни» on listed cards only with edits; the kit's disabled style is app-wide |
| #532 | R3: the email-link pages inside the app (confirm, «Це не я»), button by session, `no-store` on token pages |
| #545 | Verification: «відкриті джерела» as an evidence basis. Registered forms: registry entry + (call or open sources). Initiatives (a′): (call or open sources) + one reference. Early listing: any one of open sources, a call or a reference, for any form |
| #547 | English: "Dashboard" for the kabinet |
| #541 | R5 verification wording: open sources, no promised call; §6b scoped to unregistered initiatives; `verification-claim.test.ts` checks the live copy against the policy |
| #546 | Header: «Кабінет притулку» as an outline entry. On a phone it is the menu's last item. Budget 81,000 (the animal page measures 79,802) |

## Pending on Oleksii
1. **Production clean-up**, commands in `Claude outputs\prod-steps-2026-11-19-evening.md` (dry runs first; only the `--commit` steps write):
   - `shelters:delete-test` for the two rehearsal shelters; paste the two log blocks back for the rehearsal-log docs PR;
   - `invitations:legacy --commit --expect 11`.
2. Then, per the pre-flag order:
   - the launch flag `SELF_REGISTRATION_ENABLED=1` (Vercel env);
   - send the registration link to the 11 legacy shelters.
3. Optional: R4 on the phone, run-book `Claude outputs\run-r4-on-phone-2026-11-19.md` (local database only; `NODE_ENV=test` for the build and the server).
4. Remove the merged worktrees, then `pnpm db:prune-test-dbs --yes`:
   ```
   pnpm worktree:remove D:/opika-worktrees/en-dashboard
   pnpm worktree:remove D:/opika-worktrees/header-kabinet
   pnpm worktree:remove D:/opika-worktrees/r5-wording
   ```
   The session's own `worktree:remove` calls are blocked because its command line names the path.

## Open items
- **#540:** keep used registration email tokens with `used_at` instead of deleting them, so E2 «Email уже підтверджено.» and E6 «Заявку вже видалено.» get their own cards. It's a migration (reviewer and sitting). Until then both show the expired card (accepted).
- **Erased registrant (backlog):** the smoke check "0028: every shelter is operator-created, or self-registered with `applied_at` and a registrant" stays strict. Once shelter account erasure exists, allow a null registrant only when the shelter's history has an erasure line.
- **R2's commit title on main:** `8c436ca` is titled «… – DON'T MERGE (#535)». The night-run draft title went into the squash commit. It can't be fixed without a force push, so it stays. Titles are now checked before queuing.
- **The 0028 smoke check** now accepts real self-registered applications (it failed the first #531 sitting).

## Decisions recorded today (owner)
- **Early listing:** any ONE of open sources, a call or a reference qualifies, for any legal form (none recorded included). Rule (a′) applies to «перевірений» only. Accepting an application still grants the first 60 days.
- **The operator's early-listing refusal:** «Щоб дозволити показ, потрібне хоча б одне: відкриті джерела, відеодзвінок або рекомендація.»
- **Kabinet entry:** «Кабінет притулку» (outline). English is "Shelter dashboard", and "Dashboard" everywhere else.
- **Budgets:** 81,000. The next raise needs a reason in the comment, like #546's.

## Process notes for the next session
- After any merge, re-check every queued PR for conflicts. A conflicting PR starts no CI and leaves the queue silently (#546 sat there).
- A PR's CI that fails in "Install Playwright Chromium" on unreachable Ubuntu mirrors is infrastructure. Re-run the failed job.
- PRs get no Vercel previews (only main deploys). Screenshots come from the harness's sign-in server (`startSignInServer` with `SELF_REGISTRATION_ENABLED=1`). A form-registered registrant is needed to see «Підтвердіть email». A magic-link sign-in confirms the address as a side effect.
- `apps/web/test/harness/dev-ui.harness.ts` enforces 48px on kit controls. Inline text-link lists use `data-inline-link` (the error summary's 36px items).
