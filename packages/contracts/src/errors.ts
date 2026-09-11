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
} as const;

export type ApiErrorCode = keyof typeof apiErrors;
