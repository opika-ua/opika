import type { LoginEmailChangeResult } from "@opika/contracts";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmEmailActions } from "./ConfirmEmailActions";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }),
}));

const NEW = "new-address@example.org";
const PASSWORD = "ялинка-під-вікном";

function setup(result: LoginEmailChangeResult) {
  const change = vi.fn(async () => result);
  render(<ConfirmEmailActions resend={async () => ({ kind: "sent" })} change={change} />);
  return { change };
}

async function openAndSubmit(email = NEW, password = PASSWORD) {
  await userEvent.click(screen.getByRole("button", { name: "Змінити пошту" }));
  const form = screen.getByRole("form", { name: "Нова пошта для входу" });
  if (email !== "") await userEvent.type(screen.getByLabelText("Електронна пошта"), email);
  if (password !== "") await userEvent.type(screen.getByLabelText("Поточний пароль"), password);
  await userEvent.click(screen.getByRole("button", { name: "Змінити й надіслати лист" }));
  return form;
}

describe("ConfirmEmailActions: «Змінити пошту»", () => {
  it("opens the form: the new address with its hint, the current password, submit and cancel", async () => {
    setup({ kind: "not_needed" });
    const toggle = screen.getByRole("button", { name: "Змінити пошту" });
    await userEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("heading", { level: 3, name: "Нова пошта для входу" })).toBeTruthy();
    expect(
      screen.getByText(
        "Лист для підтвердження прийде на нову адресу. Входити в кабінет треба буде з неї.",
      ),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Скасувати" }));
    expect(screen.queryByRole("form")).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });

  it("sends what was typed, then announces «Я надіслав лист на …» and refreshes the banner", async () => {
    const { change } = setup({ kind: "changed", email: NEW, confirmation: "sent" });
    await openAndSubmit();
    expect(change).toHaveBeenCalledWith({ email: NEW, password: PASSWORD });
    const status = await screen.findByRole("status");
    expect(status.textContent).toBe(`Я надіслав лист на ${NEW}.`);
    expect(screen.queryByRole("form")).toBeNull();
    expect(refresh).toHaveBeenCalled();
  });

  it("changed, but the email didn't go: says so and points at «Надіслати ще раз»", async () => {
    setup({ kind: "changed", email: NEW, confirmation: "failed" });
    await openAndSubmit();
    expect((await screen.findByRole("status")).textContent).toBe(
      "Пошту змінено, але лист не надіслався – натисніть „Надіслати ще раз“.",
    );
  });

  it.each<[LoginEmailChangeResult, string, string]>([
    [{ kind: "wrong_password" }, "Поточний пароль", "Поточний пароль неправильний."],
    [
      { kind: "email_taken" },
      "Електронна пошта",
      "Цей email уже зареєстровано. Увійдіть або відновіть пароль.",
    ],
    [
      { kind: "invalid", fields: { email: "same_email" } },
      "Електронна пошта",
      "Це та сама адреса.",
    ],
    [
      { kind: "invalid", fields: { email: "email" } },
      "Електронна пошта",
      "Схоже, це не адреса пошти.",
    ],
    [
      { kind: "invalid", fields: { password: "required" } },
      "Поточний пароль",
      "Заповніть це поле.",
    ],
  ])("%j: the field says why, and takes focus", async (result, label, text) => {
    setup(result);
    await openAndSubmit();
    const field = screen.getByLabelText(label);
    expect(field.getAttribute("aria-invalid")).toBe("true");
    const describedBy = field.getAttribute("aria-describedby") ?? "";
    const error = describedBy
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .find((line) => line === text);
    expect(error).toBe(text);
    expect(document.activeElement).toBe(field);
    expect(screen.getByRole("form")).toBeTruthy();
  });

  it.each<[LoginEmailChangeResult, string]>([
    [
      { kind: "rate_limited", retryAfterSeconds: 60 },
      "Забагато спроб. Спробуйте за кілька хвилин.",
    ],
    [
      { kind: "limiter_unavailable" },
      "Зараз не вдалося змінити пошту. Спробуйте за кілька хвилин.",
    ],
    [{ kind: "failed" }, "Не вдалося змінити пошту. Спробуйте ще раз або напишіть мені."],
  ])("%j: one alert under the form, which stays open", async (result, text) => {
    setup(result);
    await openAndSubmit();
    expect((await screen.findByRole("alert")).textContent).toBe(text);
    expect(screen.getByRole("form")).toBeTruthy();
  });

  it("the daily cap names the operator's address", async () => {
    setup({ kind: "daily_cap" });
    await openAndSubmit();
    expect((await screen.findByRole("alert")).textContent).toMatch(/^Зараз забагато заявок\./);
  });

  it("an action that throws reads as failed", async () => {
    const change = vi.fn(async (): Promise<LoginEmailChangeResult> => {
      throw new Error("network");
    });
    render(<ConfirmEmailActions resend={async () => ({ kind: "sent" })} change={change} />);
    await openAndSubmit();
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Не вдалося змінити пошту. Спробуйте ще раз або напишіть мені.",
    );
  });
});
