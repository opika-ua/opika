import type { EmailSendOutcome } from "@opika/contracts";
import { ORPCError } from "@orpc/client";
import { describe, expect, it } from "vitest";
import { createRefusalOf, emailOutcomeMessage, refusalMessage } from "./create-outcome";

/**
 * Every refusal and every invitation outcome S2 can meet, mapped to
 * Oleksii's sentence. The sentences are transcribed from his file
 * (`rui-copy-uk.md` §2.3, §2.4), never read from `uk.ts`, so a drift in the
 * catalogue fails here. Errors are built the way the oRPC client builds
 * them from a response body.
 */

const fromBody = (body: {
  code: string;
  status: number;
  message?: string;
  data?: unknown;
  defined?: boolean;
}) =>
  new ORPCError(body.code, {
    status: body.status,
    message: body.message ?? "",
    data: body.data,
    defined: body.defined ?? false,
  });

const message = (error: unknown) => refusalMessage(createRefusalOf(error));

describe("create's refusals", () => {
  it.each([
    ["shelter_admin", "Ця адреса вже має доступ до іншого притулку."],
    ["operator", "Це адреса адміністратора сайту. Для притулку потрібна інша."],
    ["invited_elsewhere", "На цю адресу вже надіслано чинне запрошення до іншого притулку."],
  ])("the first admin's address already has a role: %s", (reason, expected) => {
    const error = fromBody({
      code: "ADDRESS_HAS_A_ROLE",
      status: 409,
      data: { reason },
      defined: true,
    });
    expect(createRefusalOf(error)).toEqual({ kind: "address_has_a_role", reason });
    expect(message(error)).toBe(expected);
  });

  it("a site visit dated in the future", () => {
    const error = fromBody({
      code: "INVALID_EVIDENCE",
      status: 422,
      data: { reason: "site_visit_in_future" },
      defined: true,
    });
    expect(message(error)).toBe("Дата візиту не може бути в майбутньому.");
  });

  it("an unknown city: the server's undeclared 400 with its own message", () => {
    const error = fromBody({ code: "BAD_REQUEST", status: 400, message: "Unknown city" });
    expect(createRefusalOf(error)).toEqual({ kind: "unknown_city" });
    expect(message(error)).toBe("Такого міста немає у списку.");
  });

  it("an input-validation 400 is not an unknown city", () => {
    const error = fromBody({
      code: "BAD_REQUEST",
      status: 400,
      message: "Input validation failed",
      data: { issues: [] },
    });
    expect(message(error)).toBe("Не вдалося створити притулок. Спробуйте ще раз.");
  });

  // RUI4-F2: his sentence transcribed from his answer, filled for 100; the issue message is the server's.
  it("an input-validation 400 naming the display name's cap is the name's own refusal", () => {
    const error = fromBody({
      code: "BAD_REQUEST",
      status: 400,
      message: "Input validation failed",
      data: {
        issues: [
          { path: ["contact"], message: "Invalid input" },
          { path: ["displayName"], message: "Shelter display name is longer than 100 characters" },
        ],
      },
    });
    expect(createRefusalOf(error)).toEqual({ kind: "name_too_long" });
    expect(message(error)).toBe("Назва довша за 100 символів.");
  });

  it.each([
    ["no response at all (fetch threw)", new TypeError("Failed to fetch")],
    ["an error with no code", new Error("Cannot parse response body")],
    ["the server failed", fromBody({ code: "INTERNAL_SERVER_ERROR", status: 500 })],
    ["the gateway timed out", fromBody({ code: "GATEWAY_TIMEOUT", status: 504 })],
    ["a 503 after the request left", fromBody({ code: "SERVICE_UNAVAILABLE", status: 503 })],
  ])("a lost answer: %s; the shelter may exist, so the list first", (_case, error) => {
    expect(createRefusalOf(error)).toEqual({ kind: "lost_answer" });
    expect(message(error)).toBe(
      "Відповідь не надійшла. Притулок міг створитися – перевірте список, перш ніж пробувати знову.",
    );
  });

  it.each([
    ["FORBIDDEN", 403],
    ["UNAUTHENTICATED", 401],
    ["TOO_MANY_REQUESTS", 429],
    ["PAYLOAD_TOO_LARGE", 413],
  ])("any other refusal, answered before anything was written: %s", (code, status) => {
    expect(message(fromBody({ code, status }))).toBe(
      "Не вдалося створити притулок. Спробуйте ще раз.",
    );
  });

  it("a document refusal the form can't cause is a plain failure, not a site-visit message", () => {
    const error = fromBody({
      code: "INVALID_EVIDENCE",
      status: 422,
      data: { reason: "document_not_supported_yet" },
      defined: true,
    });
    expect(createRefusalOf(error)).toEqual({ kind: "failed" });
  });

  it("an address refusal with a reason it doesn't know is a plain failure", () => {
    expect(
      createRefusalOf(fromBody({ code: "ADDRESS_HAS_A_ROLE", status: 409, data: { reason: "x" } })),
    ).toEqual({ kind: "failed" });
  });
});

describe("what became of the invitation email", () => {
  const email = "iryna@example.org";
  it.each<[string, EmailSendOutcome, string]>([
    [
      "sent, block list checked",
      { kind: "sent", blockCheck: "clear" },
      "Запрошення надіслано на iryna@example.org.",
    ],
    [
      "sent, block list unchecked",
      { kind: "sent", blockCheck: "unknown" },
      "Запрошення надіслано. Перевірити, чи адреса не заблокована, не вдалося.",
    ],
    [
      "blocked: unsubscribed",
      { kind: "blocked", reason: "unsubscribed" },
      "Запрошення не надіслано: людина з цієї адреси відписалася від листів.",
    ],
    [
      "blocked: hard bounce",
      { kind: "blocked", reason: "hard_bounce" },
      "Запрошення не надіслано: адреса не існує або не приймає пошту.",
    ],
    [
      "blocked: spam complaint",
      { kind: "blocked", reason: "spam_complaint" },
      "Запрошення не надіслано: на попередній лист з цієї адреси поскаржилися як на спам.",
    ],
    [
      "blocked: by hand",
      { kind: "blocked", reason: "admin_blocked" },
      "Запрошення не надіслано: адресу заблоковано вручну в поштовому сервісі.",
    ],
    [
      "failed: provider error",
      { kind: "failed", reason: "provider_error" },
      "Запрошення не надіслано: поштовий сервіс відповів помилкою. Спробуйте надіслати ще раз.",
    ],
    [
      "failed: copy pending",
      { kind: "failed", reason: "copy_pending" },
      "Запрошення не надіслано: текст листа ще не готовий.",
    ],
  ])("%s", (_case, outcome, expected) => {
    expect(emailOutcomeMessage(outcome, email)).toBe(expected);
  });
});
