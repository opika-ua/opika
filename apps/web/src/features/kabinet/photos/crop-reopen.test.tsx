import type { KabinetAnimalView, KabinetPhotoCropView } from "@opika/contracts";
import type { PhotoFrame } from "@opika/domain";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { CropperProps } from "react-easy-crop";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KabinetAnimalClient } from "../../../api/kabinet-browser-client";
import { PhotoSection } from "../animal-form/PhotoSection";

/**
 * Reopening a cropped photo from its pill with the REAL react-easy-crop (Sentry WEB-2, React #185).
 * happy-dom has no layout, so a browser's is given: a 512 x 288 box only once the dialog is shown,
 * and the photo already decoded when the dialog commits, as a fast CDN answer leaves it.
 */

const cropper = vi.hoisted(() => ({ cropChanges: 0, natural: { width: 2000, height: 1125 } }));

// The real cropper, its `onCropChange` counted on the way through.
vi.mock("react-easy-crop", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-easy-crop")>();
  const Real = actual.default;
  function Counted(props: CropperProps) {
    return (
      <Real
        {...props}
        onCropChange={(point) => {
          cropper.cropChanges += 1;
          props.onCropChange(point);
        }}
      />
    );
  }
  return { ...actual, default: Counted };
});

vi.mock("next/image", () => ({
  default: (props: { src: string; alt: string }) => <img src={props.src} alt={props.alt} />,
}));

// A healthy reopening calls `onCropChange` 3 or 4 times (the stored frame, then re-clamps); the loop
// passes 50, React's nested-update limit. 10 leaves a library patch room and is far below a spin.
const MAX_CROP_CHANGES = 10;

const NOW = new Date("2026-11-12T09:00:00.000Z");
const ID = "a1000000-0000-4000-8000-000000000001" as KabinetAnimalView["id"];
const BASE = "https://img.example.test";
const KEY = "animals/a1/p1";
const CROPPED_KEY = "animals/a1/p1-cropped";
const BOX = { width: 512, height: 288 };
const AREA = "Рамка кадру. Стрілки зсувають фото.";

type SourceSize = { width: number; height: number };

const cropView = (
  storageKey: string,
  size: SourceSize,
  frame: PhotoFrame | null,
): KabinetPhotoCropView => ({
  storageKey,
  framing: frame === null ? { kind: "attention" } : { kind: "frame", frame },
  source: {
    kind: "kept",
    objectKey: `${storageKey}/source-0f.webp`,
    origin: "upload",
    ...size,
  },
});

const view = (crop: KabinetPhotoCropView): KabinetAnimalView =>
  ({
    id: ID,
    name: "Ластівка",
    species: "dog",
    sex: "male",
    size: "medium",
    coatLength: null,
    age: null,
    description: null,
    photos: [{ storageKey: crop.storageKey, width: 1600, height: 2000, alt: null }],
    photoCrops: [crop],
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

/** The section with one photo; the server stores `stored` as that photo's frame when it is cropped. */
function setup(source: SourceSize, stored: PhotoFrame) {
  const crop = vi.fn(async (_input: unknown) => view(cropView(CROPPED_KEY, source, stored)));
  const client = { shelter: { photos: { crop } } } as unknown as KabinetAnimalClient;
  function Harness() {
    const [animal, setAnimal] = useState(view(cropView(KEY, source, null)));
    return (
      <PhotoSection
        animal={animal}
        editable
        shelterVisibility="visible"
        client={client}
        onView={setAnimal}
        reload={async () => null}
      />
    );
  }
  render(<Harness />);
  return crop;
}

const cropButton = () => screen.getByRole("button", { name: "Обрізати фото 1" });
const saveButton = (dialog: HTMLElement) =>
  within(dialog).getByRole("button", { name: "Зберегти кадр" });
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_BASE_URL", BASE);
  cropper.cropChanges = 0;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const shown = this.closest("dialog")?.open === true;
    return DOMRect.fromRect(shown ? BOX : { width: 0, height: 0 });
  });
  vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockImplementation(
    () => cropper.natural.width,
  );
  vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockImplementation(
    () => cropper.natural.height,
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("crop, save, then crop the same photo again from its pill (real cropper)", () => {
  // The last number is how far the frame saved again may be from the stored one, in fractions.
  it.each<[string, SourceSize, SourceSize, PhotoFrame, number]>([
    [
      "a centred frame",
      { width: 2000, height: 1125 },
      { width: 2000, height: 1125 },
      { x: 0.275, y: 0, w: 0.45, h: 1 },
      0,
    ],
    [
      "a frame at the image's edge, zoomed in (1.25x)",
      { width: 2000, height: 1125 },
      { width: 2000, height: 1125 },
      { x: 0.64, y: 0.2, w: 0.36, h: 0.8 },
      0,
    ],
    // Read back against the decoded size, so it may move by a few of the 10,000 units.
    [
      "a source stored a pixel off the size it decodes to",
      { width: 2000, height: 1125 },
      { width: 2001, height: 1126 },
      { x: 0.275, y: 0, w: 0.45, h: 1 },
      0.0005,
    ],
  ])(
    "%s: the dialog opens, settles, and saves the frame it was left at",
    async (_, stored, natural, frame, tolerance) => {
      cropper.natural = natural;
      const crop = setup(stored, frame);

      // The first opening: the automatic crop, saved as is.
      await userEvent.click(cropButton());
      const first = await screen.findByRole("dialog", { name: "Обрізати фото 1" });
      await within(first).findByRole("application", { name: AREA });
      await userEvent.click(saveButton(first));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(crop).toHaveBeenCalledTimes(1);

      // Again, on the same photo: it now has a stored frame.
      cropper.cropChanges = 0;
      await userEvent.click(cropButton());
      const dialog = await screen.findByRole("dialog", { name: "Обрізати фото 1" });
      await within(dialog).findByRole("application", { name: AREA });
      await settle();
      const changes = cropper.cropChanges;
      await settle();
      expect(cropper.cropChanges, "onCropChange after the dialog settled").toBe(changes);
      expect(changes).toBeLessThanOrEqual(MAX_CROP_CHANGES);

      // Settled where it was left: saving it again sends the stored frame.
      expect(saveButton(dialog).getAttribute("aria-disabled")).toBeNull();
      await userEvent.click(saveButton(dialog));
      expect(crop).toHaveBeenCalledTimes(2);
      const sent = crop.mock.calls[1]?.[0] as { framing: { kind: string; frame: PhotoFrame } };
      expect(sent.framing.kind).toBe("frame");
      for (const side of ["x", "y", "w", "h"] as const) {
        expect(Math.abs(sent.framing.frame[side] - frame[side]), side).toBeLessThanOrEqual(
          tolerance + Number.EPSILON,
        );
      }
    },
  );
});
