"use client";

import { uk } from "@opika/i18n";
import { useState } from "react";
import { Button } from "../../../ui/Button";
import { Icon } from "../../../ui/Icon";
import { Panel } from "../../../ui/Panel";
import { Text } from "../../../ui/Text";

/**
 * «Притулок схвалено» (Q3): dismissible for this visit. Nothing is stored; it stops showing for
 * good once the shelter publishes its first card (`applicationBannersOf`).
 */
export function ApprovedBanner() {
  const [shown, setShown] = useState(true);
  if (!shown) return null;
  return (
    <Panel tone="outline" padding="md" className="flex items-start justify-between gap-3">
      <Text look="label" className="self-center">
        {uk.kabinet.application.approved}
      </Text>
      <Button
        variant="icon"
        aria-label={uk.kabinet.profileEdit.pause.close}
        onClick={() => setShown(false)}
      >
        <Icon name="close" size="md" />
      </Button>
    </Panel>
  );
}
