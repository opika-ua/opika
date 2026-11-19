import { fillTemplate, uk } from "@opika/i18n";
import { Card } from "../../ui/Card";
import { Text } from "../../ui/Text";
import { KabinetEntryLink } from "../kabinet/KabinetEntryLink";
import { REGISTRATION_ANCHOR } from "./form-state";
import { RegistrationSignOut } from "./RegistrationSignOut";
import type { RegistrationViewer } from "./registration-viewer";

/**
 * The card in the form's place for someone already signed in (A2) or the operator (A3, A4): no
 * form, one sentence, the way into the kabinet (a full load, #509).
 */
export function RegistrationSignedIn({
  viewer,
}: {
  viewer: Exclude<RegistrationViewer, { kind: "anonymous" }>;
}) {
  const s = uk.registration.signedIn;
  return (
    <section id={REGISTRATION_ANCHOR} className="scroll-mt-24">
      <Card tone="outline">
        <div className="flex flex-col items-stretch gap-4 p-5 text-center tablet:p-8">
          <Text look="lead">
            {viewer.kind === "shelter"
              ? fillTemplate(s.admin, { email: viewer.maskedEmail })
              : s.operator}
          </Text>
          <KabinetEntryLink
            to={viewer.kind === "shelter" ? "home" : "operator"}
            variant="primary"
            size="lg"
            className="w-full"
          >
            {viewer.kind === "shelter" ? s.toKabinet : s.toApplications}
          </KabinetEntryLink>
          {viewer.kind === "shelter" ? (
            <RegistrationSignOut label={s.signOut} failed={uk.kabinet.profile.signOutFailed} />
          ) : null}
        </div>
      </Card>
    </section>
  );
}
