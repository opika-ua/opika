# ErrorSummary

File: `apps/web/src/ui/ErrorSummary.tsx`

**Purpose.** What a refused save says, once, at the top of a form: every problem as a button that takes you to its field.

**Props and variants.** `items` (`{ key, message, target }`; `target` is a CSS selector, a radio group names its first radio), `ref` (the focus target). The kit holds no copy: the messages are the same sentences the fields show.

**Accessibility.** A live `role="alert"` panel that is a programmatic focus target (`tabIndex=-1`, visible focus). The form focuses it only when a person asks to save and is refused, never on an autosave, so focus is never pulled from where they are typing. Each item is a button that scrolls the field to the centre and focuses it.

**Responsive.** Full-width buttons, 48px tall, left-aligned text that wraps.

**Example.**

```tsx
{refused ? <ErrorSummary ref={summaryRef} items={[{ key: "name", message: "Вкажіть імʼя", target: "#animal-name" }]} /> : null}
```
