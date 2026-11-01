import type { PublishGap } from "@opika/domain";
import type { AnimalTab } from "./animal-tabs";
import { ageInputOf, type FormValues } from "./form-values";

/** What still keeps the form's current content from publishing, in form order (K-Q5, as `publishReadinessOf`). */
export const gapsOf = (values: FormValues, photoCount: number): PublishGap[] => [
  ...(values.sex === "unknown" ? [{ kind: "sex" } as const] : []),
  ...(values.size === null ? [{ kind: "size" } as const] : []),
  ...(ageInputOf(values) === null ? [{ kind: "age" } as const] : []),
  ...(values.description.trim() === "" ? [{ kind: "description" } as const] : []),
  ...(photoCount === 0 ? [{ kind: "photo" } as const] : []),
];

/** The tab that holds each gap's field. The tab badges are derived from this and `gapsOf`, nothing else. */
export const GAP_TAB: Record<PublishGap["kind"], AnimalTab> = {
  sex: "osnovne",
  size: "osnovne",
  age: "osnovne",
  description: "pro-tvarynu",
  photo: "foto",
};

/** Where to put focus for a gap: the field itself, or for photos the section heading. */
export const GAP_TARGET: Record<PublishGap["kind"], string> = {
  sex: 'input[name="animal-sex"]',
  size: 'input[name="animal-size"]',
  age: "#animal-birth-date, input[name='animal-age-bucket']",
  description: "#animal-description",
  photo: "#photos-title",
};

/** ✓ when the tab holds publish fields and none is missing, ! when one is, null on a tab with none. */
export const tabStatusOf = (
  tab: AnimalTab,
  gaps: readonly PublishGap[],
): "complete" | "incomplete" | null => {
  if (!Object.values(GAP_TAB).includes(tab)) return null;
  return gaps.some((gap) => GAP_TAB[gap.kind] === tab) ? "incomplete" : "complete";
};
