import type { KabinetAnimalView } from "@opika/contracts";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KabinetAnimalClient } from "../../../api/kabinet-browser-client";
import type { CompressedPhoto } from "../photos/compress-photo";
import { confirmLeave } from "../profile-edit/unsaved-changes";
import { AnimalForm, type AnimalFormEditing } from "./AnimalForm";
import type { ShelterVisibility } from "./labels";

/**
 * K3's form, behaviour only (Test logic, not looks). Every Ukrainian string
 * asserted here is Oleksii's, transcribed from his K3 file (`k3-copy-uk.md`,
 * 2026-10-17), never read from `uk.ts`, so a drift in the catalogue fails
 * here too. The API is a fake client with the browser client's shape; what
 * the server does with each call is `handlers.test.ts`'s and
 * `photos.test.ts`'s.
 *
 * Photo keys here are root-relative paths: vitest runs `next/image` with its
 * default loader, not the app's `loaderFile` that turns an `animals/` key
 * into its CDN address.
 */

const NOW = new Date("2026-10-17T09:00:00.000Z");
const ID = "a1000000-0000-4000-8000-000000000001" as KabinetAnimalView["id"];
const PHOTO = { storageKey: "/photos/1.jpg", width: 1600, height: 2000, alt: null };
const unknown = { source: "shelter_declared", state: "unknown", declaredAt: NOW } as const;

const draft = (overrides: Partial<KabinetAnimalView> = {}): KabinetAnimalView =>
  ({
    id: ID,
    name: "Ластівка",
    species: "dog",
    sex: "unknown",
    size: null,
    age: null,
    description: null,
    photos: [],
    vaccination: unknown,
    spayNeuter: unknown,
    documentReadiness: { kind: "unknown" },
    listing: { kind: "draft" },
    publicLocation: null,
    createdAt: NOW,
    lastUpdatedAt: NOW,
    version: 0,
    ...overrides,
  }) as KabinetAnimalView;

const complete = {
  size: "medium",
  age: { kind: "declared_bucket", bucket: "young", declaredAt: new Date("2026-09-01T00:00:00Z") },
  description: { uk: "Спокійна, любить гуляти.", en: null },
} as const;

const published = (overrides: Partial<KabinetAnimalView> = {}) =>
  draft({
    ...complete,
    photos: [PHOTO],
    listing: { kind: "published", publishedAt: NOW, confirmedAt: NOW, undoable: null },
    ...overrides,
  } as Partial<KabinetAnimalView>);

const apiError = (code: string, data?: unknown) => Object.assign(new Error(code), { code, data });

type Fn = ReturnType<typeof vi.fn>;
type FakeClient = KabinetAnimalClient & {
  calls: {
    createDraft: Fn;
    update: Fn;
    transition: Fn;
    byId: Fn;
    add: Fn;
    reorder: Fn;
    remove: Fn;
  };
};

function fakeClient(start: KabinetAnimalView | null): FakeClient {
  let current = start;
  const createDraft = vi.fn(async (input: { name: string; species: "dog" | "cat" }) => {
    current = draft({ name: input.name, species: input.species });
    return current;
  });
  const update = vi.fn(
    async (input: { patch: Record<string, unknown>; expectedVersion: number }) => {
      if (current === null) throw new Error("no animal");
      const { patch } = input;
      current = {
        ...current,
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.species !== undefined ? { species: patch.species } : {}),
        ...(patch.sex !== undefined ? { sex: patch.sex } : {}),
        ...(patch.size !== undefined ? { size: patch.size } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.age !== undefined
          ? {
              age:
                (patch.age as { kind: string }).kind === "birth_date"
                  ? {
                      kind: "birth_date",
                      date: new Date(`${(patch.age as { date: string }).date}T00:00:00Z`),
                      precision: "day",
                    }
                  : {
                      kind: "declared_bucket",
                      bucket: (patch.age as { bucket: string }).bucket,
                      declaredAt: new Date(`${(patch.age as { asOf: string }).asOf}T00:00:00Z`),
                    },
            }
          : {}),
        version: current.version + 1,
      } as KabinetAnimalView;
      return current;
    },
  );
  const transition = vi.fn(async () => {
    if (current === null) throw new Error("no animal");
    current = {
      ...current,
      listing: { kind: "published", publishedAt: NOW, confirmedAt: NOW, undoable: null },
    } as KabinetAnimalView;
    return current;
  });
  const byId = vi.fn(async () => current);
  const add = vi.fn(
    async (
      _input: { file: File },
      options?: { context?: { onUploadProgress?: (p: { sent: number; total: number }) => void } },
    ) => {
      options?.context?.onUploadProgress?.({ sent: 655_360, total: 1_048_576 });
      if (current === null) throw new Error("no animal");
      current = {
        ...current,
        photos: [
          ...current.photos,
          { ...PHOTO, storageKey: `/photos/${current.photos.length + 2}.jpg` },
        ],
      } as KabinetAnimalView;
      return current;
    },
  );
  const reorder = vi.fn(async (input: { nextPhotoKeys: string[] }) => {
    if (current === null) throw new Error("no animal");
    const byKey = new Map(current.photos.map((photo) => [photo.storageKey, photo]));
    current = {
      ...current,
      photos: input.nextPhotoKeys.map((key) => byKey.get(key)),
    } as KabinetAnimalView;
    return current;
  });
  const remove = vi.fn(async (input: { storageKey: string }) => {
    if (current === null) throw new Error("no animal");
    current = {
      ...current,
      photos: current.photos.filter((photo) => photo.storageKey !== input.storageKey),
    } as KabinetAnimalView;
    return current;
  });
  const client = {
    shelter: {
      animals: { createDraft, update, transition, byId },
      photos: { add, reorder, remove },
    },
  } as unknown as FakeClient;
  client.calls = { createDraft, update, transition, byId, add, reorder, remove };
  return client;
}

const OPEN: AnimalFormEditing = { kind: "open" };
const okJpeg = async (): Promise<CompressedPhoto> => ({
  kind: "ok",
  file: new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" }),
  width: 1600,
  height: 2000,
});

function renderForm(
  view: KabinetAnimalView | null,
  options: {
    editing?: AnimalFormEditing;
    viewer?: "admin" | "support";
    shelterVisibility?: ShelterVisibility;
    compress?: (file: File) => Promise<CompressedPhoto>;
    client?: FakeClient;
    clock?: () => Date;
  } = {},
) {
  const client = options.client ?? fakeClient(view);
  render(
    <AnimalForm
      initialView={view}
      editing={options.editing ?? OPEN}
      viewer={options.viewer ?? "admin"}
      shelterVisibility={options.shelterVisibility ?? "visible"}
      back={{ href: "/kabinet", label: "← Профіль притулку" }}
      client={client}
      clock={options.clock ?? (() => NOW)}
      compress={options.compress ?? okJpeg}
    />,
  );
  return client;
}

/** The polite status line under the form (the last one; the photo section has its own). */
const formStatus = () => {
  const statuses = screen.getAllByRole("status");
  const last = statuses[statuses.length - 1];
  if (last === undefined) throw new Error("no status line");
  return last;
};

const SAVE_DRAFT = "Зберегти чернетку";
const MISSING_ALL = "Щоб опублікувати, ще потрібно: розмір, вік, опис і фото.";
const PUBLISH_DONE = "Опубліковано. Тепер картку бачать ті, хто шукає тварину.";
// His final text for a shelter that hasn't passed verification (round 2b, answer 3).
const PUBLISHED_NOT_SHOWN =
  "Опубліковано. Ті, хто шукає тварину, побачать картку, щойно притулок пройде перевірку.";
// A paused or suspended shelter has passed verification, so the line above is
// false there: his status word «Опубліковано» and his `listed.notShownNow`,
// each transcribed from his K3 file (K3-T15).
const PUBLISHED_HIDDEN = "Опубліковано. Цю картку зараз ніхто не бачить.";
const NOT_SHOWN_NOW = "Цю картку зараз ніхто не бачить.";
const NOT_VISIBLE_KINDS = [
  ["not yet verified (pending, under review, rejected)", "awaiting_verification"],
  ["paused or suspended", "hidden"],
] as const satisfies readonly (readonly [string, ShelterVisibility])[];
const WRITE_GRANTS = [["open writes", { kind: "open" }]] as const satisfies readonly (readonly [
  string,
  AnimalFormEditing,
])[];
const LAST_PHOTO_KEPT_NOT_SHOWN =
  "Картка опублікована, тож одне фото має лишитися — навіть поки її ще не бачать.";

beforeEach(() => {
  window.history.replaceState(null, "", "/kabinet/tvaryny/nova");
});
afterEach(() => {
  vi.useRealTimers();
});

describe("/nova: a name and a species make a draft (K-Q5)", () => {
  it("says what a draft needs, and lists every publish gap next to the disabled button", () => {
    renderForm(null);
    expect(screen.getByRole("heading", { level: 1, name: "Нова тварина" })).toBeTruthy();
    expect(screen.getByText(/Щоб зберегти чернетку, потрібні імʼя та вид\./)).toBeTruthy();
    const publish = screen.getByRole("button", { name: "Опублікувати" });
    expect(publish.getAttribute("aria-disabled")).toBe("true");
    const missing = screen.getByText(MISSING_ALL);
    // Written next to the button and named as its description (KAB:93: no tooltip).
    expect(publish.getAttribute("aria-describedby")).toBe(missing.id);
  });

  it("«Зберегти чернетку» with a name and a species creates the draft and takes its address", async () => {
    const user = userEvent.setup();
    const client = renderForm(null);
    await user.type(screen.getByLabelText("Імʼя"), "Ластівка");
    await user.click(within(screen.getByRole("group", { name: "Вид" })).getByLabelText("Собака"));
    await user.click(screen.getByRole("button", { name: SAVE_DRAFT }));
    expect(client.calls.createDraft).toHaveBeenCalledWith({ name: "Ластівка", species: "dog" });
    expect(await screen.findByRole("heading", { level: 1, name: "Ластівка" })).toBeTruthy();
    expect(window.location.pathname).toBe(`/kabinet/tvaryny/${ID}`);
    expect(
      screen.getByText(
        /Чернетку збережено о 12:00 · Ті, хто шукає тварину, цю чернетку не бачать\./,
      ),
    ).toBeTruthy();
    expect(screen.getByText("Чернетка")).toBeTruthy();
    expect(screen.getByText("Створено сьогодні · ще не в галереї")).toBeTruthy();
    // The draft exists now, so its photos can be added.
    expect(screen.getByRole("button", { name: "+ Фото" })).toBeTruthy();
  });

  it("before the draft exists there is no photo section to add to", () => {
    renderForm(null);
    expect(screen.queryByRole("button", { name: "+ Фото" })).toBeNull();
  });

  it("the sex starts on «Не записано» (D2), and nothing else is chosen for the person", () => {
    renderForm(null);
    const sex = within(screen.getByRole("group", { name: "Стать" }));
    expect((sex.getByLabelText("Не записано") as HTMLInputElement).checked).toBe(true);
    for (const group of ["Вид", "Розмір", "Вік на ту дату"]) {
      const radios = within(screen.getByRole("group", { name: group })).getAllByRole("radio");
      expect(
        radios.some((radio) => (radio as HTMLInputElement).checked),
        group,
      ).toBe(false);
    }
  });

  it("without a species, saving shows the species message and creates nothing", async () => {
    const user = userEvent.setup();
    const client = renderForm(null);
    await user.type(screen.getByLabelText("Імʼя"), "Ластівка");
    await user.click(screen.getByRole("button", { name: SAVE_DRAFT }));
    expect(screen.getByText("Виберіть, собака це чи кіт, щоб зберегти чернетку.")).toBeTruthy();
    expect(client.calls.createDraft).not.toHaveBeenCalled();
  });

  it("without a name, saving shows the name message and creates nothing", async () => {
    const user = userEvent.setup();
    const client = renderForm(null);
    await user.click(within(screen.getByRole("group", { name: "Вид" })).getByLabelText("Кіт"));
    await user.click(screen.getByRole("button", { name: SAVE_DRAFT }));
    expect(screen.getByText("Щоб зберегти чернетку, потрібне імʼя.")).toBeTruthy();
    expect(client.calls.createDraft).not.toHaveBeenCalled();
  });

  it("refuses a name with braces, inline, once the field is left", async () => {
    const user = userEvent.setup();
    renderForm(null);
    await user.type(screen.getByLabelText("Імʼя"), "Бу{{}");
    await user.tab();
    expect(screen.getByText("В імені не може бути фігурних дужок.")).toBeTruthy();
  });

  it("refuses a name over 60 characters once the field is left", () => {
    renderForm(null);
    const name = screen.getByLabelText("Імʼя");
    fireEvent.change(name, { target: { value: "Л".repeat(61) } });
    fireEvent.blur(name);
    expect(screen.getByText("Імʼя довше за 60 символів.")).toBeTruthy();
  });
});

describe("a draft saves itself (T6)", () => {
  it("10 seconds after the last change, each change restarting the wait, sending only what changed", async () => {
    vi.useFakeTimers();
    const client = renderForm(draft());
    fireEvent.click(within(screen.getByRole("group", { name: "Розмір" })).getByLabelText(/Малий/));
    await act(async () => {
      vi.advanceTimersByTime(6_000);
    });
    fireEvent.click(
      within(screen.getByRole("group", { name: "Стать" })).getByLabelText("Дівчинка"),
    );
    await act(async () => {
      vi.advanceTimersByTime(9_999);
    });
    expect(client.calls.update).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(client.calls.update).toHaveBeenCalledTimes(1);
    expect(client.calls.update.mock.calls[0]?.[0]).toEqual({
      animalId: ID,
      expectedVersion: 0,
      patch: { sex: "female", size: "small" },
    });
  });

  it("when a field is left, at once", async () => {
    const client = renderForm(draft());
    const description = screen.getByLabelText("Про тварину");
    fireEvent.change(description, { target: { value: "Лагідна." } });
    await act(async () => {
      fireEvent.blur(description);
    });
    expect(client.calls.update).toHaveBeenCalledWith({
      animalId: ID,
      expectedVersion: 0,
      patch: { description: { uk: "Лагідна.", en: null } },
    });
  });

  it("a save that changes nothing sends nothing", async () => {
    const user = userEvent.setup();
    const client = renderForm(draft());
    await user.click(screen.getByRole("button", { name: SAVE_DRAFT }));
    expect(client.calls.update).not.toHaveBeenCalled();
  });

  it("emptying a draft's description clears it (null), which only a draft accepts", async () => {
    const user = userEvent.setup();
    const client = renderForm(draft({ description: { uk: "Було.", en: null } }));
    await user.clear(screen.getByLabelText("Про тварину"));
    await user.click(screen.getByRole("button", { name: SAVE_DRAFT }));
    expect(client.calls.update.mock.calls[0]?.[0]).toMatchObject({ patch: { description: null } });
  });

  it("a conflict stops the autosave and offers the current version", async () => {
    const user = userEvent.setup();
    const client = fakeClient(draft());
    client.calls.update.mockRejectedValueOnce(apiError("CONFLICT"));
    renderForm(draft(), { client });
    fireEvent.change(screen.getByLabelText("Про тварину"), { target: { value: "Лагідна." } });
    await user.click(screen.getByRole("button", { name: SAVE_DRAFT }));
    expect(
      await screen.findByText(
        "Хтось змінив цю картку після того, як ви її відкрили. Ваші останні зміни не збережено. Ось поточна версія — внесіть їх ще раз.",
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Показати поточну версію" }));
    expect(client.calls.byId).toHaveBeenCalledWith({ animalId: ID });
    expect((screen.getByLabelText("Про тварину") as HTMLTextAreaElement).value).toBe("");
  });

  it("a lost connection keeps what was typed, says so, and retries on request", async () => {
    const user = userEvent.setup();
    const client = fakeClient(draft());
    client.calls.update.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderForm(draft(), { client });
    fireEvent.change(screen.getByLabelText("Про тварину"), { target: { value: "Лагідна." } });
    await user.click(screen.getByRole("button", { name: SAVE_DRAFT }));
    expect(
      await screen.findByText(
        "Чернетку не збережено. Перевірте зʼєднання — усе, що ви ввели, лишається тут.",
      ),
    ).toBeTruthy();
    expect((screen.getByLabelText("Про тварину") as HTMLTextAreaElement).value).toBe("Лагідна.");
    await user.click(screen.getByRole("button", { name: "Спробувати ще раз" }));
    expect(client.calls.update).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(/Чернетку збережено о 12:00/)).toBeTruthy();
  });

  it("a showing of the current version that fails to load says so", async () => {
    const user = userEvent.setup();
    const client = fakeClient(draft());
    client.calls.update.mockRejectedValueOnce(apiError("CONFLICT"));
    client.calls.byId.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderForm(draft(), { client });
    fireEvent.change(screen.getByLabelText("Про тварину"), { target: { value: "Лагідна." } });
    await user.click(screen.getByRole("button", { name: SAVE_DRAFT }));
    await user.click(await screen.findByRole("button", { name: "Показати поточну версію" }));
    expect(
      await screen.findByText("Картка не завантажилась. Перевірте зʼєднання і спробуйте ще раз."),
    ).toBeTruthy();
  });

  it("a registry-confirmed fact refused by the server says it can't be changed here", async () => {
    const user = userEvent.setup();
    const client = fakeClient(draft());
    client.calls.update.mockRejectedValueOnce(apiError("REGISTRY_CONFIRMED"));
    renderForm(draft(), { client });
    fireEvent.change(screen.getByLabelText("Про тварину"), { target: { value: "Лагідна." } });
    await user.click(screen.getByRole("button", { name: SAVE_DRAFT }));
    expect(
      await screen.findByText("Це підтверджено державним реєстром тварин, тут змінити не можна."),
    ).toBeTruthy();
  });

  it("the age line quotes the card's own word once a bucket is chosen", async () => {
    const user = userEvent.setup();
    renderForm(draft());
    await user.click(
      within(screen.getByRole("group", { name: "Вік на ту дату" })).getByLabelText(/Молодий/),
    );
    expect(screen.getByText("Ті, хто шукає тварину, побачать: «молодий».")).toBeTruthy();
  });

  // AW-F5. The age words are his Q9 copy (#125), transcribed from his answer,
  // never from `uk.cardMeta`: female «малючка» / «молода»; male, and an
  // unrecorded sex, «малюк» / «молодий».
  it("the age line follows the form's sex, as the card does (Q9)", async () => {
    const user = userEvent.setup();
    renderForm(draft());
    const sex = within(screen.getByRole("group", { name: "Стать" }));
    await user.click(
      within(screen.getByRole("group", { name: "Вік на ту дату" })).getByLabelText(/Молодий/),
    );
    // «Не записано», where the form starts: today's word.
    expect(screen.getByText("Ті, хто шукає тварину, побачать: «молодий».")).toBeTruthy();
    await user.click(sex.getByLabelText("Дівчинка"));
    expect(screen.getByText("Ті, хто шукає тварину, побачать: «молода».")).toBeTruthy();
    expect(screen.queryByText("Ті, хто шукає тварину, побачать: «молодий».")).toBeNull();
    await user.click(sex.getByLabelText("Хлопчик"));
    expect(screen.getByText("Ті, хто шукає тварину, побачать: «молодий».")).toBeTruthy();
    expect(screen.queryByText("Ті, хто шукає тварину, побачать: «молода».")).toBeNull();
    // A birth date reaches the same words: under a year old, a girl.
    await user.click(sex.getByLabelText("Дівчинка"));
    await user.click(
      within(screen.getByRole("group", { name: "Що відомо про вік" })).getByRole("radio", {
        name: /Відома дата народження/,
      }),
    );
    fireEvent.change(screen.getByLabelText("Дата народження"), {
      target: { value: "2026-03-01" },
    });
    expect(screen.getByText("Ті, хто шукає тварину, побачать: «малючка».")).toBeTruthy();
    await user.click(sex.getByLabelText("Не записано"));
    expect(screen.getByText("Ті, хто шукає тварину, побачать: «малюк».")).toBeTruthy();
  });

  it("«Тепер на картці» names the saved card's word: the saved sex, until a change is saved", async () => {
    const user = userEvent.setup();
    const outgrown = published({
      sex: "female",
      age: {
        kind: "declared_bucket",
        bucket: "baby",
        declaredAt: new Date("2024-09-01T00:00:00Z"),
      },
    } as Partial<KabinetAnimalView>);
    renderForm(outgrown);
    const onCard = (word: string) =>
      `Вік указано станом на 1 вересня 2024 р. Тепер на картці — «${word}». Якщо тварина вже старша, оновіть вік.`;
    expect(screen.getByText(onCard("молода"))).toBeTruthy();
    await user.click(
      within(screen.getByRole("group", { name: "Стать" })).getByLabelText("Хлопчик"),
    );
    // The form's line says what people will see once saved; the card hasn't changed yet.
    expect(screen.getByText("Ті, хто шукає тварину, побачать: «молодий».")).toBeTruthy();
    expect(screen.getByText(onCard("молода"))).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(await screen.findByText(onCard("молодий"))).toBeTruthy();
    expect(screen.queryByText(onCard("молода"))).toBeNull();
  });

  it("an «as of» date after today in Kyiv is refused inline and not sent", async () => {
    const user = userEvent.setup();
    const client = renderForm(draft());
    await user.click(
      within(screen.getByRole("group", { name: "Вік на ту дату" })).getByLabelText(/Молодий/),
    );
    fireEvent.change(screen.getByLabelText("Станом на"), { target: { value: "2026-10-18" } });
    await user.click(screen.getByRole("button", { name: SAVE_DRAFT }));
    expect(screen.getByText("Дата «Станом на» не може бути в майбутньому.")).toBeTruthy();
    expect(client.calls.update).not.toHaveBeenCalled();
  });

  it("a birth date after today, or more than 30 years back, is refused inline and not sent", async () => {
    const user = userEvent.setup();
    const client = renderForm(draft());
    await user.click(
      within(screen.getByRole("group", { name: "Що відомо про вік" })).getByRole("radio", {
        name: /Відома дата народження/,
      }),
    );
    const birth = screen.getByLabelText("Дата народження");
    fireEvent.change(birth, { target: { value: "2026-10-18" } });
    await user.click(screen.getByRole("button", { name: SAVE_DRAFT }));
    expect(screen.getByText("Дата народження не може бути в майбутньому.")).toBeTruthy();
    fireEvent.change(birth, { target: { value: "1996-10-16" } });
    expect(screen.getByText("Ця дата надто давня — понад 30 років тому.")).toBeTruthy();
    expect(client.calls.update).not.toHaveBeenCalled();
    // Exactly thirty years back is allowed, and saves as the birth date chosen.
    fireEvent.change(birth, { target: { value: "1996-10-17" } });
    await user.click(screen.getByRole("button", { name: SAVE_DRAFT }));
    expect(client.calls.update.mock.calls[0]?.[0]).toMatchObject({
      patch: { age: { kind: "birth_date", date: "1996-10-17" } },
    });
  });

  it("the server's own date refusal (its clock decides) lands on the date field", async () => {
    const user = userEvent.setup();
    const client = fakeClient(draft());
    client.calls.update.mockRejectedValueOnce(
      apiError("AGE_DATE_OUT_OF_RANGE", { problem: "too_old" }),
    );
    renderForm(draft(), { client });
    await user.click(
      within(screen.getByRole("group", { name: "Вік на ту дату" })).getByLabelText(/Дорослий/),
    );
    await user.click(screen.getByRole("button", { name: SAVE_DRAFT }));
    expect(await screen.findByText("Ця дата надто давня — понад 30 років тому.")).toBeTruthy();
  });

  it("an old bucket the animal may have outgrown asks for a new age", () => {
    renderForm(
      draft({
        age: {
          kind: "declared_bucket",
          bucket: "baby",
          declaredAt: new Date("2024-09-01T00:00:00Z"),
        },
      } as Partial<KabinetAnimalView>),
    );
    expect(
      // One full stop after «р.», not two.
      screen.getByText(
        "Вік указано станом на 1 вересня 2024 р. Тепер на картці — «молодий». Якщо тварина вже старша, оновіть вік.",
      ),
    ).toBeTruthy();
  });

  it("counts the description as a reader does, and names the excess past 1,500", () => {
    renderForm(draft());
    const description = screen.getByLabelText("Про тварину");
    fireEvent.change(description, { target: { value: "👍🏽".repeat(3) } });
    expect(screen.getByText(/^3 з 1\s?500 символів$/)).toBeTruthy();
    fireEvent.change(description, { target: { value: "а".repeat(1_502) } });
    expect(screen.getByText("Зайвих символів: 2")).toBeTruthy();
    fireEvent.blur(description);
    expect(screen.getByText(/^Опис довший за 1\s?500 символів\.$/)).toBeTruthy();
  });

  it("a registry-confirmed vaccination is read-only, with the state register named", () => {
    renderForm(
      draft({
        vaccination: {
          source: "registry",
          state: "confirmed",
          registryRef: "UA-1",
          verifiedAt: NOW,
        },
      } as Partial<KabinetAnimalView>),
    );
    expect(
      screen.getByText("Підтверджено державним реєстром тварин. Тут цей рядок змінити не можна."),
    ).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Комплексне щеплення" })).toBeNull();
    expect(screen.getByRole("group", { name: "Стерилізація" })).toBeTruthy();
  });
});

/**
 * One rule for a draft and a listed card alike (Oleksii, 2026-10-19,
 * verbatim): "warn while there are unsaved edits or a save pending or
 * queued ... 'Unsaved' includes text typed into a field that hasn't been
 * blurred or saved yet. Don't warn when everything is saved." And, on his
 * correction to the line itself: "Hide «Чернетку збережено о …» while
 * there are unsaved edits, the same as listed cards" — so a failed save
 * (the view never changed) leaves both the warning and the hidden line
 * exactly where an unsaved edit already leaves them, with no separate
 * "undo on failure" branch. Every save below is a controlled promise, so
 * the test — never a sleep — decides exactly when it settles.
 */
describe("the unsaved-work warning and the saved-time line", () => {
  const FAILURE = "Чернетку не збережено. Перевірте зʼєднання — усе, що ви ввели, лишається тут.";
  // Kyiv is UTC+3 in October (before the last-Sunday-of-October change):
  // NOW ("2026-10-17T09:00:00.000Z") reads 12:00, and 15 minutes later reads
  // 12:15 — transcribed by hand, never computed with the code's own `timeOf`
  // (a test may not compare output against the same constant the code
  // renders).
  const FIRST_TIME = "12:00";
  const SECOND_TIME = "12:15";
  const SECOND_NOW = new Date(NOW.getTime() + 15 * 60_000);

  /** Dispatches `beforeunload` on `window` and reports what the listener, if any, did to it. */
  const dispatchUnload = (): { prevented: boolean; returnValue: unknown } => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return {
      prevented: event.defaultPrevented,
      returnValue: (event as unknown as { returnValue: unknown }).returnValue,
    };
  };

  /** The next `update` call hangs until the test calls the returned function. */
  const deferredUpdate = (client: FakeClient) => {
    let release: (view: KabinetAnimalView) => void = () => {};
    client.calls.update.mockImplementationOnce(
      () =>
        new Promise<KabinetAnimalView>((resolve) => {
          release = resolve;
        }),
    );
    return (view: KabinetAnimalView) => release(view);
  };

  const CASES = [
    {
      name: "a draft",
      view: () => draft(),
      saveLabel: SAVE_DRAFT,
      savedLineText: (time: string) =>
        `Чернетку збережено о ${time} · Ті, хто шукає тварину, цю чернетку не бачать.`,
    },
    {
      name: "a listed card",
      view: () => published(),
      saveLabel: "Зберегти",
      savedLineText: (time: string) => `Збережено о ${time}`,
    },
  ] as const;

  it.each(CASES)(
    "$name: typing (unblurred) hides the line and warns; settling shows it with the new time and clears the warning; a failed save re-hides it and re-warns",
    async ({ view, saveLabel, savedLineText }) => {
      let now = NOW;
      const client = fakeClient(view());
      renderForm(view(), { client, clock: () => now });

      // Nothing typed, nothing saved yet: no warning, no line.
      expect(dispatchUnload().prevented).toBe(false);
      expect(screen.queryByText(savedLineText(FIRST_TIME))).toBeNull();

      // Typing without leaving the field: `dirty` alone turns the warning
      // on, before any save is even attempted.
      fireEvent.change(screen.getByLabelText("Про тварину"), { target: { value: "Лагідна." } });
      expect(dispatchUnload().prevented).toBe(true);
      expect(screen.queryByText(savedLineText(FIRST_TIME))).toBeNull();

      const release1 = deferredUpdate(client);
      fireEvent.click(screen.getByRole("button", { name: saveLabel }));
      expect(dispatchUnload().prevented).toBe(true); // still pending
      expect(screen.queryByText(savedLineText(FIRST_TIME))).toBeNull();

      await act(async () =>
        release1({ ...view(), description: { uk: "Лагідна.", en: null } } as KabinetAnimalView),
      );
      await screen.findByText(savedLineText(FIRST_TIME));
      expect(dispatchUnload()).toEqual({ prevented: false, returnValue: undefined });

      // Type again: `save.kind` is still "saved" from the last success, but
      // the new, unblurred edit alone must hide the line and re-warn —
      // "saved" is no longer true of the form's current content.
      fireEvent.change(screen.getByLabelText("Про тварину"), {
        target: { value: "Лагідна, грається." },
      });
      expect(screen.queryByText(savedLineText(FIRST_TIME))).toBeNull();
      expect(dispatchUnload().prevented).toBe(true);

      // Now let this save fail: the edits are still unsaved (the view the
      // patch was computed against never changed), so the line stays
      // hidden and the warning stays on.
      client.calls.update.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      fireEvent.click(screen.getByRole("button", { name: saveLabel }));
      await screen.findByText(FAILURE);
      expect(screen.queryByText(savedLineText(FIRST_TIME))).toBeNull();
      expect(dispatchUnload().prevented).toBe(true);

      // A successful retry, 15 minutes later: idle and fully saved again —
      // no warning, and the line names *this* save's own time, not the
      // first one's.
      now = SECOND_NOW;
      const release2 = deferredUpdate(client);
      fireEvent.click(screen.getByRole("button", { name: saveLabel }));
      await act(async () =>
        release2({
          ...view(),
          description: { uk: "Лагідна, грається.", en: null },
        } as KabinetAnimalView),
      );
      await screen.findByText(savedLineText(SECOND_TIME));
      expect(screen.queryByText(savedLineText(FIRST_TIME))).toBeNull();
      expect(dispatchUnload()).toEqual({ prevented: false, returnValue: undefined });
    },
  );

  /**
   * Blocker 1 (2026-10-19 review of UW-B2): `window.location.assign` fires
   * `beforeunload` synchronously, in a real browser, before React ever gets
   * a chance to re-render and run the effect that would otherwise remove
   * the listener — so the probe has to check at that exact instant, inside
   * the `assign` call itself, not after. (happy-dom's own `assign` doesn't
   * fire `beforeunload` or stop the test's event loop, so checking only
   * after an `await` would pass either way — on `main` included — without
   * ever exercising the race.)
   */
  it("an intentional back-link leave, after the save it triggers succeeds, never warns", async () => {
    const client = fakeClient(draft());
    renderForm(draft(), { client });
    fireEvent.change(screen.getByLabelText("Про тварину"), { target: { value: "Лагідна." } });

    let preventedAtNavigation: boolean | null = null;
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {
      preventedAtNavigation = dispatchUnload().prevented;
    });

    fireEvent.click(screen.getByRole("link", { name: "← Профіль притулку" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/kabinet"));

    expect(preventedAtNavigation).toBe(false);
    assign.mockRestore();
  });

  /**
   * Blocker 2: on `/nova`, `dirty` used to be `creatable` (a name AND a
   * species), so anything typed before both existed gave no warning at all
   * — including a whole typed description. "Unsaved" must include any
   * value that differs from the empty starting form, name/species or not.
   */
  it.each([
    [
      "a description",
      () =>
        fireEvent.change(screen.getByLabelText("Про тварину"), { target: { value: "Лагідна." } }),
    ],
    ["a name", () => fireEvent.change(screen.getByLabelText("Імʼя"), { target: { value: "Л" } })],
  ] as const)(
    "/nova: typing only %s, before a name and a species both exist, still warns",
    (_field, type) => {
      renderForm(null);
      type();
      expect(dispatchUnload().prevented).toBe(true);
    },
  );

  /**
   * Blocker 3: `dirty` diffs the CURRENT fields against the server's LAST
   * KNOWN view, which a save in flight hasn't changed yet — so reverting a
   * field back to that stored value, while the save for the edit it
   * replaces is still in flight, used to read as "nothing unsaved" and
   * silently drop the warning. "Pending or queued" is its own term,
   * independent of what the fields currently say (UW-T2).
   */
  it("reverting a field to its stored value keeps the warning on while that edit's save is still in flight", async () => {
    const stored = draft({ description: { uk: "Було.", en: null } } as Partial<KabinetAnimalView>);
    const client = fakeClient(stored);
    renderForm(stored, { client });
    const description = screen.getByLabelText("Про тварину");

    fireEvent.change(description, { target: { value: "Зараз." } });
    expect(dispatchUnload().prevented).toBe(true);

    const release = deferredUpdate(client);
    fireEvent.click(screen.getByRole("button", { name: SAVE_DRAFT }));
    expect(dispatchUnload().prevented).toBe(true); // the save for "Зараз." is in flight

    // Revert to the value still on the server: `dirty` alone now reads
    // false, but the in-flight save hasn't settled.
    fireEvent.change(description, { target: { value: "Було." } });
    expect(dispatchUnload().prevented).toBe(true);

    await act(async () =>
      release(draft({ description: { uk: "Зараз.", en: null } } as Partial<KabinetAnimalView>)),
    );
    // Settled — and the revert now genuinely diverges from what the server
    // actually holds, so the warning is still correctly on, for `dirty`'s
    // own reason this time.
    expect(dispatchUnload().prevented).toBe(true);
  });

  /**
   * His recommendation on the review's blocker 3 (whether a publish request
   * in flight counts): yes. `publish()` saves first (covered by
   * `savePending` above), then makes its own, separate `transition` call —
   * by the time that one is in flight, the save it depended on has already
   * settled, so neither `dirty` nor `savePending` is still true; only
   * `publishing` is.
   */
  it("a publish request in flight keeps the warning on, after its own save already settled", async () => {
    const ready = draft({ ...complete, photos: [PHOTO] } as Partial<KabinetAnimalView>);
    const client = fakeClient(ready);
    let releaseTransition: (view: KabinetAnimalView) => void = () => {};
    client.calls.transition.mockImplementationOnce(
      () =>
        new Promise<KabinetAnimalView>((resolve) => {
          releaseTransition = resolve;
        }),
    );
    renderForm(ready, { client });

    fireEvent.click(screen.getByRole("button", { name: "Опублікувати" }));
    await waitFor(() => expect(client.calls.transition).toHaveBeenCalled());

    expect(dispatchUnload().prevented).toBe(true); // nothing left to save, but not published yet

    await act(async () =>
      releaseTransition({
        ...ready,
        listing: { kind: "published", publishedAt: NOW, confirmedAt: NOW, undoable: null },
      } as KabinetAnimalView),
    );
    expect(dispatchUnload().prevented).toBe(false);
  });

  /**
   * UW-T7: reusing `useUnsavedChanges` for drafts (UW-T1) puts a dirty
   * draft in the same shared `dirtySections` a listed card already used —
   * so «Вийти» (the header's own sign-out, `SignOutButton`'s `confirmLeave`)
   * now asks before leaving a dirty draft too, not only a dirty listed card.
   */
  it("a dirty draft also makes «Вийти» ask before signing out", () => {
    renderForm(draft());
    expect(confirmLeave(() => true)).toBe(true); // nothing unsaved: goes ahead, never asks

    fireEvent.change(screen.getByLabelText("Про тварину"), { target: { value: "Лагідна." } });
    const confirm = vi.fn(() => false);
    expect(confirmLeave(confirm)).toBe(false);
    expect(confirm).toHaveBeenCalledWith("Зміни не збережено. Все одно вийти?");
  });
});

describe("photos", () => {
  it("an upload shows its progress, then the photo; the gap list loses «фото»", async () => {
    const user = userEvent.setup();
    const client = renderForm(draft({ ...complete } as Partial<KabinetAnimalView>));
    expect(screen.getByText("Щоб опублікувати, ще потрібно: фото.")).toBeTruthy();
    let release: () => void = () => {};
    client.calls.add.mockImplementationOnce(async (_input, options) => {
      options?.context?.onUploadProgress?.({ sent: 655_360, total: 1_048_576 });
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return draft({ ...complete, photos: [PHOTO] } as Partial<KabinetAnimalView>);
    });
    await user.upload(
      screen.getByTestId("photo-file-input"),
      new File(["x"], "a.jpg", { type: "image/jpeg" }),
    );
    expect(await screen.findByText(/^Завантаження · 63\s?% · 0,6 з 1,0 МБ$/)).toBeTruthy();
    await act(async () => release());
    expect(await screen.findByText("Фото додано.")).toBeTruthy();
    expect(screen.queryByText(/Щоб опублікувати, ще потрібно/)).toBeNull();
    expect(screen.getByRole("group", { name: "Фото 1 з 1" })).toBeTruthy();
    expect(screen.getByText("Обкладинка")).toBeTruthy();
  });

  it("without a measured size, the tile says «Фото завантажується…»", async () => {
    const user = userEvent.setup();
    const client = renderForm(draft());
    client.calls.add.mockImplementationOnce(() => new Promise(() => {}));
    await user.upload(
      screen.getByTestId("photo-file-input"),
      new File(["x"], "a.jpg", { type: "image/jpeg" }),
    );
    expect(await screen.findByText("Фото завантажується…")).toBeTruthy();
  });

  it("sends the device's compressed JPEG, not the file chosen", async () => {
    const user = userEvent.setup();
    const client = renderForm(draft());
    await user.upload(
      screen.getByTestId("photo-file-input"),
      new File(["original bytes"], "IMG_0001.png", { type: "image/png" }),
    );
    await screen.findByText("Фото додано.");
    const sent = client.calls.add.mock.calls[0]?.[0] as { animalId: string; file: File };
    expect(sent.animalId).toBe(ID);
    expect(sent.file.type).toBe("image/jpeg");
    expect(new Uint8Array(await sent.file.arrayBuffer())).toEqual(
      new Uint8Array([0xff, 0xd8, 0xff]),
    );
  });

  it.each([
    [
      "heic_unsupported",
      "Цей телефон чи браузер не відкриває фото у форматі HEIC. Виберіть, будь ласка, JPG або PNG.",
    ],
    ["unreadable", "Цей файл не вдалося відкрити як фото."],
    ["too_large", "Навіть після зменшення це фото завелике. Спробуйте інше."],
  ] as const)("a device refusal (%s) is his message, with no retry", async (kind, message) => {
    const user = userEvent.setup();
    const client = renderForm(draft(), { compress: async () => ({ kind }) });
    await user.upload(
      screen.getByTestId("photo-file-input"),
      new File(["x"], "a.heic", { type: "image/heic" }),
    );
    expect(await screen.findByText(message)).toBeTruthy();
    expect(client.calls.add).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Спробувати ще раз" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Прибрати фото, яке не завантажилось" }));
    expect(screen.queryByText(message)).toBeNull();
  });

  it("a decoder that throws reads as an unreadable file, and the next photo still goes up", async () => {
    const user = userEvent.setup();
    const compress = vi
      .fn<(file: File) => Promise<CompressedPhoto>>()
      .mockRejectedValueOnce(new Error("decoder crashed"))
      .mockImplementation(okJpeg);
    const client = renderForm(draft(), { compress });
    const input = screen.getByTestId("photo-file-input");
    await user.upload(input, new File(["x"], "broken.jpg", { type: "image/jpeg" }));
    expect(await screen.findByText("Цей файл не вдалося відкрити як фото.")).toBeTruthy();
    await user.upload(input, new File(["y"], "fine.jpg", { type: "image/jpeg" }));
    expect(await screen.findByText("Фото додано.")).toBeTruthy();
    expect(client.calls.add).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["PHOTO_REJECTED", "Сайт не може використати цей файл як фото.", false],
    ["PHOTO_LIMIT_REACHED", "У цієї тварини вже 10 фото.", false],
    ["RATE_LIMITED", "Забагато фото за короткий час. Спробуйте трохи пізніше.", true],
    ["PHOTO_UPLOADS_UNAVAILABLE", "На цій версії сайту фото завантажити не можна.", false],
    ["INTERNAL_SERVER_ERROR", "Не завантажилось", true],
  ] as const)("the server's %s is his message", async (code, message, retryable) => {
    const user = userEvent.setup();
    const client = renderForm(draft());
    client.calls.add.mockRejectedValueOnce(apiError(code, { max: 10 }));
    await user.upload(
      screen.getByTestId("photo-file-input"),
      new File(["x"], "a.jpg", { type: "image/jpeg" }),
    );
    expect(await screen.findByText(message)).toBeTruthy();
    const retry = screen.queryByRole("button", { name: "Спробувати ще раз" });
    expect(retry !== null).toBe(retryable);
    if (retry === null) return;
    await user.click(retry);
    expect(await screen.findByText("Фото додано.")).toBeTruthy();
    expect(client.calls.add).toHaveBeenCalledTimes(2);
  });

  it("reorders with the tile's buttons: «Зробити обкладинкою» sends the new order", async () => {
    const user = userEvent.setup();
    const second = { ...PHOTO, storageKey: "/photos/2.jpg" };
    const client = renderForm(published({ photos: [PHOTO, second] }));
    await user.click(
      within(screen.getByRole("group", { name: "Фото 2 з 2" })).getByRole("button", {
        name: "Зробити обкладинкою",
      }),
    );
    expect(client.calls.reorder).toHaveBeenCalledWith({
      animalId: ID,
      expectedPhotoKeys: ["/photos/1.jpg", "/photos/2.jpg"],
      nextPhotoKeys: ["/photos/2.jpg", "/photos/1.jpg"],
    });
    expect(await screen.findByText("Порядок змінено.")).toBeTruthy();
  });

  it("«Перемістити вперед» and «Перемістити назад» move one place", async () => {
    const user = userEvent.setup();
    const [a, b, c] = ["/photos/1.jpg", "/photos/2.jpg", "/photos/3.jpg"].map((storageKey) => ({
      ...PHOTO,
      storageKey,
    }));
    const client = renderForm(draft({ photos: [a, b, c] } as Partial<KabinetAnimalView>));
    await user.click(
      within(screen.getByRole("group", { name: "Фото 1 з 3" })).getByRole("button", {
        name: "Перемістити назад",
      }),
    );
    expect(client.calls.reorder.mock.calls[0]?.[0]).toMatchObject({
      nextPhotoKeys: ["/photos/2.jpg", "/photos/1.jpg", "/photos/3.jpg"],
    });
    await screen.findByText("Порядок змінено.");
    await user.click(
      within(screen.getByRole("group", { name: "Фото 3 з 3" })).getByRole("button", {
        name: "Перемістити вперед",
      }),
    );
    expect(client.calls.reorder.mock.calls[1]?.[0]).toMatchObject({
      expectedPhotoKeys: ["/photos/2.jpg", "/photos/1.jpg", "/photos/3.jpg"],
      nextPhotoKeys: ["/photos/2.jpg", "/photos/3.jpg", "/photos/1.jpg"],
    });
  });

  it("a removal says the photo is off the card and the file isn't deleted at once", async () => {
    const user = userEvent.setup();
    const second = { ...PHOTO, storageKey: "/photos/2.jpg" };
    const client = renderForm(published({ photos: [PHOTO, second] }));
    expect(screen.queryByText(/Сам файл не видаляється одразу/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Прибрати фото 2" }));
    expect(client.calls.remove).toHaveBeenCalledWith({
      animalId: ID,
      expectedPhotoKeys: ["/photos/1.jpg", "/photos/2.jpg"],
      storageKey: "/photos/2.jpg",
    });
    expect(await screen.findByText("Фото прибрано.")).toBeTruthy();
    expect(
      screen.getByText(
        "Фото зникло з картки. Сам файл не видаляється одразу — якщо його треба прибрати зовсім, напишіть мені.",
      ),
    ).toBeTruthy();
  });

  it("photos changed in another window: says so and shows the current set", async () => {
    const user = userEvent.setup();
    const second = { ...PHOTO, storageKey: "/photos/2.jpg" };
    const client = renderForm(published({ photos: [PHOTO, second] }));
    client.calls.reorder.mockRejectedValueOnce(apiError("CONFLICT"));
    client.calls.byId.mockResolvedValueOnce(published({ photos: [second] }));
    await user.click(screen.getByRole("button", { name: "Зробити обкладинкою" }));
    expect(
      await screen.findByText(
        "Фото змінилися в іншому вікні. Тут — поточний набір, спробуйте ще раз.",
      ),
    ).toBeTruthy();
    expect(await screen.findByRole("group", { name: "Фото 1 з 1" })).toBeTruthy();
  });

  it("a reorder that didn't go through says the card is unchanged", async () => {
    const user = userEvent.setup();
    const second = { ...PHOTO, storageKey: "/photos/2.jpg" };
    const client = renderForm(published({ photos: [PHOTO, second] }));
    client.calls.reorder.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await user.click(screen.getByRole("button", { name: "Зробити обкладинкою" }));
    expect(
      await screen.findByText(
        "Не збереглося — на картках нічого не змінилося. Перевірте зʼєднання і спробуйте ще раз.",
      ),
    ).toBeTruthy();
  });

  it("at the cap the add tile gives way to his sentence", () => {
    const photos = Array.from({ length: 10 }, (_, index) => ({
      ...PHOTO,
      storageKey: `/photos/${index + 1}.jpg`,
    }));
    renderForm(draft({ photos } as Partial<KabinetAnimalView>));
    expect(screen.queryByRole("button", { name: "+ Фото" })).toBeNull();
    expect(screen.getByText("Це максимум — 10 фото.")).toBeTruthy();
  });

  it("captions: the on-device resize to 2000 px and the metadata stripping, both true of the pipeline", () => {
    renderForm(draft());
    expect(
      screen.getByText(
        /^Перше фото — обкладинка; щоб змінити порядок, перетягніть фото\. Для публікації потрібне хоча б одне\. Великі фото зменшуються на пристрої до 2\s?000 пікселів перед відправкою — так менше мобільного трафіку\.$/,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("З фото прибираються дані про місце зйомки та інші приховані дані."),
    ).toBeTruthy();
    // A draft carries no «Оновлено» date for a photo change to move (RH-B7).
    expect(screen.queryByText(/будь-яка зміна фото оновлює дату/)).toBeNull();
  });
});

describe("publishing", () => {
  it("publishing a complete draft announces that people can see it now", async () => {
    const user = userEvent.setup();
    const client = renderForm(
      draft({ ...complete, photos: [PHOTO] } as Partial<KabinetAnimalView>),
    );
    const publish = screen.getByRole("button", { name: "Опублікувати" });
    expect(publish.getAttribute("aria-disabled")).toBeNull();
    await user.click(publish);
    expect(client.calls.transition).toHaveBeenCalledWith({
      animalId: ID,
      event: { type: "publish" },
    });
    expect(await screen.findByText(PUBLISH_DONE)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Відкрити сторінку тварини" }).getAttribute("href"),
    ).toBe(`/tvaryny/${ID}`);
    expect(screen.getByText("Зміни зʼявляться на картці одразу після збереження.")).toBeTruthy();
  });

  it("publishing first saves what was typed, then publishes", async () => {
    const user = userEvent.setup();
    const client = renderForm(
      draft({ ...complete, photos: [PHOTO] } as Partial<KabinetAnimalView>),
    );
    fireEvent.change(screen.getByLabelText("Імʼя"), { target: { value: "Ластівочка" } });
    await user.click(screen.getByRole("button", { name: "Опублікувати" }));
    expect(client.calls.update.mock.calls[0]?.[0]).toMatchObject({
      patch: { name: "Ластівочка" },
    });
    expect(client.calls.transition).toHaveBeenCalledTimes(1);
    expect(client.calls.update.mock.invocationCallOrder[0]).toBeLessThan(
      client.calls.transition.mock.invocationCallOrder[0] ?? 0,
    );
  });

  /**
   * Each announcement is true only in its own state (docs review of #116):
   * «…щойно притулок пройде перевірку» is false for a paused or suspended
   * shelter, which has passed. Which statuses make which kind is
   * `animal-page.test.ts`'s, status by status.
   */
  const ANNOUNCED = [
    ["shown (verified)", "visible", PUBLISH_DONE],
    [NOT_VISIBLE_KINDS[0][0], NOT_VISIBLE_KINDS[0][1], PUBLISHED_NOT_SHOWN],
    [NOT_VISIBLE_KINDS[1][0], NOT_VISIBLE_KINDS[1][1], PUBLISHED_HIDDEN],
  ] as const;
  it.each(
    ANNOUNCED.flatMap(([who, visibility, announced]) =>
      WRITE_GRANTS.map(([grant, editing]) => [who, grant, visibility, announced, editing] as const),
    ),
  )(
    "a shelter %s (writes open by %s): publishing announces only what is true there",
    async (_who, _grant, visibility, announced, editing) => {
      const user = userEvent.setup();
      renderForm(draft({ ...complete, photos: [PHOTO] } as Partial<KabinetAnimalView>), {
        shelterVisibility: visibility,
        editing,
      });
      await user.click(screen.getByRole("button", { name: "Опублікувати" }));
      const shown = visibility === "visible";
      await screen.findByText(shown ? PUBLISH_DONE : NOT_SHOWN_NOW);
      expect(formStatus().textContent).toBe(announced);
      // Only a shown shelter's admin is told people see the card, or sent to its public page.
      expect(screen.queryAllByText(/Тепер картку бачать/)).toHaveLength(shown ? 1 : 0);
      expect(screen.queryAllByRole("link", { name: "Відкрити сторінку тварини" })).toHaveLength(
        shown ? 1 : 0,
      );
      // «щойно притулок пройде перевірку» only before a pass.
      expect(screen.queryAllByText(/пройде перевірку/)).toHaveLength(
        visibility === "awaiting_verification" ? 1 : 0,
      );
    },
  );

  /**
   * Review finding 4: the save before the publish went through, so K4's
   * «Не збереглося — на картках нічого не змінилося…» would be false. The
   * card is still a draft, which his `draft.notVisible` says.
   */
  it("a publish call that fails after the save says the card is still a draft, not that nothing saved", async () => {
    const user = userEvent.setup();
    const ready = draft({ ...complete, photos: [PHOTO] } as Partial<KabinetAnimalView>);
    const client = fakeClient(ready);
    client.calls.transition.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderForm(ready, { client });
    fireEvent.change(screen.getByLabelText("Імʼя"), { target: { value: "Ластівочка" } });
    await user.click(screen.getByRole("button", { name: "Опублікувати" }));
    expect(client.calls.update).toHaveBeenCalledTimes(1);
    expect(client.calls.transition).toHaveBeenCalledTimes(1);
    await screen.findByText(/^Чернетку збережено о /);
    expect(formStatus().textContent).toBe("Ті, хто шукає тварину, цю чернетку не бачать.");
    expect(screen.queryByText(/Не збереглося/)).toBeNull();
    expect(screen.getByRole("button", { name: "Опублікувати" })).toBeTruthy();
  });

  it("clicking the disabled «Опублікувати» says what is missing and publishes nothing", async () => {
    const user = userEvent.setup();
    const client = renderForm(draft());
    await user.click(screen.getByRole("button", { name: "Опублікувати" }));
    expect(client.calls.transition).not.toHaveBeenCalled();
    expect(formStatus().textContent).toBe(MISSING_ALL);
  });

  it("the server's own gap list wins (another window removed the photo)", async () => {
    const user = userEvent.setup();
    const ready = draft({ ...complete, photos: [PHOTO] } as Partial<KabinetAnimalView>);
    const client = fakeClient(ready);
    client.calls.transition.mockRejectedValueOnce(
      apiError("PUBLISH_REQUIREMENTS_UNMET", { gaps: [{ kind: "photo" }] }),
    );
    renderForm(ready, { client });
    await user.click(screen.getByRole("button", { name: "Опублікувати" }));
    expect(await screen.findByText("Щоб опублікувати, ще потрібно: фото.")).toBeTruthy();
  });

  it("published elsewhere meanwhile: says the card changed in another window", async () => {
    const user = userEvent.setup();
    const ready = draft({ ...complete, photos: [PHOTO] } as Partial<KabinetAnimalView>);
    const client = fakeClient(ready);
    client.calls.transition.mockRejectedValueOnce(apiError("ILLEGAL_TRANSITION"));
    renderForm(ready, { client });
    await user.click(screen.getByRole("button", { name: "Опублікувати" }));
    expect(
      await screen.findByText(
        "Картка змінилася в іншому вікні. Оновіть сторінку, щоб побачити поточну версію.",
      ),
    ).toBeTruthy();
  });
});

describe("a listed animal saves only when asked (T8)", () => {
  it("doesn't autosave, on a timer or on leaving a field; «Зберегти» sends the change", async () => {
    vi.useFakeTimers();
    const client = renderForm(published());
    fireEvent.click(
      within(screen.getByRole("group", { name: "Розмір" })).getByLabelText(/Великий/),
    );
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    fireEvent.blur(screen.getByLabelText("Імʼя"));
    expect(client.calls.update).not.toHaveBeenCalled();
    expect(screen.getByText("Зміни зʼявляться на картці одразу після збереження.")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    });
    expect(client.calls.update.mock.calls[0]?.[0]).toMatchObject({ patch: { size: "large" } });
  });

  it("an emptied description is refused inline and not sent", async () => {
    const user = userEvent.setup();
    const client = renderForm(published());
    await user.clear(screen.getByLabelText("Про тварину"));
    await user.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(
      screen.getByText("Картку вже публікували, тож опис не може бути порожнім."),
    ).toBeTruthy();
    expect(client.calls.update).not.toHaveBeenCalled();
  });

  it("the server's LISTING_FACT_REQUIRED lands on the description", async () => {
    const user = userEvent.setup();
    const client = fakeClient(published());
    client.calls.update.mockRejectedValueOnce(
      apiError("LISTING_FACT_REQUIRED", { field: "description" }),
    );
    renderForm(published(), { client });
    fireEvent.change(screen.getByLabelText("Про тварину"), { target: { value: "Інший опис." } });
    await user.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(
      await screen.findByText("Картку вже публікували, тож опис не може бути порожнім."),
    ).toBeTruthy();
  });

  it("on a visible card, the photo section says a photo change updates «Оновлено»", () => {
    renderForm(published());
    expect(
      screen.getByText("На картці, яку бачать люди, будь-яка зміна фото оновлює дату «Оновлено»."),
    ).toBeTruthy();
    expect(screen.getByText("Цю картку бачать люди, тож одне фото має лишитися.")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Прибрати фото 1" }).getAttribute("aria-disabled"),
    ).toBe("true");
  });

  it.each(NOT_VISIBLE_KINDS)(
    "a shelter %s is told nobody sees the card, not that changes go live",
    (_who, visibility) => {
      renderForm(published(), { shelterVisibility: visibility });
      expect(screen.getByText(NOT_SHOWN_NOW)).toBeTruthy();
      expect(screen.queryByText(/Зміни зʼявляться на картці/)).toBeNull();
    },
  );

  it("an adopted card is shown to nobody", () => {
    renderForm(
      published({ listing: { kind: "adopted", adoptedAt: NOW } } as Partial<KabinetAnimalView>),
    );
    expect(screen.getByText("Цю картку зараз ніхто не бачить.")).toBeTruthy();
    expect(screen.getByText("Удома")).toBeTruthy();
  });
});

describe("who may change what", () => {
  it("a support view sees the animal read-only: fields disabled, no save, publish or photo controls", () => {
    renderForm(draft({ ...complete, photos: [PHOTO] } as Partial<KabinetAnimalView>), {
      viewer: "support",
    });
    expect((screen.getByLabelText("Імʼя") as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Опублікувати" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Зберегти/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "+ Фото" })).toBeNull();
  });

  it("a shelter whose writes are refused sees the same read-only page", () => {
    renderForm(published(), { editing: { kind: "read_only" } });
    expect((screen.getByLabelText("Про тварину") as HTMLTextAreaElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Зберегти" })).toBeNull();
  });

  /**
   * P10 (K2 sheet, accepted): his `listed.dateUnchanged` is true once K2's
   * «Ще шукає» exists, so it left `testShelterOnly` (since deleted, his
   * 0.3a) and shows whenever writes are open, on the cards that carry the
   * date (published, reserved), in
   * the footer only an editing admin gets. Never on a draft, which has no
   * date, and never in a read-only view, which has no footer.
   */
  it("says text edits leave the date alone on a published or reserved card, with writes open", () => {
    const line =
      "Правки тексту не змінюють дату «Оновлено». Її змінює ваше підтвердження в списку тварин і будь-яка зміна фото.";
    const reserved = published({
      listing: { kind: "reserved", since: NOW, publishedAt: NOW, confirmedAt: NOW, undoable: null },
    } as Partial<KabinetAnimalView>);
    for (const view of [published(), reserved]) {
      const rendered = render(
        <AnimalForm
          initialView={view}
          editing={{ kind: "open" }}
          viewer="admin"
          shelterVisibility="visible"
          back={{ href: "/kabinet/tvaryny", label: "←" }}
          client={fakeClient(view)}
          clock={() => NOW}
        />,
      );
      expect(screen.getByText(line), view.listing.kind).toBeTruthy();
      rendered.unmount();
    }
    const cases: [string, KabinetAnimalView, AnimalFormEditing, "admin" | "support"][] = [
      [
        "a draft",
        draft({ ...complete, photos: [PHOTO] } as Partial<KabinetAnimalView>),
        { kind: "open" },
        "admin",
      ],
      ["a support view", published(), { kind: "open" }, "support"],
      ["a read-only shelter", published(), { kind: "read_only" }, "admin"],
      // Published and reserved only: an adopted or withdrawn card shows no date to keep.
      [
        "an adopted card",
        published({ listing: { kind: "adopted", adoptedAt: NOW } } as Partial<KabinetAnimalView>),
        { kind: "open" },
        "admin",
      ],
      [
        "a withdrawn card",
        published({
          listing: { kind: "withdrawn", withdrawnAt: NOW, reason: { code: "other", note: null } },
        } as Partial<KabinetAnimalView>),
        { kind: "open" },
        "admin",
      ],
    ];
    for (const [who, view, editing, viewer] of cases) {
      const rendered = render(
        <AnimalForm
          initialView={view}
          editing={editing}
          viewer={viewer}
          shelterVisibility="visible"
          back={{ href: "/kabinet/tvaryny", label: "←" }}
          client={fakeClient(view)}
          clock={() => NOW}
        />,
      );
      expect(screen.queryByText(line), who).toBeNull();
      expect(screen.queryByText(/COPY PENDING/), who).toBeNull();
      rendered.unmount();
    }
  });

  // One note for both hidden kinds: «поки її ще не бачать» claims nothing about verification.
  it.each(
    NOT_VISIBLE_KINDS.flatMap(([who, visibility]) =>
      WRITE_GRANTS.map(([grant, editing]) => [who, grant, visibility, editing] as const),
    ),
  )(
    "while a shelter %s has its cards hidden (writes open by %s), the last-photo note doesn't say people see the card",
    (_who, _grant, visibility, editing) => {
      renderForm(published(), { shelterVisibility: visibility, editing });
      expect(screen.queryByText("Цю картку бачать люди, тож одне фото має лишитися.")).toBeNull();
      const note = screen.getByText(LAST_PHOTO_KEPT_NOT_SHOWN);
      expect(
        screen.getByRole("button", { name: "Прибрати фото 1" }).getAttribute("aria-describedby"),
      ).toBe(note.id);
    },
  );
});
