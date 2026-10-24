# Decisions inbox: feat/dr2-ui-feedback-a-d

Rows for the shared table (`docs/decisions-inbox.md`), appended at merge. Non-Tier-1 (his own
classification of this whole batch), one review by a fresh local reviewer.

**His two new strings, provenance:** `nav.kabinet` «Кабінет» and `likes.loading`
«Завантаження списку…» are both transcribed verbatim from his own batch message ("New string:
nav.kabinet «Кабінет»." and "Screen-reader text while loading: «Завантаження списку…»."), not
invented — recorded here since a reviewer flagged the PR body hadn't said so explicitly.

| ID | Date | Row | Question | Options | Default taken | Oleksii's answer | Status |
|---|---|---|---|---|---|---|---|
| DR2-D1 | 2026-10-23 | Batch A, his live correction on the first overlay screenshot | Panel inset on desktop (`desktop:mx-section`/`mb-section`) and the close button's filled-circle background — keep as first built, or change? | keep as built (a `desktop:mx-section` inset, `Button variant="icon"`'s filled circle) · remove the inset entirely (flush to viewport, top corners rounded only) and make the close button bare (no fill, `text-rg-surface` on the dark backdrop) | — (no default — his call, given live) | **his answer, verbatim:** "good result but dont forget to remove paddings on right and left and remove white backgorund from close icon. just leave X by itslef but make sure contrast works right. i mean left and right paddings at arrow of overall pages" (with an annotated screenshot). Built: `FRAME` loses `desktop:mx-section desktop:mb-section`, keeps only `desktop:rounded-t-rg-card`; the close button is now a bare `<button>` (not `Button variant="icon"`), `text-rg-surface` on `bg-rg-ink`, confirmed by contrast (pure white on `#101112`) | resolved, re-screenshotted and confirmed |
| DR2-D2 | 2026-10-23 | Batch B, his live correction on the shelter-page screenshot (a red line, annotated) | The "Шукають дім: N" heading and the sort control didn't share the grid's own left edge — fix the alignment | — | — | **his answer, verbatim:** "all good except shelter desktop. allight sign with count and filters with grid like on red line i drew here" (two annotated screenshots). Built: the per-breakpoint max-width + `mx-auto` that used to live on the grid alone moved up onto the shared `<section>`, so heading/sort/skip-link/grid/pagination all inherit the same box | resolved, re-screenshotted and confirmed |
| DR2-D3 | 2026-10-23 | `/pro` and `/prytulkam` reading the kabinet cookie for the role-aware header makes them `force-dynamic`, losing static prerendering | Pay that cost, or skip the role-aware header on these two pages only? | skip it (both pages keep showing the visitor nav even to a signed-in admin, stay static) · pay it (both become `force-dynamic`, lose caching, get the correct header) | pay it — the alternative means a signed-in admin sees «Кабінет» everywhere else on the site and «Збережені» only on these two pages, which reads as broken rather than merely static; neither page has any other dynamic data, so the whole cost is this one trade | — | taken (reversible — his call to overturn at merge) |
| DR2-D4 | 2026-10-23 | `hideCityInMeta` (shelter page's card meta line) — whether to suppress city on a fostered card's fuller "на перетримці, м. {city}" sentence too, not just the bare "м. {city}" case | Suppress both, or only the bare case? | suppress both · only the bare case | only the bare case — a fostered card's sentence says more than city alone (it's the only visible signal that animal isn't physically at the shelter), so dropping it loses real information the bare-city case never carried | — | taken (reversible — his call to overturn at merge) |

## Review notes — fixed before merge (review of 6825ffd)

- Finding 1 [a11y]: the animal list, sort control and pagination sat outside `<main>` — fixed,
  one `<main>` now wraps both the shelter-info block and the animals section.
- Finding 2 [tests]: the saved-page race fix had no regression test — added
  (`SavedPageScreen.test.tsx`, "never shows the empty state while a saved item's fetch is still
  pending"), confirmed red against the reviewer's own described mutation.
- Finding 3 [tests]: three behaviour changes with no coverage — all three now have a test,
  each confirmed red by reverting the change it guards: the overlay rendering no site header
  (`AnimalOverlay.test.tsx`), the mobile deck-entry link's `!kabinetSignedIn` gate
  (`page.test.tsx`), and `hideCityInMeta`'s fostered-card carve-out (`AnimalCard.test.tsx`).
- Finding 4 [robustness]: `kabinet-signed-in.ts`'s catch-all now calls `unstable_rethrow` first,
  so a future non-`force-dynamic` caller can't have Next's own prerender-bailout signal silently
  swallowed and served statically as "not signed in".
- Finding 6 [docs]: two stale/wrong comments fixed — `useSavedCards.ts`'s claim that
  `null?.join(",")` is `""` (it's `undefined`), and `saved-page.harness.ts`'s comment still
  describing the overlay as rendering its own `SiteHeader` (stale since batch A). Also fixed,
  found while fixing the above: two more pre-existing stale comments in `card-text.ts` and
  `AnimalCard.tsx` quoting the fostered-housing sentence as "живе у волонтерки, м. {city}" — the
  live string (`uk.cardMeta.fosteredHousing`) is "на перетримці, м. {city}" (MK-2's brand-review
  revision), predating this PR.

## Review notes — queued, not fixed in this PR

- Finding 5 [a11y/tests coverage]: the overlay's new ✕ is a bare `<button>`, not the shared
  `Button` primitive, so the shared 48px-floor test (`kabinet-profile-edit.harness.ts`, V-B2)
  doesn't cover it. Proposed fix: a dark-surface variant on the shared primitive instead of a
  bespoke button. Not done here — touches the shared `controls.tsx` variant system, a slightly
  bigger surface than a note-sized fix.
- Finding 7c [product]: if the saved page's `cardsByIds` fetch fails (offline, rate-limited), the
  page now shows skeletons and the loading `aria-live` notice indefinitely, instead of the old
  blank page. Real UX gap (no retry, no visible error), needs a design decision (a retry button?
  an error state copy?) — not a code-only fix.
- Simplification: make `kabinetSignedIn` required (no `= false` default) on `AnimalDetailScreen`,
  `ShelterPageScreen`, `SavedPageScreen` and `renderGallery` — the defaults exist only for test
  convenience and arguably contradict `SiteHeader`'s own "no default, every real caller decides
  explicitly" reasoning one level up. ~30 test call sites would need an explicit `false`/
  `kabinetSignedIn={false}` added. Low risk (reviewer's own note: "if wrong, only tests break"),
  deferred as a mechanical follow-up rather than growing this PR further.
- Simplification: the grid's per-breakpoint max-widths (`960px`/`1320px`/`1992px`) are now
  written out in both `tvaryny/page.tsx` and `ShelterPageScreen.tsx` — nothing enforces they stay
  identical. Move into one shared constant (e.g. `gallery/gallery-grid.ts`) both import.

## What this PR builds

Full account in the commit body (`6825ffd` plus this follow-up round). Screenshots (overlay
desktop/phone, shelter page desktop/phone, saved page loaded/skeleton/empty) reviewed live with
him in-session; two of his corrections (DR2-D1, DR2-D2 above) came directly from that review,
re-screenshotted and re-confirmed after each fix.

## Status

**Resolved.** Tier 1 reviewer's PASS WITH NOTES findings 1, 2, 3, 4 and 6 fixed and verified
(each new test confirmed red against the change it guards); findings 5, 7c and both
simplifications queued above, not blockers. Merging at the reviewed-and-fixed head once CI is
green.
