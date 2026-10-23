VERDICT: STOP (decision only, S8-D1) — PR #186 (`feat/dr1-s8-saved-page`) at 3fce3b7816fab5fefbde4b886e6999ad143642be, delta review of 529a6cc..3fce3b7 (Tier 1)

Reviewer: a fresh local agent, read-only, in its own detached worktree at that SHA. It is not the builder, and not the reviewer of 529a6cc.
The fix blockers 1–3 of 529a6cc.md are resolved. What still blocks the merge is the open S8-D1 decision (Oleksii), plus his real-Neon smoke.

```
VERIFIED                                              | TAKEN ON TRUST
------------------------------------------------------|------------------------------------------
neon-smoke.test.ts: both asserts now 41; 16/16 local  | Full `pnpm check` green at 3fce3b7 (the
`unavailableUnnamed` gone: git grep at 3fce3b7 hits   |   body has a one-line summary, no pasted
  only the inbox prose; uk.ts and en.ts both clean    |   output, same as 529a6cc.md item 11)
open-writes-copy-gate.test.ts passes (in the 117)     | deps.newId() is a random UUID (it decides
Builder mutation re-run: name -> `animal?.name ??      |   whether finding 1 is reachable at all)
  null` -> draft + never-verified tests red,          | Step 41 over real neon-http (his smoke)
  "- name: null / + name: "Бровко""                    |
Own mutation: shelter lookup back to discoverable ->  |
  adopted + withdrawn tests red                       |
Own mutation: hasBeenVerified -> true -> never-       |
  verified test red                                   |
Own mutation: hasSomethingToShow -> true -> S8-D2     |
  test red ("expected <div> to be null")              |
available branch: still gated on isDiscoverable &&    |
  isPubliclyVerified; listed ⊇ discoverable           |
proxy.ts delta is comments only (non-comment diff     |
  empty); proxy.test.ts not in the delta, passes      |
Pending shelters can publish: their invite says so    |
  (uk.ts:1826, email-senders.ts:188)                  |
```

FINDINGS (most severe first)
1. [Medium, not a blocker] handlers/animals.ts:125 and contracts/procedures/animals.ts:50 — `wasEverPublic` only approximates its name, and the comment overclaims ("a row that really was public at some point"). Publishing does not need verification: a pending, suspended or paused shelter's admin can publish (the invite's `whatBeforeVerification` says cards are visible "щойно притулок пройде перевірку"). Failure scenario: a shelter is suspended or paused, publishes a card, then withdraws it before the card is ever shown; or it publishes while pending, withdraws, and is then verified. Either way that never-public name is returned. Reaching it needs an id that no public surface served, so this is not live. Fix in the batch: correct the comment, or record the residual.
2. [Low, docs] animals-cards-by-ids.test.ts:178 and the inbox's S8-F4 say "publishing requires a verified shelter … unreachable". That is false, per the evidence above. The old pending fixture was reachable, and the new never-verified test covers a real production state. The switch to suspended is still sound.
3. [Low, process] Inbox S8-D2 and S8-F4 are marked "resolved". They were 529a6cc.md's decisions (a) and (c) for Oleksii. Both defaults are fail-safe and reversible, so they are fine as "Decisions taken", but not as resolved. Put them in his S8-D1 batch to overturn.
4. [Low, docs] inbox S8-D1..S8-F1 rows have 6 cells against an 8-column header. When rendered, "open — blocks merge" lands under "Default taken", and the Answer and Status columns are blank. The prose itself is honest about S8-D1.
5. [Process] The commit body asserts `pnpm check` green without pasted output.

Item 4 (S8-D1) is represented honestly. The false "/tvaryny visibility" claim is gone. The comment states the real exposure and points to the inbox. The inbox says "no default taken — his call" and "open — blocks merge". `GATE_EXEMPT_EXACT_PATHS` and `isGateExemptExactPath` are unchanged.

SIMPLIFICATIONS
- None new in the delta.

STOP REASON
S8-D1 (unchanged from 529a6cc.md (b)): yes or no to exempting `/api/rpc/animals/cardsByIds` from the pre-launch gate. What a yes accepts: an uncookied caller holding an id gets the card, or for a never-shown animal its name (finding 1), during pre-launch. Ask him in the same batch to confirm or overturn S8-D2 (drop nameless items) and S8-F4 (name only when listed under a once-verified shelter).

TESTS
db neon-smoke.test.ts: 16 passed (16) · web animals-cards-by-ids + SavedPageScreen + open-writes-copy-gate + proxy: 4 files, 117 passed (117) · mutations: 4 run, 4 red as expected
