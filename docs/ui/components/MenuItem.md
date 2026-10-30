# MenuItem

File: `apps/web/src/ui/Menu.tsx`

**Purpose.** One entry of a Menu (a list item).

**Props and variants.** `tone?` (`default`, `danger`: the destructive entry, in the danger colour, after a `MenuDivider`, a `role=separator` rule exported beside it). `children`: a ghost Button or LinkButton with `className="w-full justify-start"`.

**Accessibility.** Plain `li` inside the Menu's list.

**Responsive.** Each entry keeps the 48px target of the control inside.

**Example.** See Menu.
