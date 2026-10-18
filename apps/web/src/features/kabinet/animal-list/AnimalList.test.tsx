import type { KabinetAnimalView, KabinetCursor, KabinetShelterView } from "@opika/contracts";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KabinetAnimalListClient } from "../../../api/kabinet-browser-client";
import type { AnimalFormEditing } from "../animal-form/AnimalForm";
import { AnimalList } from "./AnimalList";
import type { AnimalListPageData, AnimalRow } from "./list-model";

/**
 * K2's list, behaviour only (Test logic, not looks). Every Ukrainian string
 * asserted here is Oleksii's, transcribed from his files (`k2-copy-uk.md`,
 * 2026-10-18, and the K3, K4 and R-UI files it reuses), never read from
 * `uk.ts`. The API is a fake client with the browser client's shape; what
 * the server does with each call is `handlers.test.ts`'s and
 * `listing-moves-table.test.ts`'s (#126).
 */

const NOW = new Date("2026-10-18T09:00:00.000Z");
const DAY = 86_400_000;
const OLD = new Date(NOW.getTime() - 40 * DAY);
const PHOTO = { storageKey: "/photos/1.jpg", width: 1600, height: 2000, alt: null };
const AGE = { kind: "declared_bucket", bucket: "young", declaredAt: new Date("2026-09-01") };

const idOf = (n: number) => `a1000000-0000-4000-8000-00000000000${n}` as AnimalRow["id"];

const row = (n: number, overrides: Partial<AnimalRow>): AnimalRow =>
  ({
    id: idOf(n),
    name: "Без імені",
    species: "dog",
    sex: "male",
    size: "medium",
    age: AGE,
    listing: { kind: "draft" },
    lastUpdatedAt: NOW,
    coverPhoto: PHOTO,
    freshness: null,
    publishGaps: [],
    ...overrides,
  }) as AnimalRow;

const PUBLISHED = row(1, {
  name: "Рекс",
  listing: { kind: "published", publishedAt: OLD, confirmedAt: OLD, undoable: null },
  freshness: { kind: "stale", updatedAt: OLD, ageDays: 40 },
});
const RESERVED = row(2, {
  name: "Мурка",
  species: "cat",
  sex: "female",
  size: "small",
  listing: {
    kind: "reserved",
    since: NOW,
    publishedAt: OLD,
    confirmedAt: new Date(NOW.getTime() - 3 * DAY),
    undoable: null,
  },
  freshness: { kind: "fresh", updatedAt: new Date(NOW.getTime() - 3 * DAY), ageDays: 3 },
});
const READY_DRAFT = row(3, { name: "Ластівка" });
const GAPPY_DRAFT = row(4, {
  name: "Сірко",
  sex: "unknown",
  size: null,
  age: null,
  coverPhoto: null,
  publishGaps: [{ kind: "size" }, { kind: "age" }, { kind: "description" }, { kind: "photo" }],
} as Partial<AnimalRow>);
const ADOPTED = row(5, {
  name: "Бім",
  listing: { kind: "adopted", adoptedAt: new Date("2026-09-12T10:00:00Z") },
});
const WITHDRAWN = row(6, {
  name: "Дуся",
  listing: {
    kind: "withdrawn",
    withdrawnAt: new Date("2026-10-02T10:00:00Z"),
    reason: { code: "transferred", note: null },
  },
});

const COUNTS = { draft: 2, published: 1, reserved: 1, adopted: 1, withdrawn: 1 };
const FIRST: AnimalListPageData = {
  items: [PUBLISHED, RESERVED, READY_DRAFT, GAPPY_DRAFT, ADOPTED, WITHDRAWN],
  nextCursor: null,
  counts: COUNTS,
  staleCount: 1,
};

/** The animal a call answers: the row's facts with a new listing. */
const viewOf = (from: AnimalRow, listing: KabinetAnimalView["listing"]): KabinetAnimalView =>
  ({
    id: from.id,
    name: from.name,
    species: from.species,
    sex: from.sex,
    size: from.size,
    age: from.age,
    description: { uk: "Опис", en: null },
    photos: from.coverPhoto === null ? [] : [from.coverPhoto],
    vaccination: { source: "shelter_declared", state: "unknown", declaredAt: NOW },
    spayNeuter: { source: "shelter_declared", state: "unknown", declaredAt: NOW },
    documentReadiness: { kind: "unknown" },
    listing,
    publicLocation: null,
    createdAt: NOW,
    lastUpdatedAt: from.lastUpdatedAt,
    version: 1,
  }) as KabinetAnimalView;

const apiError = (code: string, data?: unknown) => Object.assign(new Error(code), { code, data });

type Fn = ReturnType<typeof vi.fn>;
type Handlers = Partial<
  Record<
    "list" | "byId" | "transition" | "confirm" | "undoConfirm" | "deleteDraft" | "resume",
    (input: never) => Promise<unknown>
  >
>;

function fakeClient(handlers: Handlers = {}) {
  const calls = {
    list: vi.fn(handlers.list ?? (async () => FIRST)),
    byId: vi.fn(handlers.byId ?? (async () => viewOf(PUBLISHED, PUBLISHED.listing))),
    transition: vi.fn(handlers.transition ?? (async () => viewOf(PUBLISHED, PUBLISHED.listing))),
    confirm: vi.fn(handlers.confirm ?? (async () => ({}))),
    undoConfirm: vi.fn(handlers.undoConfirm ?? (async () => ({}))),
    deleteDraft: vi.fn(handlers.deleteDraft ?? (async () => ({}))),
    resume: vi.fn(handlers.resume ?? (async () => ({}))),
  } satisfies Record<string, Fn>;
  const client = {
    shelter: {
      animals: {
        list: calls.list,
        byId: calls.byId,
        transition: calls.transition,
        confirm: calls.confirm,
        undoConfirm: calls.undoConfirm,
        deleteDraft: calls.deleteDraft,
      },
      profile: { resume: calls.resume },
    },
  } as unknown as KabinetAnimalListClient;
  return { client, calls };
}

const VERIFIED = { status: "verified", since: new Date("2025-03-14T10:00:00Z") } as const;
const shelterIn = (verification: KabinetShelterView["verification"]) =>
  ({
    id: "51000000-0000-4000-8000-000000000001",
    displayName: "Притулок «Домівка»",
    verification,
  }) as unknown as KabinetShelterView;

const OPEN: AnimalFormEditing = { kind: "open", grantedBy: "allowlist" };

function renderList({
  first = FIRST,
  verification = VERIFIED,
  editing = OPEN,
  viewer = "admin",
  handlers = {},
  clock = () => NOW,
}: {
  first?: AnimalListPageData;
  verification?: KabinetShelterView["verification"];
  editing?: AnimalFormEditing;
  viewer?: "admin" | "support";
  handlers?: Handlers;
  clock?: () => Date;
} = {}) {
  const { client, calls } = fakeClient(handlers);
  render(
    <AnimalList
      shelter={shelterIn(verification)}
      first={first}
      viewer={viewer}
      editing={editing}
      client={client}
      clock={clock}
    />,
  );
  return calls;
}

const rowOf = (name: string) => screen.getByRole("listitem", { name });
const inRow = (name: string) => within(rowOf(name));
const openMenu = async (name: string) => {
  await userEvent.click(inRow(name).getByRole("button", { name: "Ще" }));
};
const statusText = () => screen.getByRole("status").textContent;
const alertText = () =>
  screen
    .getAllByRole("alert")
    .map((node) => node.textContent)
    .join(" ");

afterEach(() => {
  vi.useRealTimers();
});

describe("the page: header, rows, order note", () => {
  it("the title, the caption counting every card, and «Додати тварину» to K3's create page", () => {
    renderList();
    expect(screen.getByRole("heading", { level: 1, name: "Тварини" })).toBeTruthy();
    expect(screen.getByText("Притулок «Домівка» · 6 карток")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Додати тварину" }).getAttribute("href")).toBe(
      "/kabinet/tvaryny/nova",
    );
    expect(
      screen.getByText(
        "Порядок у галереї — за датою: людина сама обирає, спочатку найсвіжіші картки чи ті, хто чекає найдовше. Повнота картки впливає лише на порядок у стрічці. Тут порядок змінити не можна, і просування немає.",
      ),
    ).toBeTruthy();
  });

  it("each row: the name, the status chip, the meta line and the line that says where it stands", () => {
    renderList();
    expect(inRow("Рекс").getByText("Опубліковано")).toBeTruthy();
    expect(inRow("Рекс").getByText("Собака · Хлопчик · Середній · молодий")).toBeTruthy();
    expect(inRow("Рекс").getByText("Оновлено 40 днів тому")).toBeTruthy();
    expect(inRow("Мурка").getByText("Домовляються")).toBeTruthy();
    expect(inRow("Мурка").getByText("Кіт · Дівчинка · Малий · молода")).toBeTruthy();
    expect(inRow("Сірко").getByText("Собака · Не записано")).toBeTruthy();
    expect(inRow("Сірко").getByText("Ті, хто шукає тварину, цю чернетку не бачать.")).toBeTruthy();
    expect(inRow("Бім").getByText("Удома з 12 вересня")).toBeTruthy();
    expect(
      inRow("Дуся").getByText("Знято з показу 2 жовтня · переїхала до іншого притулку"),
    ).toBeTruthy();
  });
});

describe("filters and counts (N3)", () => {
  it("one chip per kind with its inventory count, «Усі» pressed", () => {
    renderList();
    const chips = within(screen.getByRole("group", { name: "Показати" })).getAllByRole("button");
    expect(chips.map((chip) => chip.textContent)).toEqual([
      "Усі · 6",
      "Чернетки · 2",
      "Опубліковано · 1",
      "Домовляються · 1",
      "Удома · 1",
      "Знято з показу · 1",
    ]);
    expect(chips.map((chip) => chip.getAttribute("aria-pressed"))).toEqual([
      "true",
      "false",
      "false",
      "false",
      "false",
      "false",
    ]);
  });

  it("a chip asks the server for that kind and shows its answer", async () => {
    const calls = renderList({
      handlers: {
        list: async () => ({ ...FIRST, items: [READY_DRAFT, GAPPY_DRAFT] }),
      },
    });
    await userEvent.click(screen.getByRole("button", { name: "Чернетки · 2" }));
    expect(calls.list).toHaveBeenCalledWith({
      filter: { kind: "listing", listing: "draft" },
      cursor: null,
      limit: 50,
    });
    expect(screen.getByRole("button", { name: "Чернетки · 2" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.queryByRole("listitem", { name: "Рекс" })).toBeNull();
    expect(rowOf("Ластівка")).toBeTruthy();
  });

  it("a group with no cards says so", async () => {
    renderList({ handlers: { list: async () => ({ ...FIRST, items: [] }) } });
    await userEvent.click(screen.getByRole("button", { name: "Удома · 1" }));
    expect(screen.getByText("У цій групі поки немає карток.")).toBeTruthy();
  });

  it("a list that fails to load says so, and «Спробувати ще раз» asks again", async () => {
    let fail = true;
    const calls = renderList({
      handlers: {
        list: async () => {
          if (fail) throw new TypeError("Failed to fetch");
          return FIRST;
        },
      },
    });
    await userEvent.click(screen.getByRole("button", { name: "Опубліковано · 1" }));
    expect(
      screen.getByText("Список не завантажився. Перевірте зʼєднання і спробуйте ще раз."),
    ).toBeTruthy();
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Спробувати ще раз" }));
    expect(calls.list).toHaveBeenCalledTimes(2);
    expect(rowOf("Рекс")).toBeTruthy();
  });
});

describe("the stale strip (N5)", () => {
  it("names how many, with the caption while the shelter is verified", () => {
    renderList();
    expect(screen.getByText("1 картку ви не підтверджували понад 30 днів.")).toBeTruthy();
    expect(
      screen.getByText(
        "Ті, хто шукає тварину, бачать на них давню дату. Якщо нічого не змінилося, достатньо натиснути «Ще шукає» чи «Ще домовляються».",
      ),
    ).toBeTruthy();
  });

  it("«Показати ці N» opens the server's stale filter; «Показати всі» leaves it", async () => {
    const calls = renderList({
      first: { ...FIRST, staleCount: 3 },
      handlers: { list: async () => ({ ...FIRST, items: [PUBLISHED], staleCount: 3 }) },
    });
    await userEvent.click(screen.getByRole("button", { name: "Показати ці 3" }));
    expect(calls.list).toHaveBeenLastCalledWith({
      filter: { kind: "stale" },
      cursor: null,
      limit: 50,
    });
    expect(screen.queryByRole("listitem", { name: "Мурка" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Показати всі" }));
    expect(calls.list).toHaveBeenLastCalledWith({
      filter: { kind: "all" },
      cursor: null,
      limit: 50,
    });
  });

  it("no stale cards, no strip", () => {
    renderList({ first: { ...FIRST, staleCount: 0 } });
    expect(screen.queryByText(/ви не підтверджували/)).toBeNull();
    expect(screen.queryByRole("button", { name: /^Показати ці/ })).toBeNull();
  });
});

describe("listing moves: each request, and its refusal", () => {
  it("«Почали домовлятися» reserves: the request, the row in place, his line, the counts read again", async () => {
    const calls = renderList({
      handlers: {
        transition: async () =>
          viewOf(PUBLISHED, {
            kind: "reserved",
            since: NOW,
            publishedAt: OLD,
            confirmedAt: OLD,
            undoable: null,
          }),
      },
    });
    await userEvent.click(inRow("Рекс").getByRole("button", { name: "Почали домовлятися" }));
    expect(calls.transition).toHaveBeenCalledWith({
      animalId: PUBLISHED.id,
      event: { type: "reserve" },
    });
    expect(statusText()).toBe("Рекс: почали домовлятися.");
    expect(inRow("Рекс").getByText("Домовляються")).toBeTruthy();
    // Commitment #7: a reserve keeps the confirmation, so the row keeps its date.
    expect(inRow("Рекс").getByText("Оновлено 40 днів тому")).toBeTruthy();
    expect(calls.list).toHaveBeenCalledWith({ filter: { kind: "all" }, cursor: null, limit: 1 });
  });

  it("a move the card no longer allows: his «змінилася в іншому вікні»", async () => {
    renderList({
      handlers: { transition: async () => Promise.reject(apiError("ILLEGAL_TRANSITION")) },
    });
    await userEvent.click(inRow("Рекс").getByRole("button", { name: "Почали домовлятися" }));
    expect(alertText()).toContain(
      "Картка змінилася в іншому вікні. Оновіть сторінку, щоб побачити поточну версію.",
    );
    expect(inRow("Рекс").getByText("Опубліковано")).toBeTruthy();
  });

  it("«Не домовилися — знову шукає» (in «Ще») releases; a missing card is his not-found sentence", async () => {
    const calls = renderList({
      handlers: { transition: async () => Promise.reject(apiError("NOT_FOUND")) },
    });
    await openMenu("Мурка");
    await userEvent.click(
      inRow("Мурка").getByRole("button", { name: "Не домовилися — знову шукає" }),
    );
    expect(calls.transition).toHaveBeenCalledWith({
      animalId: RESERVED.id,
      event: { type: "release" },
    });
    expect(alertText()).toContain(
      "Цієї тварини немає у вашому списку: картку видалено або посилання неправильне.",
    );
  });

  it("«Повернути в чернетки» restores", async () => {
    const calls = renderList({
      handlers: { transition: async () => viewOf(WITHDRAWN, { kind: "draft" }) },
    });
    await userEvent.click(inRow("Дуся").getByRole("button", { name: "Повернути в чернетки" }));
    expect(calls.transition).toHaveBeenCalledWith({
      animalId: WITHDRAWN.id,
      event: { type: "restore_to_draft" },
    });
    expect(statusText()).toBe("Дуся: повернуто в чернетки.");
    expect(inRow("Дуся").getByText("Чернетка")).toBeTruthy();
  });

  it("too many actions: his rate-limit sentence", async () => {
    renderList({
      handlers: { transition: async () => Promise.reject(apiError("TOO_MANY_REQUESTS")) },
    });
    await userEvent.click(inRow("Дуся").getByRole("button", { name: "Повернути в чернетки" }));
    expect(alertText()).toContain(
      "Забагато дій за короткий час. Зачекайте хвилину й спробуйте ще раз.",
    );
  });

  it("no answer at all: the row is read again, and a move that landed is reported as done", async () => {
    const calls = renderList({
      handlers: {
        transition: async () => Promise.reject(new TypeError("Failed to fetch")),
        byId: async () => viewOf(WITHDRAWN, { kind: "draft" }),
      },
    });
    await userEvent.click(inRow("Дуся").getByRole("button", { name: "Повернути в чернетки" }));
    expect(calls.byId).toHaveBeenCalledWith({ animalId: WITHDRAWN.id });
    expect(statusText()).toBe("Дуся: повернуто в чернетки.");
  });

  it("no answer, and the re-read shows nothing moved: his «Не вдалося»", async () => {
    renderList({
      handlers: {
        transition: async () => Promise.reject(new TypeError("Failed to fetch")),
        byId: async () => viewOf(WITHDRAWN, WITHDRAWN.listing),
      },
    });
    await userEvent.click(inRow("Дуся").getByRole("button", { name: "Повернути в чернетки" }));
    expect(alertText()).toContain("Не вдалося. Перевірте зʼєднання і спробуйте ще раз.");
  });
});

describe("publishing from the list", () => {
  it.each([
    ["verified", VERIFIED, "Опубліковано. Тепер картку бачать ті, хто шукає тварину."],
    [
      "pending",
      { status: "pending", since: NOW } as const,
      "Опубліковано. Ті, хто шукає тварину, побачать картку, щойно притулок пройде перевірку.",
    ],
    [
      "paused",
      {
        status: "paused",
        since: NOW,
        reason: { code: "relocation", note: null },
      } as const,
      "Опубліковано. Цю картку зараз ніхто не бачить.",
    ],
  ])(
    "a ready draft publishes; a %s shelter hears only what is true for it (his answer 5)",
    async (_s, verification, line) => {
      const calls = renderList({
        verification,
        handlers: {
          transition: async () =>
            viewOf(READY_DRAFT, {
              kind: "published",
              publishedAt: NOW,
              confirmedAt: NOW,
              undoable: null,
            }),
        },
      });
      await userEvent.click(inRow("Ластівка").getByRole("button", { name: "Опублікувати" }));
      expect(calls.transition).toHaveBeenCalledWith({
        animalId: READY_DRAFT.id,
        event: { type: "publish" },
      });
      expect(statusText()).toBe(line);
    },
  );

  it("a draft with gaps: «Опублікувати» stays focusable but does nothing, the gaps written next to it", async () => {
    const calls = renderList();
    const button = inRow("Сірко").getByRole("button", { name: "Опублікувати" });
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(
      inRow("Сірко").getByText("Щоб опублікувати, ще потрібно: розмір, вік, опис і фото."),
    ).toBeTruthy();
    expect(button).toHaveProperty("disabled", false);
    await userEvent.click(button);
    expect(calls.transition).not.toHaveBeenCalled();
  });

  it("the server's gaps, if it finds any: his «Щоб опублікувати…» with them", async () => {
    renderList({
      handlers: {
        transition: async () =>
          Promise.reject(apiError("PUBLISH_REQUIREMENTS_UNMET", { gaps: [{ kind: "photo" }] })),
      },
    });
    await userEvent.click(inRow("Ластівка").getByRole("button", { name: "Опублікувати" }));
    expect(alertText()).toContain("Щоб опублікувати, ще потрібно: фото.");
  });
});

describe("«Уже вдома» (his answer 8a)", () => {
  it("confirms in a dialog that says it can't be undone, then adopts", async () => {
    const calls = renderList({
      handlers: { transition: async () => viewOf(RESERVED, { kind: "adopted", adoptedAt: NOW }) },
    });
    await userEvent.click(inRow("Мурка").getByRole("button", { name: "Уже вдома" }));
    const dialog = screen.getByRole("dialog", { name: "Мурка уже вдома?" });
    expect(
      within(dialog).getByText(
        "Картка зникне з галереї та стрічки, а її сторінка повідомлятиме, що тварини там уже немає. У вашому списку картка лишиться з позначкою «Удома». Скасувати це не можна: якщо тварина повернеться, додайте її як нову картку.",
      ),
    ).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: "Так, уже вдома" }));
    expect(calls.transition).toHaveBeenCalledWith({
      animalId: RESERVED.id,
      event: { type: "adopt" },
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(statusText()).toBe("Мурка: уже вдома.");
    expect(inRow("Мурка").getByText("Удома")).toBeTruthy();
  });

  it("from a published card it is under «Ще»; a refusal stays in the dialog", async () => {
    renderList({
      handlers: { transition: async () => Promise.reject(apiError("ILLEGAL_TRANSITION")) },
    });
    await openMenu("Рекс");
    await userEvent.click(inRow("Рекс").getByRole("button", { name: "Уже вдома" }));
    const dialog = screen.getByRole("dialog", { name: "Рекс уже вдома?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Так, уже вдома" }));
    expect(within(dialog).getByRole("alert").textContent).toBe(
      "Картка змінилася в іншому вікні. Оновіть сторінку, щоб побачити поточну версію.",
    );
  });

  it("«Скасувати» closes it with nothing sent", async () => {
    const calls = renderList();
    await userEvent.click(inRow("Мурка").getByRole("button", { name: "Уже вдома" }));
    await userEvent.click(screen.getByRole("button", { name: "Скасувати" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(calls.transition).not.toHaveBeenCalled();
  });
});

describe("«Зняти з показу» with a reason (his answer 10)", () => {
  it("offers four reasons, not «знайшла дім іншим шляхом», and points a homed animal to «Уже вдома»", async () => {
    renderList();
    await openMenu("Рекс");
    await userEvent.click(inRow("Рекс").getByRole("button", { name: "Зняти з показу" }));
    const dialog = screen.getByRole("dialog", { name: "Зняти з показу: Рекс?" });
    expect(
      within(dialog).getByText("Якщо тварина знайшла дім, позначте краще «Уже вдома»."),
    ).toBeTruthy();
    const options = within(within(dialog).getByLabelText("Причина") as HTMLElement)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toEqual([
      "Оберіть причину",
      "переїхала до іншого притулку",
      "тварини не стало",
      "додано помилково",
      "інша причина",
    ]);
  });

  it("without a reason nothing is sent: the select is marked invalid and focused", async () => {
    const calls = renderList();
    await openMenu("Рекс");
    await userEvent.click(inRow("Рекс").getByRole("button", { name: "Зняти з показу" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Зняти з показу" }));
    const select = within(dialog).getByLabelText("Причина");
    expect(select.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(select);
    expect(calls.transition).not.toHaveBeenCalled();
  });

  it("with a reason and a note: the request carries both, trimmed, and the row shows them", async () => {
    const calls = renderList({
      handlers: {
        transition: async () =>
          viewOf(PUBLISHED, {
            kind: "withdrawn",
            withdrawnAt: NOW,
            reason: { code: "transferred", note: "до Києва" },
          }),
      },
    });
    await openMenu("Рекс");
    await userEvent.click(inRow("Рекс").getByRole("button", { name: "Зняти з показу" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.selectOptions(within(dialog).getByLabelText("Причина"), "transferred");
    await userEvent.type(within(dialog).getByLabelText(/Коментар/), "  до Києва  ");
    await userEvent.click(within(dialog).getByRole("button", { name: "Зняти з показу" }));
    expect(calls.transition).toHaveBeenCalledWith({
      animalId: PUBLISHED.id,
      event: { type: "withdraw", reason: { code: "transferred", note: "до Києва" } },
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(statusText()).toBe("Рекс: знято з показу.");
    expect(
      inRow("Рекс").getByText(
        "Знято з показу 18 жовтня · переїхала до іншого притулку · «до Києва»",
      ),
    ).toBeTruthy();
  });

  it("writes refused by the policy: his «Змінювати дані… поки не можна»", async () => {
    renderList({
      handlers: {
        transition: async () => Promise.reject(apiError("SHELTER_WRITES_NOT_YET_AVAILABLE")),
      },
    });
    await openMenu("Рекс");
    await userEvent.click(inRow("Рекс").getByRole("button", { name: "Зняти з показу" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.selectOptions(within(dialog).getByLabelText("Причина"), "other");
    await userEvent.click(within(dialog).getByRole("button", { name: "Зняти з показу" }));
    expect(within(dialog).getByRole("alert").textContent).toBe(
      "Змінювати дані в кабінеті поки не можна — для цього напишіть мені.",
    );
  });
});

describe("«Видалити чернетку» (K2-T4, his answers 2 and 8b)", () => {
  it("is on every draft and on nothing else", async () => {
    renderList();
    for (const name of ["Ластівка", "Сірко"]) {
      await openMenu(name);
      expect(inRow(name).getByRole("button", { name: "Видалити чернетку" })).toBeTruthy();
    }
    for (const name of ["Рекс", "Мурка", "Бім", "Дуся"]) {
      await openMenu(name);
      expect(inRow(name).queryByRole("button", { name: "Видалити чернетку" })).toBeNull();
    }
  });

  it("the photos line only when the draft has photos", async () => {
    renderList();
    const PHOTOS =
      "Файли фото не видаляються одразу — якщо їх треба прибрати зовсім, напишіть мені.";
    await openMenu("Ластівка");
    await userEvent.click(inRow("Ластівка").getByRole("button", { name: "Видалити чернетку" }));
    let dialog = screen.getByRole("dialog", { name: "Видалити чернетку «Ластівка»?" });
    expect(within(dialog).getByText("Вона назавжди зникне з вашого списку.")).toBeTruthy();
    expect(within(dialog).getByText(PHOTOS)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: "Скасувати" }));
    await openMenu("Сірко");
    await userEvent.click(inRow("Сірко").getByRole("button", { name: "Видалити чернетку" }));
    dialog = screen.getByRole("dialog", { name: "Видалити чернетку «Сірко»?" });
    expect(within(dialog).queryByText(PHOTOS)).toBeNull();
  });

  it("deletes: the request, the row gone, his line", async () => {
    const calls = renderList();
    await openMenu("Сірко");
    await userEvent.click(inRow("Сірко").getByRole("button", { name: "Видалити чернетку" }));
    await userEvent.click(screen.getByRole("button", { name: "Видалити" }));
    expect(calls.deleteDraft).toHaveBeenCalledWith({ animalId: GAPPY_DRAFT.id });
    expect(screen.queryByRole("listitem", { name: "Сірко" })).toBeNull();
    expect(statusText()).toBe("Чернетку «Сірко» видалено.");
  });

  /**
   * Commitment #2: the server answers one WAS_PUBLISHED for a draft that was
   * published and for one an adopter's swipe or reveal references (K-Q9), and
   * the screen says one sentence for it, whatever came with it.
   */
  it.each([
    ["no data", undefined],
    ["any data", { reason: "has_activity", swipes: 3 }],
  ])("a refused delete is his one sentence (%s), and the draft stays", async (_what, data) => {
    renderList({
      handlers: { deleteDraft: async () => Promise.reject(apiError("WAS_PUBLISHED", data)) },
    });
    await openMenu("Ластівка");
    await userEvent.click(inRow("Ластівка").getByRole("button", { name: "Видалити чернетку" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Видалити" }));
    expect(within(dialog).getByRole("alert").textContent).toBe(
      "Цю картку вже публікували, тож видалити її не можна. Вона лишається у вашому списку як чернетка, і ті, хто шукає тварину, її не бачать.",
    );
    expect(rowOf("Ластівка")).toBeTruthy();
  });
});

describe("«Ще шукає» / «Ще домовляються» and the 8-second undo (N4)", () => {
  const confirmedNow = (from: AnimalRow) =>
    viewOf(from, {
      kind: from.listing.kind as "published",
      publishedAt: OLD,
      confirmedAt: NOW,
      undoable: { previousConfirmedAt: OLD, confirmedAt: NOW },
    } as KabinetAnimalView["listing"]);

  it("each card its own: «Ще шукає» on a published one, «Ще домовляються» on a reserved one, none elsewhere", () => {
    renderList();
    expect(inRow("Рекс").getByRole("button", { name: "Ще шукає" })).toBeTruthy();
    expect(inRow("Мурка").getByRole("button", { name: "Ще домовляються" })).toBeTruthy();
    for (const name of ["Ластівка", "Бім", "Дуся"]) {
      expect(inRow(name).queryByRole("button", { name: /^Ще (шукає|домовляються)$/ })).toBeNull();
    }
  });

  it("confirms one animal, the date becomes today, and the undo counts down from 8 and then goes", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(NOW);
    const calls = renderList({
      clock: () => new Date(),
      handlers: {
        confirm: async () => ({
          animal: confirmedNow(PUBLISHED),
          undoUntil: new Date(NOW.getTime() + 13_000),
        }),
      },
    });
    await act(async () => {
      fireEvent.click(inRow("Рекс").getByRole("button", { name: "Ще шукає" }));
    });
    expect(calls.confirm).toHaveBeenCalledWith({ animalId: PUBLISHED.id });
    expect(calls.confirm).toHaveBeenCalledTimes(1);
    expect(inRow("Рекс").getByText("Підтверджено сьогодні")).toBeTruthy();
    expect(inRow("Рекс").getByText("Оновлено сьогодні")).toBeTruthy();
    expect(inRow("Рекс").getByRole("button", { name: "Скасувати · 8 с" })).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(3_000);
    });
    expect(inRow("Рекс").getByRole("button", { name: "Скасувати · 5 с" })).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    expect(inRow("Рекс").queryByRole("button", { name: /^Скасувати/ })).toBeNull();
    expect(inRow("Рекс").queryByText("Підтверджено сьогодні")).toBeNull();
    expect(inRow("Рекс").getByRole("button", { name: "Ще шукає" })).toBeTruthy();
  });

  /** One animal per tap (commitment #7): a second tap while the first is in flight sends nothing. */
  it("a second tap while the confirmation is in flight sends nothing", async () => {
    let answer: (value: unknown) => void = () => {};
    const calls = renderList({
      handlers: {
        confirm: () =>
          new Promise((resolve) => {
            answer = resolve;
          }),
      },
    });
    const button = inRow("Рекс").getByRole("button", { name: "Ще шукає" });
    await userEvent.click(button);
    await userEvent.click(button);
    expect(calls.confirm).toHaveBeenCalledTimes(1);
    await act(async () => {
      answer({ animal: confirmedNow(PUBLISHED), undoUntil: NOW });
    });
    expect(inRow("Рекс").getByText("Підтверджено сьогодні")).toBeTruthy();
  });

  it("undo inside the window: the request, his line, and the previous date back", async () => {
    const calls = renderList({
      handlers: {
        confirm: async () => ({ animal: confirmedNow(PUBLISHED), undoUntil: NOW }),
        undoConfirm: async () => viewOf(PUBLISHED, PUBLISHED.listing),
      },
    });
    await userEvent.click(inRow("Рекс").getByRole("button", { name: "Ще шукає" }));
    await userEvent.click(inRow("Рекс").getByRole("button", { name: "Скасувати · 8 с" }));
    expect(calls.undoConfirm).toHaveBeenCalledWith({ animalId: PUBLISHED.id });
    expect(statusText()).toBe("Скасовано: на картці знову попередня дата.");
    expect(inRow("Рекс").getByText("Оновлено 40 днів тому")).toBeTruthy();
    expect(inRow("Рекс").queryByRole("button", { name: /^Скасувати/ })).toBeNull();
  });

  it("undo after the server's window (or after a newer write): his «вже не можна», today's date stays", async () => {
    renderList({
      handlers: {
        confirm: async () => ({ animal: confirmedNow(RESERVED), undoUntil: NOW }),
        undoConfirm: async () => Promise.reject(apiError("UNDO_EXPIRED")),
        // What the server holds then: today's confirmation (the screen reads it before speaking).
        byId: async () => confirmedNow(RESERVED),
      },
    });
    await userEvent.click(inRow("Мурка").getByRole("button", { name: "Ще домовляються" }));
    await userEvent.click(inRow("Мурка").getByRole("button", { name: "Скасувати · 8 с" }));
    expect(alertText()).toContain(
      "Скасувати вже не можна: час минув або картку змінено. На картці — сьогоднішня дата.",
    );
    expect(inRow("Мурка").getByText("Оновлено сьогодні")).toBeTruthy();
    expect(inRow("Мурка").queryByRole("button", { name: /^Скасувати/ })).toBeNull();
  });

  it("a confirmation the server refuses: his «Не підтверджено», the date unchanged", async () => {
    renderList({
      handlers: { confirm: async () => Promise.reject(apiError("INTERNAL_SERVER_ERROR")) },
    });
    await userEvent.click(inRow("Рекс").getByRole("button", { name: "Ще шукає" }));
    expect(alertText()).toContain(
      "Не підтверджено: дата на картці не змінилася. Перевірте зʼєднання і спробуйте ще раз.",
    );
    expect(inRow("Рекс").getByText("Оновлено 40 днів тому")).toBeTruthy();
  });

  it("no answer: re-read; a date that moved is confirmed (no undo offered), one that didn't is «Не підтверджено»", async () => {
    let stored = viewOf(PUBLISHED, PUBLISHED.listing);
    const calls = renderList({
      handlers: {
        confirm: async () => Promise.reject(new TypeError("Failed to fetch")),
        byId: async () => stored,
      },
    });
    await userEvent.click(inRow("Рекс").getByRole("button", { name: "Ще шукає" }));
    expect(calls.byId).toHaveBeenCalledWith({ animalId: PUBLISHED.id });
    expect(alertText()).toContain("Не підтверджено: дата на картці не змінилася.");

    stored = confirmedNow(PUBLISHED);
    await userEvent.click(inRow("Рекс").getByRole("button", { name: "Ще шукає" }));
    expect(statusText()).toBe("Підтверджено сьогодні");
    expect(inRow("Рекс").getByText("Оновлено сьогодні")).toBeTruthy();
    expect(inRow("Рекс").queryByRole("button", { name: /^Скасувати/ })).toBeNull();
  });
});

/**
 * Review of #129, note 1 (Oleksii, verbatim: "no claims after a lost
 * answer"). When no answer came back and the re-read fails too, nothing is
 * known about the card, so the screen says only that: his K3 «Картка не
 * завантажилась…», never a line about what the date is or whether the move
 * happened. An UNDO_EXPIRED is read again first, since an undo whose answer
 * was lost may have landed.
 */
describe("after a lost answer, only what is known", () => {
  const LOST = () => Promise.reject(new TypeError("Failed to fetch"));
  const CARD_DIDNT_LOAD = "Картка не завантажилась. Перевірте зʼєднання і спробуйте ще раз.";
  const confirmedToday = viewOf(PUBLISHED, {
    kind: "published",
    publishedAt: OLD,
    confirmedAt: NOW,
    undoable: { previousConfirmedAt: OLD, confirmedAt: NOW },
  });

  it("a confirmation whose answer and re-read are both lost: no «дата … не змінилася»", async () => {
    renderList({ handlers: { confirm: LOST, byId: LOST } });
    await userEvent.click(inRow("Рекс").getByRole("button", { name: "Ще шукає" }));
    expect(alertText()).toContain(CARD_DIDNT_LOAD);
    expect(alertText()).not.toContain("не змінилася");
  });

  it("an undo that landed with its answer lost, then retried: the previous date, not «сьогоднішня дата»", async () => {
    let stored: KabinetAnimalView | null = null;
    const calls = renderList({
      handlers: {
        confirm: async () => ({ animal: confirmedToday, undoUntil: NOW }),
        // The first undo lands on the server; its answer and the re-read are lost.
        undoConfirm: async () => {
          if (stored === null) {
            stored = viewOf(PUBLISHED, PUBLISHED.listing);
            return LOST();
          }
          return Promise.reject(apiError("UNDO_EXPIRED"));
        },
        byId: async () => (calls.undoConfirm.mock.calls.length < 2 ? LOST() : stored),
      },
    });
    await userEvent.click(inRow("Рекс").getByRole("button", { name: "Ще шукає" }));
    await userEvent.click(inRow("Рекс").getByRole("button", { name: "Скасувати · 8 с" }));
    expect(alertText()).toContain(CARD_DIDNT_LOAD);
    expect(alertText()).not.toContain("Не вдалося");
    await userEvent.click(inRow("Рекс").getByRole("button", { name: /^Скасувати · \d с$/ }));
    expect(alertText()).not.toContain("сьогоднішня дата");
    expect(statusText()).toBe("Скасовано: на картці знову попередня дата.");
    expect(inRow("Рекс").getByText("Оновлено 40 днів тому")).toBeTruthy();
  });

  it("UNDO_EXPIRED and the re-read shows today's date: his «…На картці — сьогоднішня дата.»", async () => {
    renderList({
      handlers: {
        confirm: async () => ({ animal: confirmedToday, undoUntil: NOW }),
        undoConfirm: async () => Promise.reject(apiError("UNDO_EXPIRED")),
        byId: async () => confirmedToday,
      },
    });
    await userEvent.click(inRow("Рекс").getByRole("button", { name: "Ще шукає" }));
    await userEvent.click(inRow("Рекс").getByRole("button", { name: "Скасувати · 8 с" }));
    expect(alertText()).toContain(
      "Скасувати вже не можна: час минув або картку змінено. На картці — сьогоднішня дата.",
    );
  });

  it("UNDO_EXPIRED and the re-read lost: nothing about the date", async () => {
    renderList({
      handlers: {
        confirm: async () => ({ animal: confirmedToday, undoUntil: NOW }),
        undoConfirm: async () => Promise.reject(apiError("UNDO_EXPIRED")),
        byId: LOST,
      },
    });
    await userEvent.click(inRow("Рекс").getByRole("button", { name: "Ще шукає" }));
    await userEvent.click(inRow("Рекс").getByRole("button", { name: "Скасувати · 8 с" }));
    expect(alertText()).toContain(CARD_DIDNT_LOAD);
    expect(alertText()).not.toContain("сьогоднішня дата");
  });

  it("a move whose answer and re-read are both lost: no «Не вдалося»", async () => {
    renderList({ handlers: { transition: LOST, byId: LOST } });
    await userEvent.click(inRow("Дуся").getByRole("button", { name: "Повернути в чернетки" }));
    expect(alertText()).toContain(CARD_DIDNT_LOAD);
    expect(alertText()).not.toContain("Не вдалося");
  });

  it("a move whose answer is lost and the card is gone: his not-found sentence", async () => {
    renderList({
      handlers: { transition: LOST, byId: async () => Promise.reject(apiError("NOT_FOUND")) },
    });
    await userEvent.click(inRow("Дуся").getByRole("button", { name: "Повернути в чернетки" }));
    expect(alertText()).toContain(
      "Цієї тварини немає у вашому списку: картку видалено або посилання неправильне.",
    );
  });

  it("a delete whose answer and re-read are both lost: no «Не вдалося», the row kept", async () => {
    renderList({ handlers: { deleteDraft: LOST, byId: LOST } });
    await openMenu("Сірко");
    await userEvent.click(inRow("Сірко").getByRole("button", { name: "Видалити чернетку" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Видалити" }));
    expect(within(dialog).getByRole("alert").textContent).toBe(CARD_DIDNT_LOAD);
    expect(rowOf("Сірко")).toBeTruthy();
  });
});

describe("keyset «Показати ще»", () => {
  const CURSOR = "c1" as KabinetCursor;

  it("asks for the next page by its cursor and appends it", async () => {
    const calls = renderList({
      first: { ...FIRST, items: [PUBLISHED], nextCursor: CURSOR },
      handlers: { list: async () => ({ ...FIRST, items: [RESERVED], nextCursor: null }) },
    });
    await userEvent.click(screen.getByRole("button", { name: "Показати ще" }));
    expect(calls.list).toHaveBeenCalledWith({ filter: { kind: "all" }, cursor: CURSOR, limit: 50 });
    expect(rowOf("Рекс")).toBeTruthy();
    expect(rowOf("Мурка")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Показати ще" })).toBeNull();
  });

  /**
   * Review of #129, note 2 (Oleksii, verbatim: "«Показати ще» must reset with
   * the filter chip"): a chip changed while «Показати ще» is in flight starts
   * the new filter at its first page, and the old filter's late page is
   * dropped rather than appended under the new chip.
   */
  it("a chip changed while «Показати ще» is in flight: the new filter's first page, the old page dropped", async () => {
    let lateMore: (page: AnimalListPageData) => void = () => {};
    const calls = renderList({
      first: { ...FIRST, items: [PUBLISHED], nextCursor: CURSOR },
      handlers: {
        list: (input: { filter: { kind: string }; cursor: KabinetCursor | null }) =>
          input.cursor === CURSOR
            ? new Promise<AnimalListPageData>((resolve) => {
                lateMore = resolve;
              })
            : Promise.resolve({ ...FIRST, items: [READY_DRAFT, GAPPY_DRAFT], nextCursor: null }),
      } as Handlers,
    });
    await userEvent.click(screen.getByRole("button", { name: "Показати ще" }));
    await userEvent.click(screen.getByRole("button", { name: "Чернетки · 2" }));
    expect(calls.list).toHaveBeenLastCalledWith({
      filter: { kind: "listing", listing: "draft" },
      cursor: null,
      limit: 50,
    });
    expect(rowOf("Ластівка")).toBeTruthy();
    await act(async () => {
      lateMore({ ...FIRST, items: [ADOPTED, WITHDRAWN], nextCursor: "c2" as KabinetCursor });
    });
    expect(
      within(screen.getByRole("region", { name: "Тварини" }))
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(["Ластівка", "Сірко"]);
    expect(screen.queryByRole("button", { name: "Показати ще" })).toBeNull();
  });

  it("a cursor the server no longer accepts starts the list over", async () => {
    const answers = [
      () => Promise.reject(apiError("INVALID_CURSOR")),
      async () => ({ ...FIRST, nextCursor: null }),
    ];
    const calls = renderList({
      first: { ...FIRST, items: [PUBLISHED], nextCursor: CURSOR },
      handlers: { list: async () => (answers.shift() ?? answers[0])?.() },
    });
    await userEvent.click(screen.getByRole("button", { name: "Показати ще" }));
    expect(calls.list).toHaveBeenLastCalledWith({
      filter: { kind: "all" },
      cursor: null,
      limit: 50,
    });
    expect(rowOf("Дуся")).toBeTruthy();
  });

  it("a failed page says so and offers the same request again", async () => {
    renderList({
      first: { ...FIRST, items: [PUBLISHED], nextCursor: CURSOR },
      handlers: { list: async () => Promise.reject(new TypeError("Failed to fetch")) },
    });
    await userEvent.click(screen.getByRole("button", { name: "Показати ще" }));
    expect(
      screen.getByText("Список не завантажився. Перевірте зʼєднання і спробуйте ще раз."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Спробувати ще раз" })).toBeTruthy();
  });
});

describe("empty list", () => {
  const EMPTY = {
    items: [],
    nextCursor: null,
    counts: { draft: 0, published: 0, reserved: 0, adopted: 0, withdrawn: 0 },
    staleCount: 0,
  };

  it("his empty card, «Додати першу тварину» and the caption about a draft", () => {
    renderList({ first: EMPTY });
    expect(screen.getByRole("heading", { name: "Тут поки немає тварин." })).toBeTruthy();
    expect(
      screen.getByText("Додайте першу. Ті, хто шукає тварину, побачать картку після публікації."),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Додати першу тварину" }).getAttribute("href")).toBe(
      "/kabinet/tvaryny/nova",
    );
    expect(
      screen.getByText(
        "Щоб зберегти чернетку, потрібні імʼя та вид — решту можна дописати пізніше.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Показати" })).toBeNull();
  });

  it("a shelter nobody can see: no «побачать картку», the line that says why instead", () => {
    renderList({ first: EMPTY, verification: { status: "pending", since: NOW } });
    expect(screen.queryByText(/побачать картку після публікації/)).toBeNull();
    expect(
      screen.getByText("Ваші тварини зʼявляться в галереї, щойно притулок пройде перевірку."),
    ).toBeTruthy();
  });
});

/**
 * His answer 5: a line that says people see a card shows only while the
 * shelter is verified; otherwise one line says why. Each line transcribed
 * from his K2, K4 and R-UI files.
 */
describe("when nobody can see the cards", () => {
  const SEEN_LINES = [
    /Ті, хто шукає тварину, бачать на них давню дату/,
    /побачать картку після публікації/,
  ];

  it.each([
    [
      "paused",
      {
        status: "paused",
        since: new Date("2026-10-10T09:00:00Z"),
        reason: { code: "relocation", note: null },
      },
      [
        "Прийом на паузі з 10 жовтня 2026 р. · Переїзд",
        "Поки прийом на паузі, ваших тварин не бачать ті, хто шукає.",
      ],
    ],
    [
      "pending",
      { status: "pending", since: NOW },
      ["Ваші тварини зʼявляться в галереї, щойно притулок пройде перевірку."],
    ],
    [
      "under review",
      { status: "under_review", since: NOW },
      ["Ваші тварини зʼявляться в галереї, щойно притулок пройде перевірку."],
    ],
    [
      "rejected",
      { status: "rejected", at: NOW, reason: { code: "insufficient_evidence", note: null } },
      ["Тварин притулку не буде в галереї, доки перевірку не пройдено."],
    ],
    [
      "suspended",
      { status: "suspended", at: NOW, reason: { code: "unresponsive", note: null } },
      ["Поки притулок призупинено, його тварин немає в галереї."],
    ],
  ] as const)(
    "%s: the line that says why, and no line saying people see the cards",
    (_s, verification, lines) => {
      renderList({ verification: verification as KabinetShelterView["verification"] });
      for (const line of lines) expect(screen.getByText(line)).toBeTruthy();
      for (const seen of SEEN_LINES) expect(screen.queryByText(seen)).toBeNull();
      // The strip's own fact stays: it is about confirmations, not about who sees what.
      expect(screen.getByText("1 картку ви не підтверджували понад 30 днів.")).toBeTruthy();
    },
  );

  it("verified: no such line", () => {
    renderList();
    expect(screen.queryByText(/щойно притулок пройде перевірку/)).toBeNull();
    expect(screen.queryByText(/на паузі/)).toBeNull();
  });

  it("paused: «Відновити прийом тварин» resumes, and the banner goes", async () => {
    const calls = renderList({
      verification: { status: "paused", since: NOW, reason: { code: "relocation", note: null } },
      handlers: { resume: async () => shelterIn(VERIFIED) },
    });
    await userEvent.click(screen.getByRole("button", { name: "Відновити прийом тварин" }));
    expect(calls.resume).toHaveBeenCalledWith({});
    expect(statusText()).toBe("Прийом відновлено. Ваших тварин знову видно.");
    expect(screen.queryByText(/Поки прийом на паузі/)).toBeNull();
  });

  it("a refused resume: his «Звідси прийом зараз не відновити»", async () => {
    renderList({
      verification: { status: "paused", since: NOW, reason: { code: "relocation", note: null } },
      handlers: { resume: async () => Promise.reject(apiError("ILLEGAL_TRANSITION")) },
    });
    await userEvent.click(screen.getByRole("button", { name: "Відновити прийом тварин" }));
    expect(alertText()).toContain(
      "Звідси прийом зараз не відновити: статус притулку змінився. Напишіть мені.",
    );
  });
});

describe("the support view (S5): everything visible, nothing writes", () => {
  it("every action disabled, no «Додати тварину», no resume; «Редагувати» still opens K3", async () => {
    const calls = renderList({
      viewer: "support",
      editing: { kind: "read_only" },
      verification: { status: "paused", since: NOW, reason: { code: "relocation", note: null } },
    });
    expect(screen.queryByRole("link", { name: "Додати тварину" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Відновити прийом тварин" })).toBeNull();
    const confirm = inRow("Рекс").getByRole("button", { name: "Ще шукає" });
    const reserve = inRow("Рекс").getByRole("button", { name: "Почали домовлятися" });
    for (const button of [confirm, reserve]) {
      expect(button.getAttribute("aria-disabled")).toBe("true");
      await userEvent.click(button);
    }
    await openMenu("Рекс");
    const withdraw = inRow("Рекс").getByRole("button", { name: "Зняти з показу" });
    expect(withdraw.getAttribute("aria-disabled")).toBe("true");
    await userEvent.click(withdraw);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(calls.confirm).not.toHaveBeenCalled();
    expect(calls.transition).not.toHaveBeenCalled();
    expect(inRow("Рекс").getByRole("link", { name: "Редагувати" }).getAttribute("href")).toBe(
      `/kabinet/tvaryny/${PUBLISHED.id}`,
    );
  });
});

describe("«Ще» is a disclosure", () => {
  it("opens and closes, says so, and Escape closes it with focus back on «Ще»", async () => {
    renderList();
    const more = inRow("Рекс").getByRole("button", { name: "Ще" });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    const edit = inRow("Рекс").getByRole("link", { name: "Редагувати" });
    edit.focus();
    await userEvent.keyboard("{Escape}");
    expect(more.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(more);
  });

  it("the row's repeated buttons are described by the animal's name (P4)", () => {
    renderList();
    const name = inRow("Рекс").getByRole("heading", { name: "Рекс" });
    for (const label of ["Ще", "Ще шукає", "Почали домовлятися"]) {
      expect(
        inRow("Рекс").getByRole("button", { name: label }).getAttribute("aria-describedby"),
      ).toContain(name.id);
    }
  });
});
