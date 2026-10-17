import {
  EvidenceGapSchema,
  LISTING_EVENT_TYPES,
  LISTING_KINDS,
  PHOTO_REJECTION_REASONS,
  PublishGapSchema,
  VERIFICATION_EVENT_TYPES,
  VerificationStatusSchema,
} from "@opika/domain";
import { z } from "zod";

/**
 * Which state machine refused, and from where. A union on `machine` rather
 * than one loose `{ from: string; event: string }`: the two FSMs' states and
 * events are disjoint vocabularies, and a client rendering the refusal needs
 * to know which one it's reading.
 */
export const IllegalTransitionDataSchema = z.discriminatedUnion("machine", [
  z.object({
    machine: z.literal("listing"),
    from: z.enum(LISTING_KINDS),
    // `delete_draft` isn't a listing event (a deleted draft has no next
    // state), but deleting a non-draft is refused for the same reason a
    // transition is: the current state doesn't allow it.
    event: z.enum([...LISTING_EVENT_TYPES, "delete_draft"]),
  }),
  z.object({
    machine: z.literal("verification"),
    from: VerificationStatusSchema,
    event: z.enum(VERIFICATION_EVENT_TYPES),
  }),
]);

/**
 * Failure modes that are part of the API's contract rather than incidents.
 *
 * Codes only. Human-readable copy belongs to the translation layer, which also
 * means no product naming can leak into this package.
 *
 * **`status`, added 2026-09-10 (O-20) — the one place every one of these
 * codes' real HTTP status is declared.** Found by the reviewer, confirmed
 * against a real request: none of these codes are oRPC's own "common" error
 * codes (`BAD_REQUEST`, `UNAUTHORIZED`, `TOO_MANY_REQUESTS`, ...), and oRPC's
 * own `fallbackORPCErrorStatus` falls back to a bare `500` for any code it
 * doesn't recognise — so every `throw new ORPCError("RATE_LIMITED")` in this
 * codebase answered 500 over the wire, indistinguishable from a real server
 * failure, until now. (`NOT_FOUND` happened to already read 404, purely
 * because oRPC also has a *common* code spelled identically — coincidence,
 * not a fix.) Every procedure's own `.errors({...})` declaration in
 * `packages/contracts/src/procedures/*.ts` already references these objects
 * directly, and every handler now constructs its errors via the
 * `errors.<CODE>()` constructor oRPC injects from that same declaration
 * (`apps/web/src/api/handlers/*.ts`) rather than a raw `new ORPCError(code)`
 * — so a status set here is the status a real client receives, not merely
 * the status the server intended to send. Verified end to end in
 * `apps/web/src/api/api.test.ts`, which asserts the actual `Response.status`
 * a request receives (via the real `RPCHandler` pipeline in
 * `apps/web/src/api/test-harness.ts`), not the code the handler threw — "the
 * harness" elsewhere in this repo means the Playwright rendering gate
 * (`pnpm test:harness`), which this fix does not touch.
 */
export const apiErrors = {
  NOT_FOUND: {
    status: 404,
    message: "The requested resource does not exist or is not visible.",
  },
  ANIMAL_NOT_AVAILABLE: {
    status: 404,
    message: "The animal is no longer listed for adoption.",
  },
  /**
   * Only ever declared where the caller has already been shown the shelter, so
   * that it explains a refusal rather than revealing one. Declaring it beside
   * NOT_FOUND on a lookup would turn it into a moderation oracle: shelter ids
   * are public on every feed card, so an id answering "not visible" rather than
   * "not found" would identify a shelter a moderator had suspended or rejected.
   * Same status as NOT_FOUND, deliberately — the point is that a client can't
   * tell the two apart from the status alone, only from the code.
   */
  SHELTER_NOT_VISIBLE: {
    status: 404,
    message: "The shelter is not currently verified.",
  },
  /**
   * The session cookie is absent, expired, or was not issued by this server.
   * Distinct from NOT_FOUND so the client can restore a session rather than
   * rendering a dead end.
   */
  UNAUTHENTICATED: {
    status: 401,
    message: "No valid session.",
  },
  INVALID_CURSOR: {
    status: 400,
    message: "The pagination cursor is malformed or no longer valid.",
  },
  RATE_LIMITED: {
    status: 429,
    message: "Too many requests.",
  },
  /**
   * H2 kabinet. Authenticated, but not as an actor this procedure accepts,
   * including a shelter admin acting on another shelter's animal or shelter
   * (S3-Q2: cross-tenant is FORBIDDEN, by Oleksii's instruction).
   */
  FORBIDDEN: {
    status: 403,
    message: "Not permitted for this account.",
  },
  /**
   * A shelter admin called a `shelter.*` write while the cabinet's editing
   * screens (K2/K3) haven't shipped (inbox KH-Q1). Its own code rather than
   * FORBIDDEN: the caller is the right actor for the procedure, the procedure
   * just isn't open yet, and a client or a test must be able to tell "never yours" from
   * "not yet" by the code. 403 because it is still the access policy
   * refusing, not a server failure; the code carries the distinction.
   */
  SHELTER_WRITES_NOT_YET_AVAILABLE: {
    status: 403,
    message: "Changes from the shelter's cabinet are not available yet.",
  },
  /** A compare-and-set lost: someone else changed the record first. Reload and try again. */
  CONFLICT: {
    status: 409,
    message: "The record changed since it was read.",
  },
  /** Either state machine refused the move (`data` names the state and the event). */
  ILLEGAL_TRANSITION: {
    status: 409,
    message: "That change isn't possible from the current state.",
    data: IllegalTransitionDataSchema,
  },
  /** Approve with evidence short of `DEFAULT_VERIFICATION_POLICY` (`data.gaps` says what's missing). */
  EVIDENCE_INSUFFICIENT: {
    status: 422,
    message: "The evidence doesn't meet the verification policy yet.",
    data: z.object({ gaps: z.array(EvidenceGapSchema).min(1).readonly() }),
  },
  /**
   * Publish with something missing (`data.gaps`, in form order: size, age,
   * description, photo; K-Q5). Widened from photo-only by K3 and still
   * accepting every value it did, so an older client reading `photo` keeps
   * working.
   */
  PUBLISH_REQUIREMENTS_UNMET: {
    status: 422,
    message: "The listing isn't ready to publish.",
    data: z.object({ gaps: z.array(PublishGapSchema).min(1).readonly() }),
  },
  /**
   * A save that would clear a listing fact on an animal that has been
   * published (F-B1): only a draft may lack one. Today only the description
   * can be cleared, so `field` is that in practice; the enum names every
   * listing fact so the answer stays exact if another becomes clearable.
   */
  LISTING_FACT_REQUIRED: {
    status: 422,
    message: "A listing that was published must keep this field.",
    data: z.object({ field: z.enum(["size", "age", "description"]) }),
  },
  /**
   * A birth date or «as of» date the server refuses (D3, Oleksii: "Refuse a
   * date in the future (Kyiv) or older than 30 years."). The form checks the
   * same rule first (`ageDateProblem`), so this reaches a shelter only when
   * the device's calendar disagrees with the server's.
   */
  AGE_DATE_OUT_OF_RANGE: {
    status: 422,
    message: "That date is in the future or too far back.",
    data: z.object({ problem: z.enum(["future", "too_old"]) }),
  },
  /**
   * A shelter's declaration would overwrite a fact the registry confirmed
   * (proposal §1.7). Its own code, not FORBIDDEN (HS-T6, Oleksii): 403 is
   * reserved for access and tenant violations, so the cross-tenant suite
   * can't pass on a 403 that meant something else.
   */
  REGISTRY_CONFIRMED: {
    status: 409,
    message: "That fact is confirmed by the registry and can't be changed here.",
  },
  /**
   * A draft that can't be deleted, only withdrawn (HS-Q9, Oleksii). One
   * refusal for both causes, with no data (K-Q9, Oleksii: "one refusal for
   * both cases"): it has been public before (`first_published_at` set), or a
   * swipe or reveal still references it (the database's own refusal). Telling
   * the two apart would tell a shelter that an adopter acted on its animal
   * (commitment #2). Merging them is truthful because activity implies
   * publication: `swipes.record` refuses a non-discoverable animal (DR-F1),
   * and a reveal needs a discoverable one too, so a never-published draft
   * collects neither.
   */
  WAS_PUBLISHED: {
    status: 409,
    message: "This listing can be withdrawn but not deleted.",
  },
  /**
   * The address already has a role, so it can't be invited (RG-T10, IN-Q7,
   * IN-Q8): it administers a shelter (one person, one shelter:
   * `auth_member_user_id_unique`), it is an operator (one person is never
   * both: `conflicting_roles`), or it holds a live invitation to another
   * shelter (accepting both would hit the one-membership index). A typed
   * refusal, never the database's error; the reason lets S2/S4 say which.
   */
  ADDRESS_HAS_A_ROLE: {
    status: 409,
    message: "That address already has a role in the registry.",
    data: z.object({
      reason: z.enum(["shelter_admin", "operator", "invited_elsewhere"]),
    }),
  },
  /** An undo past its window, or after a newer write (H2-16). */
  UNDO_EXPIRED: {
    status: 409,
    message: "That confirmation can no longer be undone.",
  },
  /**
   * Evidence input refused (`data.reason`): a site visit dated in the future
   * (`toVerificationEvidence`), or, once the registry writers land in this PR, a
   * `documentKey` before the private evidence bucket exists (RG-Q5,
   * `document_not_supported_yet`).
   */
  INVALID_EVIDENCE: {
    status: 422,
    message: "The evidence couldn't be accepted.",
    data: z.object({ reason: z.enum(["site_visit_in_future", "document_not_supported_yet"]) }),
  },
  /**
   * Photo uploads are switched off on this deployment (P-Q10): only
   * Production holds the upload token, so a Preview, or a local run without
   * one, refuses every `shelter.photos.add` with this rather than failing
   * somewhere inside the storage call. 503: the request was fine, the
   * deployment can't serve it.
   */
  PHOTO_UPLOADS_UNAVAILABLE: {
    status: 503,
    message: "Photo uploads are not available on this deployment.",
  },
  /** The uploaded file isn't a photo the registry stores (`data.reason`, decided by its bytes). */
  PHOTO_REJECTED: {
    status: 422,
    message: "That file can't be used as a photo.",
    data: z.object({ reason: z.enum(PHOTO_REJECTION_REASONS) }),
  },
  /** The animal already has the most photos it can have (K-Q11; `data.max`). */
  PHOTO_LIMIT_REACHED: {
    status: 409,
    message: "This animal already has the most photos it can have.",
    data: z.object({ max: z.int().positive() }),
  },
  /**
   * Removing the last photo of a published or reserved animal (P-Q8): a card
   * adopters can see must keep a photo, the same rule that refuses to publish
   * a draft without one. Withdraw it first, or add another photo.
   */
  PHOTOS_REQUIRED_WHILE_VISIBLE: {
    status: 409,
    message: "A listing adopters can see must keep at least one photo.",
  },
} as const;

export type ApiErrorCode = keyof typeof apiErrors;
