import { SHELTER_DESCRIPTION_TOO_LONG_MESSAGE } from "@opika/domain";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AboutForm } from "./AboutForm";
import { apiError, lostAnswer, registryView, renderWithActions, SHELTER_ID } from "./test-fixtures";

/**
 * The operator edits the shelter's text on S4 («Про притулок»), through the same runner as the
 * rename. The strings are the owner's, transcribed: «Про притулок», «Змінити», «Додати»,
 * «Зберегти», «Скасувати» (`create.cancel`), «Збережено.», and the cap's «Текст довший за 1 500
 * символів. Скоротіть його, щоб зберегти.» The server side is `kabinet/registry.test.ts`'s.
 */

const before = registryView({ description: { uk: "Невеликий притулок.", en: null }, version: 3 });
const after = (uk: string) => registryView({ description: { uk, en: null }, version: 4 });

const TOO_LONG = "Текст довший за 1 500 символів. Скоротіть його, щоб зберегти.";
const field = () => screen.getByRole("textbox", { name: "Про притулок" }) as HTMLTextAreaElement;
const open = (name = "Змінити") => userEvent.click(screen.getByRole("button", { name }));
const save = () => userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
const paste = async (text: string) => {
  await userEvent.clear(field());
  await userEvent.click(field());
  await userEvent.paste(text);
};

describe("the about form on S4", () => {
  it("offers «Змінити» for a text, «Додати» for none, and shows no field until opened", () => {
    renderWithActions(<AboutForm />, { view: before });
    expect(screen.getByRole("button", { name: "Змінити" })).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("«Додати» when the shelter has no text", () => {
    renderWithActions(<AboutForm />, { view: registryView({ description: null }) });
    expect(screen.getByRole("button", { name: "Додати" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Змінити" })).toBeNull();
  });

  it("opens on the stored text with the hint and the counter, focus in the field", async () => {
    renderWithActions(<AboutForm />, { view: before });
    await open();
    expect(field().value).toBe("Невеликий притулок.");
    expect(document.activeElement).toBe(field());
    expect(
      screen.getByText(
        "Цей текст показується на сторінці притулку. Не пишіть тут нічого приватного.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("19 з 1 500 символів")).toBeTruthy();
  });

  it("sends the trimmed text with the version read, keeps the English, says «Збережено.» and closes", async () => {
    const stored = { text: "A small shelter.", provenance: "human" as const };
    const updateProfile = vi.fn(async () => after("Волонтери з Броварів."));
    const { reread } = renderWithActions(<AboutForm />, {
      view: registryView({ description: { uk: "Невеликий притулок.", en: stored }, version: 3 }),
      client: { shelters: { updateProfile } },
      reread: async () => after("Волонтери з Броварів."),
    });
    await open();
    await paste("  Волонтери з Броварів.  ");
    await save();
    expect(updateProfile).toHaveBeenCalledExactlyOnceWith({
      shelterId: SHELTER_ID,
      expectedVersion: 3,
      description: { uk: "Волонтери з Броварів.", en: stored },
    });
    expect(screen.getByRole("status").textContent).toBe("Збережено.");
    expect(reread).toHaveBeenCalledOnce();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Змінити" }));
  });

  it("a blank text clears it: null is sent", async () => {
    const updateProfile = vi.fn(async () => registryView({ description: null, version: 4 }));
    renderWithActions(<AboutForm />, {
      view: before,
      client: { shelters: { updateProfile } },
      reread: async () => registryView({ description: null, version: 4 }),
    });
    await open();
    await paste("   ");
    await save();
    expect(updateProfile).toHaveBeenCalledExactlyOnceWith({
      shelterId: SHELTER_ID,
      expectedVersion: 3,
      description: null,
    });
    expect(screen.getByRole("status").textContent).toBe("Збережено.");
    expect(screen.getByRole("button", { name: "Додати" })).toBeTruthy();
  });

  it("the same text again sends nothing and claims nothing", async () => {
    const updateProfile = vi.fn(async () => before);
    renderWithActions(<AboutForm />, { view: before, client: { shelters: { updateProfile } } });
    await open();
    await userEvent.type(field(), "  ");
    await save();
    expect(updateProfile).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("«Скасувати» closes without sending", async () => {
    const updateProfile = vi.fn(async () => before);
    renderWithActions(<AboutForm />, { view: before, client: { shelters: { updateProfile } } });
    await open();
    await userEvent.type(field(), " Ще.");
    await userEvent.click(screen.getByRole("button", { name: "Скасувати" }));
    expect(updateProfile).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("1,500 characters go; 1,501 are refused in the field before anything is sent", async () => {
    const updateProfile = vi.fn(async () => after("а".repeat(1500)));
    renderWithActions(<AboutForm />, {
      view: before,
      client: { shelters: { updateProfile } },
      reread: async () => after("а".repeat(1500)),
    });
    await open();
    await paste("а".repeat(1501));
    expect(screen.getByText(TOO_LONG)).toBeTruthy();
    expect(screen.getByText("Зайвих символів: 1")).toBeTruthy();
    await save();
    expect(updateProfile).not.toHaveBeenCalled();
    expect(field().getAttribute("aria-invalid")).toBe("true");
    await paste("а".repeat(1500));
    expect(screen.queryByText(TOO_LONG)).toBeNull();
    await save();
    expect(updateProfile).toHaveBeenCalledOnce();
  });

  it("a stored text over the cap opens with the message and the over counter at once", async () => {
    renderWithActions(<AboutForm />, {
      view: registryView({ description: { uk: "а".repeat(1530), en: null } }),
    });
    await open();
    expect(screen.getByText(TOO_LONG)).toBeTruthy();
    expect(screen.getByText("Зайвих символів: 30")).toBeTruthy();
    expect(field().value).toHaveLength(1530);
  });

  it("a server refusal with the cap's fixed message puts the same message on the field", async () => {
    renderWithActions(<AboutForm />, {
      view: before,
      client: {
        shelters: {
          updateProfile: vi.fn(async () => {
            throw apiError("BAD_REQUEST", {
              issues: [
                { path: ["description", "uk"], message: SHELTER_DESCRIPTION_TOO_LONG_MESSAGE },
              ],
            });
          }),
        },
      },
    });
    await open();
    await paste("Коротка.");
    await save();
    expect(screen.getByText(TOO_LONG)).toBeTruthy();
    expect(screen.queryByText("Не вдалося. Спробуйте ще раз.")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Про притулок" })).toBeTruthy();
  });

  it("any other refusal is the plain failure, and the form stays open with what was typed", async () => {
    renderWithActions(<AboutForm />, {
      view: before,
      client: {
        shelters: {
          updateProfile: vi.fn(async () => {
            throw apiError("INTERNAL_SERVER_ERROR");
          }),
        },
      },
    });
    await open();
    await paste("Коротка.");
    await save();
    expect(screen.getByRole("alert").textContent).toBe("Не вдалося. Спробуйте ще раз.");
    expect(field().value).toBe("Коротка.");
  });

  it("CONFLICT: re-reads, says the page was updated, and closes so nothing stale is resent", async () => {
    const { reread } = renderWithActions(<AboutForm />, {
      view: before,
      client: {
        shelters: {
          updateProfile: vi.fn(async () => {
            throw apiError("CONFLICT");
          }),
        },
      },
      reread: async () => after("Хтось змінив текст."),
    });
    await open();
    await paste("Коротка.");
    await save();
    expect(reread).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert").textContent).toBe(
      "Дані змінилися, поки сторінка була відкрита. Сторінку оновлено.",
    );
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("a lost answer the re-read shows done: «Збережено.»", async () => {
    renderWithActions(<AboutForm />, {
      view: before,
      client: {
        shelters: {
          updateProfile: vi.fn(async () => {
            throw lostAnswer();
          }),
        },
      },
      reread: async () => after("Коротка."),
    });
    await open();
    await paste("Коротка.");
    await save();
    expect(screen.getByRole("status").textContent).toBe("Збережено.");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a lost answer the re-read shows not done: the failure, the form kept for another try", async () => {
    renderWithActions(<AboutForm />, {
      view: before,
      client: {
        shelters: {
          updateProfile: vi.fn(async () => {
            throw lostAnswer();
          }),
        },
      },
      reread: async () => before,
    });
    await open();
    await paste("Коротка.");
    await save();
    expect(screen.getByRole("alert").textContent).toBe("Не вдалося. Спробуйте ще раз.");
    expect(field().value).toBe("Коротка.");
  });
});
