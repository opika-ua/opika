# «Для притулків» — the argument, in English

**This is not copy and must not be translated.** It states what each section has
to establish, what it must not claim, and the facts it has to get right. The
Ukrainian is written fresh from this structure by the maintainer — sentence-by-
sentence translation is how calques get in, and the copy critique (D3) already
found one construction in the live catalogue that reads translated.

Section order is fixed. It follows the order a volunteer's questions actually
arrive in, not the order the project finds it natural to explain itself.

**Vocabulary to keep out, throughout:** платформа, екосистема, партнерство, and
anything else that sounds like a product pitching itself. **No promise about how
many adopters a shelter will get** — that number is unknown and promising it is
the one thing that would make this page dishonest.

**Register:** ви, consistent with the rest of the catalogue. Plain statements.
The existing `about.intro` («…який я роблю сам, поза роботою») is the closest
model already in the repo for the voice this page needs.

---

## 1. What this is — one sentence

Establish, in a single sentence, that this is a register of animals from
verified shelters in Kyiv oblast, and that a shelter's animals appear on it with
their own page.

Do not open with what it costs, what it does for them, or why it exists. One
sentence, then move.

## 2. What it costs — nothing, now and later

Early on purpose: it is what they are bracing for, and every sentence after it
is read differently once it is answered.

Must establish: free today, and free later. No paid tier, no trial that expires,
no "first three months free." If that ever changes, every shelter hears about it
in advance rather than discovering it.

`about.free` already says this well and can be reused nearly as-is — it is one
of the strongest strings in the catalogue.

Do not hedge it. A conditional here undoes the whole section.

## 3. What happens to their animals

Each animal gets its own page, with photographs, at its own address that can be
sent to someone.

Facts that must be right:
- The page is real and public: `/tvaryny/{id}`.
- Animals appear in a browsable list and in a one-at-a-time swipe mode; both
  show every animal, and there is no ranking a shelter can pay to influence.
- A reserved animal stays visible rather than disappearing, because
  reservations fall through.

Do not describe the swipe interaction as a "match" or imply the shelter is
choosing back. It is a filter on the adopter's side and nothing more.

## 4. Who contacts whom

The single most important section for trust, and the one most likely to be
misread if it is vague.

Must establish, unambiguously:
- An adopter writes to the shelter **directly**, using the shelter's own contact
  channel.
- Opika never contacts an adopter on the shelter's behalf.
- Opika never speaks *for* the shelter to anyone.
- The shelter does not learn that someone looked at an animal until that person
  writes to them themselves. There is no queue of leads, no notifications to
  answer, nothing that turns into an obligation.

That last point is worth its own sentence. The live product already states the
adopter-facing half of it («Притулок не знає про цей запит, поки ви не напишете
самі») — this is the same promise from the shelter's side.

## 5. Money

Opika never touches money. No payments, no commission, no donation collection
through the site.

If a shelter has its own donation page, the register links to it, and the
destination is visible before anyone taps it — a person always knows whose site
they are about to land on.

`about.money` covers this already. Do not add anything about future monetisation,
even to rule it out; section 2 has done that work and repeating it weakens both.

## 6. What "verified" means

Concrete, not reassuring-sounding. The word is doing real work on the adopter
side and it has to mean something specific here.

Must establish: a person checks, and here is what checking is.

- A registered organisation shows its EDRPOU registration and a bank record in
  the organisation's name, plus one independent reference.
- An unregistered volunteer group — most groups — is **not excluded**. It
  substitutes a visit and two independent references who can confirm the group
  is real and does what it says.
- "A visit" includes a real phone conversation where an actual person talked to
  them and can say what they learned. It does not require anyone to travel.
- A reference has to be someone other than the shelter itself — a neighbouring
  shelter, a vet clinic they work with. Not their own second phone number.

Source of truth: `DEFAULT_VERIFICATION_POLICY` in `packages/domain`, and
`docs/onboarding-a-shelter.md`'s table. If either changes, this section changes
with it.

Tone: this section should read as "here is the bar, and it was set so that a
volunteer group with no legal registration can clear it," not as a gate.

## 7. What they'd need to prepare

Practical and short. A volunteer reading this should be able to tell in ten
seconds whether they can do it this week.

- Photographs of each animal. Real files.
- A short description per animal — name, rough age, size, temperament in a
  sentence or two.
- One sentence, in their own words, about how current their listings are.
- Contact details they actually answer on.
- A donation link, if they have one.

Do not present this as a form to fill in. It is a conversation, and the
maintainer does the data entry.

## 8. Why that sentence exists

**The paragraph that needs the most care on the page.** No shelter has been
asked for this before, so it will read as strange unless the reason lands.

The argument, in order:
1. Listings go stale everywhere. This is not a criticism of any shelter — it is
   what happens when a small group is doing rescue work rather than maintaining
   a website.
2. Most registries hide this. Every listing looks equally current, so an adopter
   cannot tell a card updated yesterday from one updated in 2023, and eventually
   stops trusting any of them.
3. Opika will not pretend a shelter's listings are fresher than they are.
4. So the site shows how recently the shelter confirmed their listings — plainly,
   in days, never as a warning, never in red, never with anything hidden or
   faded.
5. And it shows the shelter's own sentence about their update rhythm, in their
   voice, attributed to them, next to a date the system fills in automatically —
   so the sentence can never be mistaken for something they said today.

What this buys the shelter, and it is worth stating: an honest freshness signal
is what makes an adopter believe the *other* listings. A shelter that says "we
update on Saturdays" and visibly does is more credible than one that claims
nothing.

Do not make this sound like a requirement being justified. It is a design
decision the shelter is being let in on.

Facts that must be right: the sentence is written once, by them, in their own
words, and stored per shelter (not per animal). It renders under the attribution
«Слова притулку · дата автоматична». Freshness is shown as three pips plus the
day count in words, always both, never red or amber.

## 9. When an animal finds a home

Establish that telling us an animal is homed matters **more** than adding new
ones, and say why plainly: an animal that is already home but still listed is
the one thing that would make every other listing untrustworthy. It costs an
adopter a phone call and costs the shelter the credibility of everything else on
their page.

**Be honest about the mechanism, which is currently manual.** There is no
self-serve edit yet. They write or message, and it is handled by hand, quickly.
Do not describe a dashboard that does not exist. If a shelter reads this page
and then cannot find the button it implied, that is worse than admitting the
process is a message today.

## 10. Who is behind this

A named person. Not "our team," not "we" used to sound larger.

`about.intro` already does this — one person, outside of work hours, no team and
no investor. Reuse that framing; do not soften it into something more corporate.
The smallness is the credential here, not a thing to apologise for.

## 11. How to start

One instruction. Write to **hello@opika.org.ua**.

Say what happens next in one line, honestly: a conversation, then the
verification described in section 6, then their animals go up.

Do not add a form, a "book a call," or an expected response time that cannot be
guaranteed.

---

## Two things this page must not become

**A pitch.** Every section above answers a question a volunteer actually has.
None of them exist to persuade. If a sentence is doing persuasion rather than
answering, it belongs to a different document.

**A promise about outcomes.** Nothing here may state or imply how many adopters,
how much faster, or how many animals homed. Those numbers are unknown, and this
page is the one place where a claim that turns out false would cost exactly the
trust it exists to build.

---

## Open item this page depends on

`hello@opika.org.ua` must be a mailbox that actually receives mail before this
page is linked in any outreach message. `apps/web/src/app/pro/page.tsx` already
carries this as a launch gate; this page raises the stakes, because it is the
page a shelter is *sent to* rather than one they might stumble on.
