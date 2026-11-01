# The UI kit

The kit lives in `apps/web/src/ui`. Use it before writing any markup: if a component exists, use it;
if not, compose from the kit; if the kit cannot express it, add a component here (with a doc and a
showcase entry) rather than a one-off in a feature folder.

Rules every component follows:

- Variants are discriminated unions (`kind`/`variant`), never boolean flags.
- `className` is for layout only (margin, width, aspect ratio), never restyling.
- 48px touch target (`min-h-target`), visible focus (`focus-ring` utility from `globals.css`).
- Works without JS where it can (links and forms first); server-component-safe unless it needs state.
  Only Modal, Sheet, Popover, InfoTip, Menu, Tabs, PhotoSlider and Toast are client components.
- Tokens only: no `rg-`, no `brand-`, no raw hex, no arbitrary values (the retired token sets are
  guarded against coming back). Type scale and fonts in `tokens.md`.
- The kit holds no copy: every label, title and accessible name arrives as a prop.

See the live kit at `/dev/ui` (404 in a production build unless `OPIKA_DEV_UI=1`; not indexed, not in
the sitemap). Screenshot it at 360 and 1440 when you change a component. The harness spec
`test/harness/dev-ui.harness.ts` loads it at both widths and fails on horizontal overflow.

Guards (`src/guards/ui-guards.test.ts`): no raw hex, one token set (retired `rg-`/`brand-`/bare classes fail on any reintroduction), arbitrary values (the allowlist is empty and stays as a permanent test),
no raw `<img>`, the client-file budget, and guard 7: every exported component in `src/ui` has a
`docs/ui/components/<Name>.md` and is rendered in `/dev/ui`.

## Overlays: one core, two shapes

`Modal` and `Sheet` share `dialog-core.ts`: a native `<dialog>` opened with `showModal()`. The platform
supplies the focus trap, Esc, the Android Back key, the top layer and focus return; the core adds the
counted body scroll lock, initial focus on the title, backdrop click and a single `onClose`. Heights use
`dvh`, sheets pad the bottom with `pb-safe` (the home indicator).

What each of the five existing overlays needs to move over (done in its surface's PR, not here):

| Overlay | Becomes | Needs |
|---|---|---|
| ModalDialog (kabinet) | Modal | Same props; its tests move to Modal's contract |
| ContactRevealDialog | Modal | Stacks over the animal overlay (both in the top layer; last opened is on top); drop its own trap and hex backdrop |
| AnimalOverlay | Modal | Route-driven: always `open`, `router.back()` in `onClose`; a full-screen variant if the design keeps it |
| FilterSheet | Sheet | Keeps its GET form as children; its count line goes in children |
| MobileNavMenu | Sheet | Nav links as children; hide the trigger from desktop (1024) via `hideFrom` and `triggerClassName` |

## Catalog

| Component | File (`apps/web/src/ui/`) | Purpose |
|---|---|---|
| [Button](components/Button.md) | `Button.tsx` | The one button. Replaces controls.Button, CircleButton, PillButton and the deck's ActionButton. |
| [LinkButton](components/LinkButton.md) | `Button.tsx` | A link that looks like a Button, for navigation. |
| [TextLink](components/TextLink.md) | `TextLink.tsx` | An inline link inside prose. |
| [Icon](components/Icon.md) | `Icon.tsx` | The one inline-SVG icon set. |
| [Heading](components/Heading.md) | `Heading.tsx` | Headings mapped to the type scale. |
| [Text](components/Text.md) | `Text.tsx` | Body copy. |
| [MetaLine](components/MetaLine.md) | `MetaLine.tsx` | Facts joined by a drawn separator: «Хлопчик · дорослий · середній». |
| [Badge](components/Badge.md) | `Badge.tsx` | A small tag that sits on a photo. |
| [Spinner](components/Spinner.md) | `Spinner.tsx` | Indeterminate progress. |
| [Mascot](components/Mascot.md) | `Mascot.tsx` | Decorative cat and dog, inline SVG, perches on an edge or on a word (`PerchedWords`). `MascotPerch` seats a pair. |
| [PerchedWords](components/PerchedWords.md) | `PerchedWords.tsx` | Display-heading text with a mascot seated on the last word of its first line (client). |
| [Skeleton](components/Skeleton.md) | `Skeleton.tsx` | Loading placeholder shaped like the content. |
| [Chip](components/Chip.md) | `Chip.tsx` | One chip, six kinds. |
| [Card](components/Card.md) | `Card.tsx` | The 24px rounded container. |
| [Panel](components/Panel.md) | `Panel.tsx` | A 20px box that groups content inside a page or card. |
| [Photo](components/Photo.md) | `Photo.tsx` | The only image component. |
| [Avatar](components/Avatar.md) | `Avatar.tsx` | A shelter's logo, or its initials. |
| [Container](components/Container.md) | `Container.tsx` | Max width plus page gutters. |
| [Section](components/Section.md) | `Container.tsx` | A vertical block of a page, named by its heading. |
| [EmptyState](components/EmptyState.md) | `feedback.tsx` | Nothing to show yet. |
| [ErrorState](components/ErrorState.md) | `feedback.tsx` | Something failed. |
| [InlineStatus](components/InlineStatus.md) | `feedback.tsx` | A short message beside the thing it concerns. |
| [FieldHint](components/FieldHint.md) | `form.tsx` | Helper text under a field. |
| [FieldError](components/FieldError.md) | `form.tsx` | A field's error message. |
| [TextField](components/TextField.md) | `form.tsx` | Label, input, hint and error as one unit. |
| [TextArea](components/TextArea.md) | `form.tsx` | TextField for long text. |
| [Select](components/Select.md) | `form.tsx` | A native select with the field frame. |
| [Radio](components/Radio.md) | `form.tsx` | One option of a radio group; the whole row is the target. |
| [Checkbox](components/Checkbox.md) | `form.tsx` | One option of a multi-choice group. |
| [SegmentedControl](components/SegmentedControl.md) | `form.tsx` | A choice of a few, built from native radios. |
| [Modal](components/Modal.md) | `Modal.tsx` | A modal dialog: bottom sheet on a phone, centred card from tablet. |
| [Sheet](components/Sheet.md) | `Sheet.tsx` | A bottom sheet with its own trigger. |
| [Menu](components/Menu.md) | `Menu.tsx` | A short list of actions under a ghost button (a list row's «Ще»). |
| [MenuItem](components/MenuItem.md) | `Menu.tsx` | One entry of a Menu. |
| [FilterTabs](components/FilterTabs.md) | `FilterTabs.tsx` | One row of underline tabs with counts that filter one list. |
| [MenuDivider](components/MenuDivider.md) | `Menu.tsx` | A rule between groups of a Menu. |
| [InfoTip](components/InfoTip.md) | `InfoTip.tsx` | A «?» button that opens a short explanation in a small card in the top layer (no layout shift). |
| [Popover](components/Popover.md) | `Popover.tsx` | A panel under its trigger (the filter selectors): chip or field trigger, list or pills. |
| [Combobox](components/Combobox.md) | `Combobox.tsx`, `ComboboxMulti.tsx` | A select-only search field: async options, the value must come from the list; a list under the field, a full-screen dialog on phones. Multi-select mode: several values from a list already held, a count badge, a top-layer list. |
| [Toast](components/Toast.md) | `Toast.tsx` | One toast, presentational. `ToastProvider` renders these; it is exported for the showcase and tests. |
| [ToastProvider](components/ToastProvider.md) | `Toast.tsx` | Holds the toast queue and the live region. Wrap the page once; call `useToast().show(message, tone)` from client components. |
| [CheckboxGroup](components/CheckboxGroup.md) | `groups.tsx` | A question with several choices: fieldset, legend, hint, error. |
| [ChipGroup](components/ChipGroup.md) | `groups.tsx` | A question with many short answers as wrapping chips, in a fieldset. |
| [ErrorSummary](components/ErrorSummary.md) | `ErrorSummary.tsx` | A refused save listed once at the top; each problem takes you to its field. |
| [RadioGroup](components/RadioGroup.md) | `groups.tsx` | A question with one choice: fieldset, legend, hint, error. |
| [Toggle](components/Toggle.md) | `Toggle.tsx` | A two-option switch made of two real links (the gallery sort). |
| [Pagination](components/Pagination.md) | `Pagination.tsx` | Numbered pages as links. |
| [PrevNext](components/PrevNext.md) | `PrevNext.tsx` | Previous and next as icon links. |
| [Tabs](components/Tabs.md) | `Tabs.tsx` | Tabs that switch panels in place (ARIA tabs pattern). |
| [BottomNav](components/BottomNav.md) | `BottomNav.tsx` | A short top-level nav as a fixed bottom bar (the kabinet). |
| [PhotoSlider](components/PhotoSlider.md) | `PhotoSlider.tsx` | Photos that scroll sideways and snap. |
| [FormSection](components/FormSection.md) | `FormSection.tsx` | One named section of a long form, with an optional step number. |
| [FormSteps](components/FormSteps.md) | `FormSection.tsx` | The form's sections as a row of anchor links. |
| [StickyActionBar](components/StickyActionBar.md) | `StickyActionBar.tsx` | The save / publish bar: sticky, safe-area aware, lifted above the on-screen keyboard. |
| [FreshnessPips](components/FreshnessPips.md) | `FreshnessPips.tsx` | Three pips plus the day count in words. |
