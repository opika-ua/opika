# Decisions inbox: docs/skew-protection

Rows for the shared table (`docs/decisions-inbox.md`), appended at merge.

| ID | Date | Row | Question | Options | Default taken | Oleksii's answer | Status |
|---|---|---|---|---|---|---|---|
| SK-B1 | 2026-10-18 | Vercel skew protection | Turn it on for stale clients (RUI4-F1's mixed-deploy note)? | — | — | Verbatim: "Skew protection was already on (max age 12h). Record that in the stack notes instead of adding a new setting. Note for H4 (PWA): re-check stale-client behaviour then, since an installed app can stay open longer than 12h." | done: `docs/stack-decision.md`'s hosting note and CLAUDE.md's hosting row say it is on (12 h); `docs/build-plan.md` H4 carries the re-check |
