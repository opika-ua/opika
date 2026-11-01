import type { KabinetShelterView } from "@opika/contracts";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
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
    uk: "Оновлюємо картки щосуботи.",
    en: { text: "We update the cards every Saturday.", provenance: "human" },
  },
  logo: null,
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
    donationDeclined?: boolean;
  } = {},
) {
  const view = options.view ?? baseView();
  const { fns, client } = fakeClient(view, options.overrides);
  render(
    <ProfileEditor
      initialView={view}
      cityName="Бровари"
      operatorName="Олексій"
      donationDeclined={options.donationDeclined ?? false}
      client={client}
    />,
  );
  return fns;
}

/** Selects the sub-tab (every panel stays mounted, only the active one is visible), then the section. */
const inTab = (tab: string, name: string) => {
  fireEvent.click(screen.getByRole("tab", { name: tab }));
  return screen.getByRole("region", { name });
};
const contacts = () => inTab("Контакти", "Контакти");
const voice = () => inTab("Профіль", "Голос притулку");
const donation = () => inTab("Збір коштів", "Збір коштів");

describe("contacts (answer 3, answer 4)", () => {
  it("offers save and cancel only once something changed, and cancel puts the stored values back", async () => {
    renderEditor();
    const c = within(contacts());
    expect(screen.queryByRole("button", { name: "Зберегти" })).toBeNull();
    const phone = c.getByLabelText(/^Телефон/);
    await userEvent.clear(phone);
    await userEvent.type(phone, "+380 50 111-22-33");
    expect(screen.getByRole("button", { name: "Зберегти" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Скасувати" }));
    expect((phone as HTMLInputElement).value).toBe("+380671234567");
    expect(screen.queryByRole("button", { name: "Зберегти" })).toBeNull();
  });

  it("normalises silently and saves with the version it read, then confirms with the time", async () => {
    const fns = renderEditor();
    const c = within(contacts());
    const phone = c.getByLabelText(/^Телефон/);
    await userEvent.clear(phone);
    await userEvent.type(phone, "+380 50 111-22-33");
    const telegram = c.getByLabelText(/^Telegram/);
    await userEvent.clear(telegram);
    await userEvent.type(telegram, "t.me/lapa_shelter");
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(fns.updateContact).toHaveBeenCalledWith({
      contact: {
        primary: { kind: "phone", e164: "+380501112233" },
        additional: [{ kind: "telegram", handle: "lapa_shelter" }],
      },
      expectedVersion: 3,
    });
    // The confirmation is in the pill and repeated in the status line under the tabs.
    expect(screen.getAllByText(/^Збережено о \d\d:\d\d$/)).toHaveLength(2);
  });

  it("names the bad field with his message and sends nothing", async () => {
    const fns = renderEditor();
    const c = within(contacts());
    const phone = c.getByLabelText(/^Телефон/);
    await userEvent.clear(phone);
    await userEvent.type(phone, "+380670000002213");
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(
      c.getByText("Вкажіть український номер: +380 і ще 9 цифр, наприклад +380 67 123 45 67."),
    ).toBeTruthy();
    expect(phone.getAttribute("aria-invalid")).toBe("true");
    expect(fns.updateContact).not.toHaveBeenCalled();
  });

  it("refuses to save with no channel at all", async () => {
    const fns = renderEditor();
    const c = within(contacts());
    await userEvent.clear(c.getByLabelText(/^Телефон/));
    await userEvent.clear(c.getByLabelText(/^Telegram/));
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    // K4-B4, answer 3: his U+02BC apostrophe.
    expect(c.getByRole("alert").textContent).toBe("Залиште хоча б один спосіб звʼязку.");
    expect(fns.updateContact).not.toHaveBeenCalled();
  });

  it("CONFLICT: says so in the bar, keeps nothing saved, and shows the current version on request", async () => {
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
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(
      screen.getAllByText(
        "Профіль змінили після того, як ви його відкрили. Ваші зміни не збережено. Ось поточна версія – внесіть зміни ще раз.",
      ),
    ).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "Показати поточну версію" }));
    expect(fns.get).toHaveBeenCalledOnce();
    expect((c.getByLabelText(/^Телефон/) as HTMLInputElement).value).toBe("+380509999999");
    expect((c.getByLabelText(/^Telegram/) as HTMLInputElement).value).toBe("");
  });

  it("a lost connection: the short failure in the bar and a retry that sends again", async () => {
    const updateContact = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(baseView({ version: 4 }));
    renderEditor({ overrides: { updateContact } });
    const c = within(contacts());
    const phone = c.getByLabelText(/^Телефон/);
    await userEvent.clear(phone);
    await userEvent.type(phone, "+380501112233");
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(screen.getAllByText("Не вдалося зберегти")).toHaveLength(2);
    // The longer text never shows beside the short one.
    expect(screen.queryByText(/^Не збереглося/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Спробувати ще раз" }));
    expect(updateContact).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Не вдалося зберегти")).toBeNull();
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
        "Нові контакти побачать одразу після збереження – коли натиснуть «Написати притулку».",
      ),
    ).toBeTruthy();
    // CB-B1, item 1
    expect(
      within(contacts()).getByText(
        "Ці контакти бачить людина, коли натискає «Написати притулку», – і пише вам сама. Листування йде напряму, без посередників.",
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
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    const v = within(voice());
    await userEvent.type(v.getByLabelText("Ваші слова на сторінці притулку"), " Пишіть.");
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(fns.updateFreshnessSentence).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: 4 }),
    );
  });
});

describe("the voice sentence (N11)", () => {
  const textarea = () =>
    within(voice()).getByLabelText("Ваші слова на сторінці притулку") as HTMLTextAreaElement;

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

  it("offers no button to insert {імʼя} any more (DR1-Q5)", () => {
    renderEditor();
    expect(within(voice()).queryByRole("button", { name: /імʼя/ })).toBeNull();
  });

  it.each([
    [
      "{дата} (answer 5; his DR1-Q1 text)",
      "Оновлено {дата}.",
      "Дата оновлення показується на кожній картці, тому {дата} у реченні писати не потрібно.",
    ],
    [
      "{імʼя} (DR1-Q5, his text)",
      "Напишіть, чи {імʼя} ще з нами.",
      "Тепер речення показується на сторінці притулку, тому {імʼя} у ньому не використовується. Приберіть його й збережіть ще раз.",
    ],
    [
      "{імʼя} typed with an ASCII apostrophe (DR1-Q5)",
      "Чи {ім'я} ще з нами?",
      "Тепер речення показується на сторінці притулку, тому {імʼя} у ньому не використовується. Приберіть його й збережіть ще раз.",
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
    await userEvent.click((voice(), screen.getByRole("button", { name: "Зберегти" })));
    expect(within(voice()).getByText(message)).toBeTruthy();
    expect(textarea().getAttribute("aria-invalid")).toBe("true");
    expect(fns.updateFreshnessSentence).not.toHaveBeenCalled();
  });

  /**
   * Designer round 1, S6: the preview is the shelter page's «Слова притулку»
   * section, so it needs no animal, and his DR1-Q1 label and empty text
   * (transcribed from his message).
   */
  it("previews the sentence as the shelter page shows it, with no animal", async () => {
    renderEditor();
    const preview = within(within(voice()).getByTestId("voice-preview"));
    expect(preview.getByText("Так це виглядає на сторінці притулку:")).toBeTruthy();
    expect(preview.getByRole("heading", { name: "Слова притулку" })).toBeTruthy();
    expect(preview.getByText("«Оновлюємо картки щосуботи.»")).toBeTruthy();
    await userEvent.clear(textarea());
    expect(preview.queryByText(/щосуботи/)).toBeNull();
    expect(preview.queryByRole("heading", { name: "Слова притулку" })).toBeNull();
    expect(preview.getByText("Речення немає – на сторінці притулку його не буде.")).toBeTruthy();
  });

  /** His words: "Existing test-shelter sentences containing it are re-saved, not migrated." */
  it("a stored sentence with {імʼя} is shown as written, and saving it asks for it to go", async () => {
    const fns = renderEditor({
      view: baseView({ freshnessSentence: { uk: "Чи {імʼя} ще з нами?", en: null } }),
    });
    expect(textarea().value).toBe("Чи {імʼя} ще з нами?");
    await userEvent.type(textarea(), " Пишіть.");
    await userEvent.click((voice(), screen.getByRole("button", { name: "Зберегти" })));
    expect(
      within(voice()).getByText(
        "Тепер речення показується на сторінці притулку, тому {імʼя} у ньому не використовується. Приберіть його й збережіть ще раз.",
      ),
    ).toBeTruthy();
    expect(fns.updateFreshnessSentence).not.toHaveBeenCalled();
  });

  it("sends the stored English back with the new Ukrainian (the server clears it, answer 13)", async () => {
    const fns = renderEditor();
    await userEvent.type(textarea(), " Пишіть.");
    await userEvent.click((voice(), screen.getByRole("button", { name: "Зберегти" })));
    expect(fns.updateFreshnessSentence).toHaveBeenCalledWith({
      freshnessSentence: {
        uk: "Оновлюємо картки щосуботи. Пишіть.",
        en: { text: "We update the cards every Saturday.", provenance: "human" },
      },
      expectedVersion: 3,
    });
  });

  it("an emptied sentence is saved as no sentence", async () => {
    const fns = renderEditor();
    await userEvent.clear(textarea());
    await userEvent.click((voice(), screen.getByRole("button", { name: "Зберегти" })));
    expect(fns.updateFreshnessSentence).toHaveBeenCalledWith({
      freshnessSentence: null,
      expectedVersion: 3,
    });
  });

  it("shows his per-section caption and hints (his DR1-Q1 text)", () => {
    renderEditor();
    const v = within(voice());
    expect(
      v.getByText("Нове речення зʼявиться на сторінці притулку одразу після збереження."),
    ).toBeTruthy();
    expect(
      v.getByText(
        "Якщо залишити порожнім, на сторінці притулку цього речення не буде, а на картках, як і раніше, буде „Оновлено … тому“.",
      ),
    ).toBeTruthy();
    expect(
      v.getByText(
        "Одне речення від першої особи, вашими словами, про те, як часто ви оновлюєте картки. Воно показується на сторінці притулку.",
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
        "Лише https. Через сайт гроші не проходять – це зовнішнє посилання.",
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
      "Останнє запропоноване посилання не підтверджено. Якщо незрозуміло чому – напишіть мені.";
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

const openTab = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));
/** Pause and resume live in the Акаунт tab. */
const renderInAccount = (options: Parameters<typeof renderEditor>[0] = {}) => {
  const fns = renderEditor(options);
  openTab("Акаунт");
  return fns;
};

describe("pause and resume (N21)", () => {
  const REASONS = ["Сезонна перерва", "Переїзд", "Немає місця", "Брак людей", "Інше"];

  it("pauses through the reason dialog, which needs a reason; the note is optional", async () => {
    const fns = renderInAccount();
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
    renderInAccount();
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

  // The kit's Modal is a native <dialog>: Esc is the platform's `cancel` event, then `close`. happy-dom
  // fires neither on a key press, so the test sends the event the browser would and closes as it does.
  const pressEscape = (): boolean => {
    const dialog = screen.getByRole("dialog") as HTMLDialogElement;
    const cancel = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(cancel);
    if (!cancel.defaultPrevented) act(() => dialog.close());
    return cancel.defaultPrevented;
  };

  it("Escape and ✕ close the dialog without pausing", async () => {
    const fns = renderInAccount();
    await userEvent.click(screen.getByRole("button", { name: "Призупинити прийом тварин" }));
    expect(pressEscape()).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Призупинити прийом тварин" }));
    await userEvent.click(screen.getByRole("button", { name: "Закрити" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fns.pause).not.toHaveBeenCalled();
  });

  it("ILLEGAL_TRANSITION on pause: his message, in the dialog", async () => {
    renderInAccount({
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
    renderInAccount({
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
    expect(pressEscape()).toBe(true);
    await userEvent.click(dialog.getByRole("button", { name: "Закрити" }));
    await userEvent.click(dialog.getByRole("button", { name: "Скасувати" }));
    expect(screen.getByRole("dialog", { name: "Призупинити прийом тварин?" })).toBeTruthy();

    await act(async () => answer(apiError("ILLEGAL_TRANSITION")));
    expect(dialog.getByRole("alert").textContent).toBe(
      "Зараз не вийде поставити прийом на паузу: статус притулку змінився. Оновіть сторінку.",
    );
    // Answered, it closes again as before.
    expect(pressEscape()).toBe(false);
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
    const fns = renderInAccount({ view: paused() });
    // The stored note, under the paused line (K4-B4, answer 2).
    expect(screen.getByText("Повні вольєри").previousElementSibling?.textContent).toBe("Коментар");
    await userEvent.click(screen.getByRole("button", { name: "Відновити прийом тварин" }));
    expect(fns.resume).toHaveBeenCalledOnce();
    expect(screen.getByText("Прийом відновлено. Ваших тварин знову видно.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Призупинити прийом тварин" })).toBeTruthy();
  });

  it("ILLEGAL_TRANSITION on resume: his message", async () => {
    renderInAccount({
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
    renderInAccount({ view: baseView({ verification: { status, since: new Date() } }) });
    expect(screen.queryByRole("button", { name: /прийом тварин/ })).toBeNull();
  });

  it("the locked block's chip follows the pause", async () => {
    renderEditor();
    const locked = () => {
      openTab("Перевірка");
      return screen.getByRole("region", { name: "Встановлено під час перевірки" });
    };
    expect(within(locked()).getAllByText("Перевірено").length).toBeGreaterThan(0);
    openTab("Акаунт");
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
  const FAILED = "Не вдалося зберегти";
  const lost = () =>
    vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

  it("contacts: the re-read shows the saved value, so it counts as saved", async () => {
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
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(fns.updateContact).toHaveBeenCalledWith({ contact: saved, expectedVersion: 3 });
    expect(fns.get).toHaveBeenCalledOnce();
    expect(screen.getAllByText(/^Збережено о \d\d:\d\d$/).length).toBeGreaterThan(0);
    expect(screen.queryByText(FAILED)).toBeNull();
  });

  it("contacts: the re-read shows the old value, so the failure shows", async () => {
    const fns = renderEditor({ overrides: { updateContact: lost() } });
    const c = within(contacts());
    const phone = c.getByLabelText(/^Телефон/);
    await userEvent.clear(phone);
    await userEvent.type(phone, "+380501112233");
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(fns.get).toHaveBeenCalledOnce();
    expect(screen.getAllByText(FAILED).length).toBeGreaterThan(0);
  });

  it("voice: the re-read shows the new sentence (English dropped by the server), so it counts as saved", async () => {
    const fns = renderEditor({
      overrides: {
        updateFreshnessSentence: lost(),
        get: vi.fn(async () =>
          baseView({
            version: 4,
            freshnessSentence: { uk: "Оновлюємо картки щосуботи. Пишіть.", en: null },
          }),
        ),
      },
    });
    const v = within(voice());
    await userEvent.type(v.getByLabelText("Ваші слова на сторінці притулку"), " Пишіть.");
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(fns.get).toHaveBeenCalledOnce();
    expect(screen.getAllByText(/^Збережено о \d\d:\d\d$/).length).toBeGreaterThan(0);
  });

  it("a server refusal is not re-read: the failure shows at once", async () => {
    const fns = renderEditor({
      overrides: {
        updateContact: vi.fn(async () => {
          throw apiError("INTERNAL_SERVER_ERROR");
        }),
      },
    });
    const c = within(contacts());
    const phone = c.getByLabelText(/^Телефон/);
    await userEvent.clear(phone);
    await userEvent.type(phone, "+380 50 111 22 33");
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(screen.getAllByText(FAILED).length).toBeGreaterThan(0);
    expect(fns.get).not.toHaveBeenCalled();
  });
});

describe("the page's one save bar and the sub-tabs", () => {
  const dirtyPhone = async () => {
    const c = within(contacts());
    const phone = c.getByLabelText(/^Телефон/);
    await userEvent.clear(phone);
    await userEvent.type(phone, "+380 50 111-22-33");
  };
  const dirtySentence = async () => {
    await userEvent.type(
      within(voice()).getByLabelText("Ваші слова на сторінці притулку"),
      " Пишіть.",
    );
  };
  /** Resolves a microtask after the commit that makes `node` read `text`: the first frame showing it. */
  const whenReads = (node: HTMLElement, text: RegExp) =>
    new Promise<void>((resolve) => {
      const observer = new MutationObserver(() => {
        if (!text.test(node.textContent ?? "")) return;
        observer.disconnect();
        resolve();
      });
      observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    });

  it("shows no bar until something is unsaved, announces it politely, and hides it after a save", async () => {
    renderEditor();
    expect(screen.queryByRole("button", { name: "Зберегти" })).toBeNull();
    await dirtyPhone();
    expect(screen.getByRole("button", { name: "Зберегти" })).toBeTruthy();
    // The polite live region exists from the start and gains the message; focus stays in the field.
    const live = screen
      .getAllByRole("status")
      .find((node) => node.textContent === "Є незбережені зміни");
    expect(live).toBeTruthy();
    expect(document.activeElement?.tagName).toBe("INPUT");
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(screen.queryByRole("button", { name: "Зберегти" })).toBeNull();
  });

  it("an edit survives a tab switch, and the bar stays while it is unsaved", async () => {
    renderEditor();
    await dirtyPhone();
    fireEvent.click(screen.getByRole("tab", { name: "Збір коштів" }));
    expect(screen.getByRole("button", { name: "Зберегти" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Контакти" }));
    expect((within(contacts()).getByLabelText(/^Телефон/) as HTMLInputElement).value).toBe(
      "+380 50 111-22-33",
    );
  });

  it("one press of «Зберегти» saves every unsaved section in turn, each with the fresh version", async () => {
    const fns = renderEditor();
    await dirtyPhone();
    await dirtySentence();
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    // Page order: the sentence (Профіль) first with the version read, then the contacts with the one it returned.
    expect(fns.updateFreshnessSentence).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: 3 }),
    );
    expect(fns.updateContact).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: 4 }));
    expect(screen.queryByRole("button", { name: "Зберегти" })).toBeNull();
  });

  // The save tests above, checked at the moment they flaked (#299's merge, #308): the answers
  // commit outside any event, and the bar must not outlive them by a frame.
  it("the unsaved bar is gone in the same frame the last save lands", async () => {
    renderEditor();
    await dirtyPhone();
    await dirtySentence();
    // The status line under the tabs reads the time only once every save has landed.
    const line = screen.getAllByText("Є незбережені зміни")[0]?.closest('[role="status"]');
    const saved = whenReads(line as HTMLElement, /^Збережено о \d\d:\d\d$/);
    const click = userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    await saved;
    expect(screen.queryByRole("button", { name: "Зберегти" })).toBeNull();
    await click;
  });

  it("«Скасувати» puts every unsaved section back and hides the bar", async () => {
    renderEditor();
    await dirtyPhone();
    await dirtySentence();
    await userEvent.click(screen.getByRole("button", { name: "Скасувати" }));
    expect((within(contacts()).getByLabelText(/^Телефон/) as HTMLInputElement).value).toBe(
      "+380671234567",
    );
    expect(screen.queryByRole("button", { name: "Зберегти" })).toBeNull();
  });

  it("a refused save keeps the bar and shows the tab that holds the problem", async () => {
    const fns = renderEditor();
    fireEvent.click(screen.getByRole("tab", { name: "Контакти" }));
    const phone = within(contacts()).getByLabelText(/^Телефон/);
    await userEvent.clear(phone);
    await userEvent.type(phone, "+380670000002213");
    fireEvent.click(screen.getByRole("tab", { name: "Збір коштів" }));
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(fns.updateContact).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: "Контакти" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "Зберегти" })).toBeTruthy();
  });

  it("the tab is in the URL as ?tab= (not for the first), and a sub-tab list is keyboard-operable", async () => {
    renderEditor();
    fireEvent.click(screen.getByRole("tab", { name: "Збір коштів" }));
    expect(window.location.search).toBe("?tab=zbir");
    fireEvent.click(screen.getByRole("tab", { name: "Профіль" }));
    expect(window.location.search).toBe("");
    screen.getByRole("tab", { name: "Профіль" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Контакти" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(window.location.search).toBe("?tab=kontakty");
  });

  it("after a save, «Переглянути» opens the public shelter page in a new tab", async () => {
    renderEditor();
    await dirtySentence();
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    const link = screen.getByRole("link", { name: /^Переглянути/ });
    expect(link.getAttribute("href")).toBe(`/prytulky/${baseView().id}`);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.textContent).toContain("(відкриється в новій вкладці)");
  });
});

describe("the save pill on the shelter page", () => {
  const dirtySentence = async () => {
    await userEvent.type(
      within(voice()).getByLabelText("Ваші слова на сторінці притулку"),
      " Пишіть.",
    );
  };

  it("S1: nothing to act on shows no pill, only the quiet line under the tabs", () => {
    renderEditor();
    expect(screen.queryByRole("button", { name: "Зберегти" })).toBeNull();
    expect(screen.getAllByText("Усі зміни збережено")).toHaveLength(1);
  });

  it("S5: counts the fields to fix, and «Показати» brings the first one into view and focuses it", async () => {
    renderEditor();
    fireEvent.click(screen.getByRole("tab", { name: "Контакти" }));
    const phone = within(contacts()).getByLabelText(/^Телефон/);
    await userEvent.clear(phone);
    await userEvent.type(phone, "+380670000002213");
    fireEvent.click(screen.getByRole("tab", { name: "Збір коштів" }));
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(screen.getAllByText("Перевірте 1 поле")).toHaveLength(2);
    // Move away again, then ask the pill to show the problem.
    fireEvent.click(screen.getByRole("tab", { name: "Збір коштів" }));
    await userEvent.click(screen.getByRole("button", { name: "Показати" }));
    expect(screen.getByRole("tab", { name: "Контакти" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(document.activeElement).toBe(within(contacts()).getByLabelText(/^Телефон/));
  });

  it("S6: a failed save shows only the short failure, never the long one, and the retry repeats it", async () => {
    const updateFreshnessSentence = vi
      .fn()
      .mockRejectedValueOnce(apiError("INTERNAL_SERVER_ERROR"))
      .mockResolvedValueOnce(baseView({ version: 4 }));
    renderEditor({ overrides: { updateFreshnessSentence } });
    await dirtySentence();
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(screen.getAllByText("Не вдалося зберегти")).toHaveLength(2);
    expect(screen.queryByText(/^Не збереглося/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Спробувати ще раз" }));
    expect(updateFreshnessSentence).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Не вдалося зберегти")).toBeNull();
  });

  it("S3: both buttons are inert while saving", async () => {
    let finish: (view: KabinetShelterView) => void = () => {};
    const updateFreshnessSentence = vi.fn(
      () =>
        new Promise<KabinetShelterView>((resolve) => {
          finish = resolve;
        }),
    );
    renderEditor({ overrides: { updateFreshnessSentence } });
    await dirtySentence();
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(screen.getAllByText("Збереження…")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Зберегти" }).getAttribute("aria-disabled")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "Скасувати" }).getAttribute("aria-disabled")).toBe(
      "true",
    );
    await act(async () => finish(baseView({ version: 4 })));
    expect(screen.getAllByText(/^Збережено о \d\d:\d\d$/)).toHaveLength(2);
  });

  it("S4 leaves after 4 s and the line keeps the time; hover holds it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderEditor();
      await dirtySentence();
      await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
      const link = screen.getByRole("link", { name: /^Переглянути/ });
      const bar = link.parentElement?.parentElement as HTMLElement;
      act(() => {
        fireEvent.mouseEnter(bar);
      });
      act(() => {
        vi.advanceTimersByTime(30_000);
      });
      expect(screen.getByRole("link", { name: /^Переглянути/ })).toBeTruthy();
      act(() => {
        fireEvent.mouseLeave(bar);
      });
      act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(screen.queryByRole("link", { name: /^Переглянути/ })).toBeNull();
      expect(screen.getAllByText(/^Збережено о \d\d:\d\d$/)).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
