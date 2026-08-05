# Model policy

Which model to use for which work. This is a documented rule rather than a per-session
judgement call, so the choice doesn't depend on who is paying attention that evening.

## The heuristic

Ask what the failure mode is.

**If the failure mode is "subtly wrong forever" → Opus.** Type and schema design,
state machines, security-relevant code, query shapes, gesture physics, anything whose
defect would be invisible in review and expensive after 100k rows exist. These are the
places where a plausible-looking wrong answer costs weeks.

**If the failure mode is "obviously broken immediately" → Sonnet.** Config, wiring,
CRUD screens, seed data, fixtures, docs, mechanical refactors. A mistake here fails
loudly on the first run, so the cheaper, faster model is strictly better — you are not
buying judgement, you are buying typing.

**When genuinely unsure → Opus.** A wasted Opus session costs tokens. A subtly wrong
foundation costs a rewrite, and on a ten-hour week a rewrite costs a month.

## By milestone

| Milestone | Model | Why |
|---|---|---|
| M0 tooling | Sonnet | Config. Fails loudly or not at all |
| M1 contracts + domain | **Opus** | Type design. Every later milestone inherits these shapes |
| M2 Drizzle schema | **Opus** | Mirrors the domain unions; a wrong column is a migration |
| M2 repositories | Sonnet | Mechanical once the schema is settled |
| M2 keyset feed query | **Opus** | Cursor stability, seen-set exclusion, filter binding. Subtly wrong is the default outcome here |
| M3 seed data | Sonnet | Volume and realism, not judgement |
| M4 API layer | Sonnet | Wiring contracts to repositories |
| M4 anonymous session | **Opus** | Identity and abuse surface |
| M5 swipe deck | **Opus** | Gesture physics and pointer capture. The product's core interaction, and hard to review by reading |
| M6 filters, profile, reveal | Sonnet | UI over settled contracts |
| M6 reveal rate limiting | **Opus** | Abuse surface — shelter contact details are scrapeable |
| M7 image pipeline | **Opus** | Presigned uploads and untrusted input handling |
| M8 internal admin | Sonnet | CRUD |
| M9 i18n | Sonnet | Wiring, with the correctness already tested in M1 |
| M10 PWA | Sonnet | Service worker config |
| M11 observability | Sonnet | Config and instrumentation |
| M11 privacy policy | **Opus** | GDPR posture, and it is a legal document |
| M12 launch | **Opus** | Real shelter data, irreversible |

## Subagents

- **reviewer** — Opus, always. It is the last gate before a pull request and there is
  no second human reviewer. Reviewing well is harder than implementing.
- **debugger** — Opus. Root-causing is exactly the "subtly wrong" category; a cheap
  wrong diagnosis produces a fix that hides the bug rather than removing it.

## Note

Within a `/milestone` run, tasks may use different models — the milestone-level
assignment above is the default, not a ceiling. State the per-task choice in the Phase 1
plan so it is visible before the work happens rather than inferred afterwards.
