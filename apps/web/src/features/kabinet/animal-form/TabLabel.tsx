import { uk } from "@opika/i18n";
import { Icon } from "../../../ui/Icon";

const t = uk.kabinet.animalForm.sections;

/**
 * A tab's name with its completion mark: ✓ or !, drawn from the publish rules (`tabStatusOf`).
 * The mark is decoration; its meaning is read out after the name («Основне, потрібно доповнити»).
 */
export function TabLabel({
  label,
  status,
}: {
  label: string;
  status: "complete" | "incomplete" | null;
}) {
  if (status === null) return label;
  return (
    <>
      <span>{label}</span>
      <span
        aria-hidden="true"
        className="ml-2 inline-grid size-6 place-items-center rounded-pill border-2 border-current align-middle text-caption leading-none"
      >
        {status === "complete" ? <Icon name="check" size="sm" /> : "!"}
      </span>
      <span className="sr-only">
        , {status === "complete" ? t.badgeComplete : t.badgeIncomplete}
      </span>
    </>
  );
}
