import type { AnimalDetailView } from "@opika/contracts";
import type { CoatLength } from "@opika/domain";
import { uk } from "@opika/i18n";

const COAT_VALUE: Record<CoatLength, string> = {
  short: uk.detail.coatShort,
  long: uk.detail.coatLong,
};

/**
 * The fur fact, shared by the animal page and the gallery's preview drawer so
 * the two can't disagree. His rule (DR1, S3): «Шерсть» with the form's words
 * «Коротка» / «Довга», and no row at all when fur isn't recorded («Не вказано»
 * is the kabinet's word, never an adopter's).
 */
export function CoatFact({
  coatLength,
  className,
}: {
  coatLength: AnimalDetailView["coatLength"];
  className: string;
}) {
  if (coatLength === null) return null;
  return (
    <dl className={`flex gap-1 ${className}`}>
      <dt>{uk.detail.coatLabel}:</dt>
      <dd>{COAT_VALUE[coatLength]}</dd>
    </dl>
  );
}
