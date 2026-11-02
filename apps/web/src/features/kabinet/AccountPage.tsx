import { uk } from "@opika/i18n";
import type { SignedInPerson } from "../../kabinet/signed-in-person";
import { Heading } from "../../ui/Heading";
import type { ProfileEditing } from "./home";
import { KabinetNav } from "./KabinetNav";
import { ChangePasswordSection, type PasswordState } from "./password/ChangePasswordSection";
import { animalListShownTo } from "./routes";
import { ShelterShell } from "./ShelterShell";
import { SignInEmail } from "./SignInEmail";

/**
 * «Акаунт і пароль»: personal only, the sign-in address and the password. What concerns the shelter
 * (pausing intake) lives on Притулок → Профіль. Under the same shell as the shelter's other pages;
 * it is in neither nav item, the account menu leads here.
 */
export function AccountPage({
  shelterName,
  editing,
  password,
  person,
}: {
  shelterName: string;
  editing: ProfileEditing;
  password: PasswordState | null;
  person: SignedInPerson | null;
}) {
  return (
    <ShelterShell
      shelterName={shelterName}
      viewer="admin"
      person={person}
      nav={<KabinetNav current={null} animalList={animalListShownTo("admin", editing)} />}
    >
      <Heading level={1} look="display-l" className="break-words">
        {uk.kabinet.shell.accountAndPassword}
      </Heading>
      <SignInEmail email={person?.email ?? null} />
      {password !== null ? <ChangePasswordSection password={password} /> : null}
    </ShelterShell>
  );
}
