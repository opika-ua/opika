import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { apiError, registryView, renderWithActions, SHELTER_ID } from "./test-fixtures";
import { AddressEdit, LegalEdit } from "./VerifiedDataEditor";

/**
 * «Змінити» on S4's «Юридичні дані» and «Адреса приміщення». Strings transcribed: «Змінити»
 * (owner, 2026-11-10), «Зберегти», «Збережено.», «Код ЄДРПОУ», «Код ЄДРПОУ – 8 цифр.» and S4's
 * «Дані змінилися, поки сторінка була відкрита. Сторінку оновлено.». Server side:
 * `kabinet/registry.test.ts`.
 */

const before = registryView({ version: 3 });
const after = registryView({
  version: 4,
  legalEntity: { ...before.legalEntity, edrpou: "12345678" as never } as never,
});
const NOW = () => new Date("2026-11-10T10:00:00Z");

const changeEdrpou = async (value: string) => {
  await userEvent.click(screen.getByRole("button", { name: "Змінити" }));
  const field = screen.getByRole("textbox", { name: "Код ЄДРПОУ" }) as HTMLInputElement;
  expect(field.value).toBe("43218765");
  await userEvent.clear(field);
  await userEvent.type(field, value);
  await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
};

describe("LegalEdit", () => {
  it("sends the changed legal entity with the version read, then says it is saved", async () => {
    const updateVerifiedData = vi.fn(async () => after);
    renderWithActions(<LegalEdit now={NOW} />, {
      view: before,
      client: { shelters: { updateVerifiedData } },
      reread: async () => after,
    });
    await changeEdrpou("12345678");
    expect(updateVerifiedData).toHaveBeenCalledWith({
      shelterId: SHELTER_ID,
      expectedVersion: 3,
      change: { field: "legal_entity", next: { ...before.legalEntity, edrpou: "12345678" } },
    });
    expect(await screen.findByText("Збережено.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Зберегти" })).toBeNull();
  });

  it("refuses a malformed ЄДРПОУ on the field, sending nothing", async () => {
    const updateVerifiedData = vi.fn(async () => after);
    renderWithActions(<LegalEdit now={NOW} />, {
      view: before,
      client: { shelters: { updateVerifiedData } },
    });
    await changeEdrpou("123");
    expect(screen.getByText("Код ЄДРПОУ – 8 цифр.")).toBeTruthy();
    expect(updateVerifiedData).not.toHaveBeenCalled();
  });

  it("CONFLICT: re-reads the page, closes the form and says so", async () => {
    const updateVerifiedData = vi.fn(async () => {
      throw apiError("CONFLICT");
    });
    const { reread } = renderWithActions(<LegalEdit now={NOW} />, {
      view: before,
      client: { shelters: { updateVerifiedData } },
      reread: async () => after,
    });
    await changeEdrpou("12345678");
    expect(
      await screen.findByText("Дані змінилися, поки сторінка була відкрита. Сторінку оновлено."),
    ).toBeTruthy();
    expect(reread).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Зберегти" })).toBeNull();
  });
});

describe("AddressEdit", () => {
  it("sends the changed address, keeping the stored district", async () => {
    const view = registryView({
      version: 3,
      exactAddress: { ...before.exactAddress, district: "Центральний" },
    });
    const updateVerifiedData = vi.fn(async () => view);
    renderWithActions(<AddressEdit cityName="Бровари" cities={{ search: vi.fn() }} />, {
      view,
      client: { shelters: { updateVerifiedData } },
    });
    await userEvent.click(screen.getByRole("button", { name: "Змінити" }));
    const line1 = screen.getByRole("textbox", { name: /Вулиця, будинок/ });
    await userEvent.clear(line1);
    await userEvent.type(line1, "вул. Нова, 1");
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(updateVerifiedData).toHaveBeenCalledWith({
      shelterId: SHELTER_ID,
      expectedVersion: 3,
      change: {
        field: "exact_address",
        next: { ...view.exactAddress, line1: "вул. Нова, 1" },
      },
    });
  });
});
