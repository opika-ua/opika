"use client";

import type { AnimalId } from "@opika/domain";
import { ukPublic as uk } from "@opika/i18n/public";
import { useState } from "react";
import { SITE_ORIGIN } from "../../brand";
import { Button } from "../../ui/Button";

/**
 * Pet card PR 5, owner decision 5: «Поділитись» (the panel header's own
 * second pill, ink `bg-brand-ink`) uses the Web Share API with the animal's
 * name and the **canonical** `/tvaryny/{id}` URL - no gallery query params,
 * built from `animal.id` directly (not `window.location`, which would carry
 * whatever filter/sort context the overlay's own URL happens to have, the
 * same reasoning `[animalId]/page.tsx`'s `generateMetadata` already gives
 * for its own `alternates.canonical`). Falls back to a clipboard copy plus
 * his `detail.shareCopied` announcement when `navigator.share` doesn't
 * exist - a progressive enhancement, not a must-always-work path, so a
 * browser with neither API silently does nothing rather than throwing.
 *
 * No new dependency (owner decision 5) and no click tracking. The
 * announcement pattern mirrors `SaveButton.tsx`'s own `aria-live="polite"`
 * region exactly, rather than building a generic toast system for one
 * string.
 */
export function ShareButton({ animalId, animalName }: { animalId: AnimalId; animalName: string }) {
  const [announcement, setAnnouncement] = useState("");
  const url = `${SITE_ORIGIN}/tvaryny/${animalId}`;

  const share = async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: animalName, url });
      } catch {
        // AbortError (the person cancelled the share sheet) or any other
        // failure: nothing to announce, nothing to fall back to - the
        // person saw the native share UI, which is itself the feedback.
      }
      return;
    }
    if (typeof navigator.clipboard?.writeText === "function") {
      try {
        await navigator.clipboard.writeText(url);
        setAnnouncement(uk.detail.shareCopied);
      } catch {
        // No clipboard permission or a non-secure context - a silent no-op,
        // same posture as the share-unsupported case above.
      }
    }
  };

  return (
    <>
      <Button size="lg" data-testid="share-button" onClick={() => void share()}>
        {uk.detail.share}
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </>
  );
}
