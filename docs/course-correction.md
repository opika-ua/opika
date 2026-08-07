# Opika — Course Correction

**Date:** 6 August 2026 · Written after a repo audit at the end of M5
**Status:** historical record. `docs/build-plan.md` is the plan — its Part 1 folds in
what this document reported, and its Part 2 replaced §5's phase plan directly. Nothing
about what to build lives here any more; what follows is the reasoning that isn't worth
losing, kept because a course correction that reads as pure repudiation invites someone
to relitigate it later without knowing why it happened.

---

## What happened, briefly

Two things landed at once: a build failure invisible to CI (`tsc` accepts `.js` on
relative imports under every resolution mode; the bundler doesn't, and nothing had ever
run `next build`), and a new, correct requirement the original plan never carried — the
app must work on desktop, and animals must be browsable as a gallery, not only as a
swipe deck.

The first is a process failure, generalised into `docs/standing-constraints.md` rather
than restated here. The second invalidated a meaningful part of the design and the plan,
and is the subject of the rest of this document.

## The strategic call: the gallery should be primary

The original plan treated the swipe deck as the product and everything else as support.
That was wrong on its own terms, and the desktop requirement only made it clearer.

- **It is the acquisition channel.** The stack decision identified SEO on animal profile
  pages as the growth mechanism for a project with no marketing budget — links shared into
  Telegram and Facebook groups by shelters and volunteers. A swipe deck is not indexable
  and not linkable. A gallery is both.
- **It is what people expect.** Every adoption site has a browsable list. The absence of
  one reads as a broken product, not as a bold choice.
- **It works everywhere.** One surface serves desktop and mobile, mouse and touch,
  keyboard and screen reader.
- **It suits the data.** With a handful of shelters in one oblast, forty animals is one
  minute of scrolling. A deck forces sequential consumption of a set small enough to see
  at once.
- **Everyone who evaluates this project uses a desktop** — grant reviewers, shelter
  directors, journalists, potential collaborators.

The deck remains the differentiator and still ships. But it is a **mode** entered from the
gallery, not the front door, and its remaining work — including the unresolved iOS
failure — comes off the critical path. It ships when it works.

## What has not changed

Worth saying, because a course correction can read as a repudiation and this is not one.

The domain model is good and none of it is affected. The contracts are good. The database
layer is good — keyset pagination, HMAC location fuzzing, the verification invariant
enforced in SQL. The security work is good, and the session vulnerability caught in review
would have shipped in most projects. The design direction is good, and the honesty
mechanism at its centre — freshness, told plainly, never as alarm — is a real idea that
survives everything above.

The new work sits entirely above the API line. Nothing below it needed to change, which is
the payoff for having built it contract-first.

## Process changes that came out of this

Now standing rules rather than a one-time note — see `docs/standing-constraints.md` for
the current, generalised form and the incidents behind each one. The two additions this
document specifically prompted, beyond what M5 alone had already established:

- **Verify a plan's premises before approving it.** The M5 build diagnosis was wrong about
  `tsconfig` inheritance, and work proceeded on it before the truth surfaced. A plan gate
  only works if both sides check — this is now `.claude/commands/phase.md`'s Phase 1 stop
  condition list, not a note in a document.
- **Check a document's claims before relying on them.** This document itself named a
  folder location for the design handoff that had already moved by the time it was read
  again. A plan — or a pause brief — describes a moment; treat it as one.
