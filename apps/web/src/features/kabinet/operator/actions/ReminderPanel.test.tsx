import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReminderPanel } from "./ReminderPanel";
import { apiError, lostAnswer, registryView, renderWithActions, SHELTER_ID } from "./test-fixtures";

/** The operator's switch for the weekly «непідтверджені картки» email. */

const OFF_AT = new Date("2026-11-05T09:00:00Z");
const on = registryView({ freshnessReminderOffAt: null, version: 4 });
const off = registryView({ freshnessReminderOffAt: OFF_AT, version: 5 });

describe("«Лист про непідтверджені картки»", () => {
  it("says the mail is on, with its 14 days, and offers to turn it off", () => {
    renderWithActions(<ReminderPanel />, { view: on });
    const region = within(screen.getByRole("region", { name: "Лист про непідтверджені картки" }));
    expect(
      region.getByText(
        "Щопонеділка адміністратори притулку отримують лист про картки, яких не підтверджували щонайменше 14 днів.",
      ),
    ).toBeTruthy();
    expect(region.getByRole("button", { name: "Вимкнути лист" })).toBeTruthy();
    expect(region.queryByRole("button", { name: "Увімкнути лист" })).toBeNull();
  });

  it("says the mail is off since when, and offers to turn it on", () => {
    renderWithActions(<ReminderPanel />, { view: off });
    expect(screen.getByText(/Лист вимкнено 5 листопада 2026 р/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Увімкнути лист" })).toBeTruthy();
  });

  it("turning it off sends the version the page read and shows the answered record", async () => {
    const updateProfile = vi.fn(async (_input: unknown) => off);
    renderWithActions(<ReminderPanel />, {
      view: on,
      client: { shelters: { updateProfile } },
      reread: async () => off,
    });
    await userEvent.setup().click(screen.getByRole("button", { name: "Вимкнути лист" }));
    expect(updateProfile).toHaveBeenCalledExactlyOnceWith({
      shelterId: SHELTER_ID,
      expectedVersion: 4,
      weeklyReminder: "off",
    });
    expect(await screen.findByRole("button", { name: "Увімкнути лист" })).toBeTruthy();
  });

  it("turning it on sends «on»", async () => {
    const updateProfile = vi.fn(async (_input: unknown) => on);
    renderWithActions(<ReminderPanel />, {
      view: off,
      client: { shelters: { updateProfile } },
    });
    await userEvent.setup().click(screen.getByRole("button", { name: "Увімкнути лист" }));
    expect(updateProfile).toHaveBeenCalledExactlyOnceWith({
      shelterId: SHELTER_ID,
      expectedVersion: 5,
      weeklyReminder: "on",
    });
  });

  it("CONFLICT: re-reads and says the page was updated", async () => {
    const { reread } = renderWithActions(<ReminderPanel />, {
      view: on,
      client: {
        shelters: {
          updateProfile: vi.fn(async () => {
            throw apiError("CONFLICT");
          }),
        },
      },
      reread: async () => off,
    });
    await userEvent.setup().click(screen.getByRole("button", { name: "Вимкнути лист" }));
    expect(reread).toHaveBeenCalledOnce();
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Дані змінилися, поки сторінка була відкрита. Сторінку оновлено.",
    );
  });

  it("a lost answer the re-read shows landed is no failure; one that did not land is", async () => {
    const landed = renderWithActions(<ReminderPanel />, {
      view: on,
      client: {
        shelters: {
          updateProfile: vi.fn(async () => {
            throw lostAnswer();
          }),
        },
      },
      reread: async () => off,
    });
    await userEvent.setup().click(screen.getByRole("button", { name: "Вимкнути лист" }));
    await screen.findByRole("button", { name: "Увімкнути лист" });
    expect(screen.queryByRole("alert")).toBeNull();
    landed.unmount();
    renderWithActions(<ReminderPanel />, {
      view: on,
      client: {
        shelters: {
          updateProfile: vi.fn(async () => {
            throw lostAnswer();
          }),
        },
      },
      reread: async () => on,
    });
    await userEvent.setup().click(screen.getByRole("button", { name: "Вимкнути лист" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Не вдалося. Спробуйте ще раз.");
  });
});
