import {
  AUTH_ERROR_CODES,
  type PasswordRefusal,
  passwordRefusalOf,
  SIGN_IN_DELAYED_CODE,
} from "../../../kabinet/password-codes";

/**
 * What each password request comes back as, for the forms (PW-1). Each is
 * read from the HTTP status and the error's `code` only (`password-codes.ts`),
 * never from Better Auth's English message, and each kind maps to exactly one
 * of Oleksii's sentences (`password-copy.ts`).
 */

export type SignInOutcome =
  | { kind: "signed_in" }
  /** Every refusal, whatever its cause (§5): one sentence. */
  | { kind: "wrong" }
  /** The per-address delay or the per-IP budget (a minute, the budget's window). */
  | { kind: "throttled"; minutes: number }
  /**
   * The request got no answer at all (the fetch threw): the connection, not the
   * credentials, and not the site's fault. G4 (audit 2026-10-22) gives it a sentence
   * of its own, `kabinet.signIn.failed`; never used for a refused sign-in.
   */
  | { kind: "no_answer" }
  /** A server error: an answer, but not one about the credentials. */
  | { kind: "failed" };

export type ForgotOutcome = { kind: "sent" } | { kind: "throttled" } | { kind: "failed" };

export type ResetOutcome =
  | { kind: "done" }
  | { kind: "refused"; refusal: PasswordRefusal }
  | { kind: "invalid_link" }
  | { kind: "throttled" }
  /** G4: the request got no answer at all. */
  | { kind: "no_answer" }
  | { kind: "failed" };

export type ChangeOutcome =
  | { kind: "done" }
  | { kind: "refused"; refusal: PasswordRefusal }
  | { kind: "wrong_current" }
  | { kind: "no_password" }
  | { kind: "throttled" }
  | { kind: "failed" };

/** An answer as the mapping functions read it: the status and the parsed body, or no answer at all. */
export type Answer = { status: number; body: unknown } | null;

const field = (body: unknown, name: string): unknown =>
  typeof body === "object" && body !== null ? (body as Record<string, unknown>)[name] : undefined;

const codeOf = (answer: Answer) => (answer === null ? undefined : field(answer.body, "code"));

export function signInOutcomeOf(answer: Answer): SignInOutcome {
  if (answer === null) return { kind: "no_answer" };
  if (answer.status >= 500) return { kind: "failed" };
  if (answer.status === 200) return { kind: "signed_in" };
  if (answer.status === 429) {
    const minutes = field(answer.body, "retryAfterMinutes");
    // The per-IP budget answers without minutes: its window is 60 s, so one minute is true.
    return {
      kind: "throttled",
      minutes:
        codeOf(answer) === SIGN_IN_DELAYED_CODE && typeof minutes === "number" && minutes >= 1
          ? Math.ceil(minutes)
          : 1,
    };
  }
  return { kind: "wrong" };
}

export function forgotOutcomeOf(answer: Answer): ForgotOutcome {
  if (answer === null || answer.status >= 500) return { kind: "failed" };
  if (answer.status === 429) return { kind: "throttled" };
  // A malformed address is refused by the browser's own field first; any other answer says
  // nothing about the address, so it reads as sent, as every address does (§6.3).
  return answer.status === 200 ? { kind: "sent" } : { kind: "failed" };
}

export function resetOutcomeOf(answer: Answer): ResetOutcome {
  if (answer === null) return { kind: "no_answer" };
  if (answer.status >= 500) return { kind: "failed" };
  if (answer.status === 200) return { kind: "done" };
  if (answer.status === 429) return { kind: "throttled" };
  const refusal = passwordRefusalOf(codeOf(answer));
  if (refusal !== null) return { kind: "refused", refusal };
  if (codeOf(answer) === AUTH_ERROR_CODES.invalidToken) return { kind: "invalid_link" };
  return { kind: "failed" };
}

export function changeOutcomeOf(answer: Answer): ChangeOutcome {
  if (answer === null || answer.status >= 500) return { kind: "failed" };
  if (answer.status === 200) return { kind: "done" };
  if (answer.status === 429) return { kind: "throttled" };
  const code = codeOf(answer);
  const refusal = passwordRefusalOf(code);
  if (refusal !== null) return { kind: "refused", refusal };
  if (code === AUTH_ERROR_CODES.invalidPassword) return { kind: "wrong_current" };
  if (code === AUTH_ERROR_CODES.noCredential) return { kind: "no_password" };
  return { kind: "failed" };
}

/** Better Auth's endpoints, through the kabinet's own auth route (`FORWARDED_AUTH_PATHS`). */
export const PASSWORD_ENDPOINTS = {
  signIn: "/api/auth/sign-in/email",
  forgot: "/api/auth/request-password-reset",
  reset: "/api/auth/reset-password",
  change: "/api/auth/change-password",
} as const;

/** One JSON POST, read as an `Answer`; a network failure is null. */
export async function postJson(path: string, body: unknown): Promise<Answer> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  } catch {
    return null;
  }
}
