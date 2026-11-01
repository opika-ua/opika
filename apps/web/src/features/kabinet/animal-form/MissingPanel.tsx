import type { PublishGap } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { Text } from "../../../ui/Text";
import { TextLink } from "../../../ui/TextLink";
import type { AnimalTab } from "./animal-tabs";
import { GAP_TAB } from "./publish-gaps";

const t = uk.kabinet.animalForm;

/** The field names as the form's own labels, capitalised (never the lowercase `publish.gap.*`). */
const FIELD_LABEL: Record<PublishGap["kind"], string> = {
  sex: t.who.sexLabel,
  size: t.who.sizeLabel,
  age: t.age.title,
  description: t.description.title,
  photo: t.photos.title,
};

export const TAB_LABEL: Record<AnimalTab, string> = {
  osnovne: t.sections.basics,
  foto: t.photos.title,
  "pro-tvarynu": t.sections.about,
  zdorovia: t.sections.health,
  publikatsiia: t.sections.publication,
};

/**
 * What still blocks publishing, as links: each one switches to the tab that holds the field and
 * puts focus on it. «Усе потрібне заповнено» replaces an empty list. Ids are read by the
 * «Опублікувати» button's `aria-describedby`.
 */
export function MissingPanel({
  gaps,
  onGo,
}: {
  gaps: readonly PublishGap[];
  onGo: (gap: PublishGap) => void;
}) {
  if (gaps.length === 0) return <Text look="label">{t.publish.allSet}</Text>;
  return (
    <nav aria-labelledby="publish-missing" className="flex flex-col gap-1">
      <Text id="publish-missing" look="label">
        {t.publish.missingTitle}
      </Text>
      <ul id="publish-missing-list" className="flex flex-col items-start">
        {gaps.map((gap) => (
          <li key={gap.kind}>
            <TextLink
              href={`?tab=${GAP_TAB[gap.kind]}`}
              placement="standalone"
              onClick={(event) => {
                event.preventDefault();
                onGo(gap);
              }}
            >
              {fillTemplate(t.publish.missingItem, {
                field: FIELD_LABEL[gap.kind],
                tab: TAB_LABEL[GAP_TAB[gap.kind]],
              })}
            </TextLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
