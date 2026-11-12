# Menu

File: `apps/web/src/ui/Menu.tsx`

**Purpose.** A short list of actions under a ghost button (a list row's «Ще»). Added for the kabinet animals list; Popover is a chip-styled filter panel and does not fit an action list.

**Props and variants.** Controlled: `open`, `onOpenChange`, `label` (the trigger's text; a chevron is added), `trigger?` (`text`, `icon`: a 48px ⋯ button named by `label`, `icon-plain`: the same ⋯ with no border or shadow, 48px, for a card's corner, `icon-compact`: the same ⋯ as a 32px circle inside a 44px target, for a button laid over a photo, or `status`: a status chip, `text` in its `tone` (the Chip status tones) with a chevron, inside a 48px target, named in full by `label`, for a state the list can change, the kabinet animal card's), `triggerId?`, `describedBy?` (ids that say whose menu it is), `align?` (`start`/`end`), `className?` (layout). Children are `MenuItem`s holding a ghost Button or LinkButton. Client component.

**Accessibility.** A disclosure, not an ARIA menu: the trigger has `aria-expanded`/`aria-controls`, the items are real buttons and links in tab order. Esc closes and returns focus to the trigger; a press outside or focus leaving closes. The panel is in the top layer (a manual popover), so a card with `overflow: hidden` never clips it, and it stays in the DOM right after its trigger, so Tab moves from the trigger into the items; it follows the trigger on scroll and closes when the trigger scrolls out of view or under the sticky header, like Esc (`useAnchored`, shared with InfoTip and ComboboxMulti).

**Responsive.** The panel floats over the content under the trigger (above when there is no room below), at least 192px wide; align `end` when the trigger is near the right edge. It is positioned with `fixed` coordinates, so a parent's `transform` does not move it.

**Example.**

```tsx
<Menu open={o} onOpenChange={setO} label="Ще"><MenuItem><Button variant="ghost" …>Редагувати</Button></MenuItem></Menu>
```
