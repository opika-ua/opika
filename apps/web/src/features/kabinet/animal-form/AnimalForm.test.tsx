import type { KabinetAnimalView } from "@opika/contracts";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KabinetAnimalClient } from "../../../api/kabinet-browser-client";
import type { CompressedPhoto } from "../photos/compress-photo";
import { AnimalForm, type AnimalFormEditing } from "./AnimalForm";

/**
 * K3's form, behaviour only (Test logic, not looks). Every Ukrainian string
 * asserted here is Oleksii's, transcribed from his K3 file (`k3-copy-uk.md`,
 * 2026-10-17), never read from `uk.ts`, so a drift in the catalogue fails
 * here too. The API is a fake client with the browser client's shape; what
 * the server does with each call is `handlers.test.ts`'s and
 * `photos.test.ts`'s.
 */

const NOW = new Date("2026-10-17T09:00:00.000Z");
const ID = "a1000000-0000-4000-8000-000000000001" as KabinetAnimalView["id"];
const PHOTO = { storageKey: "animals/a/1", width: 1600, height: 2000, alt: null };
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
          { ...PHOTO, storageKey: `animals/a/${current.photos.length + 2}` },
        ],
      } as KabinetAnimalView;
      return current;
    },
  );
  const reorder = vi.fn(async () => current);
  const remove = vi.fn(async () => current);
  const client = {
    shelter: {
      animals: { createDraft, update, transition, byId },
      photos: { add, reorder, remove },
    },
  } as unknown as FakeClient;
  client.calls = { createDraft, update, transition, byId, add, reorder, remove };
  return client;
}

const OPEN: AnimalFormEditing = { kind: "open", grantedBy: "allowlist" };
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
    shelterVisible?: boolean;
    compress?: (file: File) => Promise<CompressedPhoto>;
    client?: FakeClient;
  } = {},
) {
  const client = options.client ?? fakeClient(view);
  render(
    <AnimalForm
      initialView={view}
      editing={options.editing ?? OPEN}
      viewer={options.viewer ?? "admin"}
      shelterVisible={options.shelterVisible ?? true}
      back={{ href: "/kabinet", label: "← Профіль притулку" }}
      client={client}
      clock={() => NOW}
      compress={options.compress ?? okJpeg}
    />,
  );
  return client;
}

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
    expect(
      screen.getByText("Щоб опублікувати, ще потрібно: розмір, вік, опис і фото."),
    ).toBeTruthy();
  });

  it("«Зберегти чернетку» with a name and a species creates the draft and takes its address", async () => {
    const user = userEvent.setup();
    const client = renderForm(null);
    await user.type(screen.getByLabelText("Імʼя"), "Ластівка");
    await user.click(within(screen.getByRole("group", { name: "Вид" })).getByLabelText("Собака"));
    await user.click(screen.getByRole("button", { name: "Зберегти чернетку" }));
    expect(client.calls.createDraft).toHaveBeenCalledWith({ name: "Ластівка", species: "dog" });
    expect(await screen.findByRole("heading", { level: 1, name: "Ластівка" })).toBeTruthy();
    expect(window.location.pathname).toBe(`/kabinet/tvaryny/${ID}`);
    expect(
      screen.getByText(
        /Чернетку збережено о 12:00 · Ті, хто шукає тварину, цю чернетку не бачать\./,
      ),
    ).toBeTruthy();
    expect(screen.getByText("Чернетка")).toBeTruthy();
  });

  it("without a species, saving shows the species message and creates nothing", async () => {
    const user = userEvent.setup();
    const client = renderForm(null);
    await user.type(screen.getByLabelText("Імʼя"), "Ластівка");
    await user.click(screen.getByRole("button", { name: "Зберегти чернетку" }));
    expect(screen.getByText("Виберіть, собака це чи кіт, щоб зберегти чернетку.")).toBeTruthy();
    expect(client.calls.createDraft).not.toHaveBeenCalled();
  });

  it("refuses a name with braces, inline, once the field is left", async () => {
    const user = userEvent.setup();
    renderForm(null);
    await user.type(screen.getByLabelText("Імʼя"), "Бу{{}");
    await user.tab();
    expect(screen.getByText("В імені не може бути фігурних дужок.")).toBeTruthy();
  });
});

describe("a draft saves itself (T6)", () => {
  it("10 seconds after the last change, sending only what changed", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const client = renderForm(draft());
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(within(screen.getByRole("group", { name: "Розмір" })).getByLabelText(/Малий/));
    expect(client.calls.update).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(client.calls.update).toHaveBeenCalledTimes(1);
    expect(client.calls.update.mock.calls[0]?.[0]).toEqual({
      animalId: ID,
      expectedVersion: 0,
      patch: { size: "small" },
    });
  });

  it("a conflict stops the autosave and offers the current version", async () => {
    const user = userEvent.setup();
    const client = fakeClient(draft());
    client.calls.update.mockRejectedValueOnce(apiError("CONFLICT"));
    renderForm(draft(), { client });
    await user.type(screen.getByLabelText("Про тварину"), "Лагідна.");
    await user.click(screen.getByRole("button", { name: "Зберегти чернетку" }));
    expect(
      await screen.findByText(
        "Хтось змінив цю картку після того, як ви її відкрили. Ваші останні зміни не збережено. Ось поточна версія — внесіть їх ще раз.",
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Показати поточну версію" }));
    expect(client.calls.byId).toHaveBeenCalledWith({ animalId: ID });
    expect((screen.getByLabelText("Про тварину") as HTMLTextAreaElement).value).toBe("");
  });

  it("the age line quotes the card's own word once a bucket is chosen", async () => {
    const user = userEvent.setup();
    renderForm(draft());
    await user.click(
      within(screen.getByRole("group", { name: "Вік на ту дату" })).getByLabelText(/Молодий/),
    );
    expect(screen.getByText("Ті, хто шукає тварину, побачать: «молодий».")).toBeTruthy();
  });

  it("an «as of» date after today in Kyiv is refused inline and not sent", async () => {
    const user = userEvent.setup();
    const client = renderForm(draft());
    await user.click(
      within(screen.getByRole("group", { name: "Вік на ту дату" })).getByLabelText(/Молодий/),
    );
    const asOf = screen.getByLabelText("Станом на");
    await user.clear(asOf);
    await user.type(asOf, "2026-10-18");
    await user.click(screen.getByRole("button", { name: "Зберегти чернетку" }));
    expect(screen.getByText("Дата «Станом на» не може бути в майбутньому.")).toBeTruthy();
    expect(client.calls.update).not.toHaveBeenCalled();
  });
});

describe("photos and publishing", () => {
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

  it("a HEIC the browser can't open asks for a JPG and offers no retry", async () => {
    const user = userEvent.setup();
    renderForm(draft(), { compress: async () => ({ kind: "heic_unsupported" }) });
    await user.upload(
      screen.getByTestId("photo-file-input"),
      new File(["x"], "a.heic", { type: "image/heic" }),
    );
    expect(
      await screen.findByText(
        "Цей телефон чи браузер не відкриває фото у форматі HEIC. Виберіть, будь ласка, JPG або PNG.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Спробувати ще раз" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Прибрати фото, яке не завантажилось" }),
    ).toBeTruthy();
  });

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
    expect(
      await screen.findByText("Опубліковано. Тепер картку бачать ті, хто шукає тварину."),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Відкрити сторінку тварини" }).getAttribute("href"),
    ).toBe(`/tvaryny/${ID}`);
  });

  it("for a shelter whose cards are hidden, the announcement claims no audience", async () => {
    const user = userEvent.setup();
    renderForm(draft({ ...complete, photos: [PHOTO] } as Partial<KabinetAnimalView>), {
      shelterVisible: false,
    });
    await user.click(screen.getByRole("button", { name: "Опублікувати" }));
    const status = (await screen.findAllByRole("status")).find(
      (node) => node.textContent === "Опубліковано",
    );
    expect(status).toBeTruthy();
    expect(screen.queryByText(/Тепер картку бачать/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Відкрити сторінку тварини" })).toBeNull();
  });

  it("clicking the disabled «Опублікувати» says what is missing and publishes nothing", async () => {
    const user = userEvent.setup();
    const client = renderForm(draft());
    await user.click(screen.getByRole("button", { name: "Опублікувати" }));
    expect(client.calls.transition).not.toHaveBeenCalled();
    expect(
      screen.getAllByText("Щоб опублікувати, ще потрібно: розмір, вік, опис і фото.").length,
    ).toBeGreaterThan(1);
  });

  it("reorders with the tile's buttons: «Зробити обкладинкою» sends the new order", async () => {
    const user = userEvent.setup();
    const second = { ...PHOTO, storageKey: "animals/a/2" };
    const client = renderForm(published({ photos: [PHOTO, second] }));
    await user.click(
      within(screen.getByRole("group", { name: "Фото 2 з 2" })).getByRole("button", {
        name: "Зробити обкладинкою",
      }),
    );
    expect(client.calls.reorder).toHaveBeenCalledWith({
      animalId: ID,
      expectedPhotoKeys: ["animals/a/1", "animals/a/2"],
      nextPhotoKeys: ["animals/a/2", "animals/a/1"],
    });
  });
});

describe("a listed animal saves only when asked (T8)", () => {
  it("doesn't autosave; «Зберегти» sends the change", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const client = renderForm(published());
    await user.click(
      within(screen.getByRole("group", { name: "Розмір" })).getByLabelText(/Великий/),
    );
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(client.calls.update).not.toHaveBeenCalled();
    expect(screen.getByText("Зміни зʼявляться на картці одразу після збереження.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Зберегти" }));
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

  it("a shelter outside the allowlist sees the same read-only page", () => {
    renderForm(published(), { editing: { kind: "read_only" } });
    expect((screen.getByLabelText("Про тварину") as HTMLTextAreaElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Зберегти" })).toBeNull();
  });

  /** CG-Q1: the pending-copy folder mounts only on an allowlist grant to the shelter's own admin. */
  it("mounts the test-shelter lines only for the allowlisted shelter's own admin", () => {
    const line =
      "Правки тексту не змінюють дату «Оновлено». Її змінює ваше підтвердження в списку тварин і будь-яка зміна фото.";
    const { unmount } = render(
      <AnimalForm
        initialView={published()}
        editing={{ kind: "open", grantedBy: "allowlist" }}
        viewer="admin"
        shelterVisible
        back={{ href: "/kabinet", label: "←" }}
        client={fakeClient(published())}
        clock={() => NOW}
      />,
    );
    expect(screen.getByText(line)).toBeTruthy();
    unmount();
    for (const [editing, viewer] of [
      [{ kind: "open", grantedBy: "open_policy" }, "admin"],
      [{ kind: "open", grantedBy: "allowlist" }, "support"],
      [{ kind: "read_only" }, "admin"],
    ] as const) {
      const rendered = render(
        <AnimalForm
          initialView={published()}
          editing={editing}
          viewer={viewer}
          shelterVisible
          back={{ href: "/kabinet", label: "←" }}
          client={fakeClient(published())}
          clock={() => NOW}
        />,
      );
      expect(screen.queryByText(line), `${editing.kind} ${viewer}`).toBeNull();
      rendered.unmount();
    }
  });

  it("while the shelter's cards are hidden, the last-photo note is the allowlisted stand-in, not «бачать люди»", () => {
    renderForm(published(), { shelterVisible: false });
    expect(screen.queryByText("Цю картку бачать люди, тож одне фото має лишитися.")).toBeNull();
    expect(
      screen.getByText(
        /^\[COPY PENDING\] "This card is published, so it keeps at least one photo\."/,
      ),
    ).toBeTruthy();
  });
});
