# ErrorSummary

File: `apps/web/src/ui/ErrorSummary.tsx` (client: its links carry a click handler)

**Purpose.** A refused submit with two or more problems, once, at the top of the form: a heading
(«Заповніть 3 поля:») and each field's name as a link that takes you to it.

**Props and variants.** `heading?` (the caller counts and plurals it with `Intl.PluralRules`), `items`
(`{ key, label, target, onSelect? }`; `label` is the field's name, `target` a CSS selector, a radio
group names its first radio), `ref` (the focus target). The kit holds no copy.

**When it shows.** Only with two or more problems. `errorFocusOf(items)` says where a refused submit
sends focus: `summary` (two or more: render the summary and focus it), `field` (one: no summary,
`focusErrorField(item)` focuses that field), or `none`. Validation runs on submit, then on blur for
fields that were already wrong; never on every keystroke before the first submit.

**Look.** A 2px `danger` frame on `danger-bg`; the heading in `danger`, weight 600; the items as an
underlined bulleted list in `ink`.

**Accessibility.** A live `role="alert"` that is a programmatic focus target (`tabIndex=-1`, visible
focus). Focus it only when a person asks to submit and is refused, never on an autosave. Each item is
a real link (`href` is the target when it is an id) that scrolls the field to the centre and focuses
it; 48px tall.

**`onSelect`.** Optional per item. When the field may sit in a hidden tab, the page switches the tab
and focuses the field itself; without it the link focuses `target`.

**Callers today.** The animal form and the registration form still pass their messages as labels and
show the summary from one problem up; R2 moves them to field names and `errorFocusOf`.

**Example.**

```tsx
const focus = errorFocusOf(items);
{focus.kind === "summary" ? <ErrorSummary ref={summaryRef} heading={heading} items={items} /> : null}
```
