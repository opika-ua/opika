"use client";

import type { AnimalId } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { useEffect, useState } from "react";
import { Button } from "../../ui/Button";
import {
  isAnimalSaved,
  MAX_LIKES,
  subscribeToLikesChanges,
  toggleSavedAnimal,
} from "./likes-store";

interface SaveButtonProps {
  animalId: AnimalId;
  animalName: string;
}

/**
 * The save toggle (designer round 1, S7; DR1-D8: the overlay and the animal page, since both
 * render this same `AnimalDetailScreen` - not the gallery card or the deck card). Bookmark
 * icon, no heart (his DR1-Q3). `aria-pressed` carries the state to a screen reader the same
 * way it decides the fill, so the two can never disagree.
 *
 * Read lazily in an effect, not at render: `localStorage` doesn't exist during server
 * rendering, and reading it during the client's first render (before hydration) would mismatch
 * what the server sent. The button renders unsaved until that effect runs, which is correct -
 * nothing about `isAnimalSaved` is knowable before then.
 *
 * Pet card PR 5: restyled off `buttonClass("icon")` (the old `rg-*` boxed-fill look, a visible
 * leftover from the previous design) onto the kit's icon `Button`, the same white circle the
 * overlay's close button and the photo slider's prev/next use.
 */
export function SaveButton({ animalId, animalName }: SaveButtonProps) {
  const [saved, setSaved] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    setSaved(isAnimalSaved(animalId));
    return subscribeToLikesChanges(() => setSaved(isAnimalSaved(animalId)));
  }, [animalId]);

  const toggle = () => {
    const result = toggleSavedAnimal(animalId, new Date());
    switch (result.kind) {
      case "saved":
        setSaved(true);
        setAnnouncement(fillTemplate(uk.likes.added, { name: animalName }));
        return;
      case "removed":
        setSaved(false);
        setAnnouncement(fillTemplate(uk.likes.removed, { name: animalName }));
        return;
      case "cap_reached":
        setAnnouncement(fillTemplate(uk.likes.full, { max: String(MAX_LIKES) }));
        return;
    }
  };

  return (
    <>
      <Button
        variant="icon"
        onClick={toggle}
        aria-pressed={saved}
        aria-label={saved ? uk.likes.saved : uk.likes.save}
        data-testid="save-button"
      >
        <BookmarkIcon filled={saved} />
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </>
  );
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 3.75A1.75 1.75 0 0 1 7.75 2h8.5A1.75 1.75 0 0 1 18 3.75V21l-6-4-6 4Z" />
    </svg>
  );
}
