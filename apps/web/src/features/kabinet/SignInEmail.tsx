import { uk } from "@opika/i18n";
import { Text } from "../../ui/Text";

/** The address the person signs in with: a label and the value, from the server's session read. */
export function SignInEmail({ email }: { email: string | null }) {
  return (
    <div className="flex flex-col gap-1">
      <Text look="label">{uk.kabinet.signIn.emailLabel}</Text>
      <Text look="body" className="min-h-6 break-all">
        {email}
      </Text>
    </div>
  );
}
