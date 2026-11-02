"use client";

import { uk } from "@opika/i18n";
import { Text } from "../../ui/Text";
import { useSignedInPerson } from "./use-signed-in-person";

/** The address the person signs in with: a label and the value, read from the session. */
export function SignInEmail() {
  const email = useSignedInPerson()?.email ?? null;
  return (
    <div className="flex flex-col gap-1">
      <Text look="label">{uk.kabinet.signIn.emailLabel}</Text>
      <Text look="body" className="min-h-6 break-all">
        {email}
      </Text>
    </div>
  );
}
