import type { KabinetShelterView } from "@opika/contracts";
import { uk } from "@opika/i18n";
import { Card } from "../../ui/Card";
import { Heading } from "../../ui/Heading";
import { AccountSections } from "./AccountSections";
import type { ProfileEditing } from "./home";
import { KabinetNav } from "./KabinetNav";
import { ChangePasswordSection, type PasswordState } from "./password/ChangePasswordSection";
import { animalListShownTo } from "./routes";
import { ShelterShell } from "./ShelterShell";

/**
 * «Акаунт і пароль»: pause or resume intake (when writes are open) and the password, under the same
 * shell as the shelter's other pages. It is in neither nav item: the account menu leads here.
 */
export function AccountPage({
  view,
  editing,
  password,
}: {
  view: KabinetShelterView;
  editing: ProfileEditing;
  password: PasswordState | null;
}) {
  return (
    <ShelterShell
      shelterName={view.displayName}
      viewer="admin"
      nav={<KabinetNav current={null} animalList={animalListShownTo("admin", editing)} />}
    >
      <Heading level={1} look="display-l" className="break-words">
        {uk.kabinet.shell.accountAndPassword}
      </Heading>
      {editing.kind === "open" ? <AccountSections initialView={view} /> : null}
      {password !== null ? (
        <Card>
          <div className="p-4 tablet:p-6">
            <ChangePasswordSection password={password} />
          </div>
        </Card>
      ) : null}
    </ShelterShell>
  );
}
