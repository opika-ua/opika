# FormSteps

File: `apps/web/src/ui/FormSection.tsx`

**Purpose.** The form's sections as a row of links, each to its `FormSection`'s `id`. Navigation only: no state, no script.

**Props and variants.** `labelledBy` (id of the element that names the form, usually its page title), `steps` (`{ id, label }[]`, in order), `className` (layout only).

**Accessibility.** A nav named by `labelledBy`; plain `<a href="#id">` links. The step number inside each link is `aria-hidden`.

**Responsive.** 48px chips. One row that scrolls sideways below tablet (it bleeds to the screen edge over the 16px page gutter, so it assumes that gutter), wrapping from tablet.

**Example.**

```tsx
<FormSteps labelledBy="page-title" steps={[{ id: "basics", label: "Основне" }, …]} />
```
