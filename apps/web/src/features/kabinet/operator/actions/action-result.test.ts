import { describe, expect, it } from "vitest";
import { actionFailureOf, emailOutcomeText, staleAfter } from "./action-result";

/**
 * How an S4 action's error reads. The codes are the contract's; a reason the
 * server sends is read through the contract's own data schema, so a
 * malformed one is a plain failure, never a guess.
 */

const err = (code: string, data?: unknown) => ({ code, ...(data === undefined ? {} : { data }) });

describe("actionFailureOf", () => {
  it.each([
    [err("ILLEGAL_TRANSITION"), { kind: "illegal_transition" }],
    [err("CONFLICT"), { kind: "conflict" }],
    [err("EVIDENCE_INSUFFICIENT"), { kind: "evidence_insufficient" }],
    [err("NOT_FOUND"), { kind: "not_found" }],
    [
      err("ADDRESS_HAS_A_ROLE", { reason: "invited_elsewhere" }),
      { kind: "address_has_a_role", reason: "invited_elsewhere" },
    ],
    [
      err("INVALID_EVIDENCE", { reason: "site_visit_in_future" }),
      { kind: "invalid_evidence", reason: "site_visit_in_future" },
    ],
    [err("FORBIDDEN"), { kind: "failed" }],
    [err("INTERNAL_SERVER_ERROR"), { kind: "failed" }],
  ])("%j → %j", (error, expected) => {
    expect(actionFailureOf(error)).toEqual(expected);
  });

  it("no code at all is no answer: fetch threw before the server said anything", () => {
    expect(actionFailureOf(new TypeError("Failed to fetch"))).toEqual({ kind: "no_answer" });
    expect(actionFailureOf(undefined)).toEqual({ kind: "no_answer" });
  });

  it("a reason outside the contract's list is a failure, not a guessed reason", () => {
    expect(actionFailureOf(err("ADDRESS_HAS_A_ROLE", { reason: "somebody" }))).toEqual({
      kind: "failed",
    });
    expect(actionFailureOf(err("INVALID_EVIDENCE"))).toEqual({ kind: "failed" });
  });
});

describe("staleAfter: which refusals mean the page is out of date", () => {
  it("the record moved under the page: re-read first", () => {
    for (const kind of [
      "illegal_transition",
      "conflict",
      "evidence_insufficient",
      "not_found",
    ] as const) {
      expect(staleAfter({ kind }), kind).toBe(true);
    }
  });

  it("a refusal about what was sent: nothing to re-read", () => {
    expect(staleAfter({ kind: "failed" })).toBe(false);
    expect(staleAfter({ kind: "address_has_a_role", reason: "operator" })).toBe(false);
    expect(staleAfter({ kind: "invalid_evidence", reason: "site_visit_in_future" })).toBe(false);
  });
});

/** Every outcome IN-E7 names, his text transcribed from `rui-copy-uk.md` §2.3. */
describe("emailOutcomeText", () => {
  it.each([
    [{ kind: "sent", blockCheck: "clear" }, "Запрошення надіслано на olena@example.org."],
    [
      { kind: "sent", blockCheck: "unknown" },
      "Запрошення надіслано. Перевірити, чи адреса не заблокована, не вдалося.",
    ],
    [
      { kind: "blocked", reason: "unsubscribed" },
      "Запрошення не надіслано: людина з цієї адреси відписалася від листів.",
    ],
    [
      { kind: "blocked", reason: "hard_bounce" },
      "Запрошення не надіслано: адреса не існує або не приймає пошту.",
    ],
    [
      { kind: "blocked", reason: "spam_complaint" },
      "Запрошення не надіслано: на попередній лист з цієї адреси поскаржилися як на спам.",
    ],
    [
      { kind: "blocked", reason: "admin_blocked" },
      "Запрошення не надіслано: адресу заблоковано вручну в поштовому сервісі.",
    ],
    [
      { kind: "failed", reason: "provider_error" },
      "Запрошення не надіслано: поштовий сервіс відповів помилкою. Спробуйте надіслати ще раз.",
    ],
    [
      { kind: "failed", reason: "copy_pending" },
      "Запрошення не надіслано: текст листа ще не готовий.",
    ],
  ] as const)("%j", (outcome, text) => {
    expect(emailOutcomeText(outcome, "olena@example.org")).toBe(text);
  });

  it("prints an address carrying $& literally", () => {
    expect(emailOutcomeText({ kind: "sent", blockCheck: "clear" }, "a$&b@example.org")).toBe(
      "Запрошення надіслано на a$&b@example.org.",
    );
  });
});
