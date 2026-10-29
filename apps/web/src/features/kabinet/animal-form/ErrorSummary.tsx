import type { Ref } from "react";
import { Button } from "../../../ui/Button";
import { Panel } from "../../../ui/Panel";
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

const focusField = (field: FieldProblem["field"]) => {
  const target = document.querySelector<HTMLElement>(TARGET[field]);
  if (target === null) return;
  target.scrollIntoView({ block: "center" });
  target.focus({ preventScroll: true });
};

/**
 * What a refused save or publish says, once, at the top: every problem as a button that takes you to its field,
 * in the form's order. The panel takes focus when a person asks to save and the form says no
 * (never for an autosave, which must not pull focus from where they are typing), so a keyboard
 * or screen-reader user lands on the list instead of hunting for the field. The same sentences
 * stay under their fields; this is the way in, not a second wording. It adds no copy of its own.
 */
export function ErrorSummary({
  problems,
  ref,
}: {
  problems: readonly FieldProblem[];
  ref: Ref<HTMLDivElement>;
}) {
  const fields = [...new Set(problems.map((problem) => problem.field))];
  return (
    <div ref={ref} role="alert" tabIndex={-1} className="rounded-panel focus-ring">
      <Panel tone="outline" padding="lg">
        <ul className="flex flex-col gap-2">
          {fields.map((field) => (
            <li key={field}>
              <Button
                variant="ghost"
                className="w-full justify-start text-left"
                onClick={() => focusField(field)}
              >
                {problemText(problems, field)}
              </Button>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
