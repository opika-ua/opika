import type { KabinetAnimalView, KabinetPhotoCropView } from "@opika/contracts";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement, useEffect, useState } from "react";
import type { CropperProps } from "react-easy-crop";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KabinetAnimalClient } from "../../../api/kabinet-browser-client";
import { PhotoSection } from "../animal-form/PhotoSection";

/**
 * The crop frame in the photo manager, behaviour only. react-easy-crop is replaced by a stand-in
 * that does what the dialog relies on: it loads the image, reports the area it shows (centred, as
 * with no drag) for the zoom it is given, and spreads `cropperProps` on its focusable crop area.
 * Every Ukrainian string is the owner-approved text of the crop-frame shape §10, written out here.
 */

const easyCrop = vi.hoisted(() => ({
  imported: 0,
  natural: { width: 2000, height: 1125 },
  zoom: [] as number[],
}));

vi.mock("react-easy-crop", () => {
  easyCrop.imported += 1;
  function FakeCropper({
    image,
    zoom,
    classes,
    cropperProps,
    mediaProps,
    onMediaLoaded,
    onCropAreaChange,
  }: CropperProps) {
    easyCrop.zoom.push(zoom);
    const { width, height } = easyCrop.natural;
    useEffect(() => {
      onMediaLoaded?.({ width, height, naturalWidth: width, naturalHeight: height });
    }, []);
    useEffect(() => {
      const widest = Math.min(width, height * 0.8);
      const w = ((widest / width) * 100) / zoom;
      const h = (((widest * 1.25) / height) * 100) / zoom;
      const area = { x: (100 - w) / 2, y: (100 - h) / 2, width: w, height: h };
      onCropAreaChange?.(area, area);
    }, [zoom, width, height, onCropAreaChange]);
    return (
      <div className={classes.containerClassName}>
        <img src={image} alt="" {...(mediaProps as object)} />
        {/* As the library does it: a focusable div that takes `cropperProps` (our role and name). */}
        {createElement("div", { tabIndex: 0, ...cropperProps })}
      </div>
    );
  }
  return { default: FakeCropper };
});

const NOW = new Date("2026-11-12T09:00:00.000Z");
const ID = "a1000000-0000-4000-8000-000000000001" as KabinetAnimalView["id"];
const BASE = "https://img.example.test";
// Root-relative keys: vitest runs next/image with its default loader, not the app's R2 one.
const KEPT_KEY = "/photos/1.jpg";
const OLD_KEY = "/photos/2.jpg";
const CROPPED_KEY = "/photos/1-cropped.jpg";
const photo = (storageKey: string) => ({ storageKey, width: 1600, height: 2000, alt: null });

const kept = (storageKey: string): KabinetPhotoCropView => ({
  storageKey,
  framing: { kind: "attention" },
  source: {
    kind: "kept",
    objectKey: "animals/a1/p1/source-0f.webp",
    origin: "upload",
    width: 2000,
    height: 1125,
  },
});
const older = (storageKey: string): KabinetPhotoCropView => ({
  storageKey,
  framing: { kind: "attention" },
  source: { kind: "variants_only" },
});
const withheld = (storageKey: string): KabinetPhotoCropView => ({
  storageKey,
  framing: { kind: "attention" },
  source: { kind: "withheld" },
});

const view = (crops: KabinetPhotoCropView[]): KabinetAnimalView =>
  ({
    id: ID,
    name: "Ластівка",
    species: "dog",
    sex: "male",
    size: "medium",
    coatLength: null,
    age: null,
    description: null,
    photos: crops.map((crop) => photo(crop.storageKey)),
    photoCrops: crops,
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
  }) as unknown as KabinetAnimalView;

const apiError = (code: string, data?: unknown) => Object.assign(new Error(code), { code, data });

const START = view([kept(KEPT_KEY), older(OLD_KEY)]);
const AFTER_CROP = view([
  {
    ...kept(CROPPED_KEY),
    framing: { kind: "frame", frame: { x: 0.275, y: 0, w: 0.45, h: 1 } },
  },
  older(OLD_KEY),
]);

function setup(
  start: KabinetAnimalView = START,
  crop: (input: unknown) => Promise<KabinetAnimalView> = async () => AFTER_CROP,
  editable = true,
) {
  const calls = { crop: vi.fn(crop), byId: vi.fn(async () => start) };
  const client = {
    shelter: { animals: { byId: calls.byId }, photos: { crop: calls.crop } },
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
        reload={async () => setAnimal(await calls.byId())}
      />
    );
  }
  render(<Harness />);
  return calls;
}

const menuTrigger = (n: number) => screen.getByRole("button", { name: `Дії з фото ${n}` });
const openMenu = async (n: number) => {
  const trigger = menuTrigger(n);
  await userEvent.click(trigger);
  const panel = document.getElementById(trigger.getAttribute("aria-controls") ?? "");
  if (panel === null) throw new Error(`menu ${n} is open`);
  return within(panel)
    .queryAllByRole("button")
    .map((item) => item.textContent);
};
const openCrop = async (n: number) => {
  await userEvent.click(menuTrigger(n));
  await userEvent.click(screen.getByRole("button", { name: "Обрізати" }));
  return screen.findByRole("dialog", { name: `Обрізати фото ${n}` });
};
const cropArea = () =>
  screen.findByRole("application", { name: "Рамка кадру. Стрілки зсувають фото." });

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_BASE_URL", BASE);
  easyCrop.natural = { width: 2000, height: 1125 };
  easyCrop.zoom = [];
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("loading", () => {
  // First in the file: the module registry keeps the chunk once any test has opened a menu.
  it("the dialog and react-easy-crop are fetched only once a ⋯ menu opens", async () => {
    setup();
    expect(easyCrop.imported).toBe(0);
    await openMenu(1);
    await waitFor(() => expect(easyCrop.imported).toBe(1));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("«Обрізати» in the ⋯ menu", () => {
  it("is the first item of every photo's menu, a new upload and an older photo alike", async () => {
    setup();
    expect((await openMenu(1))[0]).toBe("Обрізати");
    await userEvent.keyboard("{Escape}");
    expect((await openMenu(2))[0]).toBe("Обрізати");
  });

  it("a support view's photo (source withheld) is never offered it", async () => {
    setup(view([withheld(KEPT_KEY), withheld(OLD_KEY)]));
    expect(await openMenu(1)).not.toContain("Обрізати");
    await userEvent.keyboard("{Escape}");
    expect(await openMenu(2)).not.toContain("Обрізати");
  });

  it("a read-only form has no ⋯ menu, so nothing to crop", () => {
    setup(START, undefined, false);
    expect(screen.queryByRole("button", { name: /Дії з фото/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Обрізати" })).toBeNull();
  });
});

describe("the dialog", () => {
  it("opens on demand, named by its title, with focus on the title", async () => {
    setup();
    expect(screen.queryByRole("dialog")).toBeNull();
    const dialog = await openCrop(1);
    expect(document.activeElement).toBe(
      within(dialog).getByRole("heading", { name: "Обрізати фото 1" }),
    );
    expect(
      within(dialog).getByText("Пересуньте й наблизьте фото, щоб тварина була в рамці."),
    ).toBeTruthy();
  });

  it("the crop area is labelled and described by the hint; Tab goes crop area, zoom, save, cancel", async () => {
    setup();
    const dialog = await openCrop(1);
    const area = await cropArea();
    const described = (area.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent);
    expect(described).toEqual(["Пересуньте й наблизьте фото, щоб тварина була в рамці."]);

    const order: (string | null)[] = [];
    for (let i = 0; i < 6; i += 1) {
      await userEvent.tab();
      const active = document.activeElement;
      order.push(active?.getAttribute("aria-label") ?? active?.textContent ?? null);
    }
    // The ✕ is the kit Modal's own, in the title's row.
    expect(order).toEqual([
      "Закрити",
      "Рамка кадру. Стрілки зсувають фото.",
      "Віддалити",
      "Наблизити",
      "Зберегти кадр",
      "Скасувати",
    ]);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("«Наблизити» and «Віддалити» change the zoom, never below the whole frame", async () => {
    setup();
    await openCrop(1);
    await cropArea();
    const zoomOut = screen.getByRole("button", { name: "Віддалити" });
    const zoomIn = screen.getByRole("button", { name: "Наблизити" });
    expect(easyCrop.zoom.at(-1)).toBe(1);
    expect(zoomOut.getAttribute("aria-disabled")).toBe("true");
    await userEvent.click(zoomOut);
    expect(easyCrop.zoom.at(-1)).toBe(1);
    await userEvent.click(zoomIn);
    expect(easyCrop.zoom.at(-1)).toBe(1.25);
    expect(zoomOut.getAttribute("aria-disabled")).toBeNull();
    await userEvent.click(zoomOut);
    expect(easyCrop.zoom.at(-1)).toBe(1);
  });

  it("a stored frame's photo starts where it was left; an attention one starts zoomed out", async () => {
    setup(AFTER_CROP);
    await openCrop(1);
    await cropArea();
    expect(easyCrop.zoom[0]).toBe(1);
  });

  it("an older photo says it can only be zoomed, and the crop area reads that too", async () => {
    easyCrop.natural = { width: 1120, height: 1400 };
    setup();
    const dialog = await openCrop(2);
    const note =
      "Це фото додане до появи обрізання, тож його можна лише наблизити. Щоб вибрати інший кадр, додайте фото ще раз.";
    expect(within(dialog).getByText(note)).toBeTruthy();
    const area = await cropArea();
    const described = (area.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent);
    expect(described).toContain(note);
  });

  it("a new upload's photo has no such note", async () => {
    setup();
    const dialog = await openCrop(1);
    expect(within(dialog).queryByText(/додане до появи обрізання/)).toBeNull();
  });

  it("«Скасувати» closes it with nothing sent, and focus goes back to that photo's ⋯", async () => {
    const calls = setup();
    await openCrop(2);
    await userEvent.click(screen.getByRole("button", { name: "Скасувати" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(calls.crop).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(menuTrigger(2)));
  });

  it("a photo that won't load says so, and «Спробувати ще раз» loads it again", async () => {
    setup();
    const dialog = await openCrop(1);
    await cropArea();
    const image = dialog.querySelector(`img[src="${BASE}/animals/a1/p1/source-0f.webp"]`);
    if (image === null) throw new Error("the cropper shows the kept source");
    fireEvent.error(image);
    expect(
      await within(dialog).findByText("Не вдалося відкрити фото. Спробуйте ще раз."),
    ).toBeTruthy();
    expect(within(dialog).queryByRole("application")).toBeNull();
    await userEvent.click(within(dialog).getByRole("button", { name: "Спробувати ще раз" }));
    expect(await cropArea()).toBeTruthy();
    expect(within(dialog).queryByText("Не вдалося відкрити фото. Спробуйте ще раз.")).toBeNull();
  });
});

describe("saving", () => {
  it("sends the frame shown, says «Кадр збережено.», and focus returns to the photo's ⋯ under its new key", async () => {
    const calls = setup();
    const triggerId = menuTrigger(1).id;
    await openCrop(1);
    await cropArea();
    await userEvent.click(screen.getByRole("button", { name: "Зберегти кадр" }));
    expect(calls.crop).toHaveBeenCalledTimes(1);
    expect(calls.crop.mock.calls[0]?.[0]).toEqual({
      animalId: ID,
      expectedPhotoKeys: [KEPT_KEY, OLD_KEY],
      storageKey: KEPT_KEY,
      // The widest 4:5 frame of a 2000x1125 photo, centred: 900x1125 px from x = 550.
      framing: { kind: "frame", frame: { x: 0.275, y: 0, w: 0.45, h: 1 } },
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Кадр збережено.").getAttribute("role")).toBe("status");
    // The tile now shows the new key, and its ⋯ kept its id, so focus lands on it.
    expect(document.querySelector(`img[src*="${encodeURIComponent(CROPPED_KEY)}"]`)).not.toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(menuTrigger(1)));
    expect(menuTrigger(1).id).toBe(triggerId);
  });

  it("a zoomed frame is sent as zoomed", async () => {
    const calls = setup();
    await openCrop(1);
    await cropArea();
    await userEvent.click(screen.getByRole("button", { name: "Наблизити" }));
    await userEvent.click(screen.getByRole("button", { name: "Зберегти кадр" }));
    expect(calls.crop.mock.calls[0]?.[0]).toMatchObject({
      framing: { kind: "frame", frame: { x: 0.32, y: 0.1, w: 0.36, h: 0.8 } },
    });
  });

  it("while it saves, the dialog can't be closed", async () => {
    let finish: (value: KabinetAnimalView) => void = () => undefined;
    setup(START, () => new Promise((resolve) => (finish = resolve)));
    const dialog = await openCrop(1);
    await cropArea();
    await userEvent.click(screen.getByRole("button", { name: "Зберегти кадр" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Скасувати" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Закрити" }));
    expect(screen.getByRole("dialog", { name: "Обрізати фото 1" })).toBeTruthy();
    await act(async () => finish(AFTER_CROP));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it.each([
    ["RATE_LIMITED", "Забагато фото за короткий час. Спробуйте трохи пізніше."],
    ["PHOTO_UPLOADS_UNAVAILABLE", "На цій версії сайту фото завантажити не можна."],
    [
      "PHOTO_FRAME_REJECTED",
      "Не збереглося – на картках нічого не змінилося. Перевірте зʼєднання і спробуйте ще раз.",
    ],
    [
      "a lost connection",
      "Не збереглося – на картках нічого не змінилося. Перевірте зʼєднання і спробуйте ще раз.",
    ],
  ])("%s: the dialog stays open and says why", async (code, sentence) => {
    const calls = setup(START, async () => {
      throw code === "a lost connection"
        ? new TypeError("Failed to fetch")
        : apiError(code, code === "PHOTO_FRAME_REJECTED" ? { reason: "aspect" } : undefined);
    });
    const dialog = await openCrop(1);
    await cropArea();
    await userEvent.click(screen.getByRole("button", { name: "Зберегти кадр" }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe(sentence);
    expect(calls.crop).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Кадр збережено.")).toBeNull();
    // The photo is as it was, and saving can be tried again.
    await userEvent.click(within(dialog).getByRole("button", { name: "Зберегти кадр" }));
    expect(calls.crop).toHaveBeenCalledTimes(2);
  });

  it("photos changed in another window: the dialog closes, says so, and shows the current set", async () => {
    const calls = setup(START, async () => {
      throw apiError("CONFLICT");
    });
    await openCrop(1);
    await cropArea();
    await userEvent.click(screen.getByRole("button", { name: "Зберегти кадр" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      screen.getByText("Фото змінилися в іншому вікні. Тут – поточний набір, спробуйте ще раз."),
    ).toBeTruthy();
    expect(calls.byId).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(document.activeElement).toBe(menuTrigger(1)));
  });
});
