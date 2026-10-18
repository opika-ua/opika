import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RenameForm, renameInputOf } from "./RenameForm";
import {
  apiError,
  deferred,
  lostAnswer,
  registryView,
  renderWithActions,
  SHELTER_ID,
} from "./test-fixtures";

/**
 * R-UI 4: the operator renames the shelter on S4. Strings transcribed from
 * his catalogue words, never read from it: «Назва притулку» (`create.name`),
 * «Зберегти», «Збереження…», «Збережено.», «Спробувати ще раз» (K4's
 * `profileEdit`), «Це поле потрібне.» (`create.errors.required`) and S4's
 * own «Дані змінилися, поки сторінка була відкрита. Сторінку оновлено.»,
 * «Відповідь не надійшла. Сторінка перевіряє, чи дію виконано.» and «Не
 * вдалося. Спробуйте ще раз.». The server side is `kabinet/registry.test.ts`'s.
 */

const before = registryView({ displayName: "Домівка", version: 3 });
const renamed = registryView({ displayName: "Домівка для хвостатих", version: 4 });

const field = () => screen.getByRole("textbox", { name: "Назва притулку" }) as HTMLInputElement;
const typeName = async (name: string) => {
  await userEvent.clear(field());
  if (name !== "") await userEvent.type(field(), name);
};

describe("renameInputOf", () => {
  it("trims, and leaves nothing for a blank name", () => {
    expect(renameInputOf("  Домівка  ")).toBe("Домівка");
    expect(renameInputOf(" \t ")).toBeNull();
    expect(renameInputOf("")).toBeNull();
  });
});

describe("the rename form on S4", () => {
  it("shows the current name, and offers no button until the name differs", async () => {
    renderWithActions(<RenameForm />, { view: before });
    expect(field().value).toBe("Домівка");
    expect(screen.queryByRole("button", { name: "Зберегти" })).toBeNull();
    // Spaces around the same name are still the same name.
    await userEvent.type(field(), "  ");
    expect(screen.queryByRole("button", { name: "Зберегти" })).toBeNull();
  });

  it("sends the trimmed name with the version read, then says «Збережено.» and shows the new name", async () => {
    const updateProfile = vi.fn(async () => renamed);
    const { reread } = renderWithActions(<RenameForm />, {
      view: before,
      client: { shelters: { updateProfile } },
      reread: async () => renamed,
    });
    await typeName("  Домівка для хвостатих ");
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(updateProfile).toHaveBeenCalledExactlyOnceWith({
      shelterId: SHELTER_ID,
      expectedVersion: 3,
      displayName: "Домівка для хвостатих",
    });
    expect(screen.getByRole("status").textContent).toBe("Збережено.");
    expect(reread).toHaveBeenCalledOnce();
    expect(field().value).toBe("Домівка для хвостатих");
    expect(screen.queryByRole("button", { name: "Зберегти" })).toBeNull();
  });

  /** Review of #127, finding 2: the pressed button unmounts, so the keyboard focus returns to the field. */
  it("after a save from the keyboard, the focus is back on the name field, not on the page", async () => {
    const updateProfile = vi.fn(async () => renamed);
    renderWithActions(<RenameForm />, {
      view: before,
      client: { shelters: { updateProfile } },
      reread: async () => renamed,
    });
    await typeName("Домівка для хвостатих");
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Зберегти" }));
    await userEvent.keyboard(" ");
    expect(screen.getByRole("status").textContent).toBe("Збережено.");
    expect(document.activeElement).toBe(field());
  });

  it("Enter in the field submits like the button", async () => {
    const updateProfile = vi.fn(async () => renamed);
    renderWithActions(<RenameForm />, {
      view: before,
      client: { shelters: { updateProfile } },
      reread: async () => renamed,
    });
    await typeName("Домівка для хвостатих{Enter}");
    expect(updateProfile).toHaveBeenCalledOnce();
    expect(screen.getByRole("status").textContent).toBe("Збережено.");
  });

  it("Enter on the unchanged name sends nothing and claims nothing", async () => {
    const updateProfile = vi.fn(async () => before);
    renderWithActions(<RenameForm />, { view: before, client: { shelters: { updateProfile } } });
    await userEvent.type(field(), " {Enter}");
    expect(updateProfile).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("a blank name is refused in the field with create's message, and nothing is sent", async () => {
    const updateProfile = vi.fn(async () => renamed);
    renderWithActions(<RenameForm />, { view: before, client: { shelters: { updateProfile } } });
    await typeName("   ");
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(updateProfile).not.toHaveBeenCalled();
    expect(field().getAttribute("aria-invalid")).toBe("true");
    // The message is the field's description, so a screen reader hears it on the field.
    const describedBy = field().getAttribute("aria-describedby")?.split(" ") ?? [];
    expect(describedBy.map((ref) => document.getElementById(ref)?.textContent)).toEqual([
      "Це поле потрібне.",
    ]);
    // Typing again clears the message.
    await userEvent.type(field(), "Д");
    expect(field().getAttribute("aria-invalid")).toBeNull();
  });

  it("CONFLICT: re-reads, says the page was updated, shows the name as it is now, and the next save sends the new version", async () => {
    // Someone else renamed it meanwhile.
    const elsewhere = registryView({ displayName: "Домівка (Бровари)", version: 4 });
    const afterSecond = registryView({ displayName: "Домівка для хвостатих", version: 5 });
    const updateProfile = vi
      .fn()
      .mockImplementationOnce(async () => {
        throw apiError("CONFLICT");
      })
      .mockImplementationOnce(async () => afterSecond);
    const reads = [elsewhere, afterSecond];
    const { reread } = renderWithActions(<RenameForm />, {
      view: before,
      client: { shelters: { updateProfile } },
      reread: async () => reads.shift() ?? null,
    });
    await typeName("Домівка для хвостатих");
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(reread).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert").textContent).toBe(
      "Дані змінилися, поки сторінка була відкрита. Сторінку оновлено.",
    );
    expect(field().value).toBe("Домівка (Бровари)");
    expect(screen.queryByRole("button", { name: "Зберегти" })).toBeNull();

    await typeName("Домівка для хвостатих");
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(updateProfile).toHaveBeenLastCalledWith({
      shelterId: SHELTER_ID,
      expectedVersion: 4,
      displayName: "Домівка для хвостатих",
    });
    expect(screen.getByRole("status").textContent).toBe("Збережено.");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("CONFLICT with a re-read that fails: never claims the page was updated, keeps what was typed", async () => {
    renderWithActions(<RenameForm />, {
      view: before,
      client: {
        shelters: {
          updateProfile: vi.fn(async () => {
            throw apiError("CONFLICT");
          }),
        },
      },
      reread: async () => null,
    });
    await typeName("Домівка для хвостатих");
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(screen.getByRole("alert").textContent).toContain("Не вдалося. Спробуйте ще раз.");
    expect(screen.queryByText(/Сторінку оновлено/)).toBeNull();
    expect(field().value).toBe("Домівка для хвостатих");
  });

  it("a lost answer the re-read shows done: «Збережено.»", async () => {
    renderWithActions(<RenameForm />, {
      view: before,
      client: {
        shelters: {
          updateProfile: vi.fn(async () => {
            throw lostAnswer();
          }),
        },
      },
      reread: async () => renamed,
    });
    await typeName("Домівка для хвостатих");
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(screen.getByRole("status").textContent).toBe("Збережено.");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a lost answer the re-read shows not done: the failure, and «Спробувати ще раз» sends it again", async () => {
    const updateProfile = vi
      .fn()
      .mockImplementationOnce(async () => {
        throw lostAnswer();
      })
      .mockImplementationOnce(async () => renamed);
    const reads = [before, renamed];
    renderWithActions(<RenameForm />, {
      view: before,
      client: { shelters: { updateProfile } },
      reread: async () => reads.shift() ?? null,
    });
    await typeName("Домівка для хвостатих");
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(screen.getByRole("alert").textContent).toContain("Не вдалося. Спробуйте ще раз.");
    expect(field().value).toBe("Домівка для хвостатих");
    await userEvent.click(screen.getByRole("button", { name: "Спробувати ще раз" }));
    expect(updateProfile).toHaveBeenCalledTimes(2);
    expect(updateProfile).toHaveBeenLastCalledWith({
      shelterId: SHELTER_ID,
      expectedVersion: 3,
      displayName: "Домівка для хвостатих",
    });
    expect(screen.getByRole("status").textContent).toBe("Збережено.");
  });

  it("while checking a lost answer, it says so before anything else", async () => {
    const read = deferred<typeof renamed | null>();
    renderWithActions(<RenameForm />, {
      view: before,
      client: {
        shelters: {
          updateProfile: vi.fn(async () => {
            throw lostAnswer();
          }),
        },
      },
      reread: () => read.promise,
    });
    await typeName("Домівка для хвостатих");
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(screen.getByRole("status").textContent).toBe(
      "Відповідь не надійшла. Сторінка перевіряє, чи дію виконано.",
    );
    read.resolve(renamed);
    expect(await screen.findByText("Збережено.")).toBeTruthy();
  });

  it("one request at a time: while it is in flight the button says «Збереження…» and a second press sends nothing", async () => {
    const answer = deferred<typeof renamed>();
    const updateProfile = vi.fn(() => answer.promise);
    renderWithActions(<RenameForm />, {
      view: before,
      client: { shelters: { updateProfile } },
      reread: async () => renamed,
    });
    await typeName("Домівка для хвостатих");
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    const busy = screen.getByRole("button", { name: "Збереження…" });
    expect(busy.getAttribute("aria-busy")).toBe("true");
    await userEvent.click(busy);
    expect(updateProfile).toHaveBeenCalledOnce();
    answer.resolve(renamed);
    expect(await screen.findByText("Збережено.")).toBeTruthy();
  });
});
