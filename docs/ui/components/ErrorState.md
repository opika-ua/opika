# ErrorState

File: `apps/web/src/ui/feedback.tsx`

**Purpose.** Something failed.

**Props and variants.** `title`, `body?`, `action?`.

**Accessibility.** `role=alert`; carries words, not just colour.

**Responsive.** As EmptyState.

**Example.**

```tsx
<ErrorState title="Не вдалося завантажити" />
```
