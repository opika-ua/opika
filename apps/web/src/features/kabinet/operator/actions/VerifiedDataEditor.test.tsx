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
import { LegalEdit, PremisesEdit } from "./VerifiedDataEditor";

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

describe("PremisesEdit", () => {
  it("sends the changed address, keeping the stored district and never a point (P0-6)", async () => {
    const view = registryView({
      version: 3,
      premises: {
        kind: "address",
        address: { ...FIXTURE_ADDRESS, district: { uk: "Центральний", en: null } },
      },
    });
    const updateVerifiedData = vi.fn(async () => view);
    renderWithActions(<PremisesEdit cityName="Бровари" cities={{ search: vi.fn() }} />, {
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
        field: "premises",
        next: {
          kind: "address",
          address: {
            line1: "вул. Нова, 1",
            line2: FIXTURE_ADDRESS.line2,
            postalCode: FIXTURE_ADDRESS.postalCode,
            cityId: FIXTURE_ADDRESS.cityId,
            district: { uk: "Центральний", en: null },
          },
        },
      },
    });
  });
});

describe("adding verified data a minimal create left out", () => {
  const empty = registryView({ version: 3, legalEntity: null, premises: { kind: "not_recorded" } });

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
    renderWithActions(<PremisesEdit cityName="Бровари" cities={{ search: vi.fn() }} />, {
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
        field: "premises",
        next: {
          kind: "address",
          address: {
            line1: "вул. Нова, 1",
            line2: null,
            postalCode: null,
            cityId: empty.publicLocation.cityId,
            district: null,
          },
        },
      },
    });
  });
});

/**
 * The initiative's premises (owner, 2026-11-24). Strings transcribed from the approved copy rows 5
 * and 8: «Де живуть тварини», «Є приміщення», «Тварини на перетримках, без приміщення», «Спершу
 * додайте адресу приміщення: у зареєстрованої організації вона обовʼязкова.».
 */
describe("premises: an address or foster homes", () => {
  const INITIATIVE = { kind: "unregistered_initiative", contactPersonName: "Олена Коваль" } as const;

  it("offers an initiative the choice, and foster homes send no address", async () => {
    const view = registryView({
      version: 3,
      legalEntity: INITIATIVE,
      premises: { kind: "not_recorded" },
    });
    const updateVerifiedData = vi.fn(async () => view);
    renderWithActions(<PremisesEdit cityName="Бровари" cities={{ search: vi.fn() }} />, {
      view,
      client: { shelters: { updateVerifiedData } },
    });
    await userEvent.click(screen.getByRole("button", { name: "Додати" }));
    expect(screen.getByRole("radiogroup", { name: "Де живуть тварини" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Є приміщення" })).toHaveProperty("checked", true);
    await userEvent.click(
      screen.getByRole("radio", { name: "Тварини на перетримках, без приміщення" }),
    );
    // Address fields only under «Є приміщення».
    expect(screen.queryByRole("textbox", { name: /Вулиця, будинок/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(updateVerifiedData).toHaveBeenCalledWith({
      shelterId: SHELTER_ID,
      expectedVersion: 3,
      change: { field: "premises", next: { kind: "foster_homes" } },
    });
  });

  it("opens an initiative in foster homes on that choice, and resending it sends nothing", async () => {
    const view = registryView({
      version: 3,
      legalEntity: INITIATIVE,
      premises: { kind: "foster_homes" },
    });
    const updateVerifiedData = vi.fn(async () => view);
    renderWithActions(<PremisesEdit cityName="Бровари" cities={{ search: vi.fn() }} />, {
      view,
      client: { shelters: { updateVerifiedData } },
    });
    await userEvent.click(screen.getByRole("button", { name: "Змінити" }));
    expect(
      screen.getByRole("radio", { name: "Тварини на перетримках, без приміщення" }),
    ).toHaveProperty("checked", true);
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(updateVerifiedData).not.toHaveBeenCalled();
  });

  it("never offers a registered organisation foster homes (D3)", async () => {
    renderWithActions(<PremisesEdit cityName="Бровари" cities={{ search: vi.fn() }} />, {
      view: registryView({ version: 3 }),
      client: { shelters: { updateVerifiedData: vi.fn() } },
    });
    await userEvent.click(screen.getByRole("button", { name: "Змінити" }));
    expect(screen.queryByRole("radio", { name: "Тварини на перетримках, без приміщення" })).toBeNull();
    expect(screen.getByRole("textbox", { name: /Вулиця, будинок/ })).toBeTruthy();
  });

  it("PREMISES_NEEDS_ADDRESS: says to add the address first and keeps the form open (D5)", async () => {
    const updateVerifiedData = vi.fn(async () => {
      throw apiError("PREMISES_NEEDS_ADDRESS");
    });
    renderWithActions(<LegalEdit now={NOW} />, {
      view: registryView({
        version: 3,
        legalEntity: INITIATIVE,
        premises: { kind: "foster_homes" },
      }),
      client: { shelters: { updateVerifiedData } },
    });
    await userEvent.click(screen.getByRole("button", { name: "Змінити" }));
    await userEvent.click(screen.getByRole("radio", { name: "ФОП" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Юридична особа" }), "ФОП Коваль");
    await userEvent.type(screen.getByRole("textbox", { name: "Код ЄДРПОУ" }), "12345678");
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(
      (await screen.findByRole("alert")).textContent,
    ).toBe("Спершу додайте адресу приміщення: у зареєстрованої організації вона обовʼязкова.");
    expect(screen.getByRole("button", { name: "Зберегти" })).toBeTruthy();
  });
});
