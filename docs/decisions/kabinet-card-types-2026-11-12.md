# Kabinet animal card: types proposal (2026-11-12)

Types only, nothing built. Worktree `D:\opika-worktrees\kabinet-card-grid` on origin/main `a6d551e` (#496).

## 1. What exists today

| Fact | Where |
|---|---|
| Listing union: `draft` / `published{publishedAt, confirmedAt, undoable}` / `reserved{since, publishedAt, confirmedAt, undoable}` / `adopted{adoptedAt}` / `withdrawn{withdrawnAt, reason}` | `packages/domain/src/animals/listing.ts:64-111` |
| Events: publish, reserve, release, adopt, withdraw(reason), restore_to_draft, confirm, undo_confirm | `packages/domain/src/animals/listing-transition.ts:12-34` |
| FSM = private `switch` `nextListing`, no exported table; public entry `transitionListing` → `ok / illegal / non_monotonic / undo_expired` | `listing-transition.ts:63-68, 154-242` |
| `shelter.animals.transition`: the six non-confirm events, server stamps `at`, refuses `ILLEGAL_TRANSITION` / `PUBLISH_REQUIREMENTS_UNMET`. `confirm` → `{animal, undoUntil}`; `undoConfirm` → `UNDO_EXPIRED` after 13 s. `list` → `items, nextCursor, counts, staleCount`, filter `all / listing / stale` | `packages/contracts/src/kabinet/procedures.ts:440-462, 479-496, 533-546`; `listing-transition.ts:40-50, 366-383` |
| `freshnessOf(confirmedAt, now, policy)` → `{kind: fresh/aging/stale, confirmedAt, ageDays}`; `DEFAULT_FRESHNESS_POLICY`: fresh ≤7, aging 8–30, stale ≥31 days | `packages/domain/src/discovery/freshness.ts:3-45, 73-81` |
| Row read by the cards: `KabinetAnimalRowView` = id, name, species, sex, size, age, listing, lastUpdatedAt + coverPhoto, freshness (null unless visible), publishGaps | `packages/contracts/src/kabinet/views.ts:50-69`; built `apps/web/src/kabinet/handlers/animals.ts:185-200` |
| Stale today: `staleBefore(now)` = now − 31 days = exactly `freshness.kind === "stale"`; `staleCount` and the `stale` filter share one predicate. A strip exists: «{cards} ви не підтверджували понад {days}.» + «Показати ці картки ({count})» | `handlers/animals.ts:474-479, 497-512`; `packages/db/src/repos/kabinet-animal-repo.ts:601`; `animal-list/list-model.ts:107-111`; `AnimalList.tsx:615-634` |
| Today's actions: hand-written `rowActionsOf`; confirm button on every published/reserved row, fresh or not, with an inline undo (not a toast); `AdoptDialog`, `WithdrawDialog`, `DeleteDialog` exist. K3 only publishes, so restore and delete live only in the list | `list-model.ts:214-234`; `AnimalListRow.tsx:240-270`; `ListDialogs.tsx`; `animal-form/AnimalForm.tsx:497` |

Allowed from each state (`nextListing`): draft → publish · published → reserve, adopt, withdraw, confirm (+undo_confirm in window) · reserved → release, adopt, withdraw, confirm (+undo_confirm) · adopted → none (terminal, H2-7) · withdrawn → restore_to_draft.

Labels (`packages/i18n/src/messages/uk.ts`) against the brief:

| Key | Today | Brief / spec | Same |
|---|---|---|---|
| `listingStatus.*` :726-732 | Чернетка, Опубліковано, Домовляються, Удома, Знято з показу | same | yes |
| `animalList.confirm.stillLooking/stillArranging` :1119-1120 | «Ще шукає», «Ще домовляються» (✓ drawn before, aria-hidden) | «Ще шукає ✓» | text yes |
| `adoptDialog.title` :1130 | «{name} уже вдома?» | same | yes |
| `adoptDialog.body` :1131 (pinned `copy-status.test.ts:1995`) | «Картка зникне з галереї, а її сторінка стане недоступною. … додайте її як нову картку.» | «Картка зникне з пошуку. Повернути її буде не можна.» | **no** |
| `adoptDialog.confirm` :1132 (pinned :1997) | «Так, уже вдома» | «Так, удома» | **no** |
| `actions.reserve/release/adopt/withdraw` :1111-1114 | «Почали домовлятися», «Не домовилися – знову шукає», «Уже вдома», «Зняти з показу» | menu: «Домовляються», «Опубліковано», «Удома…», «Зняти з показу…» | **no** |
| `actions.viewOnSite` :1110, `row.menuLabel` :1104 | «Переглянути на сайті», «Дії з карткою {name}» | «Відкрити на сайті ↗», «Інші дії: {name}» | **no** |

## 2. The card view model

New file `apps/web/src/features/kabinet/animal-list/manage-card.ts` (pure, no React, beside `list-model.ts`, reusing its `metaLineOf`, `statusLineOf`, `confirmLabelOf`, `dayOf`). A composite, so feature folder, not the kit. Discriminant `status`.

```ts
type CardCore = { id: AnimalId; name: string; editHref: string; photo: AnimalPhoto | null; meta: string };
type CardFreshness = { kind: FreshnessKind; label: string };       // freshnessOf + freshnessLabel; no new threshold
type ConfirmOffer = { kind: "offered"; label: string } | { kind: "not_offered" };   // when: Q4
type SiteLinks = { href: string };                                  // ⋯: open + copy, publicAnimalPath
type PublishOffer =
  | { kind: "ready" }
  | { kind: "blocked"; gaps: readonly [PublishGap, ...PublishGap[]]; sentence: string };

export type AnimalManageCard =
  | (CardCore & { status: "draft"; publish: PublishOffer })
  | (CardCore & { status: "published"; freshness: CardFreshness; confirm: ConfirmOffer;
                  statusMenu: StatusMenu<"published">; siteLinks: SiteLinks })
  | (CardCore & { status: "reserved"; freshness: CardFreshness; confirm: ConfirmOffer;
                  statusMenu: StatusMenu<"reserved">; siteLinks: SiteLinks })
  | (CardCore & { status: "adopted"; closedLine: string })     // «Удома з 12 вересня» (Q8)
  | (CardCore & { status: "withdrawn"; closedLine: string });  // «Знято з показу … · причина»

export const toAnimalManageCard = (row: AnimalRow, now: Date): AnimalManageCard;
```

Confirm, freshness, the status menu and the site links exist only on published/reserved; «Опублікувати» only on draft; a static chip is simply a variant with no `statusMenu`. `now` feeds the age word, closed dates and the freshness fallback. Read-only (support) view: the component drops write controls from `editable` as today; the mapping stays `(row, now)`.

## 3. Status-menu items, typed per transition

```ts
export const STATUS_MENU_EVENTS = ["reserve", "release", "adopt", "withdraw"] as const
  satisfies readonly ListingEventType[];   // publish = draft button; confirm/undo own procedures
type StatusMenuEvent = (typeof STATUS_MENU_EVENTS)[number];

export const MOVE_BEHAVIOUR = {           // total: a new menu event fails to compile until given one
  reserve:  { kind: "instant", undo: "release" },
  release:  { kind: "instant", undo: "reserve" },
  adopt:    { kind: "confirm_dialog" },
  withdraw: { kind: "reason_dialog" },
} as const satisfies Record<StatusMenuEvent,
  { kind: "instant"; undo: StatusMenuEvent } | { kind: "confirm_dialog" } | { kind: "reason_dialog" }>;

export const STATUS_MENU_FROM = {          // pinned to transitionListing by test, below
  published: ["reserve", "adopt", "withdraw"],
  reserved:  ["release", "adopt", "withdraw"],
} as const satisfies Record<"published" | "reserved", readonly StatusMenuEvent[]>;

type StatusMenuItem<E extends StatusMenuEvent> =
  { [K in E]: { event: K; label: string; behaviour: (typeof MOVE_BEHAVIOUR)[K] } }[E];
export type StatusMenu<S extends keyof typeof STATUS_MENU_FROM> = {
  current: { status: S; label: string };   // checked row; choosing it only closes (spec rule 2)
  items: readonly StatusMenuItem<(typeof STATUS_MENU_FROM)[S][number]>[];
};
```

`StatusMenu<"published">` cannot hold a `release` item (compile error). The list dispatches on `behaviour.kind` exhaustively: `instant` → `transition`, then a kit toast whose «Скасувати» runs `transition(undo)`; `confirm_dialog` → `AdoptDialog`; `reason_dialog` → `WithdrawDialog`.

**Why it cannot drift:** TypeScript cannot read a `switch`, so the table is typed by hand, and `status-menu.test.ts` pins it to the FSM. It walks every `LISTING_KINDS` × `LISTING_EVENT_TYPES` pair through `transitionListing`: (1) a menu event is in `STATUS_MENU_FROM[kind]` exactly when the FSM doesn't answer `illegal` (states without a menu have no legal menu event); (2) the legal events no surface offers are exactly the agreed list (today `withdrawn → restore_to_draft`, Q2), so any new FSM edge fails; (3) each `instant` pair round-trips to the same kind with `publishedAt` and `confirmedAt` unchanged. Alternative, one source: export the table from `listing-transition.ts` and have `nextListing` consult it (domain refactor, not recommended now).

Data facts: reserve then undo leaves two history lines; undoing a release re-stamps `reserved.since` (shown nowhere in `apps/web`). An undo after a newer change answers `ILLEGAL_TRANSITION` → the existing «стан змінився» sentence. The confirm's own undo stays inline as today (existing strings, server window).

## 4. The stale strip

- Count = `list.staleCount`; «Показати» = the existing `{kind: "stale"}` filter. Both are `freshness.kind === "stale"` (≥31 days). No server change.
- Plural keys, whole phrase per form so the verb agrees: one «{count} картка давно не оновлювалась», few «{count} картки давно не оновлювались», many «{count} карток давно не оновлювались»; `pluralizeUk` + `Intl.NumberFormat("uk")`. Test: 1 one, 2 few, 5 many, 11 many, 21 one.
- «Показати» reuses `filter.label`; the way back reuses `stale.showAll` «Показати всі». Retires `stale.count`, `stale.countCards`, `stale.show` and the «понад {days}» pin (`apps/web/src/kabinet/copy-plural-pins.test.ts:147-151, 232`).

## 5. Stop conditions

1. **New server procedure:** none. **New transition:** none (undo of reserve = release and back, both existing edges). **A move the spec wants but the FSM forbids:** none.
2. **A move the FSM allows but the spec drops: YES.** `withdrawn → restore_to_draft` («Повернути в чернетки») loses its only UI (withdrawn = static chip), and `deleteDraft` loses its only UI (⋯ hidden on drafts). The withdraw dialog, kept unchanged, says «її можна повернути в чернетки» (`uk.ts:1136`): that would become false. Q2.
3. **Labels that differ:** adopt dialog body and confirm, the four menu labels, both ⋯ labels, the strip (table above). **Commitment #6** (`/prytulkam` §9, `uk.ts:179`, pinned `copy-status.test.ts:1390`): «Кожна опублікована картка в кабінеті має кнопку «Уже вдома».» A menu item «Удома…» makes it untrue. Q1.
4. **Standing product rule:** «Freshness is honest and never alarming… Never red, never amber» (`docs/standing-constraints.md:338-340`; `ui/FreshnessPips.tsx:4-10`; `StatusChips.tsx:7-10`). The spec's amber/red tints and single dot break it. Q3.
5. **Thresholds:** the decisions log says "7 and 20-day named constants"; the brief says use the existing function. Existing is 7/30, so the spec's 25-day red sample is `aging` (amber). I follow the brief: no 20.

## 6. New strings (beyond the adopt dialog)

| Key (proposed, `kabinet.animalList.`) | Ukrainian | Sense |
|---|---|---|
| `statusMenu.label` | «Статус: {status}. Змінити статус {name}» | status button's accessible name (spec rule 7) |
| `statusMenu.adopt` | «Удома…» (or «Уже вдома…», Q1) | opens the adopt dialog |
| `statusMenu.withdraw` | «Зняти з показу…» | opens the reason dialog |
| `statusToast` | «Статус: {status}» (or reuse `moved.*`, Q5) | toast after reserve/release |
| `more.openOnSite` | «Відкрити на сайті» (↗ as `Icon`, plus existing `shell.newTab` for screen readers) | ⋯ item |
| `more.copyLink` | «Копіювати посилання» | ⋯ item |
| `more.label` | «Інші дії: {name}» (or keep `row.menuLabel`) | ⋯ accessible name |
| `stale.line.{one,few,many}` | see §4 | strip |
| `statusMenu.sheetTitle` | «Статус · {name}» | only if phone sheets (Q6) |

Reused: `listingStatus.*` (release/reserve items, current row), `confirm.*`, `profileEdit.pause.cancel` «Скасувати» and `.close` «Закрити» (toast), `detail.shareCopied` «Посилання скопійовано.», `animalForm.publish.button`, `actions.edit`, `actions.restore`/`deleteDraft` (if Q2 a).

## 7. Open questions (recommendation first)

- **Q1 «Уже вдома» commitment.** Rec.: menu label «Уже вдома…» so §9 stays true; dialog per the spec. Otherwise §9 needs your rewording.
- **Q2 restore and delete.** Rec.: (a) the withdrawn chip becomes a status button whose menu holds «Повернути в чернетки» (adds `withdrawn: ["restore_to_draft"]`, instant, no undo); a draft's ⋯ holds only «Видалити чернетку». (b) Drop both and cut «її можна повернути в чернетки» from the withdraw dialog.
- **Q3 amber/red.** Rec.: the kit wins: `FreshnessPips` (three pips plus words), no amber/red tint or edge; emphasis through the confirm button. Or you scope the rule to adopter pages in writing.
- **Q4 confirm on fresh cards.** The list is the only place to confirm, and `/prytulkam` cites confirming weekly («щосуботи»); a 7-day-old card is still `fresh`, so "only when stale" blocks that. Rec.: offered on every published/reserved card as today, filled only when aging or stale.
- **Q5 toast text.** Rec.: reuse `moved.reserved` / `moved.released` («{name}: почали домовлятися.», names the animal, already yours) over «Статус: Домовляються»; 6 s (`durationMs`). The kabinet has no `ToastProvider` yet; the list adds one.
- **Q6 menu shape.** The kit `Menu` is a disclosure (Tab and Esc, no arrow keys, no `aria-checked`, no phone sheet; `docs/ui/components/Menu.md`). Rec.: kit `Menu` at every width now (meets the keyboard and Esc tests); arrows and phone sheet as a separate kit PR.
- **Q7 ⋯ on adopted/withdrawn.** The public page 404s for any non-discoverable animal (`apps/web/src/app/tvaryny/[animalId]/page.tsx:37-40, 61`). Rec.: ⋯ only on published/reserved (as typed above).
- **Q8 closed line and chips.** «Удома з {date}» / «Знято з показу {date} · {reason}» aren't on the spec; rec. keep (existing strings, the only place a shelter sees its withdrawal note). Spec §5 chip colours differ from the kit tints; kit wins, `ListingStatusChip` unchanged.
