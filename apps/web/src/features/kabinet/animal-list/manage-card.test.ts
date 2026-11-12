import { describe, expect, it } from "vitest";
import type { AnimalRow } from "./list-model";
import { type AnimalManageCard, toAnimalManageCard } from "./manage-card";

/**
 * The card's view model: what each status may show. Every Ukrainian string is transcribed from the
 * owner's sources (the K2 copy file, the card spec, the 2026-11-12 approval), never read from `uk.ts`.
 */

const NOW = new Date("2026-11-12T09:00:00.000Z");
const DAY = 86_400_000;
const ID = "a1000000-0000-4000-8000-000000000001" as AnimalRow["id"];
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);

const row = (overrides: Partial<AnimalRow> = {}): AnimalRow =>
  ({
    id: ID,
    name: "Рекс",
    species: "dog",
    sex: "male",
    size: "medium",
    age: { kind: "declared_bucket", bucket: "young", declaredAt: new Date("2026-09-01T00:00:00Z") },
    listing: { kind: "draft" },
    lastUpdatedAt: NOW,
    coverPhoto: null,
    freshness: null,
    publishGaps: [],
    ...overrides,
  }) as AnimalRow;

const published = (days: number) =>
  row({
    listing: {
      kind: "published",
      publishedAt: daysAgo(60),
      confirmedAt: daysAgo(days),
      undoable: null,
    },
    freshness: null,
  });
const reserved = (days: number) =>
  row({
    listing: {
      kind: "reserved",
      since: daysAgo(1),
      publishedAt: daysAgo(60),
      confirmedAt: daysAgo(days),
      undoable: null,
    },
  });
const ADOPTED = row({ listing: { kind: "adopted", adoptedAt: new Date("2026-09-12T10:00:00Z") } });
const WITHDRAWN = row({
  listing: {
    kind: "withdrawn",
    withdrawnAt: new Date("2026-10-02T10:00:00Z"),
    reason: { code: "transferred", note: null },
  },
});

const card = (from: AnimalRow) => toAnimalManageCard(from, NOW);
const menuLabels = (model: AnimalManageCard) =>
  "statusMenu" in model ? model.statusMenu.items.map((item) => item.label) : null;

describe("each status carries only what the spec allows", () => {
  it.each([
    ["draft", row(), ["publish", "more", "notice"]],
    ["published", published(3), ["freshness", "confirm", "statusMenu", "more"]],
    ["reserved", reserved(3), ["freshness", "confirm", "statusMenu", "more"]],
    ["adopted", ADOPTED, ["closedLine"]],
    ["withdrawn", WITHDRAWN, ["closedLine", "statusMenu"]],
  ] as const)("%s", (status, from, own) => {
    const model = card(from);
    expect(model.status).toBe(status);
    const shared = ["id", "name", "editHref", "photo", "meta", "status"];
    expect(Object.keys(model).sort()).toEqual([...shared, ...own].sort());
  });
});

describe("the status menu: the moves each state allows, named as the spec names them", () => {
  it.each([
    ["published", published(3), ["Домовляються", "Уже вдома…", "Зняти з показу…"]],
    ["reserved", reserved(3), ["Опубліковано", "Уже вдома…", "Зняти з показу…"]],
    ["withdrawn", WITHDRAWN, ["Повернути в чернетки"]],
    ["draft", row(), null],
    ["adopted", ADOPTED, null],
  ] as const)("%s", (_status, from, labels) => {
    expect(menuLabels(card(from))).toEqual(labels);
  });

  it("each item says how it runs: reserve and release undoable, adopt and withdraw through a dialog, restore at once", () => {
    const runs = [published(3), reserved(3), WITHDRAWN].flatMap((from) => {
      const model = card(from);
      return "statusMenu" in model
        ? model.statusMenu.items.map((item) =>
            item.kind === "undoable"
              ? `${item.event}:undo=${item.undo}`
              : `${item.event}:${item.kind}`,
          )
        : [];
    });
    expect(runs).toEqual([
      "reserve:undo=release",
      "adopt:confirm_dialog",
      "withdraw:reason_dialog",
      "release:undo=reserve",
      "adopt:confirm_dialog",
      "withdraw:reason_dialog",
      "restore_to_draft:instant",
    ]);
  });

  it("the status button's name: the status, then what it does, with the animal's name", () => {
    const model = card(published(3));
    expect(model.status === "published" && model.statusMenu.label).toBe(
      "Статус: Опубліковано. Змінити статус Рекс",
    );
  });
});

describe("the confirm button: on every visible card, filled once the date is aging or stale", () => {
  it.each([
    [0, "fresh", "quiet", "Оновлено сьогодні"],
    [7, "fresh", "quiet", "Оновлено 7 днів тому"],
    [8, "aging", "prompt", "Оновлено 8 днів тому"],
    [30, "aging", "prompt", "Оновлено 30 днів тому"],
    [31, "stale", "prompt", "Оновлено 31 день тому"],
  ] as const)("%i days: %s, %s", (days, kind, emphasis, label) => {
    const model = card(published(days));
    if (model.status !== "published") throw new Error("not published");
    expect(model.freshness).toEqual({ kind, label });
    expect(model.confirm).toEqual({ label: "Ще шукає", emphasis });
  });

  it("a reserved card's own label", () => {
    const model = card(reserved(12));
    expect(model.status === "reserved" && model.confirm).toEqual({
      label: "Ще домовляються",
      emphasis: "prompt",
    });
  });
});

describe("the ⋯ menu", () => {
  it("a visible card links its public page", () => {
    for (const from of [published(3), reserved(3)]) {
      const model = card(from);
      expect("more" in model && model.more).toEqual({ kind: "site_links", href: `/tvaryny/${ID}` });
    }
  });

  it("a draft's holds only its delete; adopted and withdrawn have none", () => {
    const draft = card(row());
    expect(draft.status === "draft" && draft.more).toEqual({ kind: "delete_draft" });
    expect("more" in card(ADOPTED)).toBe(false);
    expect("more" in card(WITHDRAWN)).toBe(false);
  });
});

describe("the draft's «Опублікувати»", () => {
  it("ready with nothing missing; blocked with the gaps in his sentence otherwise", () => {
    expect(card(row()).status === "draft" && card(row())).toMatchObject({
      publish: { kind: "ready" },
      notice: "Ті, хто шукає тварину, цю чернетку не бачать.",
    });
    const gappy = card(row({ publishGaps: [{ kind: "age" }, { kind: "photo" }] }));
    expect(gappy.status === "draft" && gappy.publish).toEqual({
      kind: "blocked",
      gaps: [{ kind: "age" }, { kind: "photo" }],
      sentence: "Щоб опублікувати, ще потрібно: вік і фото.",
    });
  });
});

describe("the closed states keep their line (owner, 2026-11-12)", () => {
  it("adopted: «Удома з …»; withdrawn: the date and the reason", () => {
    expect(card(ADOPTED)).toMatchObject({ closedLine: "Удома з 12 вересня" });
    expect(card(WITHDRAWN)).toMatchObject({
      closedLine: "Знято з показу 2 жовтня · переведено до іншого притулку",
    });
  });
});

describe("photo, name and «Редагувати» open the edit page; the meta line is the shared one", () => {
  it("every status", () => {
    for (const from of [row(), published(3), reserved(3), ADOPTED, WITHDRAWN]) {
      expect(card(from)).toMatchObject({
        editHref: `/kabinet/tvaryny/${ID}`,
        meta: "Собака · хлопчик · молодий · середній",
      });
    }
  });
});
