# Retiring a test shelter through the UI: what's missing (round 3, step d)

His request, verbatim (2026-10-18): "Retiring the rehearsal shelter through the UI: list what's
missing in the API or logic after R-UI 3, and build only the missing logic (Tier 1: deletion). Keep
demo:remove as the back-up path."

**Status: analysis and a proposal. Nothing destructive is built.** A deletion path is Tier 1, and
Tier 1 means his explicit decisions before code. The questions are at the end (Q-R1..Q-R6), each
with a recommendation.

## The runbook's steps, against what R-UI 1-3 give the operator

`docs/onboarding-a-shelter.md`, "Retiring the rehearsal shelter":

| Step | Today (script) | Through the UI after R-UI 3 |
|---|---|---|
| 1. Remove its admins | `registry/admins/remove` from DevTools | **Exists:** S4 «Прибрати» with the confirmation (R-UI 3). Sessions end at once |
| 2. Check for support sessions | the `demo:remove` dry run prints the count | **Missing:** S4 shows no support-session count. Support sessions are never deleted (RS-Q0), and their foreign key doesn't cascade, so a shelter with one can't be deleted at all |
| 3. Delete the shelter and everything attached | `demo:remove --shelter <id>` (dry run, then `--commit`): one postgres-js transaction that plans again inside itself and rolls back on drift | **Missing:** no registry procedure deletes a shelter or an operator-owned animal. `shelter.animals.deleteDraft` only takes a never-published draft, and only for that shelter's own admin |
| 3b. R2 photo keys for the DR-F3 takedown list | printed by the dry run | **Missing:** no screen lists them. No code deletes R2 objects (K-Q2) |
| 4. `KABINET_WRITE_ALLOWLIST` | Vercel env (his) | not a UI step (his answer 3: after PR 6, delete the variable) |
| 5. `location:verify --prod` | script (his) | not a UI step |

## The constraint that shapes any UI deletion

- **The app runs on neon-http in production, which has no interactive transactions.** `demo:remove`'s safety comes from being one transaction that plans again inside itself and rolls back if any count drifts. A served procedure can't do that the same way.
- **The closest equivalent** is a single statement: a chain of `DELETE … RETURNING` CTEs, guarded inline by `NOT EXISTS` checks (no members, no support session, no reveal crossing the target set). Alternatively, neon-http's non-interactive batch. Either way it is new SQL on the production driver, so it needs real-Neon smoke steps, and he would run them.
- **What gets deleted with a shelter** (DR-B1, as `demo:remove` does it):
  - swipes and reveals on its animals. **Those are adopters' rows**;
  - its animals;
  - its history;
  - the shelter;
  - its auth organization and invitations;
  - users whose only link was an invitation to it.

## Proposal

- **(A) Recommended for launch: retire without deleting, entirely through today's UI**, and keep `demo:remove` as the only deletion path.
  1. On S4, «Прибрати» every admin and invitation (R-UI 3).
  2. «Призупинити…» with code `other` and a note. The shelter's animals leave the feed and the gallery at once, and the shelter-side view shows the reason (R-UI 3).
  3. Delete it later with `demo:remove --shelter <id>`, unhurried, from the runbook.
  - What A doesn't do: the row stays. `location:verify`'s `match` keeps counting it until step 3, and its photos stay in R2 until DR-F3.
  - It needs no new code beyond R-UI 3.
- **(B) Later, if he wants deletion in the UI: an operator-only `registry.shelters.remove`.**
  - It comes with a read-only `registry.shelters.removalPreview`: the per-table counts, the support-session count and the R2 keys, i.e. the dry run.
  - One guarded statement. It refuses with members, support sessions, or a crossing reveal, as `demo:remove` does.
  - It is confirmed by typing the shelter's name, and it is reachable only for a shelter that is `rejected` or `suspended`.
  - It is Tier 1 throughout. The design is ready once he answers Q-R1..Q-R6.

## Questions for Oleksii (Tier 1: deletion)

1. **Q-R1. A or B?** Recommend **A** now, with B as a follow-up only if retiring test shelters becomes routine. Fewer deletion surfaces in a deployed app is safer, and `demo:remove` already does this job with a real transaction.
2. **Q-R2. If B: which shelters may the UI delete?**
   - Recommend: only `rejected` or `suspended` ones, with no members, no support session, and **no reveal at all**.
   - A real shelter that ever got an inquiry can't be deleted from a screen. That stays a script decision.
3. **Q-R3. If B: adopters' swipes and reveals on its animals.** Delete them with the shelter (what `demo:remove` does), or refuse while any exist? Recommend: refuse while any reveal exists (Q-R2), and delete swipes.
4. **Q-R4. If B: a record of the deletion.** The shelter's history goes with it, so nothing would record that it happened. Recommend: one line in the server log with the operator, shelter id and per-table counts (no names, no addresses). An operator audit table would be a migration, so not now.
5. **Q-R5. If B: the R2 keys.** Recommend: the preview lists them for the DR-F3 takedown, as the dry run does. Nothing deletes R2 objects (K-Q2).
6. **Q-R6. If B: the copy.** The screen needs his Ukrainian: the button, the preview, the type-the-name confirmation, the refusals. It is operator-only, so it can't ship as `[COPY PENDING]` (the strict gate).
