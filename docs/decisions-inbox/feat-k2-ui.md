# Decisions inbox: feat/k2-ui (K milestone PR 5, the UI)

Rows for the shared table (`docs/decisions-inbox.md`), appended at merge. Every row below is a
reversible decision taken by the builder (his working mode, WM-B1), not his approval; he can
overturn any of them at merge.

| ID | Date | Row | Question | Options | Default taken | Oleksii's answer | Status |
|---|---|---|---|---|---|---|---|
| K2-D1 | 2026-10-18 | K3's entry point | Where «Додати тварину» lives | profile link · the list's header | the list's «Додати тварину»; «Нова тварина» leaves the profile | - | Decision taken. Reverse: re-add the link in `ShelterProfile` |
| K2-D2 | 2026-10-18 | The status filter | client state · URL parameter | - | client state; the first page is server-rendered with «Усі» | - | Decision taken. Reverse: add a URL parameter |
| K2-D3 | 2026-10-18 | After a move | refetch the filter · update the row in place | - | the row updates from the server's answer; counts and strip re-read with one `list` call (limit 1); a moved row stays in a filter it no longer matches until the next filter change | - | Decision taken. Reverse: refetch the current filter |
| K2-D4 | 2026-10-18 | Support view | hide actions · show them disabled | - | actions `aria-disabled`; «Редагувати» stays a link to K3 read-only; «Додати тварину» and resume hidden | - | Decision taken. Reverse: hide all actions |
| K2-D5 | 2026-10-18 | `KabinetNav` width | desktop only (as the old side nav) · every width | - | every width; «Тварини» only where P1 shows the list | - | Decision taken. Reverse: restore `hidden desktop:flex` |
| K2-D6 | 2026-10-18 | K3's back link for a shelter outside the allowlist | «← Тварини» (404s for it) · «← Профіль притулку» | - | «← Профіль притулку» | - | Decision taken; disappears with PR 6. Reverse: one constant in `AnimalPage` |
| K2-D7 | 2026-10-18 | «Ще» | ARIA menu · disclosure | - | disclosure (Escape closes it) | - | Decision taken |
| K2-D8 | 2026-10-18 | Plural key names | - | - | `animalList.captionCards.*`, `animalList.stale.countCards.*` | - | Decision taken |
| K2-D9 | 2026-10-18 | The row's meta line | - | - | K3's segment labels as written, plus the card's age word, agreeing with the animal's sex (Q9; fixed after the rebase onto #125, `3712d36`) | - | Decision taken |
| K2-D10 | 2026-10-18 | The withdrawn line's `{reason}` | - | - | the reason's label, then « · «note»» when there is a note | - | Decision taken |
| K2-D11 | 2026-10-18 | Where refusals show | - | - | dialog refusals inside the dialog; one-tap refusals on the page's alert line; after a lost confirm whose date did move, «Підтверджено сьогодні» with no undo (the window is unknown) | - | Decision taken |
| K2-D12 | 2026-10-18 | Filter chips | new component · a shared Button variant | - | a `chip` variant on the shared Button (`aria-pressed`, tokens only), chips in a `<fieldset>` with the legend «Показати» | - | Decision taken |
| K2-D14 | 2026-10-18 | The K2 harness's data | - | - | the second-to-last verified unclaimed seeded shelter, with three animals inserted under names unique to the run | - | Decision taken |
| K2-C1 | 2026-10-18 | `moved.published` copy | His "else `publishedNotShown`" is false for a paused or suspended shelter | - | reuse K3's `publishedAnnouncementOf` (paused and suspended get «Опубліковано. Цю картку зараз ніхто не бачить.»); no new wording | - | Decision taken (no new copy) |
| K2-D15 | 2026-10-18 | The row's thumbnail (review of #129, note 5) | none until the view carries a photo · render the view's `coverPhoto` | - | rendered: the row view already carries `coverPhoto`, so each row shows its cover through next/image, decorative (`alt=""`), `size-18` (72px on the spacing scale) with the photo radius token; nothing for a card with no photo | - | Decision taken. Reverse: drop the thumbnail block in `AnimalListRow` |
| K2-D16 | 2026-10-18 | After a lost answer whose re-read fails too (review of #129, note 1; his words, verbatim: "no claims after a lost answer") | a new line · an existing one that claims nothing | - | his K3 «Картка не завантажилась. Перевірте зʼєднання і спробуйте ще раз.» (`animalForm.errors.loadFailed`, reused; no new Ukrainian), for moves, «Ще шукає», its undo and delete; an UNDO_EXPIRED is read back before the date is named | - | Decision taken. Reverse: one constant (`CARD_DIDNT_LOAD`) in `AnimalList` |
| K2-D17 | 2026-10-18 | A chip changed while «Показати ще» is in flight (review of #129, note 2; his words, verbatim: "«Показати ще» must reset with the filter chip") | - | - | the new filter starts at its first page (the cursor clears as it loads) and the old filter's late page is dropped (the same request token as the filter fetch) | - | Decision taken |
| K2-D18 | 2026-10-18 | The screen's undo vs the server's window (review of #129, note 3) | two literals · one derived from the other | - | the domain exports `UNDO_SHOWN_MS` (8 s), `UNDO_WINDOW_MS = UNDO_SHOWN_MS + 5 s`, and a domain test pins the shown time strictly inside the window | - | Decision taken |
