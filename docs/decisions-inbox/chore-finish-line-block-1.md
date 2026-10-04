| ID | Date | Row | Question (one line) | Options | Default taken | Oleksii's answer | Status |
|----|------|-----|----------------------|---------|----------------|-------------------|--------|
| B1-1 | 2026-10-04 | `docs/handoff-2026-10-04.md` block 1, "RATE_LIMITED сьогодні/завтра wording" | `uk.errors.rateLimited.body` ("Наступні — завтра.") reads as a calendar-day reset; the real mechanism is a rolling 24h window counted from each reveal's own timestamp, not midnight — a unit freed at 11:00 yesterday frees again at 11:00 today, not "tomorrow." Is the current wording close enough, or does it need revising to describe the rolling window honestly? | (a) leave as-is — it under-promises rather than over-promises, a minor inaccuracy in the safe direction; (b) revise to name the rolling window directly (new Ukrainian, not mine to write) | none — not a Tier 2 default, this is his call on his own prior wording, not a reversible implementation judgement | | open |

Not a Tier 2 decision — flagged first in `docs/decisions-pending-review.md` (R3's "сьогодні…
завтра" entry, 2026-09-13) as "not a reason to change his wording unilaterally... it's his call,"
carried forward here unchanged rather than re-litigated or defaulted. No code or copy changed
this row.
