# Kabinet animal card grid: owner decisions (2026-11-12)

The grid PR starts only when BOTH have happened: (1) the layout-grid tokens PR has merged, and (2) the owner has updated `kabinet-card-spec.png` with these decisions.

1. **Labels: no rename.** Keep the existing «Ще шукає» (available, `published`) and «Ще домовляються» (reserved). Stale styling and the confirm button apply to both statuses, each with its own label, using the existing `shelter.animals.confirm` / `undoConfirm`.
2. **Status menu:** lists only the transitions the FSM allows from the current state, through the existing `shelter.animals.transition`. Adopted: the chip is static, not a button.
   - **reserve ↔ release:** instant, with an undo snackbar (~6 s).
   - **adopt («Удома»):** a confirm dialog, no undo (adopted is final).
   - **withdraw («Зняти з показу»):** the existing reason dialog, no undo.
   - **publish:** only via «Опублікувати» on drafts; instant, no undo.
   - No new server undo transitions in this PR.

Still from the original brief:
- the stale strip (Intl plurals);
- ⋯ = «Відкрити на сайті ↗» + «Копіювати посилання»;
- freshness levels fresh/amber/red with 7 and 20-day named constants;
- types first (send to the owner before implementing);
- every new string to the owner;
- screenshots at 360/1024/1440 plus both menus and the snackbar.

## Grid columns and token conflicts (owner, 2026-11-12, after #496)

- **Breakpoints:** keep the existing ones (600/1024). For the kabinet card grid, the column count comes from the AVAILABLE width, not the viewport: `grid-template-columns: repeat(auto-fill, minmax(320px, 1fr))`, with the gap = the grid gutter token. Note the 240 sidebar: at 1024 the content is about 730 px, which fits 2 cards, not 3. (This replaces the brief's "≥1280 → 3, 768–1279 → 2, <768 → 1".)
- **Desktop margin floor:** 24, confirmed.
- **Where the foundations sheet conflicts with a standing test or the existing kit, the kit wins:** the 48 px control minimum, the 14 px minimum text, card radius 24. The owner will update `grid-1-foundations.png` to match.
- **Separate later PRs, NOT now:** container width, the kabinet sidebar, retiring spacing classes.

## Types approved, with the owner's decisions (2026-11-12, after the types doc)
1. The adopt menu item is «Уже вдома…» (keeps /prytulkam §9 true).
2. Both actions are kept. The withdrawn chip opens a menu with «Повернути в чернетки» (the existing restore_to_draft). Drafts get a ⋯ with only «Видалити чернетку» (the existing deleteDraft + its existing confirm). The withdraw dialog text is unchanged. The status-menu test's "unoffered events" list becomes empty.
3. The kit wins: FreshnessPips + words, no tint, no amber/red. The spec's colours are withdrawn.
4. The confirm button is on every published/reserved card: filled when aging or stale, outline when fresh.
5. The toast reuses the existing moved.* lines («{name}: почали домовлятися.» etc.).
6. The kit Menu is used as is. The current status is left out of the menu (the chip shows it), so no checked state. No phone sheet now. Arrow keys + checked state + sheet go into a separate kit PR later.
7. ⋯ per status: published/reserved → «Відкрити на сайті», «Копіювати посилання»; draft → «Видалити чернетку»; adopted/withdrawn → no ⋯.
8. Keep the «Удома з …» / «Знято з показу …» lines and the kit chip colours.
- Thresholds: the existing freshness function (7/30). The 7/20 above is superseded.
- §6 strings: approved as proposed (with «Уже вдома…»; drop statusMenu.sheetTitle). Any further new string goes to the owner before queueing.
- Screenshots: 360 / 1024 with the sidebar / 1440; the status menu open (published, reserved, withdrawn); the draft ⋯; the adopt dialog; the toast.
