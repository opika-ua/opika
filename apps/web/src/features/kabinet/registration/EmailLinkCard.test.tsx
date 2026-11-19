import { act, fireEvent, getDefaultNormalizer, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RegistrationLinkState } from "../../../kabinet/registration/email-link-route";
import { EmailLinkCard, type EmailLinkPurpose, type KabinetEntry } from "./EmailLinkCard";

/**
 * The email-link pages (R3): one card per state, a heading, at most one sentence, at most one
 * button. Found by role and text; the button's POST is a stand-in here (the decisions are
 * `registration-flow.test.ts`).
 */
const TOKEN = "a".repeat(43);
const PATH = { confirm_email: "/kabinet/zaiavka/pidtverdyty", not_me: "/kabinet/zaiavka/ne-ya" };

function show(
  purpose: EmailLinkPurpose,
  initial: RegistrationLinkState,
  action = vi.fn(async (): Promise<RegistrationLinkState> => initial),
  kabinetEntry: KabinetEntry = "sign_in",
) {
  render(
    <EmailLinkCard
      purpose={purpose}
      initial={initial}
      action={action}
      permalink={PATH[purpose]}
      kabinetEntry={kabinetEntry}
    />,
  );
  return action;
}

const heading = () => screen.getByRole("heading", { level: 1 }).textContent;

describe("EmailLinkCard", () => {
  it("«Підтвердити email» with a live link: the heading, its address and one button that carries the token", () => {
    show("confirm_email", { kind: "form", token: TOKEN, email: "olena@example.org" });
    expect(heading()).toBe("Підтвердити email");
    expect(
      screen.getByText("Натисніть кнопку, щоб підтвердити адресу olena@example.org."),
    ).toBeDefined();
    const button = screen.getByRole("button", { name: "Підтвердити email" });
    const form = button.closest("form");
    expect(new FormData(form ?? undefined).get("token")).toBe(TOKEN);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("a confirm link whose address is unknown: just the button, no sentence with a gap in it", () => {
    show("confirm_email", { kind: "form", token: TOKEN, email: null });
    expect(screen.queryByText(/Натисніть кнопку/)).toBeNull();
    expect(screen.getByRole("button", { name: "Підтвердити email" })).toBeDefined();
  });

  it("«Це не я» with a live link: the heading, what the button does, and one button", () => {
    show("not_me", { kind: "form", token: TOKEN, email: null });
    expect(heading()).toBe("Це не я");
    expect(
      screen.getByText(
        "Якщо ви не реєстрували притулок, натисніть кнопку\u00a0– я видалю заявку, створену з вашою адресою.",
        // Exact, the no-break space included (the default normalizer folds it into a space).
        { normalizer: getDefaultNormalizer({ collapseWhitespace: false }) },
      ),
    ).toBeDefined();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Це не я"]);
  });

  it("«Підтвердити email», used, expired or unknown: the sentence and a link into the kabinet", () => {
    show("confirm_email", { kind: "expired" });
    expect(screen.getByRole("alert").textContent).toBe(
      "Посилання застаріло. Увійдіть у кабінет і надішліть лист ще раз.",
    );
    expect(screen.getByRole("link", { name: "Увійти в кабінет" }).getAttribute("href")).toBe(
      "/kabinet",
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("«Це не я», used, expired or unknown: who to write to, and no sign-in for someone who never registered", () => {
    show("not_me", { kind: "expired" });
    expect(screen.getByRole("alert").textContent).toBe(
      "Посилання вже не діє. Якщо хтось зареєстрував притулок з вашою адресою\u00a0– напишіть мені на hello@opika.org.ua.",
    );
    expect(screen.queryByText(/Увійдіть у кабінет/)).toBeNull();
    // The operator's address is the only link: a click writes to it, no way into a kabinet.
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "mailto:hello@opika.org.ua",
    ]);
    expect(screen.getByRole("link", { name: "hello@opika.org.ua" })).toBeDefined();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("after the confirm POST: announced as done, with the way into the kabinet", async () => {
    const action = show(
      "confirm_email",
      { kind: "form", token: TOKEN, email: null },
      vi.fn(async (): Promise<RegistrationLinkState> => ({ kind: "confirmed" })),
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Підтвердити email" }));
    });
    expect(action).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toBe(
      "Email підтверджено. Я перевірю притулок, зазвичай до 2 днів.",
    );
    expect(screen.getByRole("link", { name: "Увійти в кабінет" })).toBeDefined();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("confirmed while signed in to the kabinet: «Перейти в кабінет», not a sign-in", async () => {
    show(
      "confirm_email",
      { kind: "form", token: TOKEN, email: null },
      vi.fn(async (): Promise<RegistrationLinkState> => ({ kind: "confirmed" })),
      "go_to_kabinet",
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Підтвердити email" }));
    });
    expect(screen.getByRole("link", { name: "Перейти в кабінет" }).getAttribute("href")).toBe(
      "/kabinet",
    );
    expect(screen.queryByRole("link", { name: "Увійти в кабінет" })).toBeNull();
  });

  it("a press the link no longer allows: the expired message is announced", async () => {
    show(
      "not_me",
      { kind: "form", token: TOKEN, email: null },
      vi.fn(async (): Promise<RegistrationLinkState> => ({ kind: "expired" })),
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Це не я" }));
    });
    expect(screen.getByRole("alert").textContent).toBe(
      "Посилання вже не діє. Якщо хтось зареєстрував притулок з вашою адресою\u00a0– напишіть мені на hello@opika.org.ua.",
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("after «Це не я»: the deletion is announced, the operator's address a mailto link", () => {
    show("not_me", { kind: "withdrawn" });
    expect(heading()).toBe("Це не я");
    expect(screen.getByRole("status").textContent).toBe(
      "Заявку видалено. Якщо це помилка\u00a0– напишіть мені на hello@opika.org.ua.",
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "mailto:hello@opika.org.ua",
    ]);
    expect(screen.getByRole("link", { name: "hello@opika.org.ua" })).toBeDefined();
  });

  it("«Це не я» once approved: says nothing was deleted, the address a mailto link", () => {
    show("not_me", { kind: "approved" });
    expect(screen.getByRole("status").textContent).toBe(
      "Притулок уже схвалено, тому заявку не можна видалити за посиланням. Якщо ви не реєстрували цей притулок, напишіть мені на hello@opika.org.ua.",
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "mailto:hello@opika.org.ua",
    ]);
    expect(screen.getByRole("link", { name: "hello@opika.org.ua" })).toBeDefined();
  });
});
