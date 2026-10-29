"use client";

import type { KabinetAnimalView } from "@opika/contracts";
import {
  type AnimalPhoto,
  isDiscoverable,
  MAX_ANIMAL_PHOTOS,
  PHOTO_MAX_EDGE_PX,
} from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { useCallback, useRef, useState } from "react";
import type { KabinetAnimalClient } from "../../../api/kabinet-browser-client";
import { Badge } from "../../../ui/Badge";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { cx } from "../../../ui/cx";
import { InlineStatus } from "../../../ui/feedback";
import { Icon } from "../../../ui/Icon";
import { Photo } from "../../../ui/Photo";
import { Text } from "../../../ui/Text";
import { type CompressedPhoto, compressPhoto } from "../photos/compress-photo";
import { type ShelterVisibility, uploadProgressText } from "./labels";

/**
 * K3's «Фото» section body (N9), inside a `FormSection`: the photos as tiles in their order (the
 * first is the cover, P-Q9), an add tile, and one tile per photo on its way up. A failed upload
 * is a full-width row, not a tile: its sentence has to be readable on a phone.
 *
 * Every photo goes through `compressPhoto` on the device first (K-Q2: 2000 px,
 * re-encoded, which also drops its location data), then up over
 * `XMLHttpRequest`, so the tile can say how much has gone (answer 12). Uploads
 * run one after another: a budget phone decodes one large photo at a time.
 *
 * The order changes by dragging a photo (pointer events, mouse and touch
 * alike) or with each tile's own buttons, which are the keyboard's way in
 * (drag alone isn't operable without a pointer). Photo writes go one at a
 * time: the server compare-and-sets on the list the screen shows (P-Q3), so
 * a second write planned on the same list would only come back CONFLICT.
 */

const t = uk.kabinet.animalForm;
const integer = new Intl.NumberFormat("uk");

type UploadState =
  | { kind: "preparing" }
  | { kind: "uploading"; progress: { sent: number; total: number } | null }
  | { kind: "failed"; message: string; retryable: boolean };

type Upload = { id: number; file: File; state: UploadState };

const codeOf = (error: unknown): string | null =>
  typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : null;

/** A device-side refusal, in his words (P-T8 (1)-(3)); retrying the same file can't help. */
const compressionMessage = (result: Exclude<CompressedPhoto, { kind: "ok" }>): string => {
  switch (result.kind) {
    case "heic_unsupported":
      return t.photoErrors.heicUnsupported;
    case "unreadable":
      return t.photoErrors.unreadable;
    case "too_large":
      return t.photoErrors.tooLarge;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled refusal; unreachable at runtime */
    default: {
      const unreachable: never = result;
      return unreachable;
    }
  }
};

/** The server's refusal of an upload, in his words (P-T8 (4)-(8)); a lost connection is «Не завантажилось». */
const uploadFailure = (error: unknown): { message: string; retryable: boolean } => {
  switch (codeOf(error)) {
    case "PHOTO_REJECTED":
      return { message: t.photoErrors.rejected, retryable: false };
    case "PHOTO_LIMIT_REACHED":
      return {
        message: fillTemplate(t.photoErrors.limitReached, {
          max: integer.format(MAX_ANIMAL_PHOTOS),
        }),
        retryable: false,
      };
    case "RATE_LIMITED":
      return { message: t.photoErrors.rateLimited, retryable: true };
    case "PHOTO_UPLOADS_UNAVAILABLE":
      return { message: t.photoErrors.uploadsUnavailable, retryable: false };
    default:
      return { message: t.photos.failed, retryable: true };
  }
};

export function PhotoSection({
  animal,
  editable,
  shelterVisibility,
  client,
  onView,
  reload,
  compress = compressPhoto,
}: {
  animal: KabinetAnimalView;
  editable: boolean;
  /** Where the shelter's cards stand with the public (`shelterVisibilityOf`). */
  shelterVisibility: ShelterVisibility;
  client: KabinetAnimalClient;
  onView: (view: KabinetAnimalView) => void;
  reload: () => Promise<void>;
  compress?: (file: File) => Promise<CompressedPhoto>;
}) {
  const photos = animal.photos;
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [writing, setWriting] = useState(false);
  const [status, setStatus] = useState("");
  const [removedOnce, setRemovedOnce] = useState(false);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const drag = useRef<{ from: number; x: number; y: number; moved: boolean } | null>(null);

  const visibleListing = isDiscoverable(animal.listing);
  const lastPhotoLocked = visibleListing && photos.length === 1;
  // «бачать люди» is true only while the shelter's cards are shown. His other
  // line serves both hidden kinds: «поки її ще не бачать» ("while they still
  // don't see it") makes no claim about verification.
  const lastPhotoText =
    shelterVisibility === "visible" ? t.photos.lastPhotoKept : t.photos.lastPhotoKeptNotShown;
  const room =
    MAX_ANIMAL_PHOTOS - photos.length - uploads.filter((u) => u.state.kind !== "failed").length;

  const patchUpload = (id: number, state: UploadState | null) =>
    setUploads((current) =>
      state === null
        ? current.filter((upload) => upload.id !== id)
        : current.map((upload) => (upload.id === id ? { ...upload, state } : upload)),
    );

  const send = useCallback(
    async (upload: Upload) => {
      patchUpload(upload.id, { kind: "preparing" });
      // A decoder that throws rather than answering is, for the person, a
      // file this device couldn't open.
      const compressed = await compress(upload.file).catch(
        (): CompressedPhoto => ({ kind: "unreadable" }),
      );
      if (compressed.kind !== "ok") {
        patchUpload(upload.id, {
          kind: "failed",
          message: compressionMessage(compressed),
          retryable: false,
        });
        return;
      }
      patchUpload(upload.id, { kind: "uploading", progress: null });
      try {
        const view = await client.shelter.photos.add(
          {
            animalId: animal.id,
            file: new File([compressed.file], "photo.jpg", { type: "image/jpeg" }),
          },
          {
            context: {
              onUploadProgress: (progress) =>
                patchUpload(upload.id, { kind: "uploading", progress }),
            },
          },
        );
        onView(view);
        patchUpload(upload.id, null);
        setStatus(t.photos.added);
      } catch (error) {
        patchUpload(upload.id, { kind: "failed", ...uploadFailure(error) });
      }
    },
    [animal.id, client, compress, onView],
  );

  // One after another; a failed link never stops the ones queued behind it.
  const enqueue = (upload: Upload) => {
    queue.current = queue.current
      .then(() => send(upload))
      .catch(() =>
        patchUpload(upload.id, { kind: "failed", message: t.photos.failed, retryable: true }),
      );
  };

  const choose = (files: FileList | null) => {
    if (files === null) return;
    const accepted = [...files].slice(0, Math.max(0, room));
    const added = accepted.map((file) => ({
      id: nextId.current++,
      file,
      state: { kind: "preparing" } as const,
    }));
    setUploads((current) => [...current, ...added]);
    for (const upload of added) enqueue(upload);
  };

  const writePhotos = async (call: () => Promise<KabinetAnimalView>, done: string) => {
    setWriting(true);
    try {
      onView(await call());
      setStatus(done);
      return true;
    } catch (error) {
      const code = codeOf(error);
      if (code === "CONFLICT") {
        setStatus(t.photos.conflict);
        await reload();
      } else if (code === "PHOTOS_REQUIRED_WHILE_VISIBLE") {
        setStatus(lastPhotoText);
        await reload();
      } else {
        // A reorder or removal that didn't go through left the card as it
        // was: K4's «Не збереглося — на картках нічого не змінилося…» says
        // exactly that («Не завантажилось» is the upload tile's word).
        setStatus(uk.kabinet.profileEdit.state.failed);
      }
      return false;
    } finally {
      setWriting(false);
    }
  };

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= photos.length) return;
    const keys = photos.map((photo) => photo.storageKey);
    const next = [...keys];
    const [moved] = next.splice(from, 1);
    if (moved === undefined) return;
    next.splice(to, 0, moved);
    void writePhotos(
      () =>
        client.shelter.photos.reorder({
          animalId: animal.id,
          expectedPhotoKeys: keys,
          nextPhotoKeys: next,
        }),
      t.photos.reordered,
    );
  };

  const remove = async (photo: AnimalPhoto) => {
    const removed = await writePhotos(
      () =>
        client.shelter.photos.remove({
          animalId: animal.id,
          expectedPhotoKeys: photos.map((p) => p.storageKey),
          storageKey: photo.storageKey,
        }),
      t.photos.removed,
    );
    if (removed) setRemovedOnce(true);
  };

  // Dragging: the pointer's own events, captured on the tile it started on;
  // the tile under the pointer at release is where the photo goes.
  const tileAt = (x: number, y: number): number | null => {
    const tile = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-photo-index]");
    const index = tile?.dataset.photoIndex;
    return index === undefined ? null : Number(index);
  };

  const lastPhotoNoteId = `${animal.id}-last-photo`;
  const total = photos.length;
  const failed = uploads.filter((upload) => upload.state.kind === "failed");
  const inProgress = uploads.filter((upload) => upload.state.kind !== "failed");

  return (
    <>
      <ul className="grid grid-cols-2 items-start gap-3 tablet:grid-cols-3 desktop:grid-cols-4">
        {photos.map((photo, index) => (
          <li
            key={photo.storageKey}
            data-photo-index={index}
            className={cx("min-w-0 rounded-card", dragOver === index && "ring-4 ring-ink")}
          >
            <Card tone="outline">
              <fieldset
                aria-label={fillTemplate(t.photos.tileLabel, {
                  n: integer.format(index + 1),
                  total: integer.format(total),
                })}
                className="flex min-w-0 flex-col"
                disabled={!editable || writing}
              >
                <div className="relative">
                  {/* biome-ignore lint/a11y/noStaticElementInteractions: the drag is the pointer's way to reorder; the keyboard's is the tile's own buttons */}
                  <div
                    className={editable ? "cursor-grab touch-none" : undefined}
                    // The browser's own image drag would cancel the pointer drag below.
                    onDragStart={(event) => event.preventDefault()}
                    onPointerDown={(event) => {
                      if (!editable || writing || event.button !== 0) return;
                      event.currentTarget.setPointerCapture(event.pointerId);
                      drag.current = {
                        from: index,
                        x: event.clientX,
                        y: event.clientY,
                        moved: false,
                      };
                    }}
                    onPointerMove={(event) => {
                      const current = drag.current;
                      if (current === null) return;
                      if (
                        !current.moved &&
                        Math.hypot(event.clientX - current.x, event.clientY - current.y) < 8
                      ) {
                        return;
                      }
                      current.moved = true;
                      setDragOver(tileAt(event.clientX, event.clientY));
                    }}
                    onPointerUp={(event) => {
                      const current = drag.current;
                      drag.current = null;
                      setDragOver(null);
                      if (current === null || !current.moved) return;
                      const to = tileAt(event.clientX, event.clientY);
                      if (to !== null) move(current.from, to);
                    }}
                    onPointerCancel={() => {
                      drag.current = null;
                      setDragOver(null);
                    }}
                  >
                    <Photo
                      src={photo.storageKey}
                      alt=""
                      aspect="portrait"
                      sizes="(min-width: 1024px) 160px, (min-width: 600px) 200px, 50vw"
                    />
                  </div>
                  {index === 0 ? (
                    <Badge tone="ink" className="absolute bottom-2 left-2">
                      {t.photos.cover}
                    </Badge>
                  ) : null}
                  {editable ? (
                    <Button
                      variant="icon"
                      className="absolute top-2 right-2"
                      aria-label={fillTemplate(t.photos.remove, { n: integer.format(index + 1) })}
                      aria-disabled={lastPhotoLocked || undefined}
                      aria-describedby={lastPhotoLocked ? lastPhotoNoteId : undefined}
                      onClick={() => {
                        if (!lastPhotoLocked) void remove(photo);
                      }}
                    >
                      <Icon name="close" />
                    </Button>
                  ) : null}
                </div>
                {editable && total > 1 ? (
                  <div className="flex flex-col items-start p-1">
                    <div className="flex">
                      {index > 0 ? (
                        <Button
                          variant="ghost"
                          aria-label={t.photos.moveEarlier}
                          onClick={() => move(index, index - 1)}
                        >
                          <Icon name="chevron-left" />
                        </Button>
                      ) : null}
                      {index < total - 1 ? (
                        <Button
                          variant="ghost"
                          aria-label={t.photos.moveLater}
                          onClick={() => move(index, index + 1)}
                        >
                          <Icon name="chevron-right" />
                        </Button>
                      ) : null}
                    </div>
                    {index > 0 ? (
                      <Button variant="ghost" onClick={() => move(index, 0)}>
                        {t.photos.makeCover}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </fieldset>
            </Card>
          </li>
        ))}
        {inProgress.map((upload) => (
          <li key={`upload-${upload.id}`} className="min-w-0">
            <Card tone="outline" className="flex aspect-4/5 flex-col justify-end gap-2 p-3">
              {upload.state.kind === "preparing" ? (
                <Text look="hint">{t.photos.preparing}</Text>
              ) : null}
              {upload.state.kind === "uploading" ? (
                <>
                  <progress
                    className="h-2 w-full accent-ink"
                    max={upload.state.progress?.total ?? 1}
                    value={upload.state.progress?.sent ?? undefined}
                    aria-label={t.photos.uploading}
                  />
                  <Text look="hint">
                    {upload.state.progress === null
                      ? t.photos.uploading
                      : uploadProgressText(upload.state.progress.sent, upload.state.progress.total)}
                  </Text>
                </>
              ) : null}
            </Card>
          </li>
        ))}
        {editable && room > 0 ? (
          <li className="min-w-0">
            <Card tone="outline" className="flex aspect-4/5 items-center justify-center p-3">
              <Button variant="secondary" onClick={() => fileInput.current?.click()}>
                {t.photos.add}
              </Button>
            </Card>
          </li>
        ) : null}
        {failed.map((upload) =>
          upload.state.kind === "failed" ? (
            <li key={`upload-${upload.id}`} className="col-span-full flex flex-col gap-2">
              <InlineStatus tone="error">{upload.state.message}</InlineStatus>
              <div className="flex flex-wrap gap-2">
                {upload.state.retryable ? (
                  <Button variant="secondary" onClick={() => enqueue(upload)}>
                    {uk.kabinet.profileEdit.state.retry}
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  aria-label={t.photos.dismissFailedName}
                  onClick={() => patchUpload(upload.id, null)}
                >
                  {t.photos.dismissFailed}
                </Button>
              </div>
            </li>
          ) : null,
        )}
      </ul>
      {editable ? (
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          data-testid="photo-file-input"
          onChange={(event) => {
            choose(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
        />
      ) : null}
      {editable && room > 0 ? <Text look="hint">{t.photos.addHint}</Text> : null}
      {editable && room <= 0 ? (
        <Text look="hint">
          {fillTemplate(t.photos.capReached, { max: integer.format(MAX_ANIMAL_PHOTOS) })}
        </Text>
      ) : null}
      {editable && lastPhotoLocked ? (
        <Text look="hint" id={lastPhotoNoteId}>
          {lastPhotoText}
        </Text>
      ) : null}
      <Text look="hint">
        {fillTemplate(t.photos.howItWorks, { px: integer.format(PHOTO_MAX_EDGE_PX) })}
      </Text>
      <Text look="hint">{t.photos.privacyNote}</Text>
      {visibleListing ? <Text look="hint">{t.photos.dateMoves}</Text> : null}
      {removedOnce ? <Text look="hint">{t.photos.removedStillReachable}</Text> : null}
      <p role="status" className="text-caption text-ink-2 empty:sr-only">
        {status}
      </p>
    </>
  );
}
