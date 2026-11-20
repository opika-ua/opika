import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeletedNotice } from "../DeletedNotice";
import { countsLine, DeleteShelter, nameConfirms } from "./DeleteShelter";
import { apiError, lostAnswer, registryView, renderWithActions, SHELTER_ID } from "./test-fixtures";

/** «Видалити притулок» (owner, 2026-11-20): the counts, the typed-name gate, the outcomes. */

const view = registryView({ displayName: "Домівка" });
const SHOWN = { animals: 3, published: 2, admins: 2 };

afterEach(() => window.sessionStorage.clear());

const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: "Видалити притулок" }));
  return screen.findByText("3 картки тварин, з них опубліковано 2; 2 адміністратори.");
};
const confirmButton = () => screen.getByRole("button", { name: "Видалити назавжди" });
const nameField = () => screen.getByLabelText("Щоб підтвердити, введіть назву притулку");

describe("the counts line", () => {
  it("takes the owner's form for each count", () => {
    expect(countsLine({ animals: 1, published: 1, admins: 1 })).toBe(
      "1 картка тварин, з них опубліковано 1; 1 адміністратор.",
    );
    expect(countsLine({ animals: 5, published: 0, admins: 5 })).toBe(
      "5 карток тварин, з них опубліковано 0; 5 адміністраторів.",
    );
    expect(countsLine({ animals: 22, published: 21, admins: 0 })).toBe(
      "22 картки тварин, з них опубліковано 21; 0 адміністраторів.",
    );
    expect(countsLine({ animals: 21, published: 11, admins: 2 })).toBe(
      "21 картка тварин, з них опубліковано 11; 2 адміністратори.",
    );
  });
});

describe("the name gate", () => {
  it("trims the input only, then matches exactly", () => {
    expect(nameConfirms("  Домівка ", "Домівка")).toBe(true);
    expect(nameConfirms("домівка", "Домівка")).toBe(false);
    expect(nameConfirms("Домівка", " Домівка")).toBe(false);
    expect(nameConfirms("", "Домівка")).toBe(false);
  });
});

describe("«Видалити притулок»", () => {
  it("reads the live counts on open, shows them above the body, and keeps the confirm disabled until the name matches", async () => {
    const deletionCounts = vi.fn(async (_input: unknown) => SHOWN);
    const remove = vi.fn(async (_input: unknown) => ({ kind: "deleted", name: "Домівка" }));
    renderWithActions(<DeleteShelter />, {
      view,
      client: { shelters: { deletionCounts, delete: remove } },
    });
    const user = userEvent.setup();
    const counts = await open(user);
    expect(deletionCounts).toHaveBeenCalledExactlyOnceWith({ shelterId: SHELTER_ID });
    const body = screen.getByText(/^Буде видалено притулок «Домівка»/);
    expect(counts.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(confirmButton().getAttribute("aria-disabled")).toBe("true");
    await user.click(confirmButton());
    await user.type(nameField(), "домівка");
    expect(confirmButton().getAttribute("aria-disabled")).toBe("true");
    await user.click(confirmButton());
    expect(remove).not.toHaveBeenCalled();

    await user.clear(nameField());
    await user.type(nameField(), " Домівка ");
    expect(confirmButton().getAttribute("aria-disabled")).toBeNull();
  });

  it("sends the id, the typed name and the counts shown; done lands on the list with the line", async () => {
    const remove = vi.fn(async (_input: unknown) => ({ kind: "deleted", name: "Домівка" }));
    const { navigate } = renderWithActions(<DeleteShelter />, {
      view,
      client: { shelters: { deletionCounts: vi.fn(async () => SHOWN), delete: remove } },
    });
    const user = userEvent.setup();
    await open(user);
    await user.type(nameField(), "Домівка");
    await user.click(confirmButton());
    expect(remove).toHaveBeenCalledExactlyOnceWith({
      shelterId: SHELTER_ID,
      typedName: "Домівка",
      counts: SHOWN,
    });
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/kabinet/prytulky");

    const list = render(<DeletedNotice />);
    expect((await list.findByText("Притулок «Домівка» видалено.")).getAttribute("role")).toBe(
      "status",
    );
    // Once: a reload says nothing.
    expect(window.sessionStorage.length).toBe(0);
  });

  it("shows the fresh counts after the page is read again when they changed, and sends those next", async () => {
    const fresh = { animals: 4, published: 2, admins: 2 };
    const remove = vi
      .fn()
      .mockResolvedValueOnce({ kind: "counts_changed", counts: fresh })
      .mockResolvedValueOnce({ kind: "deleted", name: "Домівка" });
    const { reread, navigate } = renderWithActions(<DeleteShelter />, {
      view,
      client: { shelters: { deletionCounts: vi.fn(async () => SHOWN), delete: remove } },
    });
    const user = userEvent.setup();
    await open(user);
    await user.type(nameField(), "Домівка");
    await user.click(confirmButton());

    expect(
      await screen.findByText("4 картки тварин, з них опубліковано 2; 2 адміністратори."),
    ).toBeTruthy();
    expect(
      screen.getByText("Дані змінилися, поки сторінка була відкрита. Сторінку оновлено."),
    ).toBeTruthy();
    expect(reread).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();

    await user.click(confirmButton());
    expect(remove).toHaveBeenLastCalledWith({
      shelterId: SHELTER_ID,
      typedName: "Домівка",
      counts: fresh,
    });
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/kabinet/prytulky");
  });

  it("after a lost answer, a shelter found gone is the deletion landing", async () => {
    const deletionCounts = vi
      .fn()
      .mockResolvedValueOnce(SHOWN)
      .mockRejectedValueOnce(apiError("NOT_FOUND"));
    const { navigate } = renderWithActions(<DeleteShelter />, {
      view,
      client: {
        shelters: {
          deletionCounts,
          delete: vi.fn(async () => {
            throw lostAnswer();
          }),
        },
      },
    });
    const user = userEvent.setup();
    await open(user);
    await user.type(nameField(), "Домівка");
    await user.click(confirmButton());
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/kabinet/prytulky");
    expect(window.sessionStorage.getItem("opika.operator.deletedShelter")).toBe("Домівка");
  });

  it("says it failed and stays open when the server refuses for another reason", async () => {
    const { navigate } = renderWithActions(<DeleteShelter />, {
      view,
      client: {
        shelters: {
          deletionCounts: vi.fn(async () => SHOWN),
          delete: vi.fn(async () => {
            throw apiError("INTERNAL_SERVER_ERROR");
          }),
        },
      },
    });
    const user = userEvent.setup();
    await open(user);
    await user.type(nameField(), "Домівка");
    await user.click(confirmButton());
    expect((await screen.findByRole("alert")).textContent).toBe("Не вдалося. Спробуйте ще раз.");
    expect(navigate).not.toHaveBeenCalled();
    expect(nameField()).toBeTruthy();
  });
});
