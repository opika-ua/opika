# Decisions inbox: docs/designer-round-1-plan

Rows for the shared table (`docs/decisions-inbox.md`), appended at merge.

The scope row quotes Oleksii's words as relayed in the scheduled task that wrote the plan; nothing
else here is his. The "Default taken" column is the builder's, and every DR1-D row is the builder's
decision, recorded as such, never as his approval. Full reasoning: `docs/designer-round-1.md`.

| ID | Date | Row | Question | Options | Default taken | Oleksii's answer | Status |
|---|---|---|---|---|---|---|---|
| DR1-B1 | 2026-10-20 | Scope: designer round 1 | — | — | — | Relayed as his words, verbatim: "Designer round 1: go now, in the cloud. Contract-first: first a plan doc docs/designer-round-1.md (the shelter page with «Слова притулку» only there, the preview drawer, no shelter name on the card preview, likes in localStorage plus a liked page, the long/short fur filter; “viewed” is NOT in scope) as a draft PR for my review. Then build in slices, one PR per slice." | planned: `docs/designer-round-1.md`; "viewed" out of scope |
| DR1-Q1 | 2026-10-20 | §1 shelter page (public claim) | "«Слова притулку» only there" moves words `/prytulkam` §8 (B1, commitment 7) and `voice.previewLabel` place on the animal page; the medical rows use the same two words | (a) additive: description on the shelter page, sentence stays · (b) move the sentence to the shelter page, rewrite B1 and the preview label in the same PR; medical label stays · (c) as (b), and rename the medical source label | none: public claim (recommend b) | | open |
| DR1-Q2 | 2026-10-20 | §4 liked page data (security) | How the liked page learns current state without tying likes to the session | (A) cookieless POST batch read `animals.cardsByIds`, nothing kept · (B) snapshot in storage, nothing ever sent, list goes stale · (C) per-id `animals.byId` with the cookie | none: security (recommend A) | | open |
| DR1-Q3 | 2026-10-20 | §4 the feature's name (brand voice) | "Like" and a heart read as judgement; the feature is "keep for later" | (i) like + heart · (ii) save for later, neutral mark · (iii) his word | none: brand voice (recommend ii, Ukrainian his) | | open |
| DR1-Q4 | 2026-10-20 | §4 `/pro` (public claim) | `/pro` is silent on adopter devices; pending R4-2 says «одне кукі» | (a) a sentence in `about.data` + amend R4-2 before it lands · (b) a device-only line on the liked page only | none: public claim (recommend a) | | open |
| DR1-D1 | 2026-10-20 | §3 | Which "card preview" loses the shelter name | gallery card · gallery + deck · drawer only | gallery card, and the drawer; the deck keeps its line | | taken (reversible) |
| DR1-D2 | 2026-10-20 | §1 | Shelter page URL | `/prytulky/{id}` · a slug | `/prytulky/{id}` | | taken (reversible) |
| DR1-D3 | 2026-10-20 | §1 | Filters on the shelter page | none · the gallery's rail | none in round 1 | | taken (reversible) |
| DR1-D4 | 2026-10-20 | §1 | Where the shelter's animals come from | `gallery.list` + `scope` union · a new procedure | `gallery.list` + `scope` (stays in the named OFFSET exception) | | taken (reversible) |
| DR1-D5 | 2026-10-20 | §2 | Drawer mechanism and reach | intercepting route · client state; gallery only · also the deck | intercepting route, gallery and liked page only | | taken (reversible) |
| DR1-D6 | 2026-10-20 | §2 | Focus trap | extract a shared hook · copy | shared hook from `ModalDialog` | | taken (reversible) |
| DR1-D7 | 2026-10-20 | §2 | Reveal inside the drawer | yes · no | no; reveal stays on the animal page | | taken (reversible) |
| DR1-D8 | 2026-10-20 | §4 | Where the like control sits | card · drawer · animal page · deck | drawer and animal page | | taken (reversible) |
| DR1-D9 | 2026-10-20 | §4 | Count on the header link | yes · no | no | | taken (reversible) |
| DR1-D10 | 2026-10-20 | §5 | Fur required to publish | required + backfill · optional, nullable | optional, nullable, no backfill | | taken (reversible) |
| DR1-D11 | 2026-10-20 | §5 | Unknown fur under a fur filter | excluded · matches every fur filter | excluded; relaxation count shows the difference | | taken (reversible) |
| DR1-D12 | 2026-10-20 | §5 | `onboard:shelter` gains fur | yes · no | no (Tier 1 path; onboarded animals start not recorded) | | taken (reversible) |
| DR1-D13 | 2026-10-20 | §5 | Fur on the card meta line | yes · no | no; animal page only | | taken (reversible) |
| DR1-D14 | 2026-10-20 | §4 | Likes storage key and cap | key, cap, overflow | `likes.v1`, 200, refuse past the cap | | taken (reversible) |
| DR1-D15 | 2026-10-20 | §4 | Server-side record of a like | swipe/analytics event · nothing | nothing | | taken (reversible) |
