import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  apiError,
  FIXTURE_ADDRESS,
  FIXTURE_LEGAL_ENTITY,
  registryView,
  renderWithActions,
  SHELTER_ID,
} from "./test-fixtures";
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
  legalEntity: { ...FIXTURE_LEGAL_ENTITY, edrpou: "12345678" as never } as never,
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
      change: { field: "legal_entity", next: { ...FIXTURE_LEGAL_ENTITY, edrpou: "12345678" } },
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
      exactAddress: { ...FIXTURE_ADDRESS, district: { uk: "Центральний", en: null } },
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

describe("adding verified data a minimal create left out", () => {
  const empty = registryView({ version: 3, legalEntity: null, exactAddress: null });

  it("offers «Додати» on an empty legal block and sends the picked form from nothing", async () => {
    const updateVerifiedData = vi.fn(async () => after);
    renderWithActions(<LegalEdit now={NOW} />, {
      view: empty,
      client: { shelters: { updateVerifiedData } },
    });
    expect(screen.queryByRole("button", { name: "Змінити" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Додати" }));
    await userEvent.click(screen.getByRole("radio", { name: "Ініціатива без реєстрації" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Контактна особа" }), "Олена Коваль");
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(updateVerifiedData).toHaveBeenCalledWith({
      shelterId: SHELTER_ID,
      expectedVersion: 3,
      change: {
        field: "legal_entity",
        next: { kind: "unregistered_initiative", contactPersonName: "Олена Коваль" },
      },
    });
  });

  it("starts an empty address in the shelter's city and sends a street without a point", async () => {
    const updateVerifiedData = vi.fn(async () => empty);
    renderWithActions(<AddressEdit cityName="Бровари" cities={{ search: vi.fn() }} />, {
      view: empty,
      client: { shelters: { updateVerifiedData } },
    });
    await userEvent.click(screen.getByRole("button", { name: "Додати" }));
    await userEvent.type(screen.getByRole("textbox", { name: /Вулиця, будинок/ }), "вул. Нова, 1");
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(updateVerifiedData).toHaveBeenCalledWith({
      shelterId: SHELTER_ID,
      expectedVersion: 3,
      change: {
        field: "exact_address",
        next: {
          line1: "вул. Нова, 1",
          line2: null,
          postalCode: null,
          cityId: empty.publicLocation.cityId,
          district: null,
          coordinates: null,
        },
      },
    });
  });
});
