# FormSection

File: `apps/web/src/ui/FormSection.tsx`

**Purpose.** One named section of a long form: a card with a heading, an optional step number and an optional one-line description. Every section stays on the page, so the form reads as plain anchored content without JS.

**Props and variants.** `id` (the anchor; the heading is `${id}-title`), `title`, `step` (1-based number badge, decoration only), `titleExtra` (an InfoTip or a counter beside the heading, outside it so the heading keeps its name), `description`, `className` (layout only).

**Accessibility.** A `section` named by its heading (a region landmark). The heading has `tabindex=-1` so a page can send focus to it (after a failed submit, or a jump from `FormSteps`). The step number is `aria-hidden`: the order in the document is the order of the steps.

**Responsive.** Padding 16 on a phone, 24 from tablet, 32 from desktop. The heading is the 20px bold `section` look on a phone and the 26px title from tablet.

**Example.**

```tsx
<FormSection id="basics" title="Основне" step={1}>…fields…</FormSection>
```
