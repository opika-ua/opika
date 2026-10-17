"use client";

import type { RegistryShelterView } from "@opika/contracts";
import type { ReactNode } from "react";
import { OperatorActionsProvider } from "./operator-actions";
import { useRouterReread } from "./use-router-reread";

/**
 * What S4 (R-UI 1's `/kabinet/prytulky/[id]`) wraps its sections in, so
 * every R-UI 3 control on the page shares one runner: one request at a time,
 * and a re-read is the page rendering itself again on the server.
 *
 * rebase: mount on S4. The page passes the record it read through its own
 * guard (`registry.shelters.byId`, in-process); the controls go inside:
 * `DecisionPanel` beside the evidence, `DonationDecision` in the donation
 * section, `AdminRowActions` on each admin row and `InviteAdminForm` under
 * the list, `SupportEntry` in the header.
 */
export function OperatorActionsRoot({
  view,
  children,
}: {
  view: RegistryShelterView;
  children: ReactNode;
}) {
  const reread = useRouterReread(view);
  return (
    <OperatorActionsProvider view={view} reread={reread}>
      {children}
    </OperatorActionsProvider>
  );
}
