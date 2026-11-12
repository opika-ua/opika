# Tokens

One set, defined in `apps/web/src/app/globals.css` (`@theme`). Class names have no prefix:
`bg-surface`, `text-ink`, `rounded-card`.

| Group | Tokens | Use |
|---|---|---|
| Colour | `page`, `surface`, `ink`, `ink-2`, `muted`, `line`, `accent`, `accent-strong`, `accent-text`, `on-ink`, `species-dog`, `species-cat`, `focus`, `success`, `warning`, `danger` | `ink` text and primary fills; `ink-2` secondary text and hints; `muted` placeholders only (not for text that carries meaning); `line` borders and quiet fills; `accent` the call to action (fill only; text on it is `on-ink`, white; orange as text on a light background, and the focus ring, is `accent-text`); `accent-strong` #D9531A the fill of the primary accent Button only, with `on-accent-strong` #FFFFFF as its label colour (nothing else uses either) |
| Radius | `tag` 8, `field` 12, `bar` 16 (the page save bar only), `panel` 20, `card` 24, `sheet` 48, `pill` | tags, inputs, grouped boxes, cards, tablet sheets, buttons and chips |
| Shadow | `float` | floating layers only |
| Motion | `--duration-quick/settle/reveal`, `--ease-standard` | all go to 0 under reduced motion |
| Z-index | `--z-header/popover/sheet/modal/toast` | use `z-(--z-popover)`; dialogs use the top layer |
| Breakpoints | `tablet` 600, `desktop` 1024, `wide` 1440, `ultrawide` 2000 | mobile first |
| Spacing | Tailwind's 4px steps; `target` = 48px | `min-h-target`, `size-target` |
| Layout grid | `grid-cols-page`, `gutter`, `margin`, `content`, `reading`, `sidebar` | the page grid, below |
| Utilities | `focus-ring`, `focus-ring-within`, `focus-ring-on-ink` (white ring on an ink surface), `pb-safe` (sheets), `pb-inset` (fixed bars), `bottom-above-nav` (a bar that sticks above the kabinet's phone nav) | every control; chips with a hidden input; sheets and fixed bars |

## Layout grid

From the owner's foundations sheet (2026-11-12). Columns are fluid (`1fr`): the sheet's column widths
(73, 76, 78) are what they come to at 360, 768 and 1440. The values switch at the existing `tablet` and
`desktop` breakpoints; the sheet draws its cut points at 768 and 1200, which is open with the owner.

| Token | Utility | Phone | `tablet` | `desktop` | Use |
|---|---|---|---|---|---|
| `--grid-template-columns-page` | `grid-cols-page` | 4 | 8 | 12 | the page grid; blocks take `col-span-*` |
| `--spacing-gutter` | `gap-gutter`, `gap-x-gutter` | 12 | 16 | 24 | between columns, and between cards in a grid |
| `--spacing-margin` | `px-margin`; `-mx-margin` to bleed | 16 | 24 | 24 | the page's side margin; from `desktop` the content is also capped and centred, so the margin grows (120 at 1440) |
| `--container-content` | `max-w-content` | 1200 | 1200 | 1200 | the content's maximum width |
| `--container-reading` | `max-w-reading` | 690 | 690 | 690 | running text: seven desktop columns, lines under ~80 characters |
| `--spacing-sidebar` | `w-sidebar` | – | – | 240 | the kabinet sidebar; the grid beside it keeps a 48 margin (`px-12`) |
| `--grid-template-columns-cards` | `grid-cols-cards` | auto | auto | auto | a card grid (the kabinet's animals): `repeat(auto-fill, minmax(min(320px, 100%), 1fr))` with `gap-gutter`; the column count follows the width the grid has, never a viewport query |

- **Page box:** `mx-auto box-content max-w-content px-margin`. Content-box, so the 1200 cap is the
  content's and the margin sits outside it.
- **Grid:** `grid grid-cols-page gap-gutter`, blocks on `col-span-*`. A block four columns wide
  (`col-span-4`) is one per row on a phone, two from `tablet`, three from `desktop`.
- **Full bleed:** only photos in the animal viewer and nav dividers ignore the margin (`-mx-margin`).
- **Spacing roles** (Tailwind steps, the sheet's scale is 1, 2, 3, 4, 6, 8, 12, 16): inside a group 12
  or less; between groups 16 to 24; between sections 32 on a phone, 48 on desktop; the page bottom 64.

## Mascot colours

The mascots (`Mascot`, `docs/ui/components/Mascot.md`) reuse `accent` (orange), `species-dog` (the dog's dark patch) and `on-ink` (eyes). Four tokens exist only for them, declared `@theme static` because the SVG reads them through `var()`:

| Token | Value | Use |
|---|---|---|
| `mascot-dog` | #A469FB | the dog's body |
| `mascot-dog-light` | #DBC3FD | the dog's muzzle |
| `mascot-cat-stripe` | #A04300 | the cat's stripes and collar |
| `mascot-tag` | #F1D692 | the collar tag and paws |

Decorative only: never text or a fill that carries meaning.

## Status chip tints

A card's or a shelter's state, as a soft tint with its own text colour (`Chip kind="status"`, tones `published`, `reserved`, `adopted`, `withdrawn`; a draft is the outline info chip). Used on the kabinet's animal list and the operator's shelter screens. Never a warning colour. Ratios measured with the WCAG relative-luminance formula:

| Tone | Fill | Text | Contrast |
|---|---|---|---|
| `published` | `status-published` #EDE6F7 | `status-published-ink` #5B3A96 | 6.9:1 |
| `reserved` | `status-reserved` #FDE6D8 | `status-reserved-ink` #9A3412 | 6.1:1 |
| `adopted` | `status-adopted` #E9DDEC | `status-adopted-ink` #270041 | 13.8:1 |
| `withdrawn` | `status-withdrawn` #E8E5E6 | `status-withdrawn-ink` #735263 | 5.4:1 |

## Type scale

| Utility | Size / line | Weight | Use |
|---|---|---|---|
| `text-display-xl` | 48 / 1.1 | 400 | hero, in `font-display` |
| `text-display-l` | 32 / 1.15 | 400 | page title, in `font-display` |
| `text-display-m` | 28 / 1.15 | 400 | the gallery title below 360px; the kabinet's shelter-name page title (`Heading look="display-m"`) |
| `text-title` | 26 / 1.2 | 700 | section headings |
| `text-body-l` | 20 / 1.4 | 400 | lead text; bold for h3 |
| `text-body` | 16 / 1.4 | 400 | body |
| `text-label` | 16 / 1.4 | 600 | labels, field titles, buttons |
| `text-cta` | 19 / 1.4 | 700 | the accent Button label, every size and breakpoint (large text, see contrast) |
| `text-chip` | 15 / 1.4 | 600 | the pet card's fact chips |
| `text-caption` | 14 / 1.4 | 600 | hints, captions, tags |

Fonts (self-hosted through `next/font/local` in `app/fonts.ts`, both SIL OFL 1.1, no on-page credit):
Climate Crisis is the display face (`font-display`, headings only); the UI face is «Opika Variable», an OFL
derivative of Bellota Text (weights 300-700, the page default). Licence and provenance sit beside each file in
`app/fonts/`. Role names map to them in `globals.css`.

Rules (owner, 2026-10-28; the UI face reads light at equal weights):

- Minimum text size is 14px anywhere (hints, captions, meta). Body and labels are 16px.
- Labels and field titles are weight 600; headings are 700; the large Button size sets its label at 700. Do not use 500 for anything that must stand out.
- Hint and secondary text is `text-ink-2` (#735263, AA on `page` and on `line`), never lighter.
- Never pick a size or weight by hand: use the utility or the `Heading`/`Text` component.

The old `rg-`, `brand-` and Keeper's Voice token sets are gone (DS PR 4); the guards fail on any
reintroduction.

## Accepted contrast deviations

| Pair | Ratio | Rule | Decision | Mitigation |
|---|---|---|---|---|
| White (`on-ink`) text on the `accent` fill #F26427 (cat Badge, accent Chip) | 3.0:1 | Below WCAG 1.4.3 AA for normal text (4.5:1) | Accepted by the owner on 2026-10-29 as the brand design. The fill is not darkened. | Badge and Chip labels are 14px at weight 600. No body-size text on the fill. |
| Pure white (`on-accent-strong` #FFFFFF, this button only; `on-ink` is #FAF8F9) text on `accent-strong` #D9531A (accent Button) | 4.0:1 | Below 4.5:1, passes 1.4.3 only as large text (3:1) | Owner, 2026-11-04 (Lighthouse failure; replaces the #F26427 fill for this button). | The label is `text-cta`: 19px bold, above the 18.66px bold large-text threshold, at every breakpoint including the phone sticky bar. Pinned by `Button.test.tsx`. |

Orange as text on a light background is not part of this deviation: it uses `accent-text` (#C2410C, 4.9:1), as does the focus ring.
