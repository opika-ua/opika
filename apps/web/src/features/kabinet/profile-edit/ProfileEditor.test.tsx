import type { KabinetShelterView } from "@opika/contracts";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { KabinetProfileClient } from "../../../api/kabinet-browser-client";
import { ProfileEditor } from "./ProfileEditor";

/**
 * K4's editor, behaviour only (Oleksii, 2026-10-17: "Test logic, not looks").
 * Every string asserted here is Oleksii's Ukrainian transcribed from his K4
 * file (`k4-copy-uk.md`) and his later "K4 copy fixes", never read from
 * `uk.ts`, so a drift in the catalogue fails here. The API is a fake client
 * with the browser client's shape; the server side of each call is
 * `handlers.test.ts`'s.
 */

const baseView = (overrides: Partial<KabinetShelterView> = {}): KabinetShelterView => ({
  id: "51000000-0000-4000-8000-000000000001" as KabinetShelterView["id"],
  displayName: "Притулок «Домівка»",
  description: { uk: "Опис", en: null },
  legalEntity: {
    kind: "registered_ngo",
    legalName: "ГО «Домівка для хвостатих»",
    edrpou: "43218765" as never,
    registeredAt: new Date("2020-01-01T00:00:00Z"),
  },
  exactAddress: {
    line1: "вул. Київська, 300",
    line2: null,
    postalCode: "07400",
    cityId: "c1000000-0000-4000-8000-000000000001" as never,
    district: null,
    coordinates: { lat: 50.5, lng: 30.8 },
  },
  contact: {
    primary: { kind: "phone", e164: "+380671234567" },
    additional: [{ kind: "telegram", handle: "domivka_brovary" }],
  },
  donation: { url: "https://dobro.ua/fund/domivka", provider: "other" },
  pendingDonation: null,
  freshnessSentence: {
    uk: "{імʼя} досі шукає дім.",
    en: { text: "{імʼя} is still looking for a home.", provenance: "human" },
  },
  version: 3,
  verification: { status: "verified", since: new Date("2025-03-14T10:00:00Z") },
  ...overrides,
});

const apiError = (code: string) => Object.assign(new Error(code), { code });

type Fake = {
  [K in keyof KabinetProfileClient["shelter"]["profile"]]: ReturnType<typeof vi.fn>;
};

function fakeClient(view: KabinetShelterView, overrides: Partial<Fake> = {}) {
  const echo = (patch: (input: never) => Partial<KabinetShelterView>) =>
    vi.fn(async (input: never) => ({ ...view, version: view.version + 1, ...patch(input) }));
  const fns: Fake = {
    get: vi.fn(async () => view),
    updateContact: echo((input: { contact: KabinetShelterView["contact"] }) => ({
      contact: input.contact,
    })),
    updateFreshnessSentence: echo(
      (input: { freshnessSentence: KabinetShelterView["freshnessSentence"] }) => ({
        freshnessSentence: input.freshnessSentence,
      }),
    ),
    proposeDonation: echo((input: { url: string }) => ({
      pendingDonation: {
        link: { url: input.url, provider: "other" },
        proposedAt: new Date("2026-10-17T09:00:00Z"),
        proposedBy: "33333333-3333-4333-8333-333333333333" as never,
      },
    })),
    cancelDonationProposal: echo(() => ({ pendingDonation: null })),
    pause: echo((input: { reason: { code: "relocation"; note: string | null } }) => ({
      verification: {
        status: "paused",
        since: new Date("2026-10-17T09:00:00Z"),
        reason: input.reason,
      },
    })),
    resume: echo(() => ({
      verification: { status: "verified", since: new Date("2025-03-14T10:00:00Z") },
    })),
    ...overrides,
  };
  return { fns, client: { shelter: { profile: fns } } as unknown as KabinetProfileClient };
}

function renderEditor(
  options: {
    view?: KabinetShelterView;
    overrides?: Partial<Fake>;
    previewAnimal?: { name: string; ageDays: number } | null;
    donationDeclined?: boolean;
  } = {},
) {
  const view = options.view ?? baseView();
  const { fns, client } = fakeClient(view, options.overrides);
  const animal =
    options.previewAnimal === undefined ? { name: "Ластівка", ageDays: 3 } : options.previewAnimal;
  render(
    <ProfileEditor
      initialView={view}
      cityName="Бровари"
      operatorName="Олексій"
      previewAnimal={
        animal === null
          ? null
          : {
              name: animal.name,
              freshness: {
                kind: "fresh",
                updatedAt: new Date("2026-10-14T00:00:00Z"),
                ageDays: animal.ageDays,
              },
            }
      }
      donationDeclined={options.donationDeclined ?? false}
      client={client}
    />,
  );
  return fns;
}

const section = (name: string) => screen.getByRole("region", { name });
const contacts = () => section("Контакти");
const voice = () => section("Голос притулку");
const donation = () => section("Збір коштів");

describe("contacts (answer 3, answer 4)", () => {
  it("offers save and cancel only once something changed, and cancel puts the stored values back", async () => {
    renderEditor();
    const c = within(contacts());
    expect(c.queryByRole("button", { name: "Зберегти" })).toBeNull();
    const phone = c.getByLabelText(/^Телефон/);
    await userEvent.clear(phone);
    await userEvent.type(phone, "+380 50 111-22-33");
    expect(c.getByRole("button", { name: "Зберегти" })).toBeTruthy();
    await userEvent.click(c.getByRole("button", { name: "Скасувати зміни" }));
    expect((phone as HTMLInputElement).value).toBe("+380671234567");
    expect(c.queryByRole("button", { name: "Зберегти" })).toBeNull();
  });

  it("normalises silently and saves with the version it read, then says «Збережено.»", async () => {
    const fns = renderEditor();
    const c = within(contacts());
    const phone = c.getByLabelText(/^Телефон/);
    await userEvent.clear(phone);
    await userEvent.type(phone, "+380 50 111-22-33");
    const telegram = c.getByLabelText(/^Telegram/);
    await userEvent.clear(telegram);
    await userEvent.type(telegram, "t.me/lapa_shelter");
    await userEvent.click(c.getByRole("button", { name: "Зберегти" }));
    expect(fns.updateContact).toHaveBeenCalledWith({
      contact: {
        primary: { kind: "phone", e164: "+380501112233" },
        additional: [{ kind: "telegram", handle: "lapa_shelter" }],
      },
      expectedVersion: 3,
    });
    expect(c.getByRole("status").textContent).toBe("Збережено.");
    expect(c.getByText(/^Збережено о \d\d:\d\d$/)).toBeTruthy();
  });

  it("names the bad field with his message and sends nothing", async () => {
    const fns = renderEditor();
    const c = within(contacts());
    const phone = c.getByLabelText(/^Телефон/);
    await userEvent.clear(phone);
    await userEvent.type(phone, "067 123 45 67");
    await userEvent.click(c.getByRole("button", { name: "Зберегти" }));
    expect(c.getByText("Вкажіть номер із кодом країни, наприклад +380 67 123 45 67.")).toBeTruthy();
    expect(phone.getAttribute("aria-invalid")).toBe("true");
    expect(fns.updateContact).not.toHaveBeenCalled();
  });

  it("refuses to save with no channel at all", async () => {
    const fns = renderEditor();
    const c = within(contacts());
    await userEvent.clear(c.getByLabelText(/^Телефон/));
    await userEvent.clear(c.getByLabelText(/^Telegram/));
    await userEvent.click(c.getByRole("button", { name: "Зберегти" }));
    // K4-B4, answer 3: his U+02BC apostrophe.
    expect(c.getByRole("alert").textContent).toBe("Залиште хоча б один спосіб звʼязку.");
    expect(fns.updateContact).not.toHaveBeenCalled();
  });

  it("CONFLICT: says so, keeps nothing saved, and shows the current version on request", async () => {
    const current = baseView({
      version: 9,
      contact: { primary: { kind: "phone", e164: "+380509999999" }, additional: [] },
    });
    const fns = renderEditor({
      overrides: {
        updateContact: vi.fn(async () => {
          throw apiError("CONFLICT");
        }),
        get: vi.fn(async () => current),
      },
    });
    const c = within(contacts());
    const phone = c.getByLabelText(/^Телефон/);
    await userEvent.clear(phone);
    await userEvent.type(phone, "+380501112233");
    await userEvent.click(c.getByRole("button", { name: "Зберегти" }));
    expect(
      c.getByText(
        "Профіль змінили після того, як ви його відкрили. Ваші зміни не збережено. Ось поточна версія — внесіть зміни ще раз.",
      ),
    ).toBeTruthy();
    await userEvent.click(c.getByRole("button", { name: "Показати поточну версію" }));
    expect(fns.get).toHaveBeenCalledOnce();
    expect((c.getByLabelText(/^Телефон/) as HTMLInputElement).value).toBe("+380509999999");
    expect((c.getByLabelText(/^Telegram/) as HTMLInputElement).value).toBe("");
  });

  it("writes refused by the policy: notAvailable", async () => {
    renderEditor({
      overrides: {
        updateContact: vi.fn(async () => {
          throw apiError("SHELTER_WRITES_NOT_YET_AVAILABLE");
        }),
      },
    });
    const c = within(contacts());
    await userEvent.type(c.getByLabelText(/^Телефон/), "8");
    await userEvent.click(c.getByRole("button", { name: "Зберегти" }));
    expect(c.getByRole("alert").textContent).toBe(
      "Змінювати дані в кабінеті поки не можна — для цього напишіть мені.",
    );
  });

  it("a lost connection: his failure text and a retry that sends again", async () => {
    const updateContact = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(baseView({ version: 4 }));
    renderEditor({ overrides: { updateContact } });
    const c = within(contacts());
    const phone = c.getByLabelText(/^Телефон/);
    await userEvent.clear(phone);
    await userEvent.type(phone, "+380501112233");
    await userEvent.click(c.getByRole("button", { name: "Зберегти" }));
    expect(
      c.getByText(
        "Не збереглося — на картках нічого не змінилося. Перевірте зʼєднання і спробуйте ще раз.",
      ),
    ).toBeTruthy();
    await userEvent.click(c.getByRole("button", { name: "Спробувати ще раз" }));
    expect(updateContact).toHaveBeenCalledTimes(2);
  });

  it("stored contacts that don't fit show as editable «other» rows of any kind; adding stops at two rows", async () => {
    renderEditor({
      view: baseView({
        contact: {
          primary: { kind: "email", address: "a@example.org" },
          additional: [{ kind: "email", address: "b@example.org" }],
        },
      }),
    });
    const c = within(contacts());
    const rows = c.getAllByRole("group", { name: /Інший спосіб звʼязку/ });
    expect(rows).toHaveLength(2);
    const kindOptions = within(rows[0] as HTMLElement)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(kindOptions).toEqual(["Телефон", "Telegram", "Viber", "Ел. пошта", "Сайт"]);
    expect(c.queryByRole("button", { name: "Додати ще один спосіб звʼязку" })).toBeNull();
    await userEvent.click(within(rows[1] as HTMLElement).getByRole("button", { name: "Прибрати" }));
    await userEvent.click(c.getByRole("button", { name: "Додати ще один спосіб звʼязку" }));
    const added = c.getAllByRole("group", { name: /Інший спосіб звʼязку/ })[1] as HTMLElement;
    expect(
      within(added)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Viber", "Ел. пошта", "Сайт"]);
  });

  it("shows his contacts caption (K4-B4, answer 1: reveal views carry the current contacts)", () => {
    renderEditor();
    expect(
      within(contacts()).getByText(
        "Нові контакти побачать одразу після збереження — коли натиснуть «Написати притулку».",
      ),
    ).toBeTruthy();
    // CB-B1, item 1
    expect(
      within(contacts()).getByText(
        "Ці контакти бачить людина, коли натискає «Написати притулку», — і пише вам сама. Листування йде напряму, без посередників.",
      ),
    ).toBeTruthy();
  });
});

describe("per-section saves share one version (answer 1)", () => {
  it("saving contacts and then the sentence sends the version the first save returned", async () => {
    const fns = renderEditor();
    const c = within(contacts());
    const phone = c.getByLabelText(/^Телефон/);
    await userEvent.clear(phone);
    await userEvent.type(phone, "+380501112233");
    await userEvent.click(c.getByRole("button", { name: "Зберегти" }));
    const v = within(voice());
    await userEvent.type(v.getByLabelText("Ваші слова на картках"), " Пишіть.");
    await userEvent.click(v.getByRole("button", { name: "Зберегти" }));
    expect(fns.updateFreshnessSentence).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: 4 }),
    );
  });
});

describe("the voice sentence (N11)", () => {
  const textarea = () =>
    within(voice()).getByLabelText("Ваші слова на картках") as HTMLTextAreaElement;

  it("counts characters as «{count} / 280», and the extra ones past 280", async () => {
    renderEditor({ view: baseView({ freshnessSentence: null }) });
    const v = within(voice());
    await userEvent.type(textarea(), "Оновлюємо щодня");
    expect(v.getByText("15 / 280")).toBeTruthy();
    await userEvent.clear(textarea());
    await userEvent.click(textarea());
    await userEvent.paste("а".repeat(285));
    expect(v.getByText("Зайвих символів: 5")).toBeTruthy();
  });

  it("makes the counter a polite live region only near the limit", async () => {
    renderEditor({ view: baseView({ freshnessSentence: null }) });
    const counter = within(voice()).getByText("0 / 280");
    expect(counter.getAttribute("aria-live")).toBe("off");
    await userEvent.click(textarea());
    await userEvent.paste("а".repeat(265));
    expect(within(voice()).getByText("265 / 280").getAttribute("aria-live")).toBe("polite");
  });

  it("«Вставити {імʼя}» puts the token at the cursor (answer 7)", async () => {
    renderEditor({ view: baseView({ freshnessSentence: null }) });
    await userEvent.type(textarea(), "досі шукає дім");
    textarea().setSelectionRange(0, 0);
    await userEvent.click(within(voice()).getByRole("button", { name: "Вставити {імʼя}" }));
    expect(textarea().value).toBe("{імʼя}досі шукає дім");
  });

  it.each([
    [
      "{дата} (answer 5)",
      "Оновлено {дата}.",
      "Дата й так показується над вашим реченням, тому {дата} писати не потрібно.",
    ],
    [
      "an unknown token, named",
      "Привіт від {name}.",
      "Підставляється лише {імʼя}. Приберіть «{name}» або напишіть без фігурних дужок.",
    ],
    [
      "a stray brace",
      "Дужка { без пари.",
      "Є дужка без пари. Фігурні дужки потрібні лише для {імʼя}.",
    ],
    ["over 280", "а".repeat(281), "Речення довше за 280 символів."],
  ])("refuses %s with his message, sending nothing", async (_label, typed, message) => {
    const fns = renderEditor({ view: baseView({ freshnessSentence: null }) });
    await userEvent.click(textarea());
    await userEvent.paste(typed);
    await userEvent.click(within(voice()).getByRole("button", { name: "Зберегти" }));
    expect(within(voice()).getByText(message)).toBeTruthy();
    expect(textarea().getAttribute("aria-invalid")).toBe("true");
    expect(fns.updateFreshnessSentence).not.toHaveBeenCalled();
  });

  it("previews in the freshness block with a real animal's name", async () => {
    renderEditor();
    const preview = within(within(voice()).getByTestId("voice-preview"));
    expect(preview.getByText("Так це виглядає на сторінці тварини: Ластівка")).toBeTruthy();
    // In «…», as on the animal page it previews (CB-B1, item 4).
    expect(preview.getByTestId("shelter-freshness-sentence").textContent).toBe(
      "«Ластівка досі шукає дім.»",
    );
    await userEvent.clear(textarea());
    expect(preview.queryByTestId("shelter-freshness-sentence")).toBeNull();
    expect(
      preview.getByText("Речення немає — на картці буде лише «Оновлено … тому»."),
    ).toBeTruthy();
  });

  it("with no animal, says the preview comes later", () => {
    renderEditor({ previewAnimal: null });
    expect(
      within(voice()).getByText(
        "Попередній перегляд зʼявиться, щойно у вас буде тварина: тут буде видно, як речення виглядатиме на її сторінці.",
      ),
    ).toBeTruthy();
  });

  it("sends the stored English back with the new Ukrainian (the server clears it, answer 13)", async () => {
    const fns = renderEditor();
    await userEvent.type(textarea(), " Пишіть.");
    await userEvent.click(within(voice()).getByRole("button", { name: "Зберегти" }));
    expect(fns.updateFreshnessSentence).toHaveBeenCalledWith({
      freshnessSentence: {
        uk: "{імʼя} досі шукає дім. Пишіть.",
        en: { text: "{імʼя} is still looking for a home.", provenance: "human" },
      },
      expectedVersion: 3,
    });
  });

  it("an emptied sentence is saved as no sentence", async () => {
    const fns = renderEditor();
    await userEvent.clear(textarea());
    await userEvent.click(within(voice()).getByRole("button", { name: "Зберегти" }));
    expect(fns.updateFreshnessSentence).toHaveBeenCalledWith({
      freshnessSentence: null,
      expectedVersion: 3,
    });
  });

  it("shows his per-section caption and hints", () => {
    renderEditor();
    const v = within(voice());
    expect(
      v.getByText(
        "Нове речення зʼявиться в стрічці та на сторінках тварин одразу після збереження.",
      ),
    ).toBeTruthy();
    expect(
      v.getByText("Якщо залишити порожнім, на картках буде лише «Оновлено … тому»."),
    ).toBeTruthy();
    // CB-B1, item 3: `{імʼя}` shows literally, never filled
    expect(
      v.getByText(
        "Одне речення від першої особи, вашими словами. На картці підставляється лише імʼя тварини — там, де ви напишете {імʼя}. Більше нічого не змінюється.",
      ),
    ).toBeTruthy();
  });
});

describe("the donation link (N20)", () => {
  const field = () => within(donation()).getByLabelText(/^Посилання на збір/) as HTMLInputElement;

  it("starts at the live link, offers sending only for a different link, and previews its host", async () => {
    renderEditor();
    const d = within(donation());
    expect(field().value).toBe("https://dobro.ua/fund/domivka");
    expect(d.queryByRole("button", { name: "Надіслати на перевірку" })).toBeNull();
    await userEvent.clear(field());
    await userEvent.type(field(), "https://send.monobank.ua/jar/abc");
    expect(d.getByText("Так це побачать люди:")).toBeTruthy();
    expect(d.getByText("send.monobank.ua ↗")).toBeTruthy();
    expect(d.getByRole("button", { name: "Надіслати на перевірку" })).toBeTruthy();
  });

  it("shows his donation note under the field (CB-B1, item 2)", () => {
    renderEditor();
    expect(
      within(donation()).getByText(
        "Лише https. Через сайт гроші не проходять — це зовнішнє посилання.",
      ),
    ).toBeTruthy();
  });

  it("refuses http and not-a-link with his messages", async () => {
    const fns = renderEditor();
    const d = within(donation());
    await userEvent.clear(field());
    await userEvent.type(field(), "http://dobro.ua/x");
    await userEvent.click(d.getByRole("button", { name: "Надіслати на перевірку" }));
    expect(d.getByText("Лише посилання, що починаються з https://.")).toBeTruthy();
    await userEvent.clear(field());
    await userEvent.type(field(), "просто текст");
    await userEvent.click(d.getByRole("button", { name: "Надіслати на перевірку" }));
    expect(d.getByText("Це не схоже на посилання.")).toBeTruthy();
    expect(fns.proposeDonation).not.toHaveBeenCalled();
  });

  it("proposes, then shows the waiting block, and cancels it", async () => {
    const fns = renderEditor();
    const d = within(donation());
    await userEvent.clear(field());
    await userEvent.type(field(), "https://send.monobank.ua/jar/abc");
    await userEvent.click(d.getByRole("button", { name: "Надіслати на перевірку" }));
    expect(fns.proposeDonation).toHaveBeenCalledWith({ url: "https://send.monobank.ua/jar/abc" });
    expect(d.getByRole("status").textContent).toBe("Надіслано. Я перевірю посилання.");
    expect(d.getByText("Чекає на перевірку")).toBeTruthy();
    expect(d.getByText("Запропоновано: send.monobank.ua")).toBeTruthy();
    expect(d.getByText(/^Надіслано \d+ жовтня 2026/)).toBeTruthy();
    // The live link is untouched.
    expect(field().value).toBe("https://dobro.ua/fund/domivka");
    await userEvent.click(d.getByRole("button", { name: "Скасувати пропозицію" }));
    expect(fns.cancelDonationProposal).toHaveBeenCalledOnce();
    expect(d.getByRole("status").textContent).toBe(
      "Пропозицію скасовано. Поточне посилання лишається.",
    );
    expect(d.queryByText("Чекає на перевірку")).toBeNull();
  });

  it("while one waits, says another replaces it", async () => {
    renderEditor({
      view: baseView({
        pendingDonation: {
          link: { url: "https://send.monobank.ua/jar/abc", provider: "monobank_jar" },
          proposedAt: new Date("2026-10-16T09:00:00Z"),
          proposedBy: "33333333-3333-4333-8333-333333333333" as never,
        },
      }),
    });
    await userEvent.clear(field());
    await userEvent.type(field(), "https://dobro.ua/fund/new");
    expect(
      within(donation()).getByText(
        "Якщо надіслати інше посилання, воно замінить те, що чекає на перевірку.",
      ),
    ).toBeTruthy();
  });

  it("shows the declined line (answer 12) until a new proposal", async () => {
    renderEditor({ donationDeclined: true });
    const d = within(donation());
    const declined =
      "Останнє запропоноване посилання не підтверджено. Якщо незрозуміло чому — напишіть мені.";
    expect(d.getByText(declined)).toBeTruthy();
    await userEvent.clear(field());
    await userEvent.type(field(), "https://send.monobank.ua/jar/abc");
    await userEvent.click(d.getByRole("button", { name: "Надіслати на перевірку" }));
    expect(d.queryByText(declined)).toBeNull();
  });

  it("a failed send: his donation failure text", async () => {
    renderEditor({
      overrides: {
        proposeDonation: vi.fn(async () => {
          throw new TypeError("Failed to fetch");
        }),
      },
    });
    const d = within(donation());
    await userEvent.clear(field());
    await userEvent.type(field(), "https://send.monobank.ua/jar/abc");
    await userEvent.click(d.getByRole("button", { name: "Надіслати на перевірку" }));
    expect(d.getByRole("alert").textContent).toBe(
      "Не надіслано. Перевірте зʼєднання і спробуйте ще раз.",
    );
  });
});

describe("pause and resume (N21)", () => {
  const REASONS = ["Сезонна перерва", "Переїзд", "Немає місця", "Брак людей", "Інше"];

  it("pauses through the reason dialog, which needs a reason; the note is optional", async () => {
    const fns = renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "Призупинити прийом тварин" }));
    const dialog = within(screen.getByRole("dialog", { name: "Призупинити прийом тварин?" }));
    expect(
      dialog.getByText(
        "Поки прийом на паузі, ваших тварин не бачать ті, хто шукає. Відновити можна тут будь-коли.",
      ),
    ).toBeTruthy();
    const select = dialog.getByLabelText("Причина");
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Оберіть причину", ...REASONS]);
    await userEvent.click(dialog.getByRole("button", { name: "Призупинити прийом" }));
    expect(fns.pause).not.toHaveBeenCalled();
    expect(select.getAttribute("aria-invalid")).toBe("true");
    await userEvent.selectOptions(select, "Переїзд");
    await userEvent.type(dialog.getByLabelText(/^Коментар/), "  Переїжджаємо до Бучі  ");
    await userEvent.click(dialog.getByRole("button", { name: "Призупинити прийом" }));
    expect(fns.pause).toHaveBeenCalledWith({
      reason: { code: "relocation", note: "Переїжджаємо до Бучі" },
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Прийом на паузі.")).toBeTruthy();
    // The paused line names the reason's label and never the note (fix 5);
    // the note sits under it, labelled «Коментар» (K4-B4, answer 2).
    expect(screen.getByText(/^Прийом на паузі з \d+ жовтня 2026 р?\.? ?· Переїзд$/)).toBeTruthy();
    const note = screen.getByText("Переїжджаємо до Бучі");
    expect(note.tagName).toBe("DD");
    expect(note.previousElementSibling?.textContent).toBe("Коментар");
    expect(screen.getByRole("button", { name: "Відновити прийом тварин" })).toBeTruthy();
  });

  it("shows his note hint under the note field (K4-B4, answer 2)", async () => {
    renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "Призупинити прийом тварин" }));
    const dialog = within(screen.getByRole("dialog"));
    const hint = dialog.getByText(
      "Коментар бачите ви, інші адміністратори притулку і я. Людям, які шукають тварину, він не показується.",
    );
    const field = dialog.getByLabelText(/^Коментар/);
    expect(field.getAttribute("aria-describedby")).toContain(hint.parentElement?.id ?? "missing");
    // The contract's cap, by its own number (K4-T15).
    expect(field.getAttribute("maxlength")).toBe("2000");
  });

  it("Escape and ✕ close the dialog without pausing", async () => {
    const fns = renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "Призупинити прийом тварин" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Призупинити прийом тварин" }));
    await userEvent.click(screen.getByRole("button", { name: "Закрити" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fns.pause).not.toHaveBeenCalled();
  });

  it("ILLEGAL_TRANSITION on pause: his message, in the dialog", async () => {
    renderEditor({
      overrides: {
        pause: vi.fn(async () => {
          throw apiError("ILLEGAL_TRANSITION");
        }),
      },
    });
    await userEvent.click(screen.getByRole("button", { name: "Призупинити прийом тварин" }));
    const dialog = within(screen.getByRole("dialog"));
    await userEvent.selectOptions(dialog.getByLabelText("Причина"), "Немає місця");
    await userEvent.click(dialog.getByRole("button", { name: "Призупинити прийом" }));
    expect(dialog.getByRole("alert").textContent).toBe(
      "Зараз не вийде поставити прийом на паузу: статус притулку змінився. Оновіть сторінку.",
    );
  });

  it("while the pause is in flight, Escape, ✕ and «Скасувати» don't close the dialog, so a refusal is still shown", async () => {
    let answer: (error: unknown) => void = () => {};
    renderEditor({
      overrides: {
        pause: vi.fn(
          () =>
            new Promise((_resolve, fail) => {
              answer = fail;
            }),
        ),
      },
    });
    await userEvent.click(screen.getByRole("button", { name: "Призупинити прийом тварин" }));
    const dialog = within(screen.getByRole("dialog", { name: "Призупинити прийом тварин?" }));
    await userEvent.selectOptions(dialog.getByLabelText("Причина"), "Немає місця");
    await userEvent.click(dialog.getByRole("button", { name: "Призупинити прийом" }));
    await userEvent.keyboard("{Escape}");
    await userEvent.click(dialog.getByRole("button", { name: "Закрити" }));
    await userEvent.click(dialog.getByRole("button", { name: "Скасувати" }));
    expect(screen.getByRole("dialog", { name: "Призупинити прийом тварин?" })).toBeTruthy();

    await act(async () => answer(apiError("ILLEGAL_TRANSITION")));
    expect(dialog.getByRole("alert").textContent).toBe(
      "Зараз не вийде поставити прийом на паузу: статус притулку змінився. Оновіть сторінку.",
    );
    // Answered, it closes again as before.
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  const paused = () =>
    baseView({
      verification: {
        status: "paused",
        since: new Date("2026-10-10T09:00:00Z"),
        reason: { code: "capacity_reached", note: "Повні вольєри" },
      },
    });

  it("resumes with no confirmation", async () => {
    const fns = renderEditor({ view: paused() });
    // The stored note, under the paused line (K4-B4, answer 2).
    expect(screen.getByText("Повні вольєри").previousElementSibling?.textContent).toBe("Коментар");
    await userEvent.click(screen.getByRole("button", { name: "Відновити прийом тварин" }));
    expect(fns.resume).toHaveBeenCalledOnce();
    expect(screen.getByText("Прийом відновлено. Ваших тварин знову видно.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Призупинити прийом тварин" })).toBeTruthy();
  });

  it("ILLEGAL_TRANSITION on resume: his message", async () => {
    renderEditor({
      view: paused(),
      overrides: {
        resume: vi.fn(async () => {
          throw apiError("ILLEGAL_TRANSITION");
        }),
      },
    });
    await userEvent.click(screen.getByRole("button", { name: "Відновити прийом тварин" }));
    expect(screen.getByRole("alert").textContent).toBe(
      "Звідси прийом зараз не відновити: статус притулку змінився. Напишіть мені.",
    );
  });

  it.each(["pending", "under_review"] as const)("offers neither while %s", (status) => {
    renderEditor({ view: baseView({ verification: { status, since: new Date() } }) });
    expect(screen.queryByRole("button", { name: /прийом тварин/ })).toBeNull();
  });

  it("the locked block's chip follows the pause", async () => {
    renderEditor();
    const locked = () => screen.getByRole("region", { name: "Встановлено під час перевірки" });
    expect(within(locked()).getAllByText("Перевірено").length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "Призупинити прийом тварин" }));
    const dialog = within(screen.getByRole("dialog"));
    await userEvent.selectOptions(dialog.getByLabelText("Причина"), "Переїзд");
    await act(async () => {
      await userEvent.click(dialog.getByRole("button", { name: "Призупинити прийом" }));
    });
    expect(within(locked()).getAllByText("На паузі").length).toBeGreaterThan(0);
  });
});

/**
 * Inbox K4-T16 (Oleksii, 2026-10-17: "Your decisions (pause note length cap;
 * re-read after a lost save response): fine."): when no answer arrives, the
 * section reads the profile again; the saved value there means «Збережено.»,
 * anything else his failure text. A server refusal is never re-read.
 */
describe("a save whose answer is lost (K4-T16)", () => {
  const FAILED =
    "Не збереглося — на картках нічого не змінилося. Перевірте зʼєднання і спробуйте ще раз.";
  const lost = () =>
    vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

  it("contacts: the re-read shows the saved value, so «Збережено.»", async () => {
    const saved = { primary: { kind: "phone" as const, e164: "+380501112233" }, additional: [] };
    // jsonb hands keys back in its own order; the comparison must not care.
    const stored = baseView({
      version: 4,
      contact: { additional: [], primary: { e164: "+380501112233", kind: "phone" } } as never,
    });
    const fns = renderEditor({
      overrides: { updateContact: lost(), get: vi.fn(async () => stored) },
    });
    const c = within(contacts());
    await userEvent.clear(c.getByLabelText(/^Telegram/));
    const phone = c.getByLabelText(/^Телефон/);
    await userEvent.clear(phone);
    await userEvent.type(phone, "+380501112233");
    await userEvent.click(c.getByRole("button", { name: "Зберегти" }));
    expect(fns.updateContact).toHaveBeenCalledWith({ contact: saved, expectedVersion: 3 });
    expect(fns.get).toHaveBeenCalledOnce();
    expect(c.getByRole("status").textContent).toBe("Збережено.");
    expect(c.queryByText(FAILED)).toBeNull();
  });

  it("contacts: the re-read shows the old value, so his failure text", async () => {
    const fns = renderEditor({ overrides: { updateContact: lost() } });
    const c = within(contacts());
    const phone = c.getByLabelText(/^Телефон/);
    await userEvent.clear(phone);
    await userEvent.type(phone, "+380501112233");
    await userEvent.click(c.getByRole("button", { name: "Зберегти" }));
    expect(fns.get).toHaveBeenCalledOnce();
    expect(c.getByText(FAILED)).toBeTruthy();
    expect(c.getByRole("status").textContent).toBe("");
  });

  it("voice: the re-read shows the new sentence (English dropped by the server), so «Збережено.»", async () => {
    const fns = renderEditor({
      overrides: {
        updateFreshnessSentence: lost(),
        get: vi.fn(async () =>
          baseView({
            version: 4,
            freshnessSentence: { uk: "{імʼя} досі шукає дім. Пишіть.", en: null },
          }),
        ),
      },
    });
    const v = within(voice());
    await userEvent.type(v.getByLabelText("Ваші слова на картках"), " Пишіть.");
    await userEvent.click(v.getByRole("button", { name: "Зберегти" }));
    expect(fns.get).toHaveBeenCalledOnce();
    expect(v.getByRole("status").textContent).toBe("Збережено.");
  });

  it("a server refusal is not re-read: his failure text at once", async () => {
    const fns = renderEditor({
      overrides: {
        updateContact: vi.fn(async () => {
          throw apiError("INTERNAL_SERVER_ERROR");
        }),
      },
    });
    const c = within(contacts());
    await userEvent.type(c.getByLabelText(/^Телефон/), "8");
    await userEvent.click(c.getByRole("button", { name: "Зберегти" }));
    expect(c.getByText(FAILED)).toBeTruthy();
    expect(fns.get).not.toHaveBeenCalled();
  });
});
