# MascotPerch

File: `apps/web/src/ui/Mascot.tsx` (exported beside `Mascot`)

**Purpose.** Seats two or more mascots side by side on one edge (the contact dialog, the Про проєкт divider). One decorative group, `aria-hidden`, no pointer events. See [Mascot](Mascot.md).

**Props.** `perch` `top-left | top-right`, `offset` as on `Mascot`, `children` the mascots (unperched).

**Accessibility.** Hidden from assistive tech.

**Responsive.** The mascots inside step down one size below `tablet`.
