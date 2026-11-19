import { uk } from "@opika/i18n";
import { derivedSecretKey } from "../../api/rate-limit-key";
import { OPERATOR_CONTACT } from "../../brand";
import { AssistanceLine } from "../../ui/AssistanceLine";
import { AuthCardFooter } from "../../ui/AuthCardFooter";
import { Card } from "../../ui/Card";
import { kabinetEntryHref } from "../kabinet/KabinetEntryLink";
import { FORM_STAMP_KEY_LABEL, issueFormStamp } from "./form-stamp";
import {
  EMPTY_VALUES,
  REGISTRATION_ANCHOR,
  REGISTRATION_HEADING_ID,
  type RegistrationFormState,
} from "./form-state";
import { RegistrationForm } from "./RegistrationForm";
import { registerShelter, searchRegistrationCities } from "./register-shelter";
import { registrationCopy } from "./registration-copy";

/**
 * The registration card on /prytulkam (`#reyestratsiia`), only while `isSelfRegistrationEnabled()`:
 * the two-step form with the sign-in switch inside the card and the help line under it. The
 * form's strings are picked here, so the client bundle carries only them.
 */
export function RegistrationSection() {
  const copy = registrationCopy();
  const r = uk.registration;
  const initial: RegistrationFormState = {
    result: null,
    values: EMPTY_VALUES,
    formStamp: issueFormStamp(new Date(), derivedSecretKey(FORM_STAMP_KEY_LABEL)),
  };
  return (
    <section
      id={REGISTRATION_ANCHOR}
      aria-labelledby={REGISTRATION_HEADING_ID}
      className="flex min-w-0 scroll-mt-24 flex-col gap-4"
    >
      <Card tone="outline">
        <div className="p-5 tablet:p-8">
          <RegistrationForm
            action={registerShelter}
            searchCities={searchRegistrationCities}
            initial={initial}
            copy={copy}
            headingId={REGISTRATION_HEADING_ID}
          />
        </div>
        <AuthCardFooter
          text={r.footer.text}
          linkLabel={r.footer.link}
          href={kabinetEntryHref("signIn")}
        />
      </Card>
      <AssistanceLine
        text={r.assistance.text}
        linkLabel={r.assistance.link}
        href={`mailto:${OPERATOR_CONTACT.email}`}
      />
    </section>
  );
}
