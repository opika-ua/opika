/**
 * Failure modes that are part of the API's contract rather than incidents.
 *
 * Codes only. Human-readable copy belongs to the translation layer, which also
 * means no product naming can leak into this package.
 */
export const apiErrors = {
  NOT_FOUND: {
    message: "The requested resource does not exist or is not visible.",
  },
  ANIMAL_NOT_AVAILABLE: {
    message: "The animal is no longer listed for adoption.",
  },
  /**
   * Only ever declared where the caller has already been shown the shelter, so
   * that it explains a refusal rather than revealing one. Declaring it beside
   * NOT_FOUND on a lookup would turn it into a moderation oracle: shelter ids
   * are public on every feed card, so an id answering "not visible" rather than
   * "not found" would identify a shelter a moderator had suspended or rejected.
   */
  SHELTER_NOT_VISIBLE: {
    message: "The shelter is not currently verified.",
  },
  /**
   * The session cookie is absent, expired, or was not issued by this server.
   * Distinct from NOT_FOUND so the client can restore a session rather than
   * rendering a dead end.
   */
  UNAUTHENTICATED: {
    message: "No valid session.",
  },
  INVALID_CURSOR: {
    message: "The pagination cursor is malformed or no longer valid.",
  },
  RATE_LIMITED: {
    message: "Too many requests.",
  },
} as const;

export type ApiErrorCode = keyof typeof apiErrors;
