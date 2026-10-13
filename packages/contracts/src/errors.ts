import {
  EvidenceGapSchema,
  LISTING_EVENT_TYPES,
  LISTING_KINDS,
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
  /** Publish with something missing (`data.gaps`; today: no photo). */
  PUBLISH_REQUIREMENTS_UNMET: {
    status: 422,
    message: "The listing isn't ready to publish.",
    data: z.object({ gaps: z.array(PublishGapSchema).min(1).readonly() }),
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
   * A draft that can't be deleted, only withdrawn (HS-Q9, Oleksii). `data.reason`
   * says why, and the kabinet picks its message by it (HS-T10, Oleksii):
   * - `was_published`: it has been public before (`first_published_at` set);
   * - `has_activity`: a swipe or reveal still references it (the database's
   *   own refusal). That is *not* a claim it was published: a draft id can
   *   be swiped without the draft ever being public, so the message for this
   *   reason must not say so.
   * The fixed message below makes neither claim.
   */
  WAS_PUBLISHED: {
    status: 409,
    message: "This listing can be withdrawn but not deleted.",
    data: z.object({ reason: z.enum(["was_published", "has_activity"]) }),
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
} as const;

export type ApiErrorCode = keyof typeof apiErrors;
