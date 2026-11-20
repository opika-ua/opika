"use client";

import { fillTemplate, uk } from "@opika/i18n";
import { useEffect, useState } from "react";
import { takeDeletedShelter } from "./deleted-notice";

/** The list's line after «Видалити притулок»: announced, once (`deleted-notice.ts`). */
export function DeletedNotice() {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    setName(takeDeletedShelter());
  }, []);
  return (
    <p role="status" className="text-label text-ink">
      {name === null ? null : fillTemplate(uk.kabinet.operator.deleteShelter.done, { name })}
    </p>
  );
}
