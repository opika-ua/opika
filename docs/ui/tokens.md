# Tokens

One set, defined in `apps/web/src/app/globals.css` (`@theme`). Class names have no prefix:
`bg-surface`, `text-ink`, `rounded-card`.

| Group | Tokens | Use |
|---|---|---|
| Colour | `page`, `surface`, `ink`, `ink-2`, `muted`, `line`, `accent`, `on-ink`, `species-dog`, `species-cat`, `focus`, `success`, `warning`, `danger` | `ink` text and primary fills; `ink-2` secondary text and hints; `muted` placeholders only (not for text that carries meaning); `line` borders and quiet fills; `accent` the call to action |
| Radius | `tag` 8, `field` 12, `panel` 20, `card` 24, `sheet` 48, `pill` | tags, inputs, grouped boxes, cards, tablet sheets, buttons and chips |
| Shadow | `float` | floating layers only |
| Motion | `--duration-quick/settle/reveal`, `--ease-standard` | all go to 0 under reduced motion |
| Z-index | `--z-header/popover/sheet/modal/toast` | use `z-(--z-popover)`; dialogs use the top layer |
| Breakpoints | `tablet` 600, `desktop` 1024, `wide` 1440, `ultrawide` 2000 | mobile first |
| Spacing | Tailwind's 4px steps; `target` = 48px | `min-h-target`, `size-target` |
| Utilities | `focus-ring`, `focus-ring-within`, `pb-safe` | every control; chips with a hidden input; sheets |

## Type scale

| Utility | Size / line | Weight | Use |
|---|---|---|---|
| `text-display-xl` | 48 / 1.1 | 400 | hero, in `font-display` |
| `text-display-l` | 32 / 1.15 | 400 | page title, in `font-display` |
| `text-title` | 26 / 1.2 | 700 | section headings |
| `text-body-l` | 20 / 1.4 | 400 | lead text; bold for h3 |
| `text-body` | 16 / 1.4 | 400 | body |
| `text-label` | 16 / 1.4 | 600 | labels, field titles, buttons |
| `text-caption` | 14 / 1.4 | 600 | hints, captions, tags |

Rules (owner, 2026-10-28; Bellota reads lighter than Commissioner at equal weights):

- Minimum text size is 14px anywhere (hints, captions, meta). Body and labels are 16px.
- Labels and field titles are weight 600; headings are 700. Do not use 500 for anything that must stand out.
- Hint and secondary text is `text-ink-2` (#805F6E, AA contrast), never lighter.
- Never pick a size or weight by hand: use the utility or the `Heading`/`Text` component.

Not yet retired (DS PR 4): the `rg-`, `brand-` and bare tokens still exist as aliases for old screens; the
guards stop new uses.
