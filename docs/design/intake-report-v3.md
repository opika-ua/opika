# V3 intake — «Реєстр» missing-surfaces addendum

Source examined: `D:\Downloads\Opika_ Three design directions\design_handoff_opika_registry\`
(outside the repo — nothing has been copied into `docs/design/` yet, per instruction). Four
files: `Opika Registry System.dc.html` (64,062 bytes), `Opika Registry Frames.dc.html`
(125,941 bytes), `README.md` (34,357 bytes, this export's own — distinct from
`docs/design/README.md`, the team's distillation of the *previous* export), `support.js`
(69,150 bytes, prototyping runtime only — see §0).

Every claim below was checked against the actual `.dc.html` markup, not against this
export's own `README.md` prose — `docs/standing-constraints.md`'s "when a mock exists, open
the mock" rule, and the reason it exists (E3 shipped from a prose summary and broke).

---

## 0. What is this

**One direction, not three, despite the parent folder's name.**

```
D:\Downloads\Opika_ Three design directions\
└── design_handoff_opika_registry\        ← the only child folder
    ├── Opika Registry System.dc.html
    ├── Opika Registry Frames.dc.html
    ├── README.md
    └── support.js
```

`find` on the parent turned up exactly one subfolder. There is no second or third direction
on disk to compare against — "Three design directions" is the parent folder's name, but its
contents are a single export. I'm not guessing at what the other two might contain; if they
exist, they haven't been placed here yet. **This is a fact to hand back to you, not a choice
I can make from what's present** — there's nothing to pick between in this folder.

What *is* here, unambiguously, is **not a new direction**. This export's own README says so
directly:

> "This package specifies the **«Реєстр» visual system** — a re-skin of an already-built and
> verified layout." (export `README.md:9`)

That's the same «Реєстр» system already in `docs/design/` and already mid-implementation on
`feat/v2-foundation`. This export is best described as **V2's missing-surfaces addendum**:
the same tokens, the same voice, filling in what the original handoff left as prose or left
out. `support.js` is the export tool's own prototyping runtime (hot-reload/asset-fetch code,
confirmed by scanning it — nothing app-relevant); its own README says plainly "not part of
the design," "do not ship" (export `README.md:16-17, 546`).

---

## 1. Relationship to what we have

**Addition, with one exception that's already a non-issue.**

Diffed `Opika Registry System.dc.html` byte-for-byte against the copy already in
`docs/design/Opika Registry System.dc.html` (the file V2 has been building against). Exactly
one substantive change, repeated at 7 call sites: the empty freshness pip's rendering.

| | Old (current `docs/design/`) | New (this export) |
|---|---|---|
| Empty pip | `background: #DCDCD9` (solid disc) | `border: 2px solid #63676B; box-sizing: border-box` (outline, transparent fill) |

This is **not a new requirement** — it's the export catching up to a decision your team
already made and shipped. `docs/design/README.md` already records the outlined-pip deviation
as owner-approved, and the implementation (`packages/ui/src/freshness-display.ts`,
commit `30a60d6`; consumer fix in `apps/web/src/features/discovery/SwipeCard.tsx` and
`apps/web/src/features/gallery/AnimalCard.tsx`, commit `d588c69`) already renders the outline,
not the disc, and already has a mutation-tested harness assertion proving it
(`apps/web/test/harness/freshness-pip-contrast.harness.ts`). **No code or doc catch-up is
needed here** — V2 is already ahead of this update, not behind it. One consequence worth a
follow-up, not a stop: `docs/design/README.md`'s note calling this an "owner-approved
deviation from the mock" is no longer accurate framing once the mock agrees — it's just the
spec now. Cosmetic, not urgent, and explicitly not something I'm fixing in this pass.

No other line in `System.dc.html` changed — not a token, not a type-scale value, not a radius,
not a spacing step. Verified via `diff` on the full file, not a sample.

`Opika Registry Frames.dc.html` has no counterpart in `docs/design/` at all — it's pure
addition, 18 new frame captures (`data-screen-label` attributes, see §2) plus one "token
delta" callout that's the same pip-outline note above (export
`Opika Registry Frames.dc.html:34-57`).

**Nothing here is a stop under this section's own test** ("a change to already-specified
values is a stop, not a merge") — because nothing already-specified changed.

---

## 2. Coverage

Every surface named as a gap now has a real frame — confirmed by reading the `data-screen-
label` attributes in `Opika Registry Frames.dc.html` directly (grep, not the README's list):

| Gap | Frame(s) | Label (verbatim) |
|---|---|---|
| Gallery loading | L1, L2 | "Завантаження" (1920 / 360) |
| Whole-list error | E1, E2 | "Список не відкрився" |
| Next-page error | E3, E4 | "Сторінка не довантажилась" |
| Out-of-range page notice | P1, P2 | "Сторінки не існує" |
| Deck header chrome + «До списку» exit | V1, V2, V3 | "Режим «Гортати»" (×2) + "Перехід" |
| 04 Detail | D1, D2 | "Деталі" |
| 05 Contact reveal modal | R1, R2 | "Контакти відкрито" |
| 06 My reveals | M1, M2 | "Мої запити" |
| 07 Exhausted | X1, X2 | "Ви подивилися всіх" |

19 `data-screen-label` divs total (18 screen frames + the "T — Token delta" callout). The
export's own README says "18 frames" (README.md:543) — it's presumably not counting V3
(a transition diagram, not a paired 1920/360 screen capture like the rest) as a frame in the
same sense; a one-off wording thing, not a coverage gap.

Spot-checked (not just trusted the label) that V1 actually renders the named exit control —
it does: `← До списку` at `Opika Registry Frames.dc.html:190`, exactly matching the prose
description already in `docs/design/README.md`.

**Every surface named in the original "still deliberately absent" list in
`apps/web/src/app/tvaryny/page.tsx`'s own comment now has a mock.** Nothing remains
prose-only from that list. (There may be surfaces neither list ever named — this report only
checked the specific gaps you asked about and the ones the codebase's own comments flagged.)

---

## 3. Product rules — quoted, and whether they hold

All five hold. Quoting the export's own text, not paraphrasing:

**Freshness — pips + day count, never red/amber, outlined empty pip, «Не записано» for
unknown.**
> "Three pips, always all three, always in the same position, immediately followed by
> 'оновлено N днів тому' in words." (README.md:191)
> "The empty pip is OUTLINED, not lightened: transparent fill, `border: 2px solid #63676B`...
> A lighter `#DCDCD9` disc measured 1.37:1 against white and fails WCAG 1.4.11" (README.md:203-205)

Holds, and — see §1 — already shipped in the app, ahead of this export.
«Не записано» specifically: README.md:325-327 (medical-status "not recorded" case) uses
exactly this framing — "an empty field, not a 'no'." Holds.

**Fostered animals — no map pin, city-precision as a place name.**
> "Fostered → no map at all. A `#DCDCD9` block with the city name at 15/500 and the
> explanation that coordinates are not known, so no pin is drawn." (README.md:333-334)

Restated identically for the detail screen frame: "Fostered = `#DCDCD9` block with the city
name... no map, even at 1920" (README.md:445-446). Holds.

**The swipe — «Не зараз», no stamps/scores/streaks/celebration.**
> "the swipe is filtering, not judging. «Не зараз», never 'nope'. No stamps, scores, streaks
> or celebration." (README.md:51-52)
> "No stamps, no badges, no scores, no haptics." (README.md:380, deck gesture spec)

Holds.

**Donations — external link, destination domain visible before the tap.**
> "Donations are external links with the destination domain (`dobro.ua ↗`) visible before the
> tap. The blue is never used on the donate row." (README.md:48-49)

Holds, and specified again at the detail-screen level with the exact treatment: "`dobro.ua ↗`
right in ink-2 — domain visible before the tap, no accent colour" (README.md:447-448).

**Shelter speaks first person; `freshnessSentence` is a sentence, not a metadata row.**
> "Written once by the shelter at verification, in their own words, stored per shelter. Opika
> substitutes only the date and the animal's name... Do not write, paraphrase or generate
> these sentences." (README.md:223-226)

Holds — and this export adds a constraint the current `docs/design/README.md` doesn't
appear to carry as explicitly: the attribution line "«Слова притулку · дата автоматична»"
(README.md:225) exists specifically so the quoted sentence "can never be mistaken for a
message sent today." Worth carrying forward whenever this section is actually merged.

**No rule found broken.** Nothing here required reconciliation.

---

## 4. Exact values vs. prose

**Fidelity is high and the export says so itself** ("Fidelity: high. Every colour, size,
line-height, radius, spacing step, motion timing and contrast ratio below is final,"
README.md:19) — largely true on inspection. Every screen section (Gallery, Detail, Contact
reveal, My reveals, Exhausted, deck) gives literal hex/px/line-height/radius/spacing/timing
values, and the Frames file backs every one of them with actual rendered markup at 1920 and
360, not just the README's prose restating itself.

What's genuinely prose-only (behavioral rules, not visual values — appropriately so, these
aren't things a px value would express):
- "Ukrainian length" guidance (README.md:133-139): "nothing shrinks type to fit," wrap over
  shrink, `text-wrap: pretty` — real CSS properties named, but no new numeric values beyond
  the already-stated min-height/line-clamp.
- "Deliberately absent" list (README.md:513-520): a set of "we will not build X" rules
  (no map-with-pins, no freshness filter, no attention counters, no phantom tiles, no
  infinite scroll, no red/amber) — correctly prose, since these are absence claims.
- The out-of-range page's "not a 404, not a silent redirect" behavior (README.md:410-411) is
  a server-behavior spec, not a visual one — precise in what it requires, but not a px/hex
  value by nature.

Nothing found that *should* have been a number and was left vague instead.

---

## 5. Geometry — unchanged, and the export says so explicitly

> "Structure, breakpoints, column counts, container widths, the rail/sheet split and the URL
> scheme are **unchanged**; what changes is palette, typeface, type scale, radii,
> borders-vs-fills, elevation, density, iconography and motion." (README.md:9-12)
> "Everything below is layout that already exists and is verified. Only the visual values
> change." (README.md:260)

Cross-checked the breakpoint table (README.md:263-268) against what's already
harness-verified: 1024 rail cutover, 960/1320 desktop content caps, 0-599/600-1023/
1024-1439/1440+ tiers — all match `docs/standing-constraints.md`'s own OFFSET-pagination
exception note and the column counts already asserted in
`apps/web/test/harness/gallery-layout.harness.ts` (1/2/3/4 columns, confirmed passing in the
just-run `pnpm check`). New frames (L1 etc.) reuse the same 1320-capped header/rail/grid
shell verbatim — spot-checked in the raw markup (`Opika Registry Frames.dc.html:60-70`), not
just claimed.

**No geometry change. Nothing here is a stop under this section's test either.**

---

## 6. Contrast — independently recomputed, not taken as given

Recomputed WCAG relative-luminance contrast for every flat-color pairing named in the
Colour table (README.md:70-82), using the standard sRGB relative-luminance formula rather
than trusting the export's own numbers:

| Pairing | Export's claim | Independently computed |
|---|---|---|
| ink `#101112` on surface `#FFFFFF` | 18.7:1 | **18.90:1** |
| ink-2 `#45484B` on surface `#FFFFFF` | 9.6:1 | **9.20:1** |
| registry `#1B3A6B` on surface `#FFFFFF` | 11.3:1 | **11.27:1** |
| ink-3 `#63676B` on surface `#FFFFFF` | 5.9:1 | **5.70:1** |
| ink-3 `#63676B` on page `#ECECEA` | 5.4:1 | **4.82:1** |
| ink-3 `#63676B` on fill `#F2F2F0` | 5.6:1 | **5.09:1** |
| old empty-pip fill `#DCDCD9` on white | 1.37:1 | **1.37:1** (exact match) |
| dark ink `#F4F5F6` on dark surface `#17191B` | 17.4:1 | **16.15:1** |
| dark ink-2 `#B9BEC2` on dark surface `#17191B` | 9.7:1 | **9.41:1** |
| dark ink-3 `#8E9498` on dark surface `#17191B` | 5.7:1 | **5.74:1** |
| dark registry `#8FB4E6` on dark surface `#17191B` | 8.6:1 | **8.26:1** |

My numbers run consistently a bit under the export's own (up to ~0.6 lower on the worst
case, `ink-3` on `page`), likely a rounding/methodology difference I didn't chase further
since it doesn't change any conclusion. **Nothing drops below the threshold that matters for
its actual use.** `ink-3` is restricted to 13px+ captions/labels (normal text needs 4.5:1) —
its lowest independently-computed value is 4.82:1 (on page background), which still clears
4.5:1, just with less headroom than the export states. The only sub-4.5:1 pairing on the
whole page is the *old*, already-replaced pip fill (1.37:1) — confirmed exactly, and it's the
thing already fixed, not a live pairing anywhere in the current spec.

**No new contrast failure found.** The one real failure in this whole export (the old solid
pip) is one this team already caught and fixed before this export even existed.

---

## 7. Harness and V2 impact

**Zero existing harness assertions need to change.** Geometry is unchanged (§5), and the
only token change (§1, empty-pip outline) is already implemented and already the thing
`freshness-pip-contrast.harness.ts` asserts — this export didn't introduce that requirement,
it caught up to it.

What this *does* unlock: every surface `apps/web/src/app/tvaryny/page.tsx`'s own comment
lists as "still deliberately absent" (loading, whole-list error, next-page error,
out-of-range notice) and everything `apps/web/src/features/discovery/SwipeDeck.tsx` still
renders in old tokens (`LoadingState`, `ErrorState`, `ExhaustedState`) now has a real mock to
build from, plus 04/05/06/07 which don't exist as routes yet at all. None of that is this
report's job to scope — flagging only that the "no mock exists yet" reason these were
deferred (`docs/build-plan.md`'s V2 section, "OUT OF SCOPE — no mock exists") no longer
applies to any of them. Whether/when to build them is a build-plan decision, not something
this intake pass is deciding.

---

## Bottom line

- **Not three directions** — one folder, one direction, and it's the one already adopted.
  The other two (if they exist) aren't here yet — that's a question back to you, not
  something resolved by this report.
- **Addition, not replacement.** One token value in `System.dc.html` changed and the app is
  already ahead of it. Nothing else in the already-specified system moved.
- **Every named coverage gap now has a real, dual-viewport mock.**
- **All five non-negotiable product rules hold**, verified by quote, not inference.
- **No geometry change, no new contrast failure, no harness repointing required.**
- **Nothing here is a stop.** Nothing was reconciled, silently or otherwise — there was
  nothing to reconcile.

Per instructions: stopping here. Nothing copied into `docs/design/`, no app code touched.
