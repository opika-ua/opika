# SegmentedControl

File: `apps/web/src/ui/form.tsx` (also exports `SEGMENT_TRACK`, `SEGMENT`, `SEGMENT_ON`, `SEGMENT_OFF`, shared with the gallery's link-based species toggle)

**Purpose.** A choice of a few, built from native radios.

**Props and variants.** `name`, `legend`, `segments` ({value, label, hint?}), `value` (null = none), `onChange`, `hint?`, `error?`.

**Geometry (owner spec).** Track 52px tall (same as the filter dropdowns), radius 12 (`rounded-field`), 2px `line` border. Segments 44px tall (`min-h-11`), 16px side padding, 64px minimum width (`min-w-16`), centred text, 4px gap, radius 8 (`rounded-tag`). The 4px inset all round is the 2px border plus 2px padding, so the selected pill follows the outer curve and the track is 52px including its border. No new tokens: all Tailwind 4px steps and the existing radii.

**States.** Selected: `ink` fill, `on-ink` text (17:1). Unselected: `ink-2` text on transparent; hover fills `line` (ink-2 on line is 4.98:1, AA). Focus: `focus-ring-within` on the segment. The track as a whole is 52px, above the 48px target floor.

**Accessibility.** Native radio group; arrow keys move the choice; announced as 1 of N.

**Responsive.** Phone: full width, segments share it equally. From `tablet:` the track shrinks to fit its segments. Segments wrap onto more lines if they cannot fit.

**Example.**

```tsx
<SegmentedControl name="sex" legend="Стать" … />
```
