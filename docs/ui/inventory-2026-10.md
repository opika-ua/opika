# UI inventory, October 2026 (design system PR 0, read-only)

Measured on `main` at `f1981e8` (after #239, the hamburger menu), 2026-10-28. Nothing in the
code was changed to produce this file. Every number below was produced by a command listed in
"How it was counted" and re-run before writing.

Scope: `apps/web/src` (130 non-test `.tsx` files: 102 under `features/`, 28 under `app/`) and
`packages/ui` (one file, `freshness-display.ts`, no React components). Test files are excluded
from every count unless a line says otherwise.

## 0. Headline numbers

| Measure | Value |
|---|---|
| Component files with a capitalised export (outside `app/`) | 102 |
| Components with no production importer (dead) | 5 files: `SortControl`, `AnimalCard`, `GalleryPagination`, `FreshnessBlock` (animal-detail), `DeckEntryLink` |
| Parallel token sets in `globals.css` | 3 colour/radius sets (bare, `rg-`, `brand-`); 5 font families loaded (Literata, Commissioner, e-Ukraine, Climate Crisis, Bellota Text) |
| `rg-` class usages (`-rg-[a-z]`, `.ts`+`.tsx`) | 417 in 52 files (+ 27 `font-rg` in 15 files) |
| `brand-` class usages (`-brand-[a-z]`) | 286 in 28 files (+ 17 `font-brand-ui`, 8 `font-brand-display`) |
| Bare/old set usages | 8 class usages in 2 files (`SwipeDeck.tsx` 7, `DeckScreen.tsx` 1); the bare `bg-photo-placeholder` utility has 0 users (section 2.5) |
| Tailwind arbitrary values (`name-[...]`) | 472 in 48 files (90 distinct utility+value pairs) |
| Raw hex colours in executable code | 9 (4 in Tailwind classes, 5 in one inline CSS string); 1 more `rgba()` shadow |
| `"use client"` files | 70 (62 `.tsx`, 8 `.ts` hooks/loader); 5 server-component candidates, 3 low-value, 2 shrinkable to CSS |
| Raw `<img>` elements | 1 (`BrandLogo`, a static SVG); `<Image>` (next/image) elements: 18 in 10 files |

Surprises, in order of how much they change the plan:

1. **`rg-` did not grow from `d995ae7` to now.** It is 417 at both commits by every method tried.
   The "354" and "378" figures cannot be reproduced (section 2.3). The only recent PR that added
   `rg-` is #236 (kabinet redesign PR 1): +10.
2. **Five components are dead** (section 2.4), carrying 40 `rg-` usages, 5 `font-rg` and 31 arbitrary values.
   Deleting them is free migration progress.
3. **The bare set is nearly dead**: only `SwipeDeck.tsx` (and one `font-sans` in `DeckScreen.tsx`) use it. Retiring it is a two-file job. Caveat: `font-sans` (Commissioner) is also Tailwind's default `html` font, so any element without `font-brand-ui`/`font-rg` silently renders in it.
4. **The kabinet and `controls.tsx` are the `rg-` stronghold**: kabinet 132 + controls 52 = 184 of 417 (44%), 0 `brand-`.
   The deck (45) and the reveal dialog (41) add another 86 (21%). None of those is a PR 3a-3d surface, so PR 4
   ("empty the token allowlists") cannot finish until the kabinet, the deck and `controls.tsx` move too.
5. **The focus ring is copy-pasted 54 times** as `outline-[3px]` + `outline-offset-[3px]` (the single
   biggest arbitrary-value cluster, 108 of 472).
6. **There are five independent modal implementations** (`ModalDialog`, `ContactRevealDialog`, `AnimalOverlay`,
   `FilterSheet`, `MobileNavMenu`) and four button systems (section 1.2).
7. **Two server-vs-client facts the plan has slightly wrong**: the "70 of 126" is 70 files of which
   8 are `.ts` hooks (62 of 130 `.tsx`), and "8 raw `<img>`" was 1 real element plus 7 matches in
   comments and tests (section 5).

## How it was counted

All counts are over `apps/web/src`, `*.ts` and `*.tsx`, excluding `*.test.*` and `*.harness.*`, run
with ripgrep or `git grep` from the worktree at `f1981e8` (and `d995ae7` for comparisons).

| Measure | Pattern |
|---|---|
| `rg-` usages | occurrences of `-rg-[a-z]` (so `bg-rg-ink`, `rounded-rg-card`, `outline-rg-registry`, `var(--color-rg-x)` each count 1) |
| `font-rg` | occurrences of `font-rg\b` |
| `brand-` usages | occurrences of `-brand-[a-z]` |
| `font-brand-ui`, `font-brand-display` | literal occurrences |
| Bare/old set | `(bg\|text\|border\|ring\|outline\|fill\|stroke\|divide\|shadow\|decoration\|accent)-(paper\|paper-alt\|sunken-deep\|line\|line-strong\|line-heavy\|ink\|ink-2\|ink-3\|ink-4\|leaf\|leaf-press\|leaf-hover\|avatar-bg)`, `font-serif`, `font-sans`, `bg-photo-placeholder` |
| Arbitrary values | PCRE `(?<![A-Za-z0-9_\[])(?:[a-z0-9]+:)*!?-?[a-z]+(?:-[a-z0-9]+)*-\[[^\]\s]+\]` (variants such as `desktop:` are kept in the match and stripped for grouping). Not counted: the 47 `/[Npx]` line-height suffixes after `text-[..]`, and 5 `[property:value]` arbitrary properties (listed in 3.3) |
| Hex | `#[0-9a-fA-F]{6,8}\b`, 3-digit hex containing a letter, and `rgba?(`; hits on comment lines were then separated by hand |
| Client files | files whose first statement is `"use client"` |

Counts include the few comments that mention a class (excluding comment lines gives 415 `rg-` instead
of 417). The per-file tables in section 2 use the same patterns, so their totals match the headline.

## 1. Component catalog

### 1.1 Catalog (every capitalised export outside `app/`)

`Kind`: **client** = file starts with `"use client"`; **no directive** = usable from either side
(a hook-free file or one only imported by client code). "Imported by" lists production importers
only (tests excluded), by file name; matching is by import path basename, so two same-named files
could merge (none found). Route files under `app/` (28, all pages/layouts/error boundaries) are
not listed; the pages that matter are named in the "Imported by" column.

| Export(s) | File (`apps/web/src/`) | Kind | Imported by (non-test) | Flags |
|---|---|---|---|---|
| `AnimalDetailScreen, AnimalDetailContent` | `features/animal-detail/AnimalDetailScreen.tsx` | no directive | /tvaryny/@preview/[animalId], /tvaryny/[animalId] | Pet card panel; shared by page and overlay. Local `MetaLine`, `PlainChip`, `SexChip`, `MedicalChip` (chip dup). |
| `AnimalOverlayNoticeView` | `features/animal-detail/AnimalPageStates.tsx` | no directive | /tvaryny/@preview/[animalId] | State screens (overlay notices). |
| `CircleButton` | `features/animal-detail/CircleButton.tsx` | client | AnimalOverlay, DetailPhotoGallery, SaveButton | Button dup #2 (circle icon button). Has no hooks yet is `"use client"`. |
| `DetailPhotoGallery` | `features/animal-detail/DetailPhotoGallery.tsx` | client | AnimalDetailScreen | PhotoSlider candidate (scroll-snap); 3 `<Image>`. |
| `FreshnessBlock` | `features/animal-detail/FreshnessBlock.tsx` | no directive | (none) | DEAD: no importer. Duplicated by a private `FreshnessBlock` in `SwipeCard.tsx`. |
| `PillButton` | `features/animal-detail/PillButton.tsx` | client | RevealFlow, ShareButton | Button dup #3 (pill). Has no hooks yet is `"use client"`. |
| `RevealFlow` | `features/animal-detail/RevealFlow.tsx` | client | AnimalDetailScreen |  |
| `ShareButton` | `features/animal-detail/ShareButton.tsx` | client | AnimalDetailScreen |  |
| `AnimalOverlay` | `features/animal-overlay/AnimalOverlay.tsx` | client | /tvaryny/@preview/[animalId] | Modal dup: own `role="dialog"` + focus handling (not `ModalDialog`). |
| `BrandLogo` | `features/chrome/BrandLogo.tsx` | no directive | SiteHeader | Logo dup (raw `<img>` of SVG wordmark). Also `WordmarkText` in SiteHeader, `KabinetMark`. |
| `ContentPageLayout` | `features/chrome/ContentPageLayout.tsx` | no directive | /pro, /prytulkam | Page shell for `/pro`, `/prytulkam` (from #227). |
| `Footer` | `features/chrome/Footer.tsx` | no directive | ContentPageLayout, SavedPageScreen, ShelterPageScreen |  |
| `MenuIcon` | `features/chrome/icons.tsx` | no directive | GalleryControlBlock, GalleryFilterDropdowns, GalleryPageNav, MobileNavMenu, ShelterPageNav | Icon set dup: four separate inline-SVG files (see section 1.3). |
| `MobileNavMenu` | `features/chrome/MobileNavMenu.tsx` | client | SiteHeader | Modal dup: native `<dialog>` + `showModal()`; same pattern as FilterSheet. |
| `RateLimitedScreen` | `features/chrome/RateLimitedScreen.tsx` | no directive | /prytulky/[shelterId], /tvaryny/[animalId] | Error/empty-state dup (rg). |
| `SiteAnalytics` | `features/chrome/SiteAnalytics.tsx` | client | /layout.tsx |  |
| `SiteHeader` | `features/chrome/SiteHeader.tsx` | no directive | /tvaryny, AnimalDetailScreen, ContentPageLayout, KabinetBrand, SavedPageScreen, ShelterPageScreen | Server header; private `WordmarkText`, `NavLinks`. |
| `FOCUS, Button, CONTROL, INVALID, LABEL, HINT, ERROR, TextField, TextAreaField, SelectField, RadioOption, CheckboxOption, SegmentedControl` | `features/controls/controls.tsx` | no directive | /prytulky/[shelterId]/not-found.tsx, AdminsManager, AnimalForm, AnimalList, AnimalListRow, ChangePasswordSe... | Seed of the kit: `Button`, `TextField`, `TextAreaField`, `SelectField`, `RadioOption`, `CheckboxOption`, `SegmentedControl`, class strings. 100% `rg-*`. |
| `ModalDialog` | `features/controls/ModalDialog.tsx` | client | AdminsManager, ListDialogs, PauseControl, ReasonDialog | The only generic modal; used by kabinet only (4 files). Public overlays do not use it. |
| `DeckScreen` | `features/discovery/DeckScreen.tsx` | client | /tvaryny/gortaty | `/tvaryny/gortaty` shell; `rg-*` page chrome. |
| `SwipeCard` | `features/discovery/SwipeCard.tsx` | client | SwipeDeck | Contains private `ShelterMonogram` (avatar dup), `FreshnessBlock`+`FreshnessPipRow` (freshness dup), own `bg-[#FCFCFB]`/`#F7F7F5` stack cards. |
| `SwipeDeck` | `features/discovery/SwipeDeck.tsx` | client | DeckScreen, use-feed-deck | Private `ActionButton` (button dup #4), `LoadingState`/`ErrorState`/`ExhaustedState` (state dup), spinner div, last user of bare `font-serif`/`text-ink`. |
| `AnimalCard` | `features/gallery/AnimalCard.tsx` | no directive | (none) | DEAD in production: only tests import it. Superseded by `GalleryCard`; 16 `rg-` + 18 arbitrary values. |
| `ArrowKeyGrid` | `features/gallery/ArrowKeyGrid.tsx` | client | /tvaryny, ShelterPageScreen |  |
| `DeckEntryLink` | `features/gallery/DeckEntryLink.tsx` | client | (none) | DEAD: no importer (entry link hidden from the gallery by GV3-Q3; probably kept for the planned restore). |
| `FilterSheet` | `features/gallery/FilterSheet.tsx` | client | /tvaryny | Sheet dup: native `<dialog>` bottom sheet, 100% `rg-*`, 36 arbitrary values. |
| `GalleryCard` | `features/gallery/GalleryCard.tsx` | no directive | /tvaryny, SavedPageScreen, ShelterPageScreen | The live gallery/saved/shelter card (brand tokens). Inline `animate-pulse` photo placeholder (skeleton dup). |
| `GalleryControlBlock` | `features/gallery/GalleryControlBlock.tsx` | client | /tvaryny | Filter-row disclosure (client, matchMedia). |
| `Dropdown, DropdownOption, SpeciesToggle, GalleryFilterDropdowns` | `features/gallery/GalleryFilterDropdowns.tsx` | client | /tvaryny | Exports `Dropdown`, `DropdownOption`, `SpeciesToggle` (popover dup; toggle dup). |
| `GalleryPageNav` | `features/gallery/GalleryPageNav.tsx` | no directive | /tvaryny | Pagination (brand). Duplicated by `ShelterPageNav`; `PaginationNav` here. |
| `GalleryPagination, PaginationNav` | `features/gallery/GalleryPagination.tsx` | no directive | (none) | DEAD: no importer except its test; superseded by `GalleryPageNav`. 13 `rg-` + 3 `font-rg`. |
| `GallerySortToggle` | `features/gallery/GallerySortToggle.tsx` | no directive | /tvaryny | Sort toggle (brand). Dup of `ShelterSortToggle`, `SortControl` (dead). |
| `FilterIcon, ChevronDownIcon, ChevronIcon` | `features/gallery/icons.tsx` | no directive | GalleryControlBlock, GalleryFilterDropdowns, GalleryPageNav, MobileNavMenu, ShelterPageNav | Icon set dup: four separate inline-SVG files (see section 1.3). |
| `NoMatch` | `features/gallery/NoMatch.tsx` | no directive | /tvaryny | Empty-state dup (gallery). |
| `OutOfRangeNotice` | `features/gallery/OutOfRangeNotice.tsx` | no directive | /tvaryny | Notice/empty-state dup; `rg-` surface. |
| `ReplaceNav` | `features/gallery/ReplaceNav.tsx` | client | /tvaryny | Client router wrapper for filter links. |
| `SortControl, SortLinks` | `features/gallery/SortControl.tsx` | no directive | (none) | DEAD: only `SortControl.test.tsx` imports it (section 2.4). `SortLinks` here is named only in a comment of `ShelterSortToggle`. |
| `WithMockRouter` | `features/gallery/test-router.tsx` | no directive | (none) |  |
| `AnimalForm` | `features/kabinet/animal-form/AnimalForm.tsx` | client | AnimalList, AnimalPage, animal-list-page, animal-page | Kabinet animal form; `rg-*`. |
| `WhoSection, AgeSection, DescriptionSection, MedicalNotesSection, TemperamentSection, HealthSection` | `features/kabinet/animal-form/FormSections.tsx` | client | AnimalForm |  |
| `PhotoSection` | `features/kabinet/animal-form/PhotoSection.tsx` | client | AnimalForm |  |
| `AnimalList` | `features/kabinet/animal-list/AnimalList.tsx` | client | AnimalListScreen |  |
| `AnimalListRow` | `features/kabinet/animal-list/AnimalListRow.tsx` | client | AnimalList |  |
| `AnimalListScreen` | `features/kabinet/animal-list/AnimalListScreen.tsx` | no directive | /kabinet/tvaryny |  |
| `AdoptDialog, WithdrawDialog, DeleteDialog` | `features/kabinet/animal-list/ListDialogs.tsx` | client | AnimalList | Modal dup: private `DialogFrame` over `ModalDialog` (3 dialogs). |
| `BACK, AnimalPage` | `features/kabinet/AnimalPage.tsx` | no directive | /kabinet/tvaryny/[id], /kabinet/tvaryny/nova |  |
| `JoinFailedCard` | `features/kabinet/JoinFailedCard.tsx` | no directive | /kabinet, /kabinet/prytulok |  |
| `KabinetBrand, KabinetMark` | `features/kabinet/KabinetBrand.tsx` | no directive | /kabinet, /kabinet/prytulok, /kabinet/vkhid, /kabinet/vkhid/novyi-parol, /kabinet/vkhid/zabuly, AnimalListS... | Logo dup (`KabinetMark`); inline SVG. |
| `KabinetHome` | `features/kabinet/KabinetHome.tsx` | no directive | /kabinet | #236 landing; added 8 of the +10 `rg-` since #235. |
| `KabinetNav` | `features/kabinet/KabinetNav.tsx` | no directive | AnimalListScreen, KabinetHome, ShelterProfile | Fixed bottom bar below `desktop:`, side rail above: this is the BottomNav candidate. |
| `AdminsManager` | `features/kabinet/operator/actions/AdminsManager.tsx` | client | ShelterActionsScreen |  |
| `DecisionPanel` | `features/kabinet/operator/actions/DecisionPanel.tsx` | client | ShelterActionsScreen |  |
| `DonationDecision` | `features/kabinet/operator/actions/DonationDecision.tsx` | client | ShelterActionsScreen |  |
| `OperatorActionsProvider` | `features/kabinet/operator/actions/operator-actions.tsx` | client | AdminsManager, DecisionPanel, DonationDecision, OperatorActionsRoot, ReasonDialog, RenameForm, ResubmitPane... |  |
| `OperatorActionsRoot` | `features/kabinet/operator/actions/OperatorActionsRoot.tsx` | client | ShelterActionsScreen |  |
| `ReasonDialog` | `features/kabinet/operator/actions/ReasonDialog.tsx` | client | DecisionPanel | Modal dup: wraps `ModalDialog`. |
| `RenameForm` | `features/kabinet/operator/actions/RenameForm.tsx` | client | ShelterActionsScreen |  |
| `ResubmitPanel` | `features/kabinet/operator/actions/ResubmitPanel.tsx` | client | DecisionPanel |  |
| `ShelterActionsScreen` | `features/kabinet/operator/actions/ShelterActionsScreen.tsx` | no directive | /kabinet/prytulky/[id] |  |
| `SUPPORT, SupportEntry` | `features/kabinet/operator/actions/SupportEntry.tsx` | client | ShelterActionsScreen |  |
| `SHELTER, MODERATOR, ADMIN` | `features/kabinet/operator/actions/test-fixtures.tsx` | no directive | test-fixtures |  |
| `CreatedShelter` | `features/kabinet/operator/create/CreatedShelter.tsx` | client | CreateShelterForm |  |
| `CreateShelterForm` | `features/kabinet/operator/create/CreateShelterForm.tsx` | client | /kabinet/prytulky/novyi, create-page |  |
| `EvidenceEditor` | `features/kabinet/operator/evidence-editor/EvidenceEditor.tsx` | client | CreateShelterForm, ResubmitPanel |  |
| `HistoryList` | `features/kabinet/operator/HistoryList.tsx` | client | ShelterScreen |  |
| `OperatorShell` | `features/kabinet/operator/OperatorShell.tsx` | no directive | /kabinet/prytulky, /kabinet/prytulky/[id], /kabinet/prytulky/novyi |  |
| `ShelterListScreen` | `features/kabinet/operator/ShelterListScreen.tsx` | no directive | /kabinet/prytulky |  |
| `ShelterRow, ShelterRows` | `features/kabinet/operator/ShelterRows.tsx` | client | ShelterListScreen | Row list (client for browser-client click). |
| `BlockedCard, ShelterScreen` | `features/kabinet/operator/ShelterScreen.tsx` | no directive | ShelterActionsScreen | Private `Section`, `Fact`, `*Card` (panel/section dup). |
| `CardFrame, CARD` | `features/kabinet/password/CardFrame.tsx` | no directive | ChangePasswordSection, ForgotPasswordCard, InviteUnusableCard, ResetPasswordCard, SetPasswordCard | Panel dup: own `CARD_TITLE`/`CARD_BODY` (rg). |
| `ChangePasswordSection` | `features/kabinet/password/ChangePasswordSection.tsx` | client | /kabinet/prytulok, ShelterProfile |  |
| `ForgotPasswordCard` | `features/kabinet/password/ForgotPasswordCard.tsx` | client | /kabinet/vkhid/zabuly |  |
| `InviteUnusableCard` | `features/kabinet/password/InviteUnusableCard.tsx` | client | /kabinet/vkhid, SetPasswordCard |  |
| `NewPasswordFields` | `features/kabinet/password/NewPasswordFields.tsx` | client | ChangePasswordSection, ResetPasswordCard, SetPasswordCard |  |
| `PasswordField` | `features/kabinet/password/PasswordField.tsx` | client | ChangePasswordSection, NewPasswordFields, SignInCard |  |
| `ResetPasswordCard` | `features/kabinet/password/ResetPasswordCard.tsx` | client | /kabinet/vkhid/novyi-parol |  |
| `SetPasswordCard` | `features/kabinet/password/SetPasswordCard.tsx` | client | /kabinet/vkhid |  |
| `NO, ContactFields` | `features/kabinet/profile-edit/ContactFields.tsx` | client | ContactsSection, CreateShelterForm, EvidenceEditor |  |
| `ContactsSection` | `features/kabinet/profile-edit/ContactsSection.tsx` | client | ProfileEditor |  |
| `DonationSection` | `features/kabinet/profile-edit/DonationSection.tsx` | client | ProfileEditor |  |
| `LogoSection` | `features/kabinet/profile-edit/LogoSection.tsx` | client | ProfileEditor |  |
| `PauseControl` | `features/kabinet/profile-edit/PauseControl.tsx` | client | ProfileEditor |  |
| `PausedStatus` | `features/kabinet/profile-edit/PausedStatus.tsx` | no directive | KabinetHome, PauseControl, ShelterProfile |  |
| `ProfileEditor` | `features/kabinet/profile-edit/ProfileEditor.tsx` | client | ShelterProfile |  |
| `SaveBar` | `features/kabinet/profile-edit/SaveBar.tsx` | client | ContactsSection, VoiceSection | Sticky action bar (kabinet). |
| `ANNOUNCE, VoiceSection` | `features/kabinet/profile-edit/VoiceSection.tsx` | client | ProfileEditor |  |
| `CARD, CAPTION, Row, LockedBlock` | `features/kabinet/ProfileParts.tsx` | no directive | ProfileEditor, ShelterProfile, ShelterScreen, format | Panel dup: own `CARD`, `CARD_TITLE`, `CAPTION`, `Row`, `LockedBlock`. |
| `ShelterProfile` | `features/kabinet/ShelterProfile.tsx` | no directive | /kabinet/prytulok |  |
| `RESEND, SIGN, SignInCard` | `features/kabinet/SignInCard.tsx` | client | /kabinet/vkhid |  |
| `SIGN, SIGNED, SignOutButton` | `features/kabinet/SignOutButton.tsx` | client | AnimalListScreen, AnimalPage, KabinetHome, OperatorShell, ShelterProfile |  |
| `EXIT, AFTER, SupportBanner` | `features/kabinet/SupportBanner.tsx` | client | AnimalListScreen, AnimalPage, KabinetHome, ShelterProfile |  |
| `VerificationDecision` | `features/kabinet/VerificationDecision.tsx` | no directive | KabinetHome |  |
| `SaveButton` | `features/likes/SaveButton.tsx` | client | AnimalDetailScreen | Uses `CircleButton`; own `BookmarkIcon` (icon dup). |
| `SavedCardSkeleton` | `features/likes/SavedCardSkeleton.tsx` | no directive | SavedPageScreen | Skeleton dup #1 (`animate-pulse`, brand). |
| `SavedNavLink` | `features/likes/SavedNavLink.tsx` | client | SiteHeader |  |
| `SavedPageScreen` | `features/likes/SavedPageScreen.tsx` | client | /zberezheni | Whole `/zberezheni` screen is client for localStorage; private `EmptyState`. |
| `ContactRevealDialog` | `features/reveal/ContactRevealDialog.tsx` | client | RevealFlow, SwipeDeck | Modal dup: own `role="dialog"`; 41 `rg-`, 36 arbitrary values, 2 raw colours (`#B9B9B5`, rgba shadow). |
| `ShelterLogoAvatar` | `features/shelters/ShelterLogoAvatar.tsx` | no directive | AnimalDetailScreen, LogoSection, ShelterPageScreen | Avatar (logo or initial). Dup: `ShelterMonogram` in `SwipeCard.tsx`. |
| `ShelterPageNav` | `features/shelters/ShelterPageNav.tsx` | no directive | ShelterPageScreen | Pagination dup of `GalleryPageNav`. |
| `ShelterPageScreen` | `features/shelters/ShelterPageScreen.tsx` | no directive | /prytulky/[shelterId] |  |
| `ShelterSortToggle` | `features/shelters/ShelterSortToggle.tsx` | no directive | ShelterPageScreen | Sort toggle dup of `GallerySortToggle`. |
| `ShelterWordsSection` | `features/shelters/ShelterWordsSection.tsx` | no directive | VoiceSection |  |

### 1.2 Duplicates (same job, built more than once)

| Job | Implementations today | Notes for the kit |
|---|---|---|
| **Modal / sheet / overlay** (5 independent) | `controls/ModalDialog` (kabinet only: via `ListDialogs.DialogFrame`, `ReasonDialog`, `PauseControl`, `AdminsManager`), `reveal/ContactRevealDialog` (own `role="dialog"`, focus, Esc, scroll lock, `#B9B9B5` backdrop), `animal-overlay/AnimalOverlay` (own `role="dialog"`, panel-up animation), `gallery/FilterSheet` (native `<dialog>` bottom sheet), `chrome/MobileNavMenu` (native `<dialog>`, #239) | `FilterSheet` and `MobileNavMenu` use the same native-`<dialog>` recipe (server-rendered closed, `showModal()` on click, no-JS `:target` fallback) written twice. `ModalDialog` and `ContactRevealDialog` implement focus trap twice (`useModalFocus` vs inline). Candidate kit split: `Modal` (centred, from `ModalDialog`) and `Sheet` (bottom/side, from the two native-`<dialog>` files). |
| **Button** (4 systems) | `controls.Button` (variants `primary`/`secondary`/`text`/`icon`/`chip`, `rg-`), `animal-detail/CircleButton` (brand circle, 3 sizes), `animal-detail/PillButton` (brand pill), `discovery/SwipeDeck.ActionButton` (private), plus 37 raw `<button>` in 23 files and 66 `<Button>` in 23 files | `CircleButton`/`PillButton` are the brand answer to `controls.Button`; there is no brand `Button`. `linkClass`/`buttonClass` are exported class strings used as `className` on `<Link>` (38 calls in 24 files). |
| **Avatar / logo** | `shelters/ShelterLogoAvatar` (logo or initial), `discovery/SwipeCard.ShelterMonogram` (private initial circle), `chrome/BrandLogo` (raw `<img>` wordmark), `chrome/SiteHeader.WordmarkText`, `kabinet/KabinetBrand.KabinetMark` (inline SVG) | `ShelterMonogram` is the same idea as the fallback in `ShelterLogoAvatar`. |
| **Skeleton / placeholder** | `likes/SavedCardSkeleton`, inline `animate-pulse` div in `gallery/GalleryCard` (photo loading), `bg-rg-photo-placeholder` / `-resolved` utilities (`SwipeCard`, `AnimalCard`), `bg-photo-placeholder` (bare, 0 users), `SwipeDeck.LoadingState` | The plan's `PulsePlaceholder` does not exist in the tree (searched `PulsePlaceholder`: 0 hits); the pulse is two inline classes. |
| **Chip / badge / status pill** | `animal-detail/AnimalDetailScreen`: `PlainChip`, `SexChip`, `MedicalChip` (private); `kabinet/profile-edit/styles.STATUS_CHIP`; `kabinet/operator/actions/styles.CHIP`; `controls.buttonClass("chip")` / `linkClass("chip")`; freshness badge in `GalleryCard`/`SwipeCard`; species and "reserved" pills on cards; filter option chips in `FilterSheet`/`GalleryFilterDropdowns` | At least 8 chip-shaped recipes. `STATUS_CHIP` and operator `CHIP` are near-identical strings. |
| **Toggle / segmented control** | `controls.SegmentedControl` (rg), `gallery/GallerySortToggle` (brand), `shelters/ShelterSortToggle` (brand, near copy), `gallery/GalleryFilterDropdowns.SpeciesToggle`, `gallery/SortControl` (dead, rg) | Two live sort toggles differ by a prop or two. |
| **Dropdown / popover / select** | `gallery/GalleryFilterDropdowns.Dropdown` (+`DropdownOption`), `controls.SelectField` (native `<select>`, 3 `<select>` in total), `GalleryControlBlock` disclosure | `Dropdown` is private to the gallery file. |
| **Pagination / prev-next** | `gallery/GalleryPageNav` (+`PaginationNav`, live), `shelters/ShelterPageNav` (near copy), `gallery/GalleryPagination` (dead, rg), `animal-overlay/AnimalOverlay.NeighbourLink` (prev/next) | Three numbered-page implementations, one dead. |
| **Panel / card container** | `kabinet/ProfileParts.CARD`, `kabinet/profile-edit/styles.CARD`, `kabinet/password/CardFrame.CARD`, operator `ShelterScreen` private `*Card`/`Section`/`Fact`, `JoinFailedCard`, gallery `GalleryCard`, dead `AnimalCard`, `SwipeCard` | `CARD` is defined three times with small differences. `CARD_TITLE` three times (`text-[19px]`, `text-xl`, `text-2xl`), `CAPTION` twice with different sizes (`text-[13px]` vs `text-sm`), re-exported by the operator styles. |
| **Section / heading / meta line** | private `Section` in `app/prytulkam/page.tsx` and `operator/ShelterScreen.tsx`; `AnimalDetailScreen.MetaLine`; card meta in `gallery/card-text.ts`; 26 `<h1>`, 42 `<h2>`, 3 `<h3>` each with hand-written size classes | No `Heading`/`Text`; 188 `text-[Npx]` usages in 18 distinct sizes stand in for a type scale. |
| **Empty / error / loading states** | `gallery/NoMatch`, `gallery/OutOfRangeNotice`, `likes/SavedPageScreen.EmptyState`, `SwipeDeck.{LoadingState,ErrorState,ExhaustedState}`, `animal-detail/AnimalPageStates`, `chrome/RateLimitedScreen`, `app/tvaryny/error.tsx` and `app/tvaryny/gortaty/error.tsx` (identical 13 `rg-`, 11 arbitrary each), `app/**/not-found.tsx` (2), `kabinet/JoinFailedCard`, `kabinet/password/InviteUnusableCard` | The two `error.tsx` files are near-identical copies. |
| **Freshness display** | `@opika/ui` functions (`freshnessLabel`, `freshnessPips`) are shared; the rendering is not: `SwipeCard.{FreshnessBlock,FreshnessPipRow}` (private), `animal-detail/FreshnessBlock` (dead), `gallery/AnimalCard` pips (dead), `kabinet/animal-list/AnimalListRow` pips, `GalleryCard` badge | `packages/ui` has logic only; the plan's `Badge` should live next to it. |
| **Icons** | `chrome/icons.tsx`, `gallery/icons.tsx` (`FilterIcon`, `ChevronDownIcon`, `ChevronIcon`), `likes/SaveButton.BookmarkIcon`, `kabinet/KabinetBrand` inline `<svg>`; 6 `<svg>` in non-test files | `chrome/MobileNavMenu` imports from `gallery/icons` (cross-feature). |
| **Shell / header** | `chrome/SiteHeader` (public), `kabinet/KabinetBrand` + `KabinetNav` (shelter), `kabinet/operator/OperatorShell` (operator), `chrome/ContentPageLayout` (marketing) | Four page shells; only `ContentPageLayout` is a layout component by name. |
| **Form style strings** | `controls.{CONTROL,LABEL,HINT,ERROR,INVALID}`, `kabinet/profile-edit/styles.ts` (13 constants), `kabinet/operator/actions/styles.ts` (re-exports + 4), `kabinet/password/CardFrame` (`CARD_TITLE`, `CARD_BODY`, `CARD_MESSAGE`), `kabinet/animal-form/FormSections.CustomTextField` (private text field) | Three style modules re-declare title/caption/body strings. `ERROR` and `ERROR_TEXT` and `NOTICE` are the same string. |

### 1.3 Shared pieces that already work (seed for the kit)

- `features/controls/controls.tsx`: `Button`, `TextField`, `TextAreaField`, `SelectField`, `RadioOption`,
  `CheckboxOption`, `SegmentedControl`, the `FOCUS_RING` string. `<Button>` is rendered 66 times in 23 files; the field components 61 times with `ModalDialog`.
  The 52 `rg-` usages under `controls/` are 45 here and 7 in `ModalDialog`.
- `features/controls/ModalDialog.tsx` + `useModalFocus.ts`: a working focus-trapped modal.
- `features/chrome/ContentPageLayout.tsx`: page shell from #227.
- `packages/ui/src/freshness-display.ts`: pure freshness label/pip logic, no JSX.
- `image-loader.ts` + `next.config.ts` `images.loader: "custom"`: the R2 variant loader.


## 2. Token usage

### 2.1 The three sets in `app/globals.css`

| Set | Defined at (approx. lines) | Colours | Radii | Fonts |
|---|---|---|---|---|
| Bare/old (Keeper's Voice) | lines 19-69 | `paper`, `paper-alt`, `sunken-deep`, `line`, `line-strong`, `line-heavy`, `ink`, `ink-2..4`, `leaf`, `leaf-press`, `leaf-hover`, `avatar-bg` | `card`, `photo`, `button`, `freshness`, `chip` | `font-serif` (Literata), `font-sans` (Commissioner) |
| `rg-` (V2 «Реєстр») | lines 95-150 | `rg-page`, `rg-surface`, `rg-surface-hover`, `rg-fill`, `rg-fill-strong`, `rg-ink`, `rg-ink-2`, `rg-ink-3`, `rg-registry` | `rg-tag`, `rg-button`, `rg-photo`, `rg-freshness`, `rg-card`, `rg-chip` | `font-rg` (e-Ukraine) |
| `brand-` (gallery v3) | lines 325-364 | `brand-page`, `brand-surface`, `brand-ink`, `brand-on-ink`, `brand-ink-2`, `brand-muted`, `brand-line`, `brand-accent`, `brand-dog`, `brand-plum` | `brand-tag`, `brand-field`, `brand-panel`, `brand-card`, `brand-pill`, `brand-panel-lg` | `font-brand-display` (Climate Crisis), `font-brand-ui` (Bellota Text) |

Also parallel (not part of the plan's token list yet):

| Family | Values today | Usage |
|---|---|---|
| Shadows | `--shadow-card` (bare), `--shadow-rg-card`; plus stock `shadow-md`/`shadow-lg`, one arbitrary `shadow-[0_24px_48px_-32px_rgba(...)]` (a copy of `--shadow-rg-card`) | `shadow-rg-card` 3, `shadow-lg` 2, `shadow-md` 1, arbitrary 1 |
| Easing | `--ease-keeper` (bare), `--ease-rg` | `ease-rg` 3, `ease-out` 1 |
| Duration | none; Tailwind stock + `duration-[120ms]` | `duration-[120ms]` 7, `duration-300` 1, `duration-0` 2 |
| Animations | `--animate-spin-fast`, `--animate-fade-in`, `--animate-panel-up` | `animate-pulse` 2, `animate-panel-up` 2, `animate-fade-in` 2, `animate-spin-fast` 1, `animate-spin` 1 |
| z-index | none | `z-50` 6, `z-30` 5, `z-20` 4, `z-10` 2, `z-1/2/3` (swipe stack) 3, `z-auto` 1 |
| Breakpoints | `tablet` 600, `desktop` 1024, `wide` 1440, `ultrawide` 2000 | already single-set |
| Fonts loaded | Literata, Commissioner, e-Ukraine, Climate Crisis, Bellota Text (`app/fonts.ts`, five `localFont` calls, all five `.variable` classes on the root element in `app/layout.tsx`) | all five ship on every page |

### 2.2 Totals (class-name occurrences, non-test `.ts`+`.tsx`, `f1981e8`)

| Set | Occurrences | Files |
|---|---:|---:|
| `rg-` (`-rg-[a-z]`) | 417 | 52 |
| `font-rg` | 27 | 15 |
| `brand-` (`-brand-[a-z]`) | 286 | 28 |
| `font-brand-ui` | 17 | 17 |
| `font-brand-display` | 8 | 5 |
| bare classes (colour, `font-serif`, `font-sans`) | 8 | 2 |
| arbitrary values | 472 | 48 |

Per area (rows sum to the totals in the per-file table below; "bare" here reads 14: the 8 class
usages plus 6 comment mentions (`DeckScreen.tsx` 1, `app/fonts.ts` 5)):

| Area | rg- | font-rg | brand- | font-brand-ui | bare/old | arbitrary |
|---|---:|---:|---:|---:|---:|---:|
| `features/kabinet` | 132 | 0 | 0 | 0 | 0 | 87 |
| `features/gallery` | 71 | 8 | 109 | 7 | 0 | 127 |
| `features/controls` | 52 | 0 | 0 | 0 | 0 | 3 |
| `app` | 46 | 7 | 32 | 2 | 5 | 51 |
| `features/discovery` | 45 | 9 | 0 | 0 | 9 | 46 |
| `features/reveal` | 41 | 1 | 0 | 0 | 0 | 36 |
| `features/animal-detail` | 16 | 1 | 34 | 1 | 0 | 40 |
| `features/chrome` | 7 | 1 | 25 | 3 | 0 | 23 |
| `features/shelters` | 7 | 0 | 55 | 3 | 0 | 38 |
| `features/animal-overlay` | 0 | 0 | 7 | 0 | 0 | 5 |
| `features/likes` | 0 | 0 | 24 | 1 | 0 | 16 |


### 2.3 Which PRs added `rg-`? (the 354 / 378 question)

The plan quotes 354 `rg-` usages (and 222 `brand-`) on `d995ae7`; the owner quotes 378 now. Neither
figure reproduces:

- With the pattern above, `rg-` is **417 at `d995ae7` and 417 at `f1981e8`**. The same holds for
  `.tsx` only (387 and 387), for `\brg-[a-z]` (424 and 424), for prefixed utilities only
  (385 and 385), for line counts (243 and 243), and with comment lines removed (415 and 415).
  I tried eight counting variants (above); none gives 354 or 378, so the plan's method is unknown. The owner's 378 may come from the same unknown method at a later moment; by the diff there is no growth to attribute.
- `git diff d995ae7 f1981e8 -U0 -- apps/web/src` shows **zero** added or removed `rg-` tokens in
  net: the only changed line carrying one is `ShelterLogoAvatar.tsx`, where an existing
  `bg-rg-fill-strong ... text-rg-ink` class string was wrapped in a template literal (removed and
  re-added, same tokens). So #235, #237 and #239 added no `rg-`.
- `brand-` did grow over the same range: 265 at `d995ae7` (the plan's 222 is again a different
  method) to 292 now (+27): #237 +31/-15 (gallery filter row), #239 +12/-1 (hamburger).

Where `rg-` did move, by commit (same pattern, whole `apps/web/src`, newest first):

| Commit (selected) | `rg-` after | Change | What |
|---|---:|---:|---|
| `f1981e8` #239 hamburger | 417 | 0 | |
| `3d90075` #237 filter row | 417 | 0 | |
| `27954c5` #235 shelter responsive | 417 | 0 | |
| `d995ae7` #234 | 417 | 0 | |
| `0d4a1e6` #238 | 417 | 0 | |
| `877246c` **#236 kabinet redesign PR 1** | 417 | **+10** | `KabinetHome.tsx` +8, `KabinetNav.tsx` +1, `app/kabinet/prytulok/page.tsx` +1 (verified by diff; 0 removed) |
| `7153eb6` #233, `c991a0a` #232, `e3fc76e` #228 | 407 | 0 / 0 / -3 | |
| `a453ac1` #229 shelter + saved redesign | 410 | -26 vs `fe9621c` | moved to brand |
| `fe9621c` #230, `daca5cf` #227 (/pro, /prytulkam) | 436, 438 | -2, -17 | moved to brand |
| `20146ad` #226 ... `b69aa11` #223 | 455 | +1 at #223 | sex filter |
| `e3b4e73` #222 pet card panel | 454 | -70 | moved to brand |
| `a4984ab` #221 shelter logo | 524 | +2 | |
| `6e5f0a3` #202 gallery v3 | 518 | -64 | moved to brand |

So in the window the owner asked about, the only addition is **#236 (+10)**. The trend since 2026-10-26 is
down (582 to 417), with the kabinet being the one surface still growing in `rg-` because it is built on
`controls.tsx`. A kabinet PR 2+ built the same way will keep adding it; that is the argument for
building the kabinet from the kit.

### 2.4 `SortControl.tsx` is dead code

- `rg "SortControl"` over `apps/web` and `packages` finds imports of `./SortControl` only in
  `SortControl.test.tsx`; every other hit is a comment (`ShelterSortToggle.tsx:20`,
  `ShelterPageScreen.tsx:76,86,89`, `ShelterPageNav.tsx:32`, `ReplaceNav.tsx:14,20,45`). `app/tvaryny/page.tsx`
  imports `GallerySortToggle`, not `SortControl`.
- Its last substantive commit is #193 (designer feedback batch), then the dash cleanup #206.
- It still holds 7 `rg-`, 1 `font-rg`, 6 arbitrary values and has a test, so the test suite and the
  allowlist seeding would otherwise carry it.

Four more files are in the same state (no production importer; tests or comments only):

| File | `rg-` | `font-rg` | Arbitrary | Evidence |
|---|---:|---:|---:|---|
| `features/gallery/SortControl.tsx` | 7 | 1 | 6 | only `SortControl.test.tsx` |
| `features/gallery/AnimalCard.tsx` | 16 | 1 | 18 | `AnimalCard.test.tsx`, `sentence-only-there.test.tsx`; live cards use `GalleryCard` |
| `features/gallery/GalleryPagination.tsx` | 13 | 3 | 5 | only its test; live pagination is `GalleryPageNav` |
| `features/animal-detail/FreshnessBlock.tsx` | 4 | 0 | 2 | no importer at all (`SwipeCard` has its own private `FreshnessBlock`) |
| `features/gallery/DeckEntryLink.tsx` | 0 | 0 | 0 | no importer; `app/tvaryny/page.tsx:261` says it is "no longer imported here" (hidden by GV3-Q3) |
| **Total** | **40** | **5** | **31** | |

`DeckEntryLink` is probably kept for the planned restore of the deck's entry link (commitments row 8:
«або по одній» is to come back when a new link into the deck appears); the other four have no stated
reason to stay. Deleting a dead component takes its test file with it.

### 2.5 Bare set and other dead token definitions

- Bare classes in use: `SwipeDeck.tsx` lines 376, 573, 577, 578 (`font-sans`, `font-serif`, `text-ink`,
  `text-ink-2`, `text-ink-3`: the deck's "exhausted" state) and `DeckScreen.tsx:148` (`font-sans`).
  Nothing else references `--color-paper`, `--color-leaf*`, `--radius-card` etc. from a `.ts`/`.tsx` file.
- `--color-sunken-deep` is read once, inside `@utility bg-photo-placeholder`, which has **no users**
  (`rg bg-photo-placeholder` finds the definition and a comment only). `--shadow-card` and `--ease-keeper`
  likewise have no class users (`shadow-card`, `ease-keeper` appear in no `.tsx` file).
- Defined but never used as a class: `--color-brand-plum` (0), `--radius-rg-tag` (0), and the bare `bg-photo-placeholder`
  utility (0). Lightly used: `brand-dog` 3, `brand-tag` 2, `rg-surface-hover` 1, `rg-freshness` 1.
  (`-<token>` occurrences in non-test `.ts`/`.tsx`.)
- The rg focus colour is `outline-rg-registry` (26 of the 28 `rg-registry` usages), i.e. the V2 focus ring is
  a registry-blue outline written per element, not a token.
- Hex inside `globals.css` itself: 50 six-digit hex values on 45 lines. Most are token definitions;
  four are literal stripe colours inside `@utility` blocks (`#f6efe3`, `#efefed`, `#cfcfcb`, `#e0e0dd`),
  not tokens.

### 2.6 Per-file token map

Columns count occurrences in that file. Sorted by `rg-`. Only files with at least one hit are listed
(80 files, including a few `.ts` files such as `medical-labels.ts` and the `styles.ts` modules that hold class
strings). "bare/old" in `app/fonts.ts` is comment mentions; in `DeckScreen.tsx` it is one `font-sans` plus a comment.

Per file:


| File | rg- | font-rg | brand- | font-brand-ui | font-brand-display | bare/old | arbitrary |
|---|---:|---:|---:|---:|---:|---:|---:|
| `features/controls/controls.tsx` | 45 | 0 | 0 | 0 | 0 | 0 | 3 |
| `features/reveal/ContactRevealDialog.tsx` | 41 | 1 | 0 | 0 | 0 | 0 | 36 |
| `features/gallery/FilterSheet.tsx` | 35 | 3 | 0 | 0 | 0 | 0 | 36 |
| `features/discovery/SwipeDeck.tsx` | 19 | 3 | 0 | 0 | 0 | 7 | 22 |
| `features/discovery/SwipeCard.tsx` | 16 | 4 | 0 | 0 | 0 | 0 | 16 |
| `features/kabinet/SignInCard.tsx` | 18 | 0 | 0 | 0 | 0 | 0 | 15 |
| `features/gallery/AnimalCard.tsx` | 16 | 1 | 0 | 0 | 0 | 0 | 18 |
| `features/gallery/GalleryPagination.tsx` | 13 | 3 | 0 | 0 | 0 | 0 | 5 |
| `features/kabinet/profile-edit/styles.ts` | 16 | 0 | 0 | 0 | 0 | 0 | 0 |
| `app/tvaryny/error.tsx` | 13 | 1 | 0 | 0 | 0 | 0 | 11 |
| `app/tvaryny/gortaty/error.tsx` | 13 | 1 | 0 | 0 | 0 | 0 | 11 |
| `features/kabinet/animal-form/PhotoSection.tsx` | 14 | 0 | 0 | 0 | 0 | 0 | 0 |
| `features/discovery/DeckScreen.tsx` | 10 | 2 | 0 | 0 | 0 | 2 | 8 |
| `app/tvaryny/[animalId]/not-found.tsx` | 10 | 1 | 0 | 0 | 0 | 0 | 9 |
| `features/kabinet/ProfileParts.tsx` | 11 | 0 | 0 | 0 | 0 | 0 | 14 |
| `features/animal-detail/medical-labels.ts` | 10 | 0 | 0 | 0 | 0 | 0 | 0 |
| `features/gallery/SortControl.tsx` | 7 | 1 | 0 | 0 | 0 | 0 | 6 |
| `features/kabinet/KabinetHome.tsx` | 8 | 0 | 0 | 0 | 0 | 0 | 13 |
| `features/kabinet/ShelterProfile.tsx` | 8 | 0 | 0 | 0 | 0 | 0 | 13 |
| `features/controls/ModalDialog.tsx` | 7 | 0 | 0 | 0 | 0 | 0 | 0 |
| `features/kabinet/JoinFailedCard.tsx` | 7 | 0 | 0 | 0 | 0 | 0 | 10 |
| `features/kabinet/animal-list/AnimalListRow.tsx` | 7 | 0 | 0 | 0 | 0 | 0 | 0 |
| `features/kabinet/animal-form/AnimalForm.tsx` | 6 | 0 | 0 | 0 | 0 | 0 | 0 |
| `app/prytulky/[shelterId]/not-found.tsx` | 4 | 1 | 0 | 0 | 0 | 0 | 0 |
| `features/chrome/RateLimitedScreen.tsx` | 4 | 1 | 0 | 0 | 0 | 0 | 0 |
| `features/kabinet/AnimalPage.tsx` | 5 | 0 | 0 | 0 | 0 | 0 | 0 |
| `features/kabinet/password/CardFrame.tsx` | 5 | 0 | 0 | 0 | 0 | 0 | 0 |
| `features/shelters/ShelterWordsSection.tsx` | 5 | 0 | 0 | 0 | 0 | 0 | 0 |
| `features/animal-detail/FreshnessBlock.tsx` | 4 | 0 | 0 | 0 | 0 | 0 | 2 |
| `features/kabinet/animal-list/AnimalListScreen.tsx` | 4 | 0 | 0 | 0 | 0 | 0 | 0 |
| `features/kabinet/operator/actions/styles.ts` | 4 | 0 | 0 | 0 | 0 | 0 | 0 |
| `app/fonts.ts` | 0 | 3 | 5 | 1 | 4 | 5 | 1 |
| `features/animal-detail/AnimalPageStates.tsx` | 2 | 1 | 0 | 0 | 0 | 0 | 0 |
| `features/kabinet/KabinetBrand.tsx` | 3 | 0 | 0 | 0 | 0 | 0 | 6 |
| `features/kabinet/SignOutButton.tsx` | 3 | 0 | 0 | 0 | 0 | 0 | 6 |
| `features/kabinet/SupportBanner.tsx` | 3 | 0 | 0 | 0 | 0 | 0 | 9 |
| `features/chrome/SiteHeader.tsx` | 2 | 0 | 8 | 1 | 0 | 0 | 10 |
| `features/kabinet/operator/evidence-editor/EvidenceEditor.tsx` | 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| `features/kabinet/password/ChangePasswordSection.tsx` | 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| `features/shelters/ShelterLogoAvatar.tsx` | 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| `app/kabinet/layout.tsx` | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| `app/kabinet/page.tsx` | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| `app/kabinet/prytulok/page.tsx` | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| `app/kabinet/vkhid/page.tsx` | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| `app/kabinet/vkhid/novyi-parol/page.tsx` | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| `app/kabinet/vkhid/zabuly/page.tsx` | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| `features/chrome/Footer.tsx` | 1 | 0 | 0 | 0 | 0 | 0 | 1 |
| `features/kabinet/KabinetNav.tsx` | 1 | 0 | 0 | 0 | 0 | 0 | 1 |
| `features/kabinet/animal-form/FormSections.tsx` | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| `features/kabinet/animal-list/AnimalList.tsx` | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| `features/kabinet/operator/OperatorShell.tsx` | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| `features/kabinet/operator/create/CreateShelterForm.tsx` | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| `features/kabinet/profile-edit/DonationSection.tsx` | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| `app/pro/page.tsx` | 0 | 0 | 7 | 0 | 0 | 0 | 6 |
| `app/prytulkam/page.tsx` | 0 | 0 | 12 | 0 | 0 | 0 | 6 |
| `app/tvaryny/page.tsx` | 0 | 0 | 8 | 1 | 1 | 0 | 7 |
| `features/animal-detail/AnimalDetailScreen.tsx` | 0 | 0 | 24 | 1 | 0 | 0 | 24 |
| `features/animal-detail/CircleButton.tsx` | 0 | 0 | 2 | 0 | 0 | 0 | 2 |
| `features/animal-detail/DetailPhotoGallery.tsx` | 0 | 0 | 1 | 0 | 0 | 0 | 5 |
| `features/animal-detail/PillButton.tsx` | 0 | 0 | 5 | 0 | 0 | 0 | 7 |
| `features/animal-detail/RevealFlow.tsx` | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| `features/animal-detail/ShareButton.tsx` | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| `features/animal-overlay/AnimalOverlay.tsx` | 0 | 0 | 7 | 0 | 0 | 0 | 5 |
| `features/chrome/BrandLogo.tsx` | 0 | 0 | 0 | 0 | 0 | 0 | 3 |
| `features/chrome/ContentPageLayout.tsx` | 0 | 0 | 6 | 1 | 1 | 0 | 3 |
| `features/chrome/MobileNavMenu.tsx` | 0 | 0 | 11 | 1 | 0 | 0 | 6 |
| `features/gallery/card-text.ts` | 0 | 0 | 6 | 0 | 0 | 0 | 0 |
| `features/gallery/GalleryCard.tsx` | 0 | 0 | 17 | 1 | 0 | 0 | 10 |
| `features/gallery/GalleryControlBlock.tsx` | 0 | 0 | 5 | 1 | 0 | 0 | 7 |
| `features/gallery/GalleryFilterDropdowns.tsx` | 0 | 0 | 32 | 1 | 0 | 0 | 14 |
| `features/gallery/GalleryPageNav.tsx` | 0 | 0 | 16 | 1 | 0 | 0 | 9 |
| `features/gallery/GallerySortToggle.tsx` | 0 | 0 | 14 | 1 | 0 | 0 | 10 |
| `features/gallery/NoMatch.tsx` | 0 | 0 | 12 | 1 | 0 | 0 | 7 |
| `features/gallery/OutOfRangeNotice.tsx` | 0 | 0 | 7 | 1 | 0 | 0 | 5 |
| `features/likes/SaveButton.tsx` | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| `features/likes/SavedCardSkeleton.tsx` | 0 | 0 | 3 | 0 | 0 | 0 | 2 |
| `features/likes/SavedPageScreen.tsx` | 0 | 0 | 20 | 1 | 1 | 0 | 14 |
| `features/shelters/ShelterPageNav.tsx` | 0 | 0 | 16 | 1 | 0 | 0 | 9 |
| `features/shelters/ShelterPageScreen.tsx` | 0 | 0 | 26 | 1 | 1 | 0 | 19 |
| `features/shelters/ShelterSortToggle.tsx` | 0 | 0 | 13 | 1 | 0 | 0 | 10 |
| **Total (80 files)** | 417 | 27 | 286 | 17 | 8 | 14 | 472 |


## 3. Arbitrary values and raw colours

### 3.1 Arbitrary values (`name-[...]`), 472 in 48 files

By utility family (variants such as `desktop:` stripped):

| Family | Count | What it stands in for |
|---|---:|---|
| `text-[Npx]` | 188 | a type scale: 18 distinct sizes from 9px to 48px; `15px` 62, `20px` 25, `16px` 21, `13px` 18, `17px` 12, `34px` 11, `26px` 8, `48px` 6 |
| `outline-[3px]` + `outline-offset-[3px]` | 54 + 54 | the focus ring, pasted per element (32 files) |
| `tracking-[...]` | 40 | letter-spacing: `-0.03em` 9, `-0.02em` 8, `0.06em` 7, `0.12em` 5, `0.2px` 4 ... |
| `leading-[...]` | 39 | line height: `normal` 15, `22px` 12, `18px` 6, `46px` 2 |
| `max-w-[...]` | 21 | container widths: `1400px` 5, `1084px` 5, `640px` 2, `1080px` 2, `1992`, `1320`, `960`, `760`, `720`, `560`, `320` once each |
| `w-[...]` | 13 | `46px` 2, `153.875px` 2 (logo), `1.5px` 2, `min(360px,calc(100vw-2rem))` (popover) ... |
| `has-[...]` | 8 | `:focus-visible` 5, `:checked` 3 |
| `duration-[120ms]` | 7 | one motion duration |
| `aspect-[...]` | 7 | `328/480` 3 (card), `4/5` 2, `3/4` 2 |
| `gap-[...]` | 6 | `30px` 5, `10px` 1 |
| everything else | about 20 | `bg-[#...]` 4, `h-[...]` 3, `border-[1.5px]` 3, `aria-[current=page]` 3, `min-h-[72px]` 2, `max-h-[85vh]` 2, `rounded-[24px]`... |

By bare value (utility ignored), top 25 of 75 distinct:

| Value (any utility) | Count |
|---|---:|
| `[3px]` | 110 |
| `[15px]` | 62 |
| `[20px]` | 25 |
| `[16px]` | 23 |
| `[13px]` | 18 |
| `[normal]` | 15 |
| `[26px]` | 13 |
| `[22px]` | 13 |
| `[17px]` | 12 |
| `[34px]` | 11 |
| `[18px]` | 10 |
| `[-0.03em]` | 9 |
| `[-0.02em]` | 8 |
| `[30px]` | 7 |
| `[120ms]` | 7 |
| `[0.06em]` | 7 |
| `[48px]` | 6 |
| `[24px]` | 5 |
| `[19px]` | 5 |
| `[1400px]` | 5 |
| `[1084px]` | 5 |
| `[1.5px]` | 5 |
| `[0.12em]` | 5 |
| `[:focus-visible]` | 5 |
| `[46px]` | 4 |


By utility + value (all 90 distinct pairs):

| Utility | Count |
|---|---:|
| `text-[15px]` | 62 |
| `outline-offset-[3px]` | 54 |
| `outline-[3px]` | 54 |
| `text-[20px]` | 25 |
| `text-[16px]` | 21 |
| `text-[13px]` | 18 |
| `leading-[normal]` | 15 |
| `text-[17px]` | 12 |
| `leading-[22px]` | 12 |
| `text-[34px]` | 11 |
| `tracking-[-0.03em]` | 9 |
| `tracking-[-0.02em]` | 8 |
| `text-[26px]` | 8 |
| `tracking-[0.06em]` | 7 |
| `duration-[120ms]` | 7 |
| `text-[48px]` | 6 |
| `leading-[18px]` | 6 |
| `tracking-[0.12em]` | 5 |
| `text-[19px]` | 5 |
| `max-w-[1400px]` | 5 |
| `max-w-[1084px]` | 5 |
| `has-[:focus-visible]` | 5 |
| `gap-[30px]` | 5 |
| `tracking-[0.2px]` | 4 |
| `text-[24px]` | 4 |
| `text-[18px]` | 4 |
| `text-[12px]` | 3 |
| `text-[11px]` | 3 |
| `has-[:checked]` | 3 |
| `border-[1.5px]` | 3 |
| `aspect-[328/480]` | 3 |
| `aria-[current=page]` | 3 |
| `w-[46px]` | 2 |
| `w-[153.875px]` | 2 |
| `w-[1.5px]` | 2 |
| `tracking-[0.08em]` | 2 |
| `tracking-[-0.035em]` | 2 |
| `text-[44px]` | 2 |
| `p-[3px]` | 2 |
| `min-h-[72px]` | 2 |
| `min-[360px]` | 2 |
| `max-w-[640px]` | 2 |
| `max-w-[1080px]` | 2 |
| `max-h-[85vh]` | 2 |
| `leading-[46px]` | 2 |
| `leading-[38px]` | 2 |
| `leading-[26px]` | 2 |
| `h-[26px]` | 2 |
| `bg-[#B9B9B5]` | 2 |
| `aspect-[4/5]` | 2 |
| `aspect-[3/4]` | 2 |
| `w-[min(360px,calc(100vw-2rem))]` | 1 |
| `w-[min(...)]` | 1 |
| `w-[480px]` | 1 |
| `w-[30px]` | 1 |
| `w-[26px]` | 1 |
| `w-[220px]` | 1 |
| `w-[120px]` | 1 |
| `translate-y-[8.3333%]` | 1 |
| `transition-[grid-template-rows]` | 1 |
| `tracking-[-0.2px]` | 1 |
| `tracking-[0.16px]` | 1 |
| `tracking-[-0.01em]` | 1 |
| `text-[9px]` | 1 |
| `text-[36px]` | 1 |
| `text-[22px]` | 1 |
| `text-[14px]` | 1 |
| `shadow-[0_24px_48px_-32px_rgba(16,17,18,0.4)]` | 1 |
| `rounded-t-[24px]` | 1 |
| `rounded-r-[16px]` | 1 |
| `rounded-l-[16px]` | 1 |
| `rounded-[30px]` | 1 |
| `rounded-[10px]` | 1 |
| `pt-[max(1.5rem,env(safe-area-inset-top))]` | 1 |
| `min-w-[11rem]` | 1 |
| `max-w-[960px]` | 1 |
| `max-w-[760px]` | 1 |
| `max-w-[720px]` | 1 |
| `max-w-[560px]` | 1 |
| `max-w-[320px]` | 1 |
| `max-w-[1992px]` | 1 |
| `max-w-[1320px]` | 1 |
| `h-[5px]` | 1 |
| `grid-rows-[1fr]` | 1 |
| `grid-rows-[0fr]` | 1 |
| `grid-cols-[200px_minmax(0,1fr)]` | 1 |
| `grid-cols-[1fr_auto]` | 1 |
| `gap-[10px]` | 1 |
| `bg-[#FCFCFB]` | 1 |
| `bg-[#F7F7F5]` | 1 |


### 3.2 Raw colours in `.ts`/`.tsx`

The scan finds 21 lines. **13 are comments or prose** (design-doc quotes such as `#101112`, `#FFFFFF`, `#4F6B3A`,
`#63676B`). The plan's "20 raw hex" matches the all-lines figure; the executable
count is lower. Executable, grouped by value:

| Value | Where (file:line) | Use |
|---|---|---|
| `#B9B9B5` | `features/reveal/ContactRevealDialog.tsx:247` (`desktop:bg-[#B9B9B5]/90`), `features/gallery/FilterSheet.tsx:269` (`bg-[#B9B9B5]/80`) | modal backdrop, two opacities; no token |
| `#FCFCFB` | `features/discovery/SwipeCard.tsx:43` | stack card behind the top card (`z-2`) |
| `#F7F7F5` | `features/discovery/SwipeCard.tsx:45` | stack card two behind (`z-1`) (`rg-surface-hover` is `#f7f7f5`, so this one equals an existing token) |
| `#faf7f2` | `kabinet/confirm-route.ts:133`, `:135` | standalone HTML page (inline `<style>`, no Tailwind, no tokens) |
| `#2b2622` | `kabinet/confirm-route.ts:133`, `:135`, `:136` | same standalone page: text, button fill, focus outline |
| `rgba(16,17,18,0.4)` | `features/reveal/ContactRevealDialog.tsx:255` (`shadow-[0_24px_48px_-32px_rgba(...)]`) | copy of `--shadow-rg-card` |

So: 9 hex literals in executable code (4 in Tailwind classes: `#B9B9B5` ×2, `#FCFCFB`, `#F7F7F5`; 5 in
`confirm-route.ts`) and 1 `rgba`. `confirm-route.ts` serves a complete HTML document from a route handler
(no stylesheet), so a guard for "no raw hex" will need to allowlist that file or move its colours to a
constant derived from the tokens. `globals.css` holds the 50 token hex values (section 2.5) and is the
intended place for colour.

### 3.3 Arbitrary properties and variants (not counted above)

Five `[property:value]` arbitrary properties, all in brand code:
`AnimalOverlay.tsx:66,75` (`[background-color:color-mix(...)]`, scrim), `AnimalOverlay.tsx:195`
(`[clip-path:inset(...)]`), `DetailPhotoGallery.tsx:107` (`[scrollbar-width:none]`),
`KabinetBrand.tsx:33` (`[stroke-width:12]`). `color-mix()` and `clip-path` are used with token `var()`s,
so they are not raw values, but a guard has to decide whether `[..:..]` is in scope.




## 4. `"use client"` files (70)

62 `.tsx` plus 8 `.ts` (7 hooks and `image-loader.ts`), out of 130
non-test `.tsx` files in `apps/web/src`. (The plan's "70 of 126 non-test `.tsx`" mixes the `.ts` files in.)
By area: `features/kabinet` 40, `features/gallery` 6, `features/animal-detail` 5, `features/discovery` 4,
`features/likes` 3, `features/controls` 3, `features/reveal` 2, `features/chrome` 2, `app/` 2 (error boundaries),
`features/filters` 1, `features/animal-overlay` 1, `image-loader.ts` 1.

The kabinet is behind a sign-in, so its client weight does not hit the public LCP/INP budget. The public
surfaces that ship client JS are: the gallery islands (`FilterSheet`, `GalleryControlBlock`,
`GalleryFilterDropdowns`, `ArrowKeyGrid`, `ReplaceNav`), the header islands (`MobileNavMenu`, `SavedNavLink`,
`SiteAnalytics`), the pet card (`DetailPhotoGallery`, `RevealFlow`, `ShareButton`, `SaveButton`,
`CircleButton`, `PillButton`, `ContactRevealDialog`), the overlay, `/zberezheni` as a whole
(`SavedPageScreen`), and the deck.

Reasons were read from each file's hooks/handlers (`useState`, `useEffect`, `showModal`, `localStorage`,
`fetch`, browser client ...), not guessed. "Candidate" means a plausible server component or a split into a
server shell plus a smaller island, not a verified saving; "low value" means it has no hooks of its own but is
only ever imported by another client file, so removing the directive saves no bytes.

Server-component candidates:

1. `features/likes/SavedPageScreen.tsx`: the whole `/zberezheni` screen is client for one `localStorage` read.
   Header, footer, skeleton and layout can be a server shell around one list island. Largest public win.
2. `features/animal-detail/CircleButton.tsx` and `PillButton.tsx`: no hooks or handlers of their own; the
   directive is not needed (their client callers stay client).
3. `features/kabinet/operator/HistoryList.tsx`, `ShelterRows.tsx`: server list plus a small island.
4. `GalleryControlBlock` and `GalleryFilterDropdowns`: at the modern baseline (CSS `:has()`, `<details name>`,
   native `popover`) parts of both could be markup-only. Not a free change; flagged for PR 2.

| File | Why it is client | Server-component candidate? |
|---|---|---|
| `app/tvaryny/error.tsx` | Next error boundary (must be client); retry button, focus on mount | required |
| `app/tvaryny/gortaty/error.tsx` | Next error boundary (must be client); retry button | required |
| `features/animal-detail/CircleButton.tsx` | none found: no hooks or handlers of its own, only forwards button props | CANDIDATE: directive removable (callers that pass handlers are client files anyway) |
| `features/animal-detail/DetailPhotoGallery.tsx` | scroll-snap slider tracks active slide, prev/next scrolling | required |
| `features/animal-detail/PillButton.tsx` | none found: forwards button props only | CANDIDATE: directive removable |
| `features/animal-detail/RevealFlow.tsx` | contact-reveal button + dialog open state, calls reveal | required (island) |
| `features/animal-detail/ShareButton.tsx` | navigator.share / clipboard on click | required (island) |
| `features/animal-overlay/AnimalOverlay.tsx` | intercepted-route modal: router.back, Esc, focus trap, scroll lock, entrance animation | required |
| `features/chrome/MobileNavMenu.tsx` | hamburger: dialog.showModal(), scroll lock, close on navigation | required (island) |
| `features/chrome/SiteAnalytics.tsx` | Vercel Analytics component | required |
| `features/controls/ModalDialog.tsx` | focus trap/restore, Esc, backdrop click (useModalFocus) | required |
| `features/controls/useModalFocus.ts` | hook: focus trap and restore | required (hook) |
| `features/controls/useScrollingClass.ts` | hook: scroll listener toggling a class | required (hook) |
| `features/discovery/DeckScreen.tsx` | swipe deck page shell: feed hook, keyboard, router | required |
| `features/discovery/SwipeCard.tsx` | only forwards onTap to the card; no own state | LOW VALUE: always inside client SwipeDeck, no bundle saving |
| `features/discovery/SwipeDeck.tsx` | pointer-event gesture engine, fetch of swipes, transform animation | required |
| `features/discovery/use-feed-deck.ts` | hook: feed paging through the browser oRPC client | required (hook) |
| `features/filters/use-feed-filters.ts` | hook: filter state persisted via window | required (hook) |
| `features/gallery/ArrowKeyGrid.tsx` | 2D arrow-key navigation over the card grid | required (island) |
| `features/gallery/DeckEntryLink.tsx` | click handler on a link; the file itself is dead | delete with the dead file |
| `features/gallery/FilterSheet.tsx` | dialog.showModal(), form submit to router, scroll lock | required (island) |
| `features/gallery/GalleryControlBlock.tsx` | filter-row disclosure: open state, matchMedia, outside click | required today; could shrink to CSS details/:has() at the new baseline |
| `features/gallery/GalleryFilterDropdowns.tsx` | popover state, pointer-outside, keyboard | required today; native popover could replace part |
| `features/gallery/ReplaceNav.tsx` | router.replace on filter link click (no history entry) | required (small island) |
| `features/kabinet/animal-form/AnimalForm.tsx` | large form: state, submit, browser client, unsaved-changes guard | required |
| `features/kabinet/animal-form/FormSections.tsx` | controlled inputs (onChange props) | LOW VALUE: only used inside client AnimalForm |
| `features/kabinet/animal-form/PhotoSection.tsx` | photo upload with pointer drag-reorder, browser client | required |
| `features/kabinet/animal-list/AnimalList.tsx` | row menus, dialogs, browser-client mutations | required |
| `features/kabinet/animal-list/AnimalListRow.tsx` | row menu toggle and keyboard | required |
| `features/kabinet/animal-list/ListDialogs.tsx` | three confirm dialogs with local state | required |
| `features/kabinet/operator/actions/AdminsManager.tsx` | invite/remove admins form + dialog | required |
| `features/kabinet/operator/actions/DecisionPanel.tsx` | verification decision controls + dialogs | required |
| `features/kabinet/operator/actions/DonationDecision.tsx` | approve/reject donation link buttons | required |
| `features/kabinet/operator/actions/operator-actions.tsx` | React context + pending/outcome state for operator actions | required |
| `features/kabinet/operator/actions/OperatorActionsRoot.tsx` | router.refresh wrapper around the provider | required (thin) |
| `features/kabinet/operator/actions/ReasonDialog.tsx` | reason textarea inside ModalDialog | required |
| `features/kabinet/operator/actions/RenameForm.tsx` | inline rename form, focus management | required |
| `features/kabinet/operator/actions/ResubmitPanel.tsx` | resubmit evidence panel with state | required |
| `features/kabinet/operator/actions/SupportEntry.tsx` | start-support-view button | required (island) |
| `features/kabinet/operator/actions/use-router-reread.ts` | hook: router.refresh after a mutation, transition | required (hook) |
| `features/kabinet/operator/create/CreatedShelter.tsx` | copy-to-clipboard success state | required |
| `features/kabinet/operator/create/CreateShelterForm.tsx` | create-shelter form | required |
| `features/kabinet/operator/evidence-editor/EvidenceEditor.tsx` | dynamic evidence rows | required |
| `features/kabinet/operator/HistoryList.tsx` | "load more" through the browser client | CANDIDATE: server list + small load-more island |
| `features/kabinet/operator/ShelterRows.tsx` | row list with status filter and browser-client paging | CANDIDATE: server rows + island for the filter |
| `features/kabinet/password/ChangePasswordSection.tsx` | password-change form | required |
| `features/kabinet/password/ForgotPasswordCard.tsx` | forgot-password form | required |
| `features/kabinet/password/InviteUnusableCard.tsx` | uses useTokenOutOfAddressBar (strips token from URL) | required (effect in hook) |
| `features/kabinet/password/NewPasswordFields.tsx` | two controlled password inputs | required |
| `features/kabinet/password/PasswordField.tsx` | show/hide toggle state | required |
| `features/kabinet/password/ResetPasswordCard.tsx` | reset form, token strip | required |
| `features/kabinet/password/SetPasswordCard.tsx` | set-password form, token strip | required |
| `features/kabinet/password/use-token-out-of-address-bar.ts` | hook: history.replaceState to drop the token | required (hook) |
| `features/kabinet/profile-edit/ContactFields.tsx` | controlled contact inputs | required |
| `features/kabinet/profile-edit/ContactsSection.tsx` | section form with save state | required |
| `features/kabinet/profile-edit/DonationSection.tsx` | donation link form | required |
| `features/kabinet/profile-edit/LogoSection.tsx` | logo upload via browser client | required |
| `features/kabinet/profile-edit/PauseControl.tsx` | pause/unpause dialog | required |
| `features/kabinet/profile-edit/ProfileEditor.tsx` | editor shell: section states, browser client | required |
| `features/kabinet/profile-edit/SaveBar.tsx` | save/cancel/reload buttons (props-driven) | LOW VALUE: only used inside client sections |
| `features/kabinet/profile-edit/VoiceSection.tsx` | sentence form with live announce | required |
| `features/kabinet/SignInCard.tsx` | sign-in form, fetch, resend timer | required |
| `features/kabinet/SignOutButton.tsx` | POST sign-out then navigate | required (island) |
| `features/kabinet/SupportBanner.tsx` | exit-support POST button | required (island) |
| `features/likes/SaveButton.tsx` | toggles saved state in localStorage | required (island) |
| `features/likes/SavedNavLink.tsx` | reads saved count from localStorage after hydration | required (island) |
| `features/likes/SavedPageScreen.tsx` | whole /zberezheni screen reads localStorage and renders from it | CANDIDATE: server shell (header, footer, skeletons) + one client list island |
| `features/reveal/ContactRevealDialog.tsx` | own modal: focus, Esc, scroll lock, reveal call | required; fold into the shared Modal |
| `features/reveal/useReveal.ts` | hook: reveal call via the browser client | required (hook) |
| `image-loader.ts` | next/image custom loader; directive is deliberate (next.config.ts comment: a function prop from a Server Component into next/image fails at request time) | required |


## 5. Images: raw `<img>` vs `next/image`

| | Count | Where |
|---|---:|---|
| Raw `<img>` elements in non-test code | **1** | `features/chrome/BrandLogo.tsx:35` (static `/brand-v3/logo.svg`, `alt=""`, `aria-hidden`; an SVG gains nothing from the optimizer) |
| `<img` text in non-test code that is not an element | 3 | comments in `features/discovery/SwipeCard.tsx:83,141,142` |
| `<img` in test files | 4 | `SiteHeader.test.tsx` 2, `LogoSection.test.tsx` 2 |
| `<Image>` (next/image) elements | 18 | 10 files: `AnimalDetailScreen` 4, `DetailPhotoGallery` 3, `ShelterPageScreen` 2, `ShelterLogoAvatar` 2, `AnimalOverlay` 2, `SwipeCard` 1, `GalleryCard` 1, `AnimalCard` 1 (dead), `AnimalListRow` 1, `PhotoSection` 1 |
| Files importing `next/image` | 10 | the files above |
| `<Image>` of a static `/pet-card/*.svg` icon or divider (mostly `unoptimized`) | 10 of the 18 | `AnimalDetailScreen`, `DetailPhotoGallery`, `AnimalOverlay`, `ShelterPageScreen`: in effect `<img>` with a wrapper |
| CSS `background-image` on `<div>` for photos | 0 | none found |

The plan's "8 raw `<img>`" is the 1 element + 3 comment mentions + 4 test mentions (8 `<img` strings at `d995ae7`).
There is effectively one image path already: `next/image` with the custom R2 loader
(`image-loader.ts`, `next.config.ts` `images.loader: "custom"`, variants pinned to
`packages/db/src/image-pipeline/variants.ts`). So the real photo call sites are 8 `<Image>` elements (18 minus the 10 icons). What is **not** shared is their policy: 6 files pass `sizes=` (`SwipeCard`, `DetailPhotoGallery`, `AnimalCard`, `GalleryCard`,
`PhotoSection`, `AnimalListRow`), `ShelterLogoAvatar` uses fixed `width`/`height`; aspect ratios are chosen per call (`aspect-[328/480]`, `aspect-[3/4]`,
`aspect-[4/5]`); placeholders are inline classes. A `Photo` component would own `sizes`, aspect, placeholder
and `priority`. `BrandLogo` is the only thing a "no raw `<img>`" guard would have to allowlist (or convert
to an inline SVG / `<Image unoptimized>`).

## 6. Gap table vs the plan's section 2.2 primitives

"Exists" means a component with that job is in the tree; "partial" means a recipe exists but is private,
duplicated, a class string, or on the wrong token set; "gap" means nothing usable.

| Group | Primitive | Status | Where it is today / what to extract from |
|---|---|---|---|
| Actions | `Button` | partial | `controls.tsx` `Button` + `buttonClass` (variants `primary`/`secondary`/`text`/`icon`/`chip`, all `rg-`); brand versions are `CircleButton`, `PillButton`, `SwipeDeck.ActionButton`. No accent variant, no `lg` size, no ghost |
| | `LinkButton` | partial | `buttonClass`/`linkClass` strings put on `<Link>` (38 calls in 24 files); no component |
| | `TextLink` | partial | `linkClass("text")`; brand pages hand-write links |
| Form | `TextField`, `TextAreaField`, `SelectField` | exists (`rg-`) | `controls.tsx`; plus a private `CustomTextField` in `animal-form/FormSections.tsx` |
| | `Checkbox`, `Radio` | exists (`rg-`) | `CheckboxOption`, `RadioOption` |
| | `CheckboxGroup`, `RadioGroup` | gap | groups are hand-assembled in forms (`fieldset` + options) |
| | `SegmentedControl` | exists (`rg-`) | `controls.tsx` |
| | `Toggle` (two-option switch with links) | partial | `GallerySortToggle`, `ShelterSortToggle`, `SpeciesToggle`: three variants, no shared component |
| | `FieldHint` / `FieldError` | partial | `HINT`/`ERROR` strings and a private `FieldFrame` in `controls.tsx`; 3 other copies in kabinet styles |
| Display | `Heading` | gap | 26 `<h1>`, 42 `<h2>`, 3 `<h3>`, each with hand-written sizes |
| | `Text` | gap | `text-[Npx]` ×188 |
| | `Chip` | partial | 8+ recipes (section 1.2) |
| | `Badge` | partial | freshness pips ×5 renderings; species and "reserved" pills inline |
| | `MetaLine` | partial | `AnimalDetailScreen.MetaLine` (private) and `gallery/card-text.ts` for cards |
| | `Avatar` | partial | `ShelterLogoAvatar` (+ private `ShelterMonogram`) |
| | `Icon` | partial | four inline-SVG files with no shared `Icon` wrapper or size/colour contract |
| Containers | `Panel` | gap | three `CARD` constants; no component |
| | `Card` | gap | each card is its own composite (`GalleryCard`, `SwipeCard`, `AnimalListRow`) |
| | `Section` | gap | two private `Section` functions |
| | `Container` | gap | `max-w-[1400px]` ×5, `[1084px]` ×5, other one-offs; no gutters component |
| | `ContentPageLayout` | exists | `chrome/ContentPageLayout.tsx` (#227) |
| Overlays | `Popover` | partial | private `GalleryFilterDropdowns.Dropdown` |
| | `Sheet` | partial | `gallery/FilterSheet` (gallery-specific), `chrome/MobileNavMenu` |
| | `Modal` | partial | `controls/ModalDialog` (kabinet only, `rg-`); public overlays bypass it |
| | `Toast` / inline status | gap | `aria-live` / `role=status|alert` in 39 files, no shared status component |
| Feedback | `Skeleton` | partial | `SavedCardSkeleton` + inline `animate-pulse` (the plan's `PulsePlaceholder` does not exist) |
| | `EmptyState`, `ErrorState` | partial | 10+ one-off screens (section 1.2) |
| | `Spinner` | partial | `SwipeDeck` div with `--animate-spin-fast`; no component |
| Navigation | `Pagination` | partial | `GalleryPageNav` (live), `ShelterPageNav` (copy), `GalleryPagination` (dead) |
| | `Tabs` | gap | none found |
| | `BottomNav` | partial | `kabinet/KabinetNav` (fixed bottom bar below `desktop:`, side rail above) |
| | `PrevNext` | partial | `AnimalOverlay.NeighbourLink`, prev/next in the page navs |
| Media | `Photo` | gap | 8 photo `<Image>` call sites with per-site `sizes`/aspect (+10 static SVG icons); loader exists |
| | `PhotoSlider` | partial | `DetailPhotoGallery` (scroll-snap, `snap-x`) |

Not in the plan's list but present and worth a decision in PR 2: `FOCUS_RING` / the 54-times pasted focus
outline (a single `focus-ring` utility would remove 108 arbitrary values); the bottom `SaveBar`;
the `SupportBanner`; and `ArrowKeyGrid` (behaviour, not UI).

## 7. Guard-test seeding notes (for PR 1)

- Guard 2 (`rg-`/bare/`font-rg`) allowlist: 52 files for `rg-`, 15 for `font-rg`, 2 for bare; 4 of the 52 are the
  dead files above and drop out on deletion.
- Guard 3 (arbitrary values): 472 occurrences, 90 distinct utility+value pairs, 48 files. The 108 outline
  occurrences and the 188 `text-[Npx]` become zero once the focus utility and the type scale exist.
- Guard 1 (hex): 8 executable lines (section 3.2); `confirm-route.ts` needs an explicit exception.
- Guard 4 (raw `<img>`): one allowlist entry, `BrandLogo.tsx`.
- Guard 6 (`"use client"` list): 70 entries; table in section 4 is a ready seed.
- Counts above are class-name occurrences, not unique classes; an allowlist keyed by file should store a
  per-file ceiling (the per-file map in 2.6), not a boolean.
