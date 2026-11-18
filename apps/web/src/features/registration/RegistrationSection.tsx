import { derivedSecretKey } from "../../api/rate-limit-key";
import { Card } from "../../ui/Card";
import { Heading } from "../../ui/Heading";
import { Text } from "../../ui/Text";
import { TextLink } from "../../ui/TextLink";
import { FORM_STAMP_KEY_LABEL, issueFormStamp } from "./form-stamp";
import {
  EMPTY_VALUES,
  REGISTRATION_ANCHOR,
  REGISTRATION_HEADING_ID,
  type RegistrationFormState,
} from "./form-state";
import { RegistrationForm } from "./RegistrationForm";
import { registerShelter, searchRegistrationCities } from "./register-shelter";
import { registrationCopy, type TemplatePart } from "./registration-copy";

/**
 * The registration form's slot on /prytulkam (`#reyestratsiia`, spec §13.1), rendered only while
 * `isSelfRegistrationEnabled()`. The pitch and the form card sit side by side once the section is
 * wide enough (a container query, so the page decides the width), stacked otherwise; the
 * «Хочете, щоб я допоміг?» line follows the form. The form's strings are picked here, so the
 * client bundle carries only them.
 */
export function RegistrationSection() {
  const copy = registrationCopy();
  const initial: RegistrationFormState = {
    result: null,
    values: EMPTY_VALUES,
    formStamp: issueFormStamp(new Date(), derivedSecretKey(FORM_STAMP_KEY_LABEL)),
  };
  const help = (part: TemplatePart, index: number) => {
    if ("text" in part) return <span key={index}>{part.text}</span>;
    if (part.slot === "telegram") {
      return (
        <TextLink key={index} href={copy.contact.telegramUrl}>
          {copy.contact.telegram}
        </TextLink>
      );
    }
    return (
      <TextLink key={index} href={`mailto:${copy.contact.email}`}>
        {copy.contact.email}
      </TextLink>
    );
  };
  return (
    <section
      id={REGISTRATION_ANCHOR}
      aria-labelledby={REGISTRATION_HEADING_ID}
      className="@container scroll-mt-24"
    >
      <div className="grid grid-cols-1 gap-6 @3xl:grid-cols-2 @3xl:items-start">
        <div className="flex flex-col gap-3">
          <Heading level={2} look="title" id={REGISTRATION_HEADING_ID} tabIndex={-1}>
            {copy.title}
          </Heading>
          <Text look="lead" className="text-ink-2">
            {copy.lead}
          </Text>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Card tone="outline">
            <div className="p-5 tablet:p-6">
              <RegistrationForm
                action={registerShelter}
                searchCities={searchRegistrationCities}
                initial={initial}
                copy={copy}
                headingId={REGISTRATION_HEADING_ID}
              />
            </div>
          </Card>
          <Text look="body" className="text-ink-2">
            {copy.help.map(help)}
          </Text>
        </div>
      </div>
    </section>
  );
}
