import type { KabinetAnimalView, KabinetPhotoCropView } from "@opika/contracts";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KabinetAnimalClient } from "../../../api/kabinet-browser-client";
import { PhotoSection, refillOrder } from "./PhotoSection";

// Real `animals/` keys (the crop needs one); next/image's own loader refuses them outside Next.
vi.mock("next/image", () => ({
  default: (props: { src: string; alt: string }) => <img src={props.src} alt={props.alt} />,
}));

const NOW = new Date("2026-11-12T09:00:00.000Z");
const ID = "a1000000-0000-4000-8000-000000000001" as KabinetAnimalView["id"];
const key = (n: number) => `animals/a1/p${n}`;
const older = (storageKey: string): KabinetPhotoCropView => ({
  storageKey,
  framing: { kind: "attention" },
  source: { kind: "variants_only" },
});

const view = (
  keys: readonly string[],
  overrides: Partial<KabinetAnimalView> = {},
  crops: (storageKey: string) => KabinetPhotoCropView = older,
): KabinetAnimalView =>
  ({
    id: ID,
    name: "Ластівка",
    species: "dog",
    sex: "male",
    size: "medium",
    coatLength: null,
    age: null,
    description: null,
    photos: keys.map((storageKey) => ({ storageKey, width: 1600, height: 2000, alt: null })),
    photoCrops: keys.map(crops),
    temperament: [],
    colour: null,
    medicalNotes: null,
    vaccination: { source: "shelter_declared", state: "unknown", declaredAt: NOW },
    spayNeuter: { source: "shelter_declared", state: "unknown", declaredAt: NOW },
    documentReadiness: { kind: "unknown" },
    listing: { kind: "draft" },
    publicLocation: null,
    createdAt: NOW,
    lastUpdatedAt: NOW,
    version: 0,
    ...overrides,
  }) as unknown as KabinetAnimalView;

const apiError = (code: string) => Object.assign(new Error(code), { code });
const keysOf = (animal: KabinetAnimalView) => animal.photos.map((photo) => photo.storageKey);
const three = () => view([key(1), key(2), key(3)]);

type RemoveInput = { animalId: string; expectedPhotoKeys: string[]; storageKey: string };

function setup(start: KabinetAnimalView = three(), editable = true) {
  let current = start;
  // The fake server keeps the listing and answers with the photos it now holds.
  const holding = (keys: readonly string[]) => {
    current = view(keys, { listing: current.listing } as Partial<KabinetAnimalView>);
    return current;
  };
  const remove = vi.fn(async (input: RemoveInput, _options?: unknown) =>
    holding(keysOf(current).filter((k) => k !== input.storageKey)),
  );
  const reorder = vi.fn(async (input: { nextPhotoKeys: string[] }) => holding(input.nextPhotoKeys));
  const add = vi.fn(async () => holding([...keysOf(current), key(99)]));
  const byId = vi.fn(async () => current);
  const calls = { remove, reorder, add, byId };
  const client = {
    shelter: { animals: { byId }, photos: { remove, reorder, add, crop: vi.fn() } },
  } as unknown as KabinetAnimalClient;
  function Harness() {
    const [animal, setAnimal] = useState(start);
    return (
      <PhotoSection
        animal={animal}
        editable={editable}
        shelterVisibility="visible"
        client={client}
        onView={setAnimal}
        reload={async () => {
          const fresh = await byId();
          setAnimal(fresh);
          return fresh;
        }}
        compress={async () => ({
          kind: "ok",
          file: new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" }),
          width: 1600,
          height: 2000,
        })}
      />
    );
  }
  const utils = render(<Harness />);
  return { calls, ...utils, setServer: (next: KabinetAnimalView) => (current = next) };
}

/** The photos on screen, in their order, by storage key. */
const shown = () =>
  [...document.querySelectorAll("li[data-photo-slot] img")].map((img) => img.getAttribute("src"));
const removeButton = (n: number) => screen.getByRole("button", { name: `Прибрати фото ${n}` });
const cropButton = (n: number) => screen.queryByRole("button", { name: `Обрізати фото ${n}` });
const undo = () => screen.getByRole("button", { name: "Повернути" });
/** Lets queued promises (the write queue, the fake server) settle. */
const settle = async () => {
  for (let i = 0; i < 10; i += 1) await act(async () => {});
};

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_BASE_URL", "https://img.example.test");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("the tile pill", () => {
  it("every photo has crop and «×», named by its number; the first photo's chip says it is the cover", () => {
    setup();
    for (const n of [1, 2, 3]) {
      const tile = screen.getByRole("group", { name: `Фото ${n} з 3` });
      expect(
        within(tile)
          .getAllByRole("button")
          .map((button) => button.getAttribute("aria-label")),
      ).toEqual([`Обрізати фото ${n}`, `Прибрати фото ${n}`]);
    }
    expect(screen.getByText("1 · Обкладинка")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Дії з фото/ })).toBeNull();
    const hint = screen.getByText(
      "Утримуйте й перетягніть фото, щоб змінити порядок. Перше фото – обкладинка.",
    );
    // The count shares the hint's line.
    expect(screen.getByText("3 з 10").parentElement).toBe(hint.parentElement);
  });

  it("Tab goes crop, remove, then the next photo, then the add tile", async () => {
    setup(view([key(1), key(2)]));
    const order: (string | null)[] = [];
    for (let i = 0; i < 6; i += 1) {
      await userEvent.tab();
      order.push(document.activeElement?.getAttribute("aria-label") ?? null);
    }
    expect(order.slice(1, 5)).toEqual([
      "Обрізати фото 1",
      "Прибрати фото 1",
      "Обрізати фото 2",
      "Прибрати фото 2",
    ]);
    // The info «?» comes first; after the photos, the add tile.
    expect(order[0]).toBe("Про фото");
    expect(document.activeElement?.textContent).toContain("Додати фото");
  });

  it.each([
    [
      "withheld (the support view)",
      (k: string): KabinetPhotoCropView => ({ ...older(k), source: { kind: "withheld" } }),
    ],
    ["a seed key with no R2 object", older],
  ] as const)("no crop is offered for %s, «×» still is", (what, crops) => {
    const keys = what.startsWith("a seed") ? ["seed-photos/dog-1.jpg"] : [key(1)];
    setup(view(keys, {}, crops));
    expect(cropButton(1)).toBeNull();
    expect(removeButton(1)).toBeTruthy();
  });

  it("an older real photo (no kept source) is offered a crop; a photo with no crop entry is not", () => {
    setup(view([key(1), key(2)], { photoCrops: [older(key(1))] } as Partial<KabinetAnimalView>));
    expect(cropButton(1)).toBeTruthy();
    expect(cropButton(2)).toBeNull();
  });

  it("a read-only view has no pill and no hint", () => {
    setup(three(), false);
    expect(screen.queryAllByRole("button", { name: /фото \d/ })).toHaveLength(0);
    expect(screen.queryByText(/Перетягніть/)).toBeNull();
  });

  it.each(["touch", "mouse"] as const)(
    "a %s press on the crop button never lifts the photo",
    (pointerType) => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const { calls } = setup();
      const crop = cropButton(1) as HTMLElement;
      fireEvent.pointerDown(crop, {
        button: 0,
        pointerId: 1,
        pointerType,
        clientX: 10,
        clientY: 10,
      });
      fireEvent.pointerMove(window, { pointerId: 1, pointerType, clientX: 40, clientY: 60 });
      act(() => {
        vi.advanceTimersByTime(600);
      });
      fireEvent.pointerUp(window, { pointerId: 1, clientX: 40, clientY: 60 });
      expect(screen.queryByText(/підняте/)).toBeNull();
      expect(calls.reorder).not.toHaveBeenCalled();
    },
  );

  it("on a card people see, the last photo's «×» is blocked and says why", () => {
    setup(
      view([key(1)], {
        listing: { kind: "published", publishedAt: NOW, confirmedAt: NOW, undoable: null },
      } as Partial<KabinetAnimalView>),
    );
    const note = screen.getByText("Цю картку бачать люди, тож одне фото має лишитися.");
    expect(removeButton(1).getAttribute("aria-disabled")).toBe("true");
    expect(removeButton(1).getAttribute("aria-describedby")).toBe(note.id);
    fireEvent.click(removeButton(1));
    expect(screen.queryByText("Фото прибрано")).toBeNull();
  });
});

describe("the limit", () => {
  it("at the cap the add tile becomes his note", () => {
    setup(view(Array.from({ length: 10 }, (_, i) => key(i + 1))));
    expect(screen.queryByRole("button", { name: /^Додати фото/ })).toBeNull();
    expect(
      screen.getByText("Досягнуто ліміту: 10 фото. Приберіть одне, щоб додати нове."),
    ).toBeTruthy();
    expect(screen.getByText("10 з 10")).toBeTruthy();
  });

  it("removing one at the cap brings the add tile back; adding then sends the remove first", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { calls } = setup(view(Array.from({ length: 10 }, (_, i) => key(i + 1))));
    fireEvent.click(removeButton(10));
    expect(screen.getByText("9 з 10")).toBeTruthy();
    expect(screen.queryByText(/Досягнуто ліміту/)).toBeNull();
    fireEvent.change(screen.getByTestId("photo-file-input"), {
      target: { files: [new File(["x"], "a.jpg", { type: "image/jpeg" })] },
    });
    await settle();
    expect(calls.remove).toHaveBeenCalledTimes(1);
    expect(calls.add).toHaveBeenCalledTimes(1);
    expect(calls.remove.mock.invocationCallOrder[0]).toBeLessThan(
      calls.add.mock.invocationCallOrder[0] ?? 0,
    );
    // The undo is gone with it: the photo is already off the card.
    expect(screen.queryByRole("button", { name: "Повернути" })).toBeNull();
  });
});

describe("«×» and «Повернути»", () => {
  it("hides the photo at once, and «Повернути» puts it back in the same place; nothing is sent", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { calls } = setup();
    fireEvent.click(removeButton(2));
    expect(shown()).toEqual([key(1), key(3)]);
    expect(screen.getByText("Фото прибрано")).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(undo());
    expect(shown()).toEqual([key(1), key(2), key(3)]);
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    await settle();
    expect(calls.remove).not.toHaveBeenCalled();
    // The toast's button is gone: focus is on the photo that came back.
    expect(document.activeElement).toBe(cropButton(2));
  });

  it("«×» moves focus to the photo that takes its place", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    setup();
    removeButton(2).focus();
    fireEvent.click(removeButton(2));
    // Photo 3 is now the second: its crop button is «Обрізати фото 2».
    expect(document.activeElement).toBe(cropButton(2));
  });

  it("the remove is sent once, when the toast's 6 s are up, planned on the list then", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { calls } = setup();
    fireEvent.click(removeButton(2));
    act(() => {
      vi.advanceTimersByTime(5999);
    });
    await settle();
    expect(calls.remove).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    await settle();
    expect(calls.remove).toHaveBeenCalledTimes(1);
    expect(calls.remove.mock.calls[0]).toEqual([
      { animalId: ID, expectedPhotoKeys: [key(1), key(2), key(3)], storageKey: key(2) },
    ]);
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    await settle();
    expect(calls.remove).toHaveBeenCalledTimes(1);
    expect(shown()).toEqual([key(1), key(3)]);
    expect(screen.getByText(/Сам файл не видаляється одразу/)).toBeTruthy();
  });

  it("two removes go one after the other, the second planned on the list the first left", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { calls } = setup();
    fireEvent.click(removeButton(1));
    fireEvent.click(removeButton(1));
    expect(shown()).toEqual([key(3)]);
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    await settle();
    expect(calls.remove.mock.calls.map(([input]) => input)).toEqual([
      { animalId: ID, expectedPhotoKeys: [key(1), key(2), key(3)], storageKey: key(1) },
      { animalId: ID, expectedPhotoKeys: [key(2), key(3)], storageKey: key(2) },
    ]);
    expect(shown()).toEqual([key(3)]);
  });

  it("unmounting sends what is waiting once, with keepalive, and nothing after", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { calls, unmount } = setup();
    fireEvent.click(removeButton(3));
    unmount();
    await settle();
    expect(calls.remove).toHaveBeenCalledTimes(1);
    expect(calls.remove.mock.calls[0]).toEqual([
      { animalId: ID, expectedPhotoKeys: [key(1), key(2), key(3)], storageKey: key(3) },
      { context: { keepalive: true } },
    ]);
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    await settle();
    expect(calls.remove).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["pagehide", () => window.dispatchEvent(new Event("pagehide"))],
    [
      "a hidden tab",
      () => {
        vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
        document.dispatchEvent(new Event("visibilitychange"));
      },
    ],
  ] as const)("%s sends it at once and takes the undo away", async (_what, leave) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { calls } = setup();
    fireEvent.click(removeButton(1));
    act(() => leave());
    await settle();
    expect(calls.remove).toHaveBeenCalledTimes(1);
    expect(calls.remove.mock.calls[0]?.[1]).toEqual({ context: { keepalive: true } });
    expect(screen.queryByRole("button", { name: "Повернути" })).toBeNull();
    vi.restoreAllMocks();
  });

  it("CONFLICT: the photo comes back with the current set, and his sentence says why", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { calls, setServer } = setup();
    calls.remove.mockRejectedValueOnce(apiError("CONFLICT"));
    // Another window put the photos in a new order meanwhile.
    setServer(view([key(3), key(2), key(1)]));
    fireEvent.click(removeButton(2));
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    await settle();
    expect(calls.byId).toHaveBeenCalledTimes(1);
    expect(shown()).toEqual([key(3), key(2), key(1)]);
    expect(
      screen.getByText("Фото змінилися в іншому вікні. Тут – поточний набір, спробуйте ще раз."),
    ).toBeTruthy();
  });

  it("a remove that didn't go through: the photo comes back and the card is said to be unchanged", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { calls } = setup();
    calls.remove.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fireEvent.click(removeButton(2));
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    await settle();
    expect(shown()).toEqual([key(1), key(2), key(3)]);
    expect(screen.getByText(/^Не збереглося/)).toBeTruthy();
  });

  it("a drag while a remove waits keeps the hidden photo in its slot", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { calls } = setup(view([key(1), key(2), key(3), key(4)]));
    fireEvent.click(removeButton(2));
    // Shown: 1, 3, 4. Drag photo 4 (shown slot 2) to the front.
    const surface = screen
      .getByRole("group", { name: "Фото 3 з 3" })
      .querySelector("[data-photo-surface]") as Element;
    const elementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => document.querySelector('[data-photo-slot="0"]');
    try {
      fireEvent.pointerDown(surface, {
        button: 0,
        pointerId: 1,
        pointerType: "mouse",
        clientX: 10,
        clientY: 300,
      });
      fireEvent.pointerMove(window, {
        pointerId: 1,
        pointerType: "mouse",
        clientX: 30,
        clientY: 330,
      });
      fireEvent.pointerMove(window, {
        pointerId: 1,
        pointerType: "mouse",
        clientX: 60,
        clientY: 330,
      });
      fireEvent.pointerUp(window, { pointerId: 1, clientX: 60, clientY: 330 });
    } finally {
      document.elementFromPoint = elementFromPoint;
    }
    await settle();
    expect(calls.reorder.mock.calls[0]?.[0]).toEqual({
      animalId: ID,
      expectedPhotoKeys: [key(1), key(2), key(3), key(4)],
      nextPhotoKeys: [key(4), key(2), key(1), key(3)],
    });
    expect(shown()).toEqual([key(4), key(1), key(3)]);
    // A drop says where the photo is now, never its old number.
    expect(screen.getByText("Фото тепер на позиції 1 з 3.")).toBeTruthy();
  });
});

describe("Alt+← and Alt+→ (the keyboard's way to the order)", () => {
  const HINT = "Щоб посунути фото на одне місце, натисніть Alt і стрілку вліво або вправо.";
  /** Presses Alt+arrow on a button; false when the page kept the browser from acting on it. */
  const alt = (button: Element | null, key: "ArrowLeft" | "ArrowRight") =>
    fireEvent.keyDown(button as Element, { key, altKey: true });

  it("Alt+→ moves the photo one place later, once, says where it went and keeps focus on it", async () => {
    const { calls } = setup();
    const crop = cropButton(1) as HTMLElement;
    crop.focus();
    expect(alt(crop, "ArrowRight")).toBe(false);
    expect(shown()).toEqual([key(2), key(1), key(3)]);
    expect(screen.getByText("Фото тепер на позиції 2 з 3.")).toBeTruthy();
    // The same button of the same photo, now photo 2.
    expect(document.activeElement).toBe(crop);
    expect(document.activeElement).toBe(cropButton(2));
    await settle();
    expect(calls.reorder.mock.calls).toEqual([
      [
        {
          animalId: ID,
          expectedPhotoKeys: [key(1), key(2), key(3)],
          nextPhotoKeys: [key(2), key(1), key(3)],
        },
      ],
    ]);
    expect(shown()).toEqual([key(2), key(1), key(3)]);
  });

  it("Alt+← on «×» moves it one place earlier; to the first place it becomes the cover", async () => {
    const { calls } = setup();
    const remove = removeButton(2);
    remove.focus();
    alt(remove, "ArrowLeft");
    expect(shown()).toEqual([key(2), key(1), key(3)]);
    expect(document.activeElement).toBe(removeButton(1));
    const cover = screen.getByText("1 · Обкладинка").closest("li");
    expect(cover?.querySelector("img")?.getAttribute("src")).toBe(key(2));
    expect(screen.getByText("Фото тепер на позиції 1 з 3.")).toBeTruthy();
    await settle();
    expect(calls.reorder).toHaveBeenCalledTimes(1);
  });

  it("at either end it does nothing, and still keeps the browser's Back from leaving the page", async () => {
    const { calls } = setup();
    expect(alt(cropButton(1), "ArrowLeft")).toBe(false);
    expect(alt(removeButton(3), "ArrowRight")).toBe(false);
    await settle();
    expect(calls.reorder).not.toHaveBeenCalled();
    expect(shown()).toEqual([key(1), key(2), key(3)]);
    expect(screen.queryByText(/на позиції/)).toBeNull();
  });

  it("an arrow without Alt, or with another modifier too, is left alone", async () => {
    const { calls } = setup();
    expect(fireEvent.keyDown(cropButton(1) as Element, { key: "ArrowRight" })).toBe(true);
    expect(
      fireEvent.keyDown(cropButton(1) as Element, {
        key: "ArrowRight",
        altKey: true,
        ctrlKey: true,
      }),
    ).toBe(true);
    await settle();
    expect(calls.reorder).not.toHaveBeenCalled();
  });

  it("two quick presses show both moves at once and send them in turn, the second on the order the first left", async () => {
    const { calls } = setup();
    const crop = cropButton(1) as HTMLElement;
    crop.focus();
    alt(crop, "ArrowRight");
    alt(document.activeElement, "ArrowRight");
    expect(shown()).toEqual([key(2), key(3), key(1)]);
    expect(screen.getByText("Фото тепер на позиції 3 з 3.")).toBeTruthy();
    expect(document.activeElement).toBe(cropButton(3));
    await settle();
    expect(calls.reorder.mock.calls.map(([input]) => input)).toEqual([
      {
        animalId: ID,
        expectedPhotoKeys: [key(1), key(2), key(3)],
        nextPhotoKeys: [key(2), key(1), key(3)],
      },
      {
        animalId: ID,
        expectedPhotoKeys: [key(2), key(1), key(3)],
        nextPhotoKeys: [key(2), key(3), key(1)],
      },
    ]);
  });

  it("the hint describes every pill button; with one photo there is nothing to move and no hint", () => {
    const { unmount } = setup();
    const hint = screen.getByText(HINT);
    for (const n of [1, 2, 3]) {
      for (const button of [cropButton(n), removeButton(n)]) {
        expect(button?.getAttribute("aria-describedby")?.split(" ")).toContain(hint.id);
      }
    }
    unmount();
    setup(view([key(1)]));
    expect(screen.queryByText(HINT)).toBeNull();
    expect(removeButton(1).getAttribute("aria-describedby")).toBeNull();
  });

  it("a move while a remove waits keeps the hidden photo in its slot, and «Повернути» puts it back there", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { calls } = setup(view([key(1), key(2), key(3), key(4)]));
    fireEvent.click(removeButton(2));
    expect(shown()).toEqual([key(1), key(3), key(4)]);
    // Shown photo 3 is key 4: one place earlier.
    alt(cropButton(3), "ArrowLeft");
    expect(shown()).toEqual([key(1), key(4), key(3)]);
    await settle();
    expect(calls.reorder.mock.calls[0]?.[0]).toEqual({
      animalId: ID,
      expectedPhotoKeys: [key(1), key(2), key(3), key(4)],
      nextPhotoKeys: [key(1), key(2), key(4), key(3)],
    });
    fireEvent.click(undo());
    expect(shown()).toEqual([key(1), key(2), key(4), key(3)]);
    expect(calls.remove).not.toHaveBeenCalled();
  });

  it("a second move to the same place is spoken again: a new line, not the same text left in place", () => {
    setup();
    alt(cropButton(1), "ArrowRight");
    const first = screen.getByText("Фото тепер на позиції 2 з 3.");
    // Photo 3 one place earlier lands on place 2 too.
    alt(cropButton(3), "ArrowLeft");
    const second = screen.getByText("Фото тепер на позиції 2 з 3.");
    expect(second).not.toBe(first);
    expect(first.isConnected).toBe(false);
    expect(second.closest('[role="status"]')).not.toBeNull();
  });

  it("a refused move puts the server's order back", async () => {
    const { calls } = setup();
    calls.reorder.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    alt(cropButton(1), "ArrowRight");
    expect(shown()).toEqual([key(2), key(1), key(3)]);
    await settle();
    expect(shown()).toEqual([key(1), key(2), key(3)]);
    expect(screen.getByText(/^Не збереглося/)).toBeTruthy();
  });
});

describe("refillOrder", () => {
  it("lays the shown order over the server's list; other keys keep their slots", () => {
    expect(refillOrder(["a", "b", "c", "d"], ["d", "a", "c"])).toEqual(["d", "b", "a", "c"]);
    expect(refillOrder(["a", "b", "new"], ["b", "a"])).toEqual(["b", "a", "new"]);
    expect(refillOrder(["a", "b"], ["gone", "b", "a"])).toEqual(["b", "a"]);
  });
});
