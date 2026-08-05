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
  SHELTER_NOT_VISIBLE: {
    message: "The shelter is not currently verified.",
  },
  INVALID_CURSOR: {
    message: "The pagination cursor is malformed or no longer valid.",
  },
  RATE_LIMITED: {
    message: "Too many requests.",
  },
} as const;

export type ApiErrorCode = keyof typeof apiErrors;
