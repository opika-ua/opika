import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChangePasswordSection } from "./ChangePasswordSection";
import { ForgotPasswordCard } from "./ForgotPasswordCard";
import type { ChangeOutcome, ForgotOutcome, ResetOutcome } from "./password-api";
import { ResetPasswordCard } from "./ResetPasswordCard";

/**
 * The three password forms PW-1 adds (§4.2), driven the way a person does: found by role,
 * label and text, never by class or position. Each sentence asserted is his, transcribed from
 * `docs/shelter-passwords-copy-uk.md`, with the numbers filled as the server's constants fill
 * them (10, 128, 60 minutes).
 */

const field = (label: string) => screen.getByLabelText(label, { selector: "input" });

describe("«Забули пароль?»", () => {
  const renderWith = (outcome: ForgotOutcome) => {
    const send = vi.fn(async (_email: string) => outcome);
    render(<ForgotPasswordCard minutes={60} send={send} />);
    return { user: userEvent.setup(), send };
  };

  it("asks for the address, sends it trimmed, and gives the one answer every address gets", async () => {
    const { user, send } = renderWith({ kind: "sent" });
    expect(screen.getByRole("heading", { level: 1, name: "Забули пароль?" })).toBeDefined();
    expect(screen.getByText("Вкажіть адресу пошти, з якою ви входите в кабінет.")).toBeDefined();
    await user.type(field("Електронна пошта"), " Olena@Example.org ");
    await user.click(screen.getByRole("button", { name: "Надіслати посилання" }));
    expect(send).toHaveBeenCalledWith("Olena@Example.org");
    expect(screen.getByRole("status").textContent).toBe(
      "Якщо це адреса адміністратора кабінету притулку, на неї надіслано посилання для нового пароля. Воно діє 60 хв.",
    );
  });

  it("too many requests, the same for every address", async () => {
    const { user } = renderWith({ kind: "throttled" });
    await user.type(field("Електронна пошта"), "olena@example.org");
    await user.click(screen.getByRole("button", { name: "Надіслати посилання" }));
    expect(screen.getByRole("status").textContent).toBe(
      "Забагато запитів. Спробуйте ще раз пізніше.",
    );
  });
});

describe("the reset page", () => {
  const renderWith = (outcome: ResetOutcome) => {
    const reset = vi.fn(async (_token: string, _password: string) => outcome);
    render(<ResetPasswordCard token="token-from-the-link" reset={reset} />);
    return { user: userEvent.setup(), reset };
  };

  async function submit(
    user: ReturnType<typeof userEvent.setup>,
    password: string,
    repeat = password,
  ) {
    await user.type(field("Пароль"), password);
    await user.type(field("Повторіть пароль"), repeat);
    await user.click(screen.getByRole("button", { name: "Зберегти пароль" }));
  }

  /**
   * Oleksii, 2026-10-20, verbatim: "Address bar: after the page reads the token, remove it with
   * history.replaceState. The form carries it in a hidden field."
   */
  it("takes the token out of the address bar on load, and the form still sends it", async () => {
    window.history.replaceState(null, "", "/kabinet/vkhid/novyi-parol?token=token-from-the-link");
    const { user, reset } = renderWith({ kind: "done" });
    expect(window.location.pathname).toBe("/kabinet/vkhid/novyi-parol");
    expect(window.location.search).toBe("");
    expect(window.location.href).not.toContain("token-from-the-link");
    await submit(user, "ялинка-під-вікном");
    expect(reset).toHaveBeenCalledWith("token-from-the-link", "ялинка-під-вікном");
  });

  it("shows the live length while typing, as «Символів: {count} з 10»", async () => {
    const { user } = renderWith({ kind: "done" });
    expect(screen.getByText("Символів: 0 з 10")).toBeDefined();
    await user.type(field("Пароль"), "ґанок🇺🇦");
    // A flag is one character, as a reader counts it.
    expect(screen.getByText("Символів: 6 з 10")).toBeDefined();
  });

  it("refuses two different passwords before sending anything", async () => {
    const { user, reset } = renderWith({ kind: "done" });
    await submit(user, "ялинка-під-вікном", "ялинка-під-вікнoм");
    expect(reset).not.toHaveBeenCalled();
    expect(screen.getByText("Паролі не збігаються.")).toBeDefined();
    expect(field("Повторіть пароль").getAttribute("aria-invalid")).toBe("true");
  });

  it.each([
    ["too_short", "Пароль закороткий. Мінімум символів: 10."],
    ["too_long", "Пароль задовгий. Максимум символів: 128."],
    ["common", "Цей пароль надто легко вгадати. Оберіть інший."],
    [
      "contains_personal",
      "Пароль не може містити вашу адресу пошти (навіть частину до @), назву притулку чи назву сайту.",
    ],
  ] as const)("puts the server's %s refusal on the field", async (refusal, sentence) => {
    const { user, reset } = renderWith({ kind: "refused", refusal });
    await submit(user, "ялинка-під-вікном");
    expect(reset).toHaveBeenCalledWith("token-from-the-link", "ялинка-під-вікном");
    const error = screen.getByText(sentence);
    expect(field("Пароль").getAttribute("aria-describedby")).toContain(error.id);
  });

  it("no answer at all: «Не вдалося звʼязатися із сайтом…» (G4, audit 2026-10-22)", async () => {
    const { user } = renderWith({ kind: "no_answer" });
    await submit(user, "ялинка-під-вікном");
    expect(screen.getByRole("alert").textContent).toBe(
      "Не вдалося звʼязатися із сайтом. Перевірте зʼєднання і спробуйте ще раз.",
    );
  });

  it("done: every device signed out, and the way to sign in", async () => {
    const { user } = renderWith({ kind: "done" });
    await submit(user, "ялинка-під-вікном");
    expect(
      screen.getByText(
        "Пароль змінено, на всіх пристроях виконано вихід. Увійдіть з новим паролем.",
      ),
    ).toBeDefined();
    expect(screen.getByRole("link", { name: "Перейти до входу" }).getAttribute("href")).toBe(
      "/kabinet/vkhid",
    );
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 }));
  });

  it("an expired or used link says so and links to a new one", async () => {
    const { user } = renderWith({ kind: "invalid_link" });
    await submit(user, "ялинка-під-вікном");
    const link = screen.getByRole("link", { name: "Отримати нове посилання" });
    expect(link.getAttribute("href")).toBe("/kabinet/vkhid/zabuly");
    expect(link.parentElement?.textContent).toBe(
      "Посилання застаріло або вже використане. Отримати нове посилання",
    );
  });
});

describe("«Змінити пароль»", () => {
  const renderWith = (outcome: ChangeOutcome, password: "set" | "not_set" = "set") => {
    const change = vi.fn(async (_current: string, _next: string) => outcome);
    render(<ChangePasswordSection password={{ kind: password }} change={change} />);
    return { user: userEvent.setup(), change };
  };

  async function submit(user: ReturnType<typeof userEvent.setup>, current = "старий-пароль-ось") {
    await user.type(field("Поточний пароль"), current);
    await user.type(field("Новий пароль"), "сонячний-ранок-над-Дніпром");
    await user.type(field("Повторіть пароль"), "сонячний-ранок-над-Дніпром");
    await user.click(screen.getByRole("button", { name: "Змінити пароль" }));
  }

  it("requires the current password and sends both; done says the other devices are signed out", async () => {
    const { user, change } = renderWith({ kind: "done" });
    expect(screen.getByRole("heading", { level: 2, name: "Змінити пароль" })).toBeDefined();
    await submit(user);
    expect(change).toHaveBeenCalledWith("старий-пароль-ось", "сонячний-ранок-над-Дніпром");
    expect(screen.getByRole("status").textContent).toBe(
      "Пароль змінено. На інших пристроях виконано вихід, тут ви залишаєтеся в кабінеті.",
    );
    expect((field("Поточний пароль") as HTMLInputElement).value).toBe("");
  });

  it("a wrong current password is said on that field", async () => {
    const { user } = renderWith({ kind: "wrong_current" });
    await submit(user);
    const error = screen.getByText("Поточний пароль неправильний.");
    expect(field("Поточний пароль").getAttribute("aria-describedby")).toContain(error.id);
  });

  it("an admin with no password yet sees his note, «Забули пароль?» linking to its page", () => {
    renderWith({ kind: "done" }, "not_set");
    expect(screen.queryByLabelText("Поточний пароль")).toBeNull();
    const link = screen.getByRole("link", { name: "Забули пароль?" });
    expect(link.getAttribute("href")).toBe("/kabinet/vkhid/zabuly");
    expect(link.parentElement?.textContent).toBe(
      "Пароля ще немає. Створити його можна через «Забули пароль?» на сторінці входу.",
    );
  });

  it("the server saying there is no password turns the form into that note", async () => {
    const { user } = renderWith({ kind: "no_password" });
    await submit(user);
    expect(screen.getByRole("link", { name: "Забули пароль?" })).toBeDefined();
  });
});
