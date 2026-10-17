# Constraints the rebrand must keep

For the designer of the coming brand, and for whoever implements it. The visual design, fonts
included, is expected to change (CLAUDE.md, "Test logic, not looks"); the rebrand should be a
token swap in `apps/web/src/app/globals.css` (`@theme`). These are the things the new design may
not drop, whatever it looks like.

## Accessibility (Oleksii, 2026-10-17)

His words, verbatim: "48px touch target: a shared min-height token on the shared button/control
primitives, plus ONE test on those primitives that the computed min-height is ≥ 48px. No
per-component or per-screen size checks. Note it in the designer handoff as a constraint the brand
must keep (WCAG AA, 50+ users on budget Android)." And: "Visible focus: keep one presence test
(focused element shows an indicator when tabbing), never its appearance."

- **Every tap target is at least 48px tall.** It comes from one theme token on the shared
  button and control primitives, so the brand may restyle a control but not shrink it below
  48px. The audience is people aged 50+ on budget Android phones; WCAG AA is the floor, and this
  goes above it on purpose.
- **Keyboard focus is always visible.** Any style is fine (outline, ring, background), as long
  as a focused control visibly differs from an unfocused one. Never `outline: none` without a
  replacement.

## Product rules a design can break

These live in `docs/standing-constraints.md` ("Product rules that are not negotiable") and
`docs/design/README.md`. They are about meaning, not looks, so they survive any rebrand:

- **Freshness is honest and never alarming:** three pips plus the day count in words, always
  both. Never red, never amber, and never opacity as the only carrier of meaning. An unknown field
  reads «Не записано», never as "no" and never as an error.
- **A fostered animal never gets a map pin.** A city-precision location renders as a place
  name.
- **The swipe filters; it doesn't judge:** «Не зараз», never "nope". No stamps, scores, streaks
  or celebration.
- **No money UI:** a donation is an external link, with its domain shown before the tap.
- **Contrast:** text and meaningful marks meet WCAG AA on their background. That includes the
  freshness pips, whose outlined "empty" state was chosen for 1.4.11 non-text contrast.
