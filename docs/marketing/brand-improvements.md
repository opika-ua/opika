# Brand improvement points

**Date:** 2026-10-06 · internal, English · **Inputs:** `competitive-brief.md`, `brand-voice.md`,
`brand-review.md` (all in this folder), `docs/design/README.md`, `apps/web/src/app/layout.tsx`,
`SiteHeader.tsx`
**Goal (handoff §1.3, §7):** Opika should read as a *register* — institutional, trustworthy,
Diia-adjacent — and still be recognisably *itself*. The model is Diia's brand discipline (one
system, one typeface, restraint, no mascot, plain language), not consumer pet brands.

Effort is in Oleksii-hours at the current ~10 h/week, with what each item actually costs. Nothing
here is "fast". Ukrainian lines are *proposals*.

---

## Priority order at a glance

| # | Item | Why now | Effort |
|---|---|---|---|
| 1 | Say who runs it (non-affiliation line) | State/city confusion is the #1 threat in the competitive brief | ~1 h |
| 2 | Decide the name — before the first shelter hears it | Rename cost is at its lifetime minimum today | 2–4 h to decide; 6–10 h if renamed |
| 3 | Fix the blue's double meaning | The design spec says the fresh pip means "confirmed" — commitment #7 says it must not | 3–5 h |
| 4 | Favicon, app icon, Telegram avatar | **No favicon exists at all** today | 3–4 h |
| 5 | Open Graph images — without relative dates | The share preview *is* the distribution channel | 6–10 h |
| 6 | Descriptor + consolidated title string | One line under the name, in one place | ~1 h |
| 7 | Recognisability rules (ground, pips, type) | Make the system ownable without breaking the register | ~2 h (documentation) |
| 8 | Shelter leaflet (one page, prints in black) | First physical/PDF touchpoint for a volunteer | 4–6 h incl. Ukrainian |
| 9 | One social channel: Telegram first, with hard rules | Don't open it yet; decide what it is | ~1 h to write rules |

---

## 1. Say who runs it

**Problem.** The «Реєстр» skin, the e-Ukraine typeface (commissioned for Diia) and the word
«реєстр» make Opika look institutional — on purpose. Kyiv runs a real municipal adoption service
in «Київ Цифровий». A visitor can reasonably assume Opika is official, or wonder if it's
imitating something official. Either reading damages trust the moment they find out otherwise.

**Change.** One line in the footer of every page and in «Про проєкт»:
*proposal* — «Незалежний проєкт однієї людини. Не є державним чи міським сервісом.»

**Cost.** ~1 h: one key, one render site, one test. It also keeps commitment #6 visible on
adopter-facing pages, where today it only appears on `/pro` and `/prytulkam`.

**Keep:** the institutional look. The fix is disclosure, not retreat.

---

## 2. The name: «Opika»

### Assessment

| For | Against |
|---|---|
| Real meaning, the right one: care, guardianship | **«опіка» is first a legal term** — «органи опіки та піклування» are the child-guardianship authorities. Combined with a Diia-adjacent look, it *adds* to the "official service" read rather than offsetting it |
| Short, two syllables, easy to say | Latin wordmark «Opika» on a Ukrainian-only site: readable, but it isn't the word — Ukrainians see a transliteration, not «Опіка» |
| Same root as Polish *opieka* — a Phase 4 bridge | Polish readers see a misspelling of *opieka*, not a cognate |
| Domain held (`opika.org.ua`); `.org.ua` signals non-commercial | Search noise: «опіка» returns legal guardianship; «опіки» returns burns (опік). The name will never rank on its own — only the descriptor will |
| The mark is abstract (arch + threshold), so it survives any rename | Two web searches on 2026-10-06 found no Ukrainian pet or charity brand using it — a point *for*, but **not a trademark check** |

### What a rename actually costs

- **Now (before any shelter contact):** domain registration and DNS/Vercel config; ~10 places
  that contain the name (`about.intro`, three `forShelters.*`, `detail.shelterVerifiedYears`,
  layout title default/template/siteName/og title, `SiteHeader` `WORDMARK`); the wordmark lockup redrawn at three
  sizes; docs. **6–10 h.** The npm scope `@opika/*` need not change.
- **After first outreach:** all of the above, plus every shelter you've spoken to now hears a new
  name from a project that just told them it wouldn't "promise and vanish". A renamed platform
  looks, to a burned volunteer, a lot like a vanished one. That cost isn't measured in hours.

### Options

- **A — Keep «Opika», Latin wordmark, as is.** Zero cost. Rely on the descriptor (#6) and the
  non-affiliation line (#1) to carry meaning and disarm the "official" read. Best for Phase 4.
- **B — Keep the name, Cyrillic wordmark «Опіка» on Ukrainian surfaces.** ~3 h. The word
  becomes the word; the legal-guardianship connotation gets *stronger*, not weaker.
- **C — Rename to something plainly about animals and finding, not about authority.** 6–10 h plus
  a naming exercise. Criteria if chosen: Ukrainian-native, not a legal or state term, not a
  diminutive («Лапка», «Хвостик» fail §3.6 of the voice guide), pronounceable in Polish, `.org.ua`
  available, no existing Ukrainian animal charity using it. *Do not pick from a brainstorm here —
  run trademark and domain checks first.*

**Lean: A**, decided explicitly and written into `standing-constraints.md` as settled, so it
stops being a "working name" with a rename hanging over every asset. If the guardianship
connotation bothers you as a Ukrainian speaker more than it reads from here, C — but only before
the first shelter conversation. B is the weakest: it pays a cost to amplify the one problem.

---

## 3. The blue: one colour, two meanings

**Problem.** The design system has exactly one colour, `#1B3A6B`, defined as *"confirmed by the
state registry"*. The same spec then puts it on the first freshness pip and says *"both mean
someone confirmed this."* But the freshness date measures only when information was last
updated — commitment #7 forbids calling it a confirmation. The visual system currently says, in
colour, the thing the copy is forbidden to say.

It also ties the brand's only colour to the *state*, which feeds the confusion in #1.

**Options.**

- **(a) Blue means state registry only. Fresh pip goes to ink `#101112`.** Fresh = 1 ink pip,
  aging = 2 grey, stale = 2 grey + 1 ink — still distinct by count and position, never by hue
  alone (already the spec's rule). Cost: token change in `freshness-display.ts`, the two card call
  sites, re-run `freshness-pip-contrast.harness.ts` (ink clears 3:1 trivially), spec text. 3–5 h.
- **(b) Keep blue on the fresh pip, rewrite the spec to say it means "updated recently".** ~1 h,
  but the blue then means two different things and a reader learns neither.

**Lean: (a).** It makes the honesty mechanism and the visual system say the same thing, and it
leaves Opika with no borrowed-authority colour — recognisability comes from #7 instead.

**Closed 2026-10-07, without recolouring: resolved against H2-3 instead.** Oleksii's answer to
inbox H2-3 (`docs/decisions-inbox/docs-h2-contract-proposal.md`), verbatim: "Note for the design
spec: this makes "blue pip = someone confirmed this" true. Close
docs/marketing/brand-improvements.md #3 against this change instead of recolouring the pip."
The problem above was that the freshness date measured edit time, so a blue pip saying "someone
confirmed this" claimed more than the data held. Since H2-3 the date *is* a confirmation:
`listing.confirmedAt`, set at publish and by the shelter's «Ще шукає», and never moved by an
edit. "Fresh pip = someone confirmed this recently" is now what the data says, so the blue
stays on the fresh pip.

Neither option above is taken. The copy that names the date (`docs/h2-copy-sheet.md` B1/B2)
still has to say "confirmed" before the visual and the words fully agree, and that is the copy
sheet's job, not a colour change.

---

## 4. Favicon, app icon, Telegram avatar

**Today:** no favicon, no `icon.*`, no `apple-icon`, no manifest exists in `apps/web` — the tab
shows the browser default. The spec already defines the favicon (white mark on an `#101112`
rounded square; dot dropped at 16 and 24 px). It just hasn't been built.

**Sizes and rules.**

| Asset | Spec |
|---|---|
| `favicon` 16/32 | white arch + threshold, **no dot**, on ink rounded square |
| `icon.svg` / 192 / 512 | full mark incl. dot at ≥ 48 px |
| `apple-icon` 180 | full mark, ink square (iOS rounds it) |
| **Telegram avatar** (circle crop) | The threshold line (68 of 96 units wide, at y = 88) **gets clipped by a circle** if the mark fills the square: the circle's chord at that height is ~53 units. Scale the mark to **≈ 60 % of the avatar diameter**, centred optically on the threshold, white on ink. Check at 40 px (chat list) — drop the dot there if it blurs. |

**Cost.** 3–4 h: three SVG variants from the existing path data, Next's file-based `icon`/
`apple-icon` conventions (no new dependency), one manual check in Telegram desktop + Android.
H4 (PWA, `handoff-2026-10-04.md` row 8) needs manifest icons anyway — build these once, before
or as part of H4, so the two don't diverge.

---

## 5. Open Graph images

The competitive brief's core finding: an animal link pasted into a Telegram group *is* Opika's
distribution. Today a per-animal link previews with the raw animal photo (good), and every other
route previews with title + text only (deliberately — `layout.tsx` records the default card as a
design task, not to be faked).

**Two cards.**

1. **Site default** (`/`, `/tvaryny`, `/prytulkam`, `/pro`) — 1200×630, cream `#ECECEA` ground,
   mark + wordmark top-left, descriptor (#6) in e-Ukraine 700, nothing else. No animals, no
   numbers.
2. **Per animal** — the photo (4:5, cropped into the left ~55 %), the animal's name, city,
   species/age/size, small mark + wordmark. White panel on cream.

**The honesty rule for both: no relative time in an image.** Telegram, Viber and Facebook cache
previews for days to weeks. A card that says «оновлено 3 дні тому» will keep saying it long after
it stops being true. Either show the absolute date («оновлено 25 вересня») or — better — leave
freshness out of the image and let the page say it. Same for «Уже домовляються»: a cached
"reserved" badge outlives the reservation. Put nothing in the image that can change.

**Demo period:** while `REGISTRY_HAS_NO_REAL_SHELTERS` is true, per-animal cards must carry the
demo disclosure or not render — same gate as the visible banner.

**Cost.** 6–10 h with Next's built-in `ImageResponse` (no new dependency): e-Ukraine woff loading
into the renderer, two layouts, the demo gate, and a manual check in Telegram, Viber and the
Facebook sharing debugger. Font licence: CC BY 4.0 attribution must stay reachable from wherever
the image lands — the page footer covers that.

---

## 6. Descriptor

The line under the name. It should say what the thing is, as a fact.

*proposal* — **«тварини з перевірених притулків Київщини»**

- Already the de facto title (`layout.tsx`) and the first half of `firstRun.promise` — this
  formalises it rather than inventing.
- Avoids «реєстр тварин», which is the state register's own term (see brand-review, terminology
  watch).
- Contains the three facts that differentiate: animals, *verified* shelters, one oblast.
- When Phase 4 adds cross-border, the descriptor changes; the name doesn't have to.

**Lockup:** wordmark, then descriptor in ink-2 at body-s on a separate line; never a tagline
with punctuation or a promise. **Move the title string into `uk.ts`** (brand-review, "strings
outside the catalogue") so name + descriptor live in one place. ~1 h.

---

## 7. Recognisable without breaking the register

Diia is recognisable not because of a mascot but because *every surface is built from the same
few parts, without exception*. That's the discipline to copy.

**Own these three things:**

1. **The cream ground `#ECECEA` + ink, with photographs as the only colour.** Diia is white;
   Opika is paper. On a feed of bright Instagram tiles and OLX thumbnails, a cream card with one
   photo is distinctive precisely because it's quiet. Every new surface (OG, leaflet, avatar
   background where light) starts from cream.
2. **The three pips as the signature.** They are the honesty mechanism made visible and no
   competitor has anything like them. Use them anywhere freshness is *on the page* (cards,
   detail, deck) — and, as a decorative motif, on the leaflet and site OG card *without* a date
   attached (a row of three outlined pips = "this is the place that tells you how fresh things
   are"). Never on cached per-animal images with meaning attached (see #5).
3. **e-Ukraine, everywhere, at the spec's scale.** Including the leaflet and OG images. No second
   typeface, ever. (It amplifies the Diia read — that's why #1 matters.)

**Never add:** a mascot, paw prints, hearts, illustration, a second colour, gradients, stickers,
emoji in brand surfaces. The spec's "no paw, no muzzle" for the mark extends to the brand.

**Cost.** ~2 h to add a "Brand surfaces" section to `docs/design/README.md` that states these rules
so the leaflet, OG and avatar are built from them, not improvised.

---

## 8. The first shelter-facing material — a one-page leaflet

For the volunteer with forty dogs and a phone, who may get it as a PDF in Telegram or on paper
from someone she trusts.

**Format.** A4, one side (or A5 two-sided), **prints cleanly on a home black-and-white printer** —
which the system already guarantees, because there's no colour to lose. PDF ≤ 1 MB so it sends
over mobile data.

**Content, in this order** (mirrors `/prytulkam`, condensed — Ukrainian by Oleksii, from the
`prytulkam-argument.md` structure, not translated):

1. Mark + wordmark + descriptor.
2. What this is — one sentence.
3. Cost — free, with notice before anything changes (commitment #3 wording).
4. Who writes to whom — adopters write to you directly; I never write on your behalf.
5. What «перевірений» means — the two paths (registered / volunteer group), concretely.
6. What to prepare — photos, a few sentences, a contact, how often you update.
7. Who's behind it — «я», name, one-line context, the contact.
8. A QR code to `/prytulkam` and the plain URL beneath it.
9. Footer: «Версія від <дата>» (so the leaflet can go out of date honestly), e-Ukraine credit.

**Not on it:** numbers of animals or adopters, screenshots of the demo corpus, any shelter's
name or logo, "join", "partner", "platform".

**Cost.** 4–6 h: Oleksii writes the Ukrainian (2–3 h), layout from tokens (2 h), print test (½ h).
Build it only once the product is rehearsed — it's the first thing a real shelter sees.

---

## 9. Social presence — one channel, and what it must never do

**Open first: a Telegram channel.** Not Instagram.

- Telegram is where Kyiv-oblast adopters and volunteers already pass links around; Opika's
  product *is* links that preview properly (#5). A channel is a list of links.
- It costs nothing to run at the cadence real supply allows and doesn't punish low frequency the
  way an algorithmic feed does.
- Instagram rewards cuteness, urgency and volume — three things the voice guide rules out — and
  shelters already own that space; Opika competing there would be competing with its own supply.

**Do not create it yet** (out of scope for this session; reserve the handle only once the name
is settled per #2).

**What the channel must never do:**

- Post an animal without that shelter knowing it will be posted.
- Speak for a shelter, answer an adopter on a shelter's behalf, or collect inquiries in comments —
  commitment #4. Comments off, or pointing to the shelter's own contact.
- Say "urgent", "last chance", count down anything, or use a reserved/adopted animal as a hook.
- Publish view counts, "N people asked", or any engagement number about an animal (commitment #2
  spirit).
- Run giveaways, reposts-for-prizes, or partner promotions (commitment #5; also the Kyiv Digital
  welcome-box game Opika must not play — competitive brief §3.7).
- Use «ми». It's one person; the channel says so in its description.
- Post adoption "success" stories with numbers before there are real ones — and then only with
  the shelter's consent and in the shelter's words.

**Cost.** ~1 h to write these rules into the campaign plan / standing constraints.

---

## Keep / change summary

**Keep:** the «Реєстр» system and its restraint; e-Ukraine; the abstract mark «Поріг · Межа»;
cream ground; three pips + words; the first-person voice; `.org.ua`; per-animal pages with stable
URLs; the refusal to show attention counters, urgency, or colour for alarm.

**Change:** disclose independence (#1); settle the name explicitly (#2); give the blue one meaning
(#3); ship the icons (#4) and OG cards with nothing that can go stale (#5); formalise the
descriptor (#6); write the brand-surface rules down (#7); then the leaflet (#8) and the channel
rules (#9).
