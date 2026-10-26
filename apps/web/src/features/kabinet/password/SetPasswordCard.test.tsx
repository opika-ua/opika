import { ORPCError } from "@orpc/client";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { type SetPasswordOutcome, setPasswordOutcomeOf } from "./invitation-client";
import { SetPasswordCard } from "./SetPasswordCard";

/**
 * The invitation link's «Створіть пароль» (PW-2), driven the way a person does: found by role,
 * label and text. Each sentence asserted is his, transcribed from
 * `docs/shelter-passwords-copy-uk.md` (§B) and his scope item 2, never read from the catalogue.
 */

const field = (label: string) => screen.getByLabelText(label, { selector: "input" });
const TOKEN = "A".repeat(43);

function renderWith(outcome: SetPasswordOutcome) {
  const accept = vi.fn(async (_token: string, _password: string) => outcome);
  const go = vi.fn((_path: string) => {});
  render(
    <SetPasswordCard
      token={TOKEN}
      shelterName="Притулок «Ліс»"
      maskedEmail="o•••@example.org"
      accept={accept}
      go={go}
    />,
  );
  return { user: userEvent.setup(), accept, go };
}

async function submit(
  user: ReturnType<typeof userEvent.setup>,
  password: string,
  repeat = password,
) {
  await user.type(field("Пароль"), password);
  await user.type(field("Повторіть пароль"), repeat);
  await user.click(screen.getByRole("button", { name: "Зберегти й увійти" }));
}

describe("«Створіть пароль»", () => {
  it("names the shelter and the masked address, with password, repeat and show/hide", () => {
    renderWith({ kind: "signed_in" });
    expect(screen.getByRole("heading", { level: 1, name: "Створіть пароль" })).toBeDefined();
    expect(
      screen.getByText(
        "Пароль для кабінету притулку «Притулок «Ліс»». Адреса для входу: o•••@example.org.",
      ),
    ).toBeDefined();
    expect(field("Пароль").getAttribute("type")).toBe("password");
    expect(field("Повторіть пароль").getAttribute("type")).toBe("password");
    expect(screen.getAllByRole("button", { name: "Показати пароль" })).toHaveLength(2);
    expect(screen.getByText("Символів: 0 з 10")).toBeDefined();
  });

  /** His PW-2 Q3: the address-bar removal extends to `?zaproshennia=`. */
  it("takes the token out of the address bar on load, and the form still sends it", async () => {
    window.history.replaceState(null, "", `/kabinet/vkhid?zaproshennia=${TOKEN}`);
    const { user, accept } = renderWith({ kind: "signed_in" });
    expect(window.location.pathname).toBe("/kabinet/vkhid");
    expect(window.location.search).toBe("");
    await submit(user, "ялинка-під-вікном");
    expect(accept).toHaveBeenCalledWith(TOKEN, "ялинка-під-вікном");
  });

  it("signed in: goes to the kabinet", async () => {
    const { user, go } = renderWith({ kind: "signed_in" });
    await submit(user, "ялинка-під-вікном");
    expect(go).toHaveBeenCalledWith("/kabinet");
  });

  it("set but not signed in: goes to the sign-in page, where the new password works", async () => {
    const { user, go } = renderWith({ kind: "password_set" });
    await submit(user, "ялинка-під-вікном");
    expect(go).toHaveBeenCalledWith("/kabinet/vkhid");
  });

  it("the two fields differ: his mismatch sentence, and nothing is sent", async () => {
    const { user, accept } = renderWith({ kind: "signed_in" });
    await submit(user, "ялинка-під-вікном", "ялинка-під-вікном!");
    expect(screen.getByText("Паролі не збігаються.")).toBeDefined();
    expect(accept).not.toHaveBeenCalled();
  });

  it("a refused password: his sentence for the reason, on the field", async () => {
    const { user } = renderWith({ kind: "refused", refusal: "contains_personal" });
    await submit(user, "olena-ліс-2026-рік");
    expect(
      screen.getByText(
        "Пароль не може містити вашу адресу пошти (навіть частину до @), назву притулку чи назву сайту.",
      ),
    ).toBeDefined();
  });

  it("a link that turns out unusable: the same page the link's GET shows, its heading focused", async () => {
    const { user } = renderWith({ kind: "unusable" });
    await submit(user, "ялинка-під-вікном");
    const heading = screen.getByRole("heading", {
      level: 1,
      name: "Цим запрошенням не можна скористатися",
    });
    expect(document.activeElement).toBe(heading);
    expect(
      screen.getByText(
        "Посилання вже не діє. Якщо пароль уже створено – увійдіть. Якщо ні – напишіть мені, і я надішлю нове запрошення.",
      ),
    ).toBeDefined();
    expect(screen.getByRole("link", { name: "Перейти до входу" }).getAttribute("href")).toBe(
      "/kabinet/vkhid",
    );
    expect(screen.queryByLabelText("Пароль", { selector: "input" })).toBeNull();
  });

  it("too many attempts, and a failed connection: the catalogue's existing sentences", async () => {
    const throttled = renderWith({ kind: "throttled" });
    await submit(throttled.user, "ялинка-під-вікном");
    expect(screen.getByRole("alert").textContent).toBe(
      "Забагато запитів. Спробуйте ще раз пізніше.",
    );
  });

  it("no answer at all: «Не вдалося звʼязатися із сайтом…» (G4, audit 2026-10-22)", async () => {
    const { user } = renderWith({ kind: "no_answer" });
    await submit(user, "ялинка-під-вікном");
    expect(screen.getByRole("alert").textContent).toBe(
      "Не вдалося звʼязатися із сайтом. Перевірте зʼєднання і спробуйте ще раз.",
    );
  });

  it("a failed connection", async () => {
    const { user } = renderWith({ kind: "failed" });
    await submit(user, "ялинка-під-вікном");
    expect(screen.getByRole("alert").textContent).toBe(
      "Не вдалося. Перевірте зʼєднання і спробуйте ще раз.",
    );
  });
});

describe("setPasswordOutcomeOf: the POST's answer, read by code and data only", () => {
  it.each([
    [{ kind: "signed_in" }, false, { kind: "signed_in" }],
    [{ kind: "password_set" }, false, { kind: "password_set" }],
    [{ kind: "something" }, false, { kind: "failed" }],
    [new ORPCError("INVITE_UNUSABLE", { status: 410 }), true, { kind: "unusable" }],
    [new ORPCError("RATE_LIMITED", { status: 429 }), true, { kind: "throttled" }],
    [
      new ORPCError("PASSWORD_REJECTED", { status: 422, data: { reason: "common" } }),
      true,
      { kind: "refused", refusal: "common" },
    ],
    [
      new ORPCError("PASSWORD_REJECTED", { status: 422, data: { reason: "toString" } }),
      true,
      { kind: "failed" },
    ],
    [new ORPCError("FORBIDDEN", { status: 403 }), true, { kind: "failed" }],
    // A fetch that never reached the site throws a TypeError: G4's no-answer outcome.
    [new TypeError("Failed to fetch"), true, { kind: "no_answer" }],
    [new Error("boom"), true, { kind: "failed" }],
  ] as const)("%o → %o", (answer, failed, outcome) => {
    expect(setPasswordOutcomeOf(answer, failed)).toEqual(outcome);
  });
});
