---
name: opika-copy
description: Use for any Ukrainian or English user-facing text in Opika (labels, errors, empty states, page copy, emails, metadata, aria-labels). Where strings live, voice, dash and apostrophe rules, plurals, the approval gate.
---

# Opika copy

- **Where:** every string lives in `packages/i18n/src/messages/uk.ts` (and `en.ts`), never in the kit, the
  domain or contracts. The product name only through app-level config (`apps/web/src/brand.ts`).
- **Approval gate (lean rule 4):** new Ukrainian copy is one table at the start of the task, asked once
  (key, proposed text, English sense). Strings from the Figma design are already approved. Until approved,
  use the pending marker; `copy-status.test.ts` keeps pending strings off public pages, emails, sign-in and
  anything a real shelter can reach. Only the owner's own words count as approval.
- **Never an em dash (U+2014).** Use an en dash (U+2013), spaced between clauses and unspaced in a range
  ("1–3"); a hyphen only inside words. A verbatim quote is exempt and stays character-exact.
  `no-em-en-dash.test.ts` guards catalogues, `brand.ts`, emails and metadata.
- **Typography:** the apostrophe in Ukrainian words is U+02BC, quotation marks are «…».
- **Dates, numbers, plurals:** native `Intl` only (formatters in `packages/domain`, four Ukrainian plural
  forms); never a hand-rolled month array or an `n === 1` branch.
- **Voice and product rules:** the swipe is filtering, not judging («Не зараз», never "nope"); freshness is
  honest and never alarming; an unknown field reads «Не записано»; no streaks or celebration; the platform
  never touches money. Details and the `/prytulkam` commitments table: `docs/standing-constraints.md`. Any
  copy near those commitments must keep every row true.
- **Removing a false claim** needs no approval; adding or rewording one does.
- Accessible names and `aria-label`s are copy too and go through the catalogue.
