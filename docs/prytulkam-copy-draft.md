# «Для притулків» — copy: where it lives now

**The copy has landed. This file is no longer the text.**

- **The copy itself:** `packages/i18n/src/messages/uk.ts`, `forShelters.*`.
  That is the only source of truth; a second copy here would drift.
- **What each section must establish:** `docs/prytulkam-argument.md`. Still the
  spec, and still the thing to write from if any section is rewritten.
- **What the page commits to:** `docs/standing-constraints.md`, "Commitments the
  «Для притулків» page makes" — seven falsifiable claims, the key each lives in,
  and the change that breaks each one.

What follows is only the decisions that are not recorded in either of those, and
would be lost otherwise.

---

## Whose voice this is

The settled decision was that the owner writes the Ukrainian and the agent
writes only the argument, because translating is how calques get in — the copy
critique's D3 found one such construction already in the live catalogue. This
draft was written by the agent after the request was restated, and then revised
across several review rounds with the owner. **The register is still the
agent's.** If any section ever reads as translated, that is why, and rewriting
it from `docs/prytulkam-argument.md` is the intended remedy rather than editing
around it.

## Voice: a three-way split, not a pronoun choice

**«я» where the actor is a person. «Opika» / «реєстр» where the actor is the
system. «ми» nowhere.**

«Ми» was doing two different jobs. In «Ми проговоримо це» the actor is a person,
and the plural is a small inflation — the exact species the rest of the page
spends its credibility avoiding. In «Ми не пишемо за вас» the actor is the
system, and «я» would read oddly, because the point is that no messaging feature
exists, not that one person personally refrains.

The counter-argument for keeping «ми» on the money section — that «я не беру
грошей» sounds like a habit where «ми не беремо» sounds like a policy — does not
survive §2, which already carries the durability in «ви дізнаєтеся заздалегідь».
The notice promise is what makes it a policy, not the pronoun.

### ⚠ Two «ми» that must survive any find-and-replace

Both are **other people speaking**, quoted inside the copy. A global replace eats
both, and neither failure is visible in review:

1. **`cost`** — «поки ми не виростемо», a quoted lie told by *other services*.
2. **`whyThatSentence`** — «дзвоніть, ми скажемо точно», one of three examples of
   *the shelter's own* freshness sentence. That «ми» is theirs.

## «картка» vs «сторінка»

Settled and applied consistently: **«картка»** is the item in the list,
**«сторінка»** is the animal's own page. So the donation link and the shelter's
freshness sentence are «на сторінці тварини»; the freshness date, the reserved
badge and «усі інші картки недостовірними» are «картка».

## Cut, and why

- **«Що завгодно, аби це було правдою»** (from `whyThatSentence`'s middle
  paragraph). Not too demanding — *redundant*. «Саме це робить решту карток
  вартими довіри», one paragraph later, carries the same truth requirement as a
  benefit to the shelter rather than a condition on them.
- **«немає місця, яке можна купити чи виграти»** (from `whatHappensToAnimals`).
  A promise about the future in a document that otherwise makes none. Replaced
  by a description of the actual ordering inputs, which fails loudly instead of
  silently. Commitment 1.
- **«коли ви востаннє підтверджували, що інформація актуальна»** (from
  `whyThatSentence`). The date is `animals.last_updated_at`, which the schema's
  own comment calls edit time; there is no confirmation concept in the data
  model. Narrowed to «коли інформацію востаннє оновлювали». Commitment 7.

## Added late, and worth keeping

- **`howToLeave`.** Nothing in eleven sections answered "what if I regret this,"
  which is the first question anyone asks before handing their data to a stranger
  with a website — and the answer is one of the strongest things the project can
  say.
- **The photo-use clause** in `whatToPrepare`. Shelters get their photos lifted
  routinely; one sentence closes it.

## Still open

- **`whoIsBehindThis` does not name the person.** Written first-person singular
  like `about.intro` rather than inventing a name. The argument document asks for
  a named person; adding it is a one-word edit the owner has to make.
- **The English catalogue is still `COPY_PENDING`**, deliberately. It is written
  from the finished Ukrainian at H3's native-speaker pass, not the reverse —
  filling it in first would make it the de-facto source and reintroduce exactly
  the translated register D3 flagged.
