import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RegistrationLinkState } from "../../../kabinet/registration/email-link-route";
import { EmailLinkCard, type EmailLinkPurpose } from "./EmailLinkCard";

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
) {
  render(
    <EmailLinkCard purpose={purpose} initial={initial} action={action} permalink={PATH[purpose]} />,
  );
  return action;
}

const heading = () => screen.getByRole("heading", { level: 1 }).textContent;

describe("EmailLinkCard", () => {
  it("«Підтвердити email» with a live link: the heading and one button that carries the token", () => {
    show("confirm_email", { kind: "form", token: TOKEN });
    expect(heading()).toBe("Підтвердити email");
    const button = screen.getByRole("button", { name: "Підтвердити email" });
    const form = button.closest("form");
    expect(new FormData(form ?? undefined).get("token")).toBe(TOKEN);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("«Це не я» with a live link: the heading, his sentence and one button", () => {
    show("not_me", { kind: "form", token: TOKEN });
    expect(heading()).toBe("Це не я");
    expect(
      screen.getByText(
        "Якщо ви не реєстрували притулок на Opika, натисніть кнопку – я видалю заявку.",
      ),
    ).toBeDefined();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Це не я"]);
  });

  it.each(["confirm_email", "not_me"] as const)(
    "%s, used, expired or unknown: the sentence and a link into the kabinet",
    (purpose) => {
      show(purpose, { kind: "expired" });
      expect(
        screen.getByText("Посилання застаріло. Увійдіть у кабінет і надішліть лист ще раз."),
      ).toBeDefined();
      expect(screen.getByRole("link", { name: "Увійти в кабінет" }).getAttribute("href")).toBe(
        "/kabinet",
      );
      expect(screen.queryByRole("button")).toBeNull();
    },
  );

  it("after the confirm POST: announced as done, with the way into the kabinet", async () => {
    const action = show(
      "confirm_email",
      { kind: "form", token: TOKEN },
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

  it("after «Це не я»: the deletion is announced, nothing to press", () => {
    show("not_me", { kind: "withdrawn" });
    expect(heading()).toBe("Це не я");
    expect(screen.getByRole("status").textContent).toBe(
      "Заявку видалено. Якщо це помилка – напишіть мені на hello@opika.org.ua.",
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("«Це не я» once approved: says nothing was deleted, nothing to press", () => {
    show("not_me", { kind: "approved" });
    expect(screen.getByRole("status").textContent).toBe(
      "Притулок уже схвалено, тому заявку не можна видалити за посиланням. Якщо ви не реєстрували цей притулок, напишіть мені на hello@opika.org.ua.",
    );
    expect(screen.queryByRole("button")).toBeNull();
  });
});
