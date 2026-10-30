# Modal

File: `apps/web/src/ui/Modal.tsx`

**Purpose.** A modal dialog: bottom sheet on a phone, centred card from tablet.

**Props and variants.** Controlled: `open`, `onClose`, `title`, `description?`, `closeLabel`, `locked?` (Esc, backdrop and the close button do nothing while a save is in flight), `header?` (a lead, e.g. thumbnail and name, in the close button's row; the title then sits below it), `dialogTestId?`/`closeTestId?` (harness hooks). Client component, on the shared core (`dialog-core.ts`).

**Accessibility.** Native `<dialog>` with `showModal()`: focus trap, Esc, Android Back, focus returns to the opener. Focus lands on the title. Page scroll locked while open.

**Responsive.** `dvh` max height; safe-area padding below. On a phone a decorative grab handle tops the sheet.

**Example.**

```tsx
<Modal open={o} onClose={close} title="…" closeLabel="Закрити">…</Modal>
```
