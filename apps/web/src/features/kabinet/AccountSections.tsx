"use client";

import type { KabinetShelterView } from "@opika/contracts";
import { useState } from "react";
import {
  type KabinetProfileClient,
  kabinetProfileBrowserClient,
} from "../../api/kabinet-browser-client";
import { PauseControl } from "./profile-edit/PauseControl";
import { runWrite } from "./shared/write-result";

/** Pause or resume intake: the one account action that writes the shelter (the password has its own form). */
export function AccountSections({
  initialView,
  client = kabinetProfileBrowserClient,
}: {
  initialView: KabinetShelterView;
  client?: KabinetProfileClient;
}) {
  const [verification, setVerification] = useState(initialView.verification);
  const profile = client.shelter.profile;
  const write = async (call: () => Promise<KabinetShelterView>) => {
    const result = await runWrite(call);
    if (result.kind === "ok") setVerification(result.view.verification);
    return result;
  };
  return (
    <PauseControl
      verification={verification}
      pause={(reason) => write(() => profile.pause({ reason }))}
      resume={() => write(() => profile.resume({}))}
    />
  );
}
