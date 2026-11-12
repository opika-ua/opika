/**
 * The sheet's desktop columns by photo count (owner, 2026-11-12): a photo slot (1-4 / 5-8 / 9-12)
 * left free takes the text that would sit below, so nothing shows twice. Phones just stack.
 */
export type StripLayout = "no-photos" | "one" | "two" | "row";

export function stripLayoutFor(photoCount: number): StripLayout {
  if (photoCount === 0) return "no-photos";
  if (photoCount === 1) return "one";
  if (photoCount === 2) return "two";
  return "row";
}

type Slot = { columns: string; className: string };
type Slots = {
  /** The body grid itself. */
  body: string;
  photos: Slot | null;
  about: Slot;
  story: Slot;
  medical: Slot;
};

// Story and health side by side: five columns give the health labels one line (owner, 2026-11-12).
const STORY: Slot = { columns: "1-7", className: "desktop:col-span-7 desktop:max-w-reading" };
const MEDICAL_BESIDE_STORY: Slot = { columns: "8-12", className: "desktop:col-span-5" };

export const STRIP_SLOTS: Record<StripLayout, Slots> = {
  // The phone's placeholder is not shown from desktop, so the text starts the body.
  "no-photos": {
    body: "",
    photos: null,
    about: { columns: "1-12", className: "desktop:col-span-12" },
    story: STORY,
    medical: MEDICAL_BESIDE_STORY,
  },
  // The second row is `1fr` so a photo taller than «Про мене» + health pushes the story down
  // without opening a gap between those two.
  one: {
    body: "desktop:[grid-template-rows:auto_1fr]",
    photos: { columns: "1-4", className: "desktop:col-span-4 desktop:row-span-2" },
    about: { columns: "5-12", className: "desktop:col-span-8" },
    story: {
      columns: "1-8",
      className: "desktop:col-span-8 desktop:max-w-reading desktop:col-start-1 desktop:row-start-3",
    },
    medical: {
      columns: "5-12",
      className: "desktop:col-span-8 desktop:col-start-5 desktop:row-start-2 desktop:self-start",
    },
  },
  two: {
    body: "",
    photos: { columns: "1-8", className: "desktop:col-span-8" },
    about: { columns: "9-12", className: "desktop:col-span-4" },
    story: STORY,
    medical: MEDICAL_BESIDE_STORY,
  },
  row: {
    body: "",
    photos: { columns: "1-12", className: "desktop:col-span-12" },
    about: { columns: "1-12", className: "desktop:col-span-12" },
    story: STORY,
    medical: MEDICAL_BESIDE_STORY,
  },
};
