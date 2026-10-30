import type { ErrorSummaryItem } from "../../../ui/ErrorSummary";
import type { AnimalTab } from "./animal-tabs";
import { problemText } from "./FormSections";
import type { FieldProblem } from "./form-values";

/**
 * Where each problem's field lives, as a selector: the summary's link focuses it. A group of
 * radios has no single element, so its first radio stands in.
 */
const TARGET: Record<FieldProblem["field"], string> = {
  name: "#animal-name",
  species: 'input[name="animal-species"]',
  description: "#animal-description",
  medicalNotes: "#animal-medical-notes",
  birthDate: "#animal-birth-date",
  asOf: "#animal-as-of",
  temperamentCustom: "#animal-temperament-custom",
  colourCustom: "#animal-colour-custom",
};

/** The tab that holds each validated field, so a summary item can bring it into view. */
const FIELD_TAB: Record<FieldProblem["field"], AnimalTab> = {
  name: "osnovne",
  species: "osnovne",
  birthDate: "osnovne",
  asOf: "osnovne",
  description: "pro-tvarynu",
  temperamentCustom: "pro-tvarynu",
  colourCustom: "pro-tvarynu",
  medicalNotes: "zdorovia",
};

/** The form's problems as the kit's summary items: one per field, in the form's order, with the field's own sentence. */
export function summaryItemsOf(
  problems: readonly FieldProblem[],
  goTo: (tab: AnimalTab, selector: string) => void,
): ErrorSummaryItem[] {
  const fields = [...new Set(problems.map((problem) => problem.field))];
  return fields.map((field) => ({
    key: field,
    message: problemText(problems, field) ?? "",
    target: TARGET[field],
    onSelect: () => goTo(FIELD_TAB[field], TARGET[field]),
  }));
}
