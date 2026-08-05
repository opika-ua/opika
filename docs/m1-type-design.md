# M1 — Type design proposal (for review, not yet implemented)

Status: **awaiting approval.** No code in `packages/domain` or
`packages/contracts` has been written. Nothing has been committed.

Revision 2 — Q1/Q2, Q3, Q6, Q8, Q14 and Q15 answered by you; Q4 and Q9
delegated to me and decided in §4.4 / §4.5; the remaining six carry my
defaults in §7.3. **One thing still needs you: the evidence item list and the
two reason code lists in §4.4.1**, plus whether an `unregistered_initiative`
can reach `verified`.

---

## 0. M0 verification — result

Run on a **fresh clone** of `sliverfish17/opika@7e16327` (no `node_modules`),
Node 24.19.0, corepack-activated pnpm 11.20.0.

| Check | Result |
|---|---|
| `pnpm i` | ✅ clean. Lockfile up to date, resolution skipped. Supply-chain policy check passed (100 entries, 4.2 s). 50 packages, exit 0 |
| `pnpm check` | ✅ exit 0 — **but vacuous**, see below |
| `tsc --version` | 7.0.2 |
| `biome --version` | 2.5.6 |
| `vitest --version` | 4.1.10 |
| GitHub Actions on `main` | ✅ CI #1 green on 7e16327 ("documentation and CI updates"), 22 s |
| Full ICU in Node 24 | ✅ `січень` / `5 днів тому` — real ICU, not `en-US` fallback |

**`pnpm check` is currently vacuous, exactly as you said:**

```
$ pnpm -r --if-present run typecheck   → No projects matched the filters
$ biome check .                        → Checked 3 files
$ pnpm -r --if-present run test        → No projects matched the filters
```

Biome sees 3 files (`package.json`, `biome.json`, `tsconfig.base.json`).
Typecheck and test do nothing. M1 is the first real load on the toolchain.

**Toolchain misbehaviour: none so far.** TypeScript 7.0.2 (the native
compiler) and Biome 2.5.6 both behaved on a type-level spike I ran and then
deleted, covering the constructs this design leans on hardest:

- Zod 4 `.brand<B>()` produces genuinely non-interchangeable IDs — assigning
  a bare `string` to `AnimalId`, and an `AnimalId` to a `ShelterId`, both
  error under TS 7.
- `z.discriminatedUnion` narrows exhaustively through a `switch`, and the
  `const never: never = m` exhaustiveness guard compiles.
- A generic schema factory (`<S extends z.ZodType>(value: S) => …`) infers
  correctly through `z.array(...).nonempty().readonly()`.
- `exactOptionalPropertyTypes` behaves with `.nullable()` and `.optional()`.

The spike is gone and the tree is clean; I mention it only because it means
the branded-ID and union-factory patterns below are verified, not assumed.

---

## 1. Two things to record before the design

### 1.1 Size buckets changed — this contradicts CLAUDE.md

CLAUDE.md currently says **4-tier** (`small` / `medium` / `large` / `giant`,
with `giant` at 40 kg+). Your locked decision is **3-tier**
(`small` / `medium` / `large`, hints `<10` / `10–25` / `25–40kg+`).

I'm treating your message as authoritative and will rewrite that section of
CLAUDE.md as part of this milestone. Flagging it rather than silently
overwriting, because CLAUDE.md says not to relitigate settled decisions and
this is a settled decision being deliberately changed.

### 1.2 The other three locked decisions match CLAUDE.md already

oRPC 1.x contract-first, location-approximate-until-reveal, and 4-tier age
buckets are already recorded. I'll tighten the wording and move the
now-answered items out of "Still open".

---

## 2. Cross-cutting conventions

These apply everywhere below. Each is a decision, not a style preference.

**C1 — `| null`, never optional properties, for absent domain data.**
`exactOptionalPropertyTypes` is on, and `undefined` does not survive a JSON
round trip. `district: LocalizedText | null` is honest at every layer;
`district?: LocalizedText` quietly means two different things on either side
of the wire. Optional properties are reserved for *procedure inputs*, where
"caller omitted this" is genuinely distinct from "caller sent null".

**C2 — `Date` in the domain, `Date` on the wire.** oRPC's RPC codec
serializes `Date` natively (along with `BigInt`, `Set`, `Map`, `URL`). This
is one of the concrete reasons oRPC beats tRPC-without-superjson here, and
it means the contract layer reuses domain schemas directly instead of
maintaining a parallel ISO-string mirror. No date strings anywhere.

**C3 — Public views are built with `pick`, never `omit`.** `omit` is
allow-by-default: add a sensitive field to `Shelter` and it silently leaks
into `PublicShelterView`. `pick` is deny-by-default: the same change breaks
the build until someone decides. Given that decision #2 turns location
exposure into a security property, this is not a style call.

**C4 — Tunable thresholds live in a policy object with an exported
default, never as inline constants.** You asked for this for freshness. I've
applied the same pattern to scoring and to location fuzzing, because all
three are things you will tune in week 6 against real data, and one pattern
is cheaper to remember than three.

**C5 — Pure functions take `now: Date` as a parameter.** No exceptions. Also
no `Math.random()`: the one place that wants randomness (coordinate fuzzing)
is instead deterministic on a seed — see §4.3, where determinism turns out
to be a security requirement rather than a testing convenience.

**C6 — Branded IDs come from a type-only factory**, so declaring one is a
single line that yields both the schema and the type:

```ts
const brandedId = <B extends string>() => z.uuid().brand<B>();

export const AnimalIdSchema = brandedId<"AnimalId">();
export type AnimalId = z.infer<typeof AnimalIdSchema>;
```

(The factory takes no runtime argument — Zod's brand is type-only, and a
`brand: B` parameter would trip `noUnusedParameters`.)

---

## 3. Module layout

Organised by domain, not by technical layer, per the standing convention.

```
packages/domain/src/
├─ primitives/     ids · money · localized-text · coordinates · locale
├─ shelters/       shelter · contact · location · verification/ (fsm)
├─ animals/        animal · attestation · document-readiness · age · size
├─ adopters/       profile · feed-filters
├─ reveals/        contact-reveal
├─ discovery/      freshness · scoring
└─ index.ts

packages/contracts/src/
├─ views/          public projections of domain entities
├─ procedures/     session · cities · feed · animals · reveals · shelters · swipes
├─ errors.ts
└─ index.ts
```

---

## 4. `packages/domain`

Everything below is written as a TypeScript type for readability. In the
implementation each one is `z.infer<typeof XSchema>` — the schema is the
single definition and the type is derived from it, never the reverse.

### 4.1 Primitives

```ts
type AnimalId  = string & Brand<"AnimalId">;
type ShelterId = string & Brand<"ShelterId">;
type AdopterId = string & Brand<"AdopterId">;
type RevealId  = string & Brand<"RevealId">;
type CityId    = string & Brand<"CityId">;
type ModeratorId = string & Brand<"ModeratorId">;   // ⚠ one addition — see note
```

> **`ModeratorId` is a sixth ID beyond your list.** The FSM's `reviewerId`,
> `verifiedBy`, and `suspendedBy` need an actor type, and using a bare
> `string` there gives up exactly the protection branded IDs exist for. The
> ADR calls it `UserId`; I'd rather name it for the role than for the auth
> table, since Better Auth's user table isn't a domain concept. Say the word
> if you want it called `UserId` instead.

```ts
type Currency = "UAH" | "PLN" | "EUR";
type Money = { amountMinor: number; currency: Currency };   // z.int(), never a float
```

> **Nothing in the MVP entity graph currently references `Money`.** Donations
> are an external link with no amount; there is no adoption fee field. So it
> ships as an unused primitive unless you want it attached somewhere — see
> open question Q7.

```ts
type Locale = "uk" | "en";

type LocalizedText = {
  uk: string;                                    // required — the oblast's language
  en: { text: string; provenance: TextProvenance } | null;
};
type TextProvenance = "human" | "machine";
```

> `provenance` exists because the build plan ships English as machine
> translation plus your review. The UI needs to know whether to show an
> "auto-translated" disclaimer, and that's a property of the text, not of the
> request. It's the difference between a boolean `isTranslated` plus a
> comment and a field that says what it means.

```ts
type Coordinates = { lat: number; lng: number };   // ±90 / ±180, validated

type ApproximateCoordinates = {
  center: Coordinates;
  precisionMetres: number;      // the true point lies within this radius of center
};
```

### 4.2 Shelter

```ts
type Shelter = {
  id: ShelterId;
  displayName: string;
  description: LocalizedText;
  legalEntity: ShelterLegalEntity;
  publicLocation: PublicLocation;
  exactAddress: ExactAddress;          // never reaches a public view — C3 enforces it
  contact: ShelterContact;             // same gating
  donation: DonationLink | null;
  verification: ShelterVerification;
  createdAt: Date;
  lastUpdatedAt: Date;
};
```

```ts
// ⚠ GUESS — the ADR doesn't specify this. See Q1.
type ShelterLegalEntity =
  | { kind: "registered_ngo"; legalName: string; edrpou: Edrpou; registeredAt: Date }
  | { kind: "sole_proprietor"; legalName: string; edrpou: Edrpou }
  | { kind: "unregistered_initiative"; contactPersonName: string };

type Edrpou = string & Brand<"Edrpou">;   // 8-digit ЄДРПОУ code
```

> `unregistered_initiative` exists because a large share of Ukrainian shelter
> activity during wartime is unincorporated volunteer groups. Excluding them
> at the type level would exclude them from the product. Whether they can
> reach `verified` is a policy question, not a type question — see Q1.

```ts
type PublicLocation = {
  cityId: CityId;
  district: LocalizedText | null;         // район; null for small towns
  approximate: ApproximateCoordinates;
};

type ExactAddress = {
  line1: string;
  line2: string | null;
  postalCode: string | null;
  cityId: CityId;
  district: LocalizedText | null;
  coordinates: Coordinates;               // the real point
};
```

```ts
type ContactChannel =
  | { kind: "phone";    e164: string }
  | { kind: "email";    address: string }
  | { kind: "telegram"; handle: string }
  | { kind: "viber";    e164: string }
  | { kind: "website";  url: string };

type ShelterContact = {
  primary: ContactChannel;
  additional: readonly ContactChannel[];
};
```

> Telegram and Viber are first-class variants rather than a generic
> `{ type: string; value: string }` because they render differently (deep
> link vs `tel:` vs `mailto:`) and because Telegram is the realistic primary
> channel for a Ukrainian shelter. A generic pair would push a `switch` on a
> raw string into every UI surface.

```ts
type DonationLink = {
  url: string;                     // https only; validated
  provider: DonationProvider;
};
type DonationProvider =
  | "monobank_jar" | "privatbank" | "liqpay" | "fondy" | "other";
```

> `provider` is a flat enum, not a union: it's a classification with no
> per-variant payload, and inventing empty variants to satisfy a rule would
> be cargo-culting it. The moment a provider needs its own fields, it becomes
> a union.
>
> The "destination domain visible" requirement from M6 is served by a pure
> `donationHost(link): string` derived from `url`. Storing it would be a
> second source of truth that can disagree with the link it describes.
>
> **No payment data is modelled anywhere.** This is what keeps Phase 3
> additive; it's the ADR's single best architectural call and I've kept it
> literal — there is no amount, no account, no token, only a URL.

### 4.3 Location fuzzing

```ts
type LocationPrivacyPolicy = { fuzzRadiusMetres: number };
export const DEFAULT_LOCATION_PRIVACY_POLICY: LocationPrivacyPolicy = {
  fuzzRadiusMetres: 1000,     // confirmed in review — one global radius
};

fuzzCoordinates(
  exact: Coordinates,
  seed: string,                    // the ShelterId
  policy: LocationPrivacyPolicy,
): ApproximateCoordinates
```

> **Deterministic on `seed`, not random — and that's a security property, not
> a testing convenience.** A fresh random offset per request lets anyone
> average N samples and recover the true point to arbitrary precision. Seeding
> on `ShelterId` means the displayed point is stable forever and averaging
> gains an attacker nothing. It also happens to make the function pure and
> trivially testable, which is the usual sign that a constraint was the right
> one.
>
> Returning `precisionMetres` alongside the point means the map draws an
> honest circle instead of a misleadingly precise pin — which is the same
> "we tell you when we don't know" property the freshness badge is for.

### 4.4 Verification FSM

Five states, per the ADR:

```ts
type ShelterVerification =
  | { status: "pending";      submittedAt: Date; evidence: VerificationEvidence }
  | { status: "under_review"; startedAt: Date;   reviewerId: ModeratorId;
                              evidence: VerificationEvidence }
  | { status: "verified";     verifiedAt: Date;  verifiedBy: ModeratorId;
                              evidence: VerificationEvidence }
  | { status: "rejected";     rejectedAt: Date;  rejectedBy: ModeratorId;
                              reason: RejectionReason;
                              evidence: VerificationEvidence }
  | { status: "suspended";    suspendedAt: Date; suspendedBy: ModeratorId;
                              reason: SuspensionReason;
                              priorStatus: "verified";
                              evidence: VerificationEvidence };
```

> **Deviation from the ADR, deliberately:** the ADR carries `evidence` only on
> `verified`. I carry it on every state. Evidence is submitted at `pending`
> and is what a reviewer looks at — dropping it on `rejected` would mean a
> resubmission has nothing to diff against, and dropping it on `under_review`
> would mean the reviewer's own screen has to fetch it from somewhere else.
> Flagging because it's a change to a documented shape, not an omission.
>
> `priorStatus` is pinned to the literal `"verified"` because only a verified
> shelter can be suspended. If Q4 opens suspension from `under_review`, this
> widens to a union of two literals — and the compiler will find every site
> that assumed otherwise. That's the field earning its keep.

Six events. `submit` is deliberately **not** an event:

```ts
type VerificationEvent =
  | { type: "start_review"; at: Date; reviewerId: ModeratorId }
  | { type: "approve";      at: Date; moderatorId: ModeratorId }
  | { type: "reject";       at: Date; moderatorId: ModeratorId; reason: RejectionReason }
  | { type: "resubmit";     at: Date; evidence: VerificationEvidence }
  | { type: "suspend";      at: Date; moderatorId: ModeratorId; reason: SuspensionReason }
  | { type: "reinstate";    at: Date; moderatorId: ModeratorId };
```

> Initial submission is a **constructor**, `submitForVerification(evidence,
> at): ShelterVerification`, not a transition — there is no prior state for it
> to transition from, and modelling it as an event would add a row of six
> always-illegal cells to the table for no information gain. `resubmit`
> covers re-entry from `rejected`.

The transition function returns a result union rather than throwing, so it
stays total and pure:

```ts
type TransitionResult =
  | { kind: "ok"; next: ShelterVerification }
  | { kind: "illegal"; from: ShelterVerification["status"];
                       event: VerificationEvent["type"] }
  | { kind: "non_monotonic"; from: ShelterVerification["status"];
                             stateTimestamp: Date; eventTimestamp: Date };

transition(current: ShelterVerification, event: VerificationEvent): TransitionResult
```

> `non_monotonic` rejects an event timestamped before the state it acts on.
> It's four lines and it's the difference between a clock-skew bug that
> corrupts an audit trail silently and one that fails loudly. See Q5 if you'd
> rather not have it.

The legal transitions — 5 states × 6 events = **30 cells, 6 legal, 24
rejected**, and the test asserts all 30:

| from \ event | start_review | approve | reject | resubmit | suspend | reinstate |
|---|---|---|---|---|---|---|
| `pending` | → under_review | ✗ | **→ rejected** | ✗ | ✗ | ✗ |
| `under_review` | ✗ | → verified | → rejected | ✗ | ✗ | ✗ |
| `verified` | ✗ | ✗ | ✗ | ✗ | → suspended | ✗ |
| `rejected` | ✗ | ✗ | ✗ | → pending | ✗ | ✗ |
| `suspended` | ✗ | ✗ | **→ rejected** | ✗ | ✗ | → verified |

**8 legal cells, 22 rejected.** The two bold edges were opened in review
(Q4); the two that stay closed are closed for reasons, not by omission:

- **`pending → rejected` — opened.** A rejection is always made by a
  moderator who looked at the submission, and `reject` already carries
  `moderatorId`, so the audit trail survives. Forcing `start_review` first on
  obvious spam models UI ceremony rather than the business lifecycle.
- **`suspended → rejected` — opened.** This is the strongest of the four.
  Without it, `suspended` conflates "temporarily paused, may come back" with
  "banned, never coming back" — one state carrying two meanings, which is
  precisely the smell the union discipline exists to eliminate. A permanent
  ban is a rejection with a reason.
- **`under_review → suspended` — stays closed.** Suspension is defined as
  something that happens to a *live* shelter. A shelter under review isn't in
  the feed, so there's nothing to suspend; if a complaint arrives mid-review,
  `reject` is the correct action. Opening it would widen `priorStatus` to
  admit a `suspended`-from-`under_review` state that reinstates to `verified`
  — a status it never held.
- **`verified → under_review` — stays closed.** Tempting for annual
  re-verification, and it's a trap: a verified shelter moved to
  `under_review` silently vanishes from the feed with no record that it was
  ever verified. That's the exact bug `priorStatus` was added to prevent,
  reintroduced through a different door. When re-verification is actually
  needed it should be a *new variant* — `{ status: "re_review"; priorStatus:
  "verified"; … }` — which is additive, keeps the shelter's history legible,
  and lets the compiler find every site that has to decide about it. That's
  the same Open/Closed move the ADR relies on everywhere else.

### 4.4.1 Evidence and reasons (Q1/Q2 — coded, as decided)

```ts
type VerificationEvidence = {
  items: readonly EvidenceItem[];
  submittedAt: Date;
};

type EvidenceItem =
  | { kind: "edrpou_registration"; edrpou: Edrpou; documentKey: string | null }
  | { kind: "bank_account_holder"; holderName: string; documentKey: string | null }
  | { kind: "reference_contact";   name: string; channel: ContactChannel;
                                   relationship: ReferenceRelationship }
  | { kind: "site_visit";          visitedAt: Date; visitedBy: ModeratorId;
                                   notes: string }
  | { kind: "supporting_document"; label: LocalizedText; documentKey: string };

type ReferenceRelationship = "veterinary_clinic" | "local_authority"
                           | "partner_organisation" | "other";
```

> `items` is a list rather than a fixed record because what a shelter can
> produce varies by legal form — a registered NGO has an ЄДРПОУ code, an
> unregistered volunteer group has references and a site visit. A fixed
> record would force nullable fields everywhere and quietly permit "verified
> with nothing attached". A list makes the *verification policy* ("an
> `unregistered_initiative` needs a `site_visit` plus two
> `reference_contact`s") a pure predicate over the items — testable, tunable,
> and exactly the kind of rule that belongs in `packages/domain`.
>
> `documentKey` is an R2 object key, never a URL and never file content. Same
> discipline as `AnimalPhoto`.
>
> **Two things I still need from you here:** (a) is that the right item list,
> and (b) what evidence lets an `unregistered_initiative` reach `verified` —
> or can it not, at MVP? I can write the schema now and leave the policy
> predicate as the last thing to fill in.

```ts
type RejectionReason  = { code: RejectionCode;  note: string | null };
type SuspensionReason = { code: SuspensionCode; note: string | null };

type RejectionCode =
  | "insufficient_evidence" | "identity_unverifiable" | "duplicate_submission"
  | "out_of_service_area"   | "spam"                  | "other";

type SuspensionCode =
  | "unresponsive"       | "complaint_upheld"    | "listing_quality"
  | "suspected_fraud"    | "shelter_requested"   | "other";
```

> Separate code lists rather than one shared enum: a shelter is *rejected* for
> reasons about its application and *suspended* for reasons about its conduct,
> and merging them would produce a list where two-thirds of the values are
> invalid in either context. `note` is the escape hatch so `other` is usable
> without reopening the enum every week.
>
> Codes only — no human-readable copy, so these translate through the i18n
> layer and carry no brand strings. **Confirm the two lists**; they're my
> guess at what you'll actually click in the admin.

### 4.5 Animal

```ts
type Animal = {
  id: AnimalId;
  shelterId: ShelterId;
  name: string;
  species: AnimalSpecies;
  sex: AnimalSex;
  size: SizeBucket;
  age: AgeEstimate;                    // derived to AgeBucket via ageBucketOf(age, now)
  description: LocalizedText;
  photos: readonly AnimalPhoto[];
  vaccination: VaccinationStatus;
  spayNeuter: SpayNeuterStatus;
  documentReadiness: DocumentReadiness;
  listing: AnimalListingState;         // draft|published|reserved|adopted|withdrawn
  createdAt: Date;
  lastUpdatedAt: Date;                 // required, per the ADR
};

type AnimalSpecies = "dog" | "cat";    // confirmed in review — see note
type AnimalSex = "male" | "female" | "unknown";
```

> **Species stays closed at `dog | cat` (Q9), and the reason is that widening
> it later is cheap while opening it now is expensive.** Adding a literal to
> this union is an additive change that the exhaustiveness guards turn into a
> guided edit — the compiler points at every site that has to decide. An
> `{ kind: "other"; label: LocalizedText }` variant, by contrast, makes the
> filter permanently non-enumerable and immediately breaks two things that are
> already locked: `SizeBucket`'s weight hints are meaningless for a rabbit or
> a bird, and the ADR's entire Phase 3/4 analysis — the Ukrainian registry,
> EU Reg. 2016/429, the titration timeline — is dog-and-cat specific. An open
> variant would be a permanent tax paid for a case that may never arrive.

```ts
type SizeBucket = "small" | "medium" | "large";

// Shelter-facing guidance only. The bucket is what's stored; this never
// round-trips back into a number.
export const SIZE_BUCKET_WEIGHT_HINTS_KG: Record<
  SizeBucket, { minKg: number; maxKg: number | null }
> = {
  small:  { minKg: 0,  maxKg: 10 },
  medium: { minKg: 10, maxKg: 25 },
  large:  { minKg: 25, maxKg: null },
};
```

```ts
type AgeBucket = "baby" | "young" | "adult" | "senior";   // <1 / 1–3 / 3–8 / 8+
```

**Age is derived, not stored (Q6, confirmed in review).** A stored bucket goes
stale — a `baby` listed in March is a `young` by December, and a swipe feed
that lies about a puppy's age is exactly the kind of dishonesty the freshness
badge exists to prevent.

```ts
type AgeEstimate =
  | { kind: "birth_date"; date: Date; precision: "day" | "month" | "year" }
  | { kind: "declared_bucket"; bucket: AgeBucket; declaredAt: Date };

ageBucketOf(estimate: AgeEstimate, now: Date): AgeBucket
```

> Same shape as freshness: store the fact, derive the presentation, pass `now`
> in. `declared_bucket` exists because a shelter that found a dog on the
> street genuinely only knows "adult" — forcing a fabricated birth date would
> be worse data, not better. And `declaredAt` means a bucket declared two
> years ago can be treated with suspicion, which a bare `AgeBucket` field
> cannot express.
>
> The cost, accepted knowingly: `AgeBucket` is no longer a stored column, so
> the feed's age filter becomes a range predicate on a derived value. That's a
> real M2 cost and it needs to be on M2's radar when the index is designed.

Vaccination and spay/neuter share one shape (DRY — one schema, two aliases):

```ts
type MedicalState = "unknown" | "in_progress" | "confirmed";

type MedicalAttestation =
  | { source: "shelter_declared"; state: MedicalState; declaredAt: Date }
  | { source: "registry"; state: "confirmed"; registryRef: string; verifiedAt: Date };

type VaccinationStatus = MedicalAttestation;
type SpayNeuterStatus  = MedicalAttestation;
```

> Exactly the ADR's shape, with `source` in the discriminant so the national
> registry lands as a variant rather than a migration. Note the asymmetry that
> falls out for free: the `registry` variant's `state` is the literal
> `"confirmed"`, because the registry has no way to tell you an animal is
> *partly* vaccinated — it either holds a record or it doesn't. That's a real
> invariant the type now enforces.
>
> Both aliases point at one schema because the shapes are identical today.
> Realistically the registry's public layer only covers rabies, so
> `SpayNeuterStatus` may never see a `registry` variant — but an unused
> variant costs nothing and a Phase 3 vet-clinic source would use it.

```ts
type DocumentReadiness =
  | { kind: "unknown" }                       // the default at MVP
  | { kind: "tracked";
      microchip: DocumentItem;
      rabiesVaccination: DocumentItem;
      rabiesTitration: DocumentItem;
      vetCertificate: DocumentItem };

type DocumentItem =
  | { kind: "absent" }
  | { kind: "pending"; since: Date }
  | { kind: "present"; issuedAt: Date; expiresAt: Date | null; reference: string | null };
```

> Ships as `{ kind: "unknown" }` for every animal, per the build plan. The
> `tracked` variant is the field *shape* the ADR says to add now so Phase 4 is
> a UI feature rather than a 100k-row migration. `earliestEligibleEntryDate`
> is explicitly **not** M1 — the date arithmetic is deferred with the phase.

```ts
type AnimalPhoto = {
  storageKey: string;              // R2 object key; no URL construction in the domain
  width: number;                   // intrinsic dimensions travel with the record so
  height: number;                  // the card can reserve space and avoid layout shift
  alt: LocalizedText | null;
};
```

> Dimensions are here rather than in M7 because a swipe deck that reflows on
> image load is a swipe deck that feels broken, and that's a week-10 finding
> you don't want. The variant/CDN machinery stays in M7 — the domain holds a
> key, never a URL.

### 4.6 Adopter and filters

```ts
type AdopterProfile = {
  id: AdopterId;
  identity: AdopterIdentity;
  country: CountryCode;              // ISO 3166-1 alpha-2, branded
  preferredLocale: Locale;
  savedFilters: FeedFilters | null;
  createdAt: Date;
};

type AdopterIdentity =
  | { kind: "anonymous"; deviceSessionId: string }
  | { kind: "account"; accountId: AccountId; email: string };
```

> The build plan cuts adopter accounts from the MVP, and the `account` variant
> is unreachable at launch. It's modelled anyway because the whole reason the
> cut is safe is that adding accounts later is *additive* — and that's only
> true if the identity is a union from day one. This is the cheapest possible
> insurance on a documented deferral.

```ts
type FilterSelection<T> =
  | { kind: "any" }
  | { kind: "oneOf"; values: readonly [T, ...T[]] };

type FeedFilters = {
  cities:  FilterSelection<CityId>;
  species: FilterSelection<AnimalSpecies>;
  sizes:   FilterSelection<SizeBucket>;
  ages:    FilterSelection<AgeBucket>;
};
```

> **This replaces the obvious `readonly CityId[]` and it's worth the extra
> type.** With a plain array, `[]` has to mean either "no constraint" or "match
> nothing", the codebase picks one by convention, and someone eventually picks
> the other in a filter sheet that renders an empty feed. The union makes the
> question unaskable, and the non-empty tuple makes
> `{ kind: "oneOf", values: [] }` a compile error. One generic, four uses —
> that's the DRY case for it too.
>
> A canonical ordering matters for cursor stability and for URL-shareable
> filter state (M6), so `canonicalizeFilters(f): FeedFilters` sorts each
> selection. Two filter sets that mean the same thing must serialize
> identically or the cursor breaks on a re-render.

### 4.7 Contact reveal

```ts
type ContactReveal = {
  id: RevealId;
  adopterId: AdopterId;
  animalId: AnimalId;
  revealedAt: Date;
  shelterSnapshot: ShelterContactSnapshot;
  animalSnapshot: AnimalRevealSnapshot;
};

type ShelterContactSnapshot = {
  shelterId: ShelterId;
  displayName: string;
  contact: ShelterContact;
  exactAddress: ExactAddress;          // ⬅ the only path by which this reaches an adopter
  publicLocation: PublicLocation;
  verificationStatusAtReveal: ShelterVerification["status"];
  donation: DonationLink | null;
};

type AnimalRevealSnapshot = {
  name: string;
  primaryPhoto: AnimalPhoto | null;
};
```

> Append-only and immutable, per the ADR — the value is that an adopter's
> history shows what they were *told*, not what is currently true.
> `verificationStatusAtReveal` is captured for the same reason: if a shelter
> is later suspended, the record should show that it was verified at the time,
> which matters for abuse investigation and for the Phase 2 reward ledger.
>
> `animalSnapshot` is my addition (Q10, my default). Without it, an adopted or
> withdrawn animal makes the adopter's own reveal history unreadable — the
> same failure the shelter snapshot exists to prevent, one field over.

### 4.8 Freshness

```ts
type Freshness =
  | { kind: "fresh"; updatedAt: Date; ageDays: number }
  | { kind: "aging"; updatedAt: Date; ageDays: number }
  | { kind: "stale"; updatedAt: Date; ageDays: number };

type FreshnessPolicy = { freshMaxDays: number; agingMaxDays: number };
export const DEFAULT_FRESHNESS_POLICY: FreshnessPolicy = {
  freshMaxDays: 7,
  agingMaxDays: 30,
};

freshnessOf(lastUpdatedAt: Date, now: Date, policy: FreshnessPolicy): Freshness
```

> `policy` is a **required** parameter, not a defaulted one. A default
> parameter is how a tuning knob quietly stops being threaded through, and
> week 6 is when you find out.
>
> `ageDays` is carried on the union even though it's derivable, because the
> entire point of the design is that no display surface ever touches the
> clock. If the badge has to recompute the delta, it needs `now`, and then
> `Date.now()` appears in a React component and the discipline is gone.
>
> `ageDays` is **elapsed whole 24-hour periods**, floored, clamped at 0 for
> clock skew (`now < lastUpdatedAt`). Not calendar days — calendar-day
> arithmetic needs a time zone, which would put `Europe/Kyiv` into a function
> that is otherwise timezone-free. The visible consequence: something updated
> 20 hours ago reads "сьогодні" rather than "вчора". See Q11 if that's wrong
> for you.

On formatting — there's a boundary question here (Q12). The M1 test must
assert real `uk-UA` output, but `packages/i18n` doesn't exist until M9. My
proposal is a single pure helper in the domain:

```ts
formatFreshnessRelative(freshness: Freshness, locale: Locale): string
// → Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-ageDays, "day")
```

> Native `Intl` is not a dependency, the function is pure, and the locale is a
> parameter rather than a constant — so no brand strings and no hardcoded
> `uk-UA`. The DRY argument is that the sign-and-unit contract (`-ageDays`,
> `"day"`) lives in exactly one place; the alternative is every surface
> re-deriving it, which is the bug CLAUDE.md says the test is there to catch.
> M9's `packages/i18n` then wraps this rather than reimplementing it.

Plus a boot assertion, which I've already confirmed passes on Node 24.19.0:

```ts
assertFullIcu(): void   // throws unless uk-UA month formatting yields "січень"
```

### 4.9 Scoring

```ts
type ScoringPolicy = {
  freshnessWeight: Record<Freshness["kind"], number>;   // e.g. 1.0 / 0.6 / 0.15
  completenessWeight: { hasPhotos: number; hasDescription: number;
                        vaccinationKnown: number };
  preferenceWeight: { species: number; size: number; age: number; city: number };
};
export const DEFAULT_SCORING_POLICY: ScoringPolicy = { /* … */ };

scoreAnimal(
  animal: Animal,
  filters: FeedFilters,
  freshness: Freshness,
  policy: ScoringPolicy,
): number      // [0, 1], deterministic
```

> Same policy pattern as freshness, for the same reason — you will tune these
> weights the first time you look at a real feed.
>
> **Q13, decided:** `FeedFilters` are hard constraints applied in the query,
> so every animal in the result set already matches every filter and
> `preferenceWeight` contributes a constant. The parameter stays anyway, and
> the code will say why in a comment: it means a future "show me close matches
> just outside your filters" feature is a change to the *query*, not to the
> scoring function. Documented as intentionally inert so nobody deletes it as
> dead code in three months.
>
> **Q14, decided:** the feed orders by `(lastUpdatedAt DESC, id)` — a stable,
> indexed, keyset-friendly tuple — and `scoreAnimal` re-ranks within each
> fetched page. No materialised score column, so no recompute job as freshness
> decays and no backfill when you tune the weights. The accepted cost:
> de-ranking stale listings is a within-page effect, not a global ordering.
> M2 implements this; M1 only needed the decision.

---

## 5. `packages/contracts`

Contracts import domain. Never the reverse. The contract layer's job is
**projection** — turning entities into views that are safe to send.

### 5.1 The security-relevant projection

```ts
// Built with pick, not omit — C3.
const PublicShelterViewSchema = ShelterSchema.pick({
  id: true, displayName: true, description: true,
  publicLocation: true, donation: true, createdAt: true,
}).extend({ verification: PublicVerificationBadgeSchema });
```

`exactAddress` and `contact` are structurally absent from every public view.
Adding a field to `Shelter` does not add it here — someone has to come to
this file and decide. That is decision #2 made unforgettable rather than
merely documented.

`PublicVerificationBadge` is a narrowed projection too: adopters see
`"verified" | "unverified"`, not the moderator IDs, evidence, or rejection
reasons carried by `ShelterVerification`.

### 5.2 The eight procedures

Each is a thin declarative object, so a 1.x → 2.0 migration stays a
one-package job:

```ts
export const feedListContract = oc
  .input(FeedListInputSchema)
  .output(FeedListOutputSchema)
  .errors(feedErrors);

export const contract = {
  session:  { bootstrap: sessionBootstrapContract },
  cities:   { list: citiesListContract },
  feed:     { list: feedListContract },
  animals:  { byId: animalsByIdContract, reveal: animalsRevealContract },
  reveals:  { listMine: revealsListMineContract },
  shelters: { byId: sheltersByIdContract },
  swipes:   { record: swipesRecordContract },
};
```

| Procedure | Input | Output |
|---|---|---|
| `session.bootstrap` | `{ deviceSessionId: string \| null }` | `{ adopter, defaultFilters, serverTime: Date }` |
| `cities.list` | `{}` | `readonly CityView[]` |
| `feed.list` | `{ filters: FeedFilters; cursor: FeedCursor \| null; limit: number }` | `{ items: readonly FeedCardView[]; nextCursor: FeedCursor \| null }` |
| `animals.byId` | `{ animalId: AnimalId }` | `AnimalDetailView` |
| `animals.reveal` | `{ animalId: AnimalId }` | `ContactRevealView` |
| `reveals.listMine` | `{ cursor: RevealCursor \| null; limit: number }` | `{ items; nextCursor }` |
| `shelters.byId` | `{ shelterId: ShelterId }` | `PublicShelterView` |
| `swipes.record` | `{ animalId: AnimalId; direction: SwipeDirection; at: Date }` | `SwipeAckView` |

```ts
type FeedCursor = string & Brand<"FeedCursor">;   // opaque; encoding is M2's business
```

> The cursor is an opaque branded string in the contract. Its internal shape
> is a persistence concern and putting it in the contract would leak the
> keyset design to the client and pin M2's hands.
>
> `serverTime` on `session.bootstrap` is the client's `now`. Given that every
> pure function takes `now` as a parameter, the client needs a trustworthy one
> — and a device with a wrong clock should not be able to make a stale listing
> look fresh.

```ts
type SwipeDirection = "pass" | "interested";
```

> **Q15, decided: separate calls.** `swipes.record` maintains the seen-set
> only — batchable, best-effort, safe to lose. `animals.reveal` is the
> explicit, idempotent, ledger-writing action: a double-tap must not write two
> rows, and it's the Phase 2 reward-ledger event. The client makes two calls
> on a right swipe, which is the right trade — coupling a fire-and-forget
> analytics write to a transactional one would give both the reliability
> requirements of the stricter and the guarantees of the looser.

### 5.3 Errors

A shared typed error catalogue via oRPC's `.errors()`, so failures are part
of the contract rather than string matching at the call site:
`NOT_FOUND`, `ANIMAL_NOT_AVAILABLE`, `SHELTER_NOT_VISIBLE`, `INVALID_CURSOR`,
`RATE_LIMITED`. Codes only — no human-readable copy, which belongs in the
i18n layer. (That also keeps brand strings out by construction.)

---

## 6. Dependencies

| Package | Where | Justification |
|---|---|---|
| `zod` 4.4.3 (catalog) | domain, contracts | Already in the catalog. The only domain dependency |
| `@orpc/contract` **1.14.14** | contracts only | The locked decision. Latest stable 1.x; published 2026-08-04, **29.7 h old — clears the 24 h `minimumReleaseAge` quarantine**, no exclude entry needed |
| `@opika/domain` | contracts | Workspace dependency. The boundary, in one line of `package.json` |

`@orpc/contract` pulls four transitive deps: `@orpc/client` and `@orpc/shared`
(first-party, version-locked), `openapi-types` and `@standard-schema/spec`
(both types-only, zero runtime). Nothing else is proposed. `packages/domain`
stays at exactly one dependency.

New catalog entry needed in `pnpm-workspace.yaml`:
```yaml
  "@orpc/contract": 1.14.14
```

---

## 7. Question resolutions

### 7.1 Decided by you

| # | Question | Resolution |
|---|---|---|
| Q1/Q2 | Verification evidence & rejection reasons | **Coded evidence + coded reasons.** `VerificationEvidence` is a discriminated union per evidence item, each carrying `submittedAt`; `RejectionReason` / `SuspensionReason` are closed code lists with an optional free-text note. Analysable and translatable |
| Q3 | Coordinate fuzz radius | **1 km, one global policy.** `DEFAULT_LOCATION_PRIVACY_POLICY.fuzzRadiusMetres = 1000`, tunable in week 6 alongside the freshness thresholds |
| Q6 | Age model | **Derive from `AgeEstimate`.** Store `birth_date` (with precision) or `declared_bucket` (with `declaredAt`); `ageBucketOf(estimate, now)` derives the bucket. M2 pays for it with a range predicate instead of a column match |
| Q8 | Animal listing lifecycle | **Full union in M1** — `draft \| published \| reserved \| adopted \| withdrawn`, each carrying its timestamp |
| Q14 | Feed ordering | **Keyset on `(lastUpdatedAt DESC, id)`, `scoreAnimal` re-ranks within the fetched page.** No materialised score column, no recompute job. De-ranking stale listings is a within-page effect |
| Q15 | Reveal flow | **Separate calls.** `swipes.record` maintains the seen-set only — batchable, best-effort. `animals.reveal` is the explicit, idempotent, ledger-writing action |

### 7.2 Delegated to me — my calls, with reasoning

**Q4 — FSM edges: open `pending → rejected` and `suspended → rejected`; keep
`under_review → suspended` and `verified → under_review` closed.** Full
reasoning in §4.4. The short version: the two I opened remove ceremony and
split a state that was carrying two meanings; the two I closed would each
reintroduce a bug the design already spent a field preventing. Re-verification
of a live shelter should arrive later as a new `re_review` variant, not by
overloading `under_review`. Table is now 8 legal / 22 rejected.

**Q9 — species stays `"dog" | "cat"`.** Reasoning in §4.5. Widening a closed
union later is a compiler-guided edit; an open `other` variant is a permanent
tax that breaks `SizeBucket` semantics on day one.

### 7.3 Not asked — my defaults, easy to override

These are the low-stakes remainder. I'll proceed on these unless you say
otherwise.

**Q5 — keep the `non_monotonic` transition rejection.** Four lines, and it's
the difference between clock skew corrupting an audit trail silently and
failing loudly.

**Q7 — `Money` attaches to nothing.** It ships as the primitive the build plan
asks for, with no `adoptionFee` field. Adding one would invite shelters to
record exactly the "symbolic fee" the ADR flags as an active EU enforcement
pattern, in a product that has deliberately modelled zero payment data. The
primitive costs nothing; the field opens a regulatory question you haven't
answered yet.

**Q10 — add `animalSnapshot` to `ContactReveal`** (name + primary photo).
Without it, an adopted animal makes the adopter's own reveal history
unreadable — the identical failure `shelterSnapshot` exists to prevent, one
field over.

**Q11 — freshness `ageDays` is elapsed whole 24-hour periods**, floored,
clamped at 0. Timezone-free, so `Europe/Kyiv` never enters the domain. Visible
consequence: something updated 20 hours ago reads "сьогодні", not "вчора".

**Q12 — `formatFreshnessRelative(freshness, locale)` lives in the domain.**
Native `Intl` is not a dependency, the function is pure, and the locale is a
parameter. It's the only way M1 can assert real `uk-UA` output, and it keeps
the sign-and-unit contract (`-ageDays`, `"day"`) in exactly one place — which
is the bug CLAUDE.md says that test exists to catch. M9's `packages/i18n`
wraps it rather than reimplementing it.

**Q13 — `FeedFilters` are hard constraints, applied in the query.**
`scoreAnimal` still computes its preference term, which is therefore constant
under the current regime and contributes nothing. That's deliberate rather
than vestigial: it means a future "show me close matches just outside your
filters" feature is a change to the *query*, not to the scoring function.
I'll document the term as intentionally inert so nobody deletes it as dead
code in three months.

---

## 8. What happens after approval

Implementation in dependency order, tests alongside each unit, committed in
logical units:

1. `packages/domain` scaffold + primitives (IDs, Money, LocalizedText, coordinates)
2. Shelter + location + contact
3. Verification FSM + the exhaustive 30-cell transition table test
4. Animal + attestations + document readiness
5. Adopter + FeedFilters
6. ContactReveal
7. Freshness + the uk-UA boundary suite (1, 2, 5, 11, 21, 22 days, `vi.setSystemTime`) + ICU boot assertion
8. `scoreAnimal` + table-driven tests
9. `packages/contracts` — views, then the eight procedures, then errors
10. CLAUDE.md update recording the four locked decisions and the resolved questions
11. Clean-clone `pnpm i && pnpm check` re-verification, now non-vacuous
