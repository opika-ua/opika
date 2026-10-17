"use client";

import type { KabinetAnimalView } from "@opika/contracts";
import {
  type AnimalPhoto,
  isDiscoverable,
  MAX_ANIMAL_PHOTOS,
  PHOTO_MAX_EDGE_PX,
} from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import Image from "next/image";
import { type ReactNode, useCallback, useRef, useState } from "react";
import type { KabinetAnimalClient } from "../../../api/kabinet-browser-client";
import { Button } from "../../controls/controls";
import { type CompressedPhoto, compressPhoto } from "../photos/compress-photo";
import { CAPTION, CARD, CARD_TITLE, ERROR_TEXT } from "../profile-edit/styles";
import { uploadProgressText } from "./labels";

/**
 * K3's «Фото» section (N9): the photos as tiles in their order (the first is
 * the cover, P-Q9), an add tile, and one tile per photo on its way up.
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

/** A device-side refusal, in his words (P-T8 (1)–(3)); retrying the same file can't help. */
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

/** The server's refusal of an upload, in his words (P-T8 (4)–(8)); a lost connection is «Не завантажилось». */
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
    case "SHELTER_WRITES_NOT_YET_AVAILABLE":
      return { message: uk.kabinet.profileEdit.errors.notAvailable, retryable: false };
    default:
      return { message: t.photos.failed, retryable: true };
  }
};

export function PhotoSection({
  animal,
  editable,
  shelterVisible,
  client,
  onView,
  reload,
  lastPhotoHiddenText,
  compress = compressPhoto,
}: {
  animal: KabinetAnimalView;
  editable: boolean;
  /** Whether the shelter's cards are on the public surfaces now (verified, not paused). */
  shelterVisible: boolean;
  client: KabinetAnimalClient;
  onView: (view: KabinetAnimalView) => void;
  reload: () => Promise<void>;
  /**
   * What says why the last photo stays while the shelter's cards are hidden
   * (paused or not verified), where `lastPhotoKept`'s «бачать люди» would be
   * false: the allowlisted shelter's pending stand-in, or null (nothing).
   */
  lastPhotoHiddenText: ReactNode | null;
  compress?: (file: File) => Promise<CompressedPhoto>;
}) {
  const photos = animal.photos;
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [writing, setWriting] = useState(false);
  const [status, setStatus] = useState<ReactNode>("");
  const [removedOnce, setRemovedOnce] = useState(false);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const drag = useRef<{ from: number; x: number; y: number; moved: boolean } | null>(null);

  const visibleListing = isDiscoverable(animal.listing);
  const lastPhotoLocked = visibleListing && photos.length === 1;
  const lastPhotoText = shelterVisible ? t.photos.lastPhotoKept : lastPhotoHiddenText;
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
      const compressed = await compress(upload.file);
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

  const enqueue = (upload: Upload) => {
    queue.current = queue.current.then(() => send(upload));
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
      } else if (code === "SHELTER_WRITES_NOT_YET_AVAILABLE") {
        setStatus(uk.kabinet.profileEdit.errors.notAvailable);
      } else {
        setStatus(t.photos.failed);
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

  return (
    <section aria-labelledby="photos-title" className={CARD}>
      <h2 id="photos-title" className={CARD_TITLE}>
        {t.photos.title}
      </h2>
      <p className={CAPTION}>{t.photos.ratioNote}</p>
      <ul className="grid grid-cols-3 gap-3 tablet:grid-cols-4">
        {photos.map((photo, index) => (
          <li
            key={photo.storageKey}
            data-photo-index={index}
            className={`flex min-w-0 flex-col gap-2 rounded-rg-photo ${dragOver === index ? "ring-2 ring-rg-ink" : ""}`}
          >
            <fieldset
              aria-label={fillTemplate(t.photos.tileLabel, {
                n: integer.format(index + 1),
                total: integer.format(total),
              })}
              className="flex min-w-0 flex-col gap-2"
              disabled={!editable || writing}
            >
              <div
                className={`relative aspect-4/5 overflow-hidden rounded-rg-photo bg-rg-fill-strong ${editable ? "cursor-grab touch-none" : ""}`}
                onPointerDown={(event) => {
                  if (!editable || writing || event.button !== 0) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  drag.current = { from: index, x: event.clientX, y: event.clientY, moved: false };
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
                <Image
                  src={photo.storageKey}
                  alt=""
                  fill
                  sizes="(min-width: 600px) 148px, 94px"
                  className="pointer-events-none object-cover"
                  draggable={false}
                />
                {index === 0 ? (
                  <span className="absolute top-2 left-2 rounded-rg-chip bg-rg-surface px-3 py-1 text-sm font-medium text-rg-ink">
                    {t.photos.cover}
                  </span>
                ) : null}
              </div>
              {editable ? (
                <div className="flex flex-col items-start gap-1">
                  {index > 0 ? (
                    <Button variant="text" onClick={() => move(index, 0)}>
                      {t.photos.makeCover}
                    </Button>
                  ) : null}
                  {index > 0 ? (
                    <Button variant="text" onClick={() => move(index, index - 1)}>
                      {t.photos.moveEarlier}
                    </Button>
                  ) : null}
                  {index < total - 1 ? (
                    <Button variant="text" onClick={() => move(index, index + 1)}>
                      {t.photos.moveLater}
                    </Button>
                  ) : null}
                  <Button
                    variant="text"
                    aria-disabled={lastPhotoLocked || undefined}
                    aria-describedby={
                      lastPhotoLocked && lastPhotoText !== null ? lastPhotoNoteId : undefined
                    }
                    onClick={() => {
                      if (!lastPhotoLocked) void remove(photo);
                    }}
                  >
                    {fillTemplate(t.photos.remove, { n: integer.format(index + 1) })}
                  </Button>
                </div>
              ) : null}
            </fieldset>
          </li>
        ))}
        {uploads.map((upload) => (
          <li key={`upload-${upload.id}`} className="flex min-w-0 flex-col gap-2">
            <div
              className={`flex aspect-4/5 flex-col justify-end gap-2 rounded-rg-photo p-2 ${upload.state.kind === "failed" ? "bg-rg-fill ring-2 ring-rg-ink ring-inset" : "bg-rg-fill-strong"}`}
            >
              {upload.state.kind === "preparing" ? (
                <p className={CAPTION}>{t.photos.preparing}</p>
              ) : null}
              {upload.state.kind === "uploading" ? (
                <>
                  <progress
                    className="h-1.5 w-full accent-rg-ink"
                    max={upload.state.progress?.total ?? 1}
                    value={upload.state.progress?.sent ?? undefined}
                    aria-label={t.photos.uploading}
                  />
                  <p className={CAPTION}>
                    {upload.state.progress === null
                      ? t.photos.uploading
                      : uploadProgressText(upload.state.progress.sent, upload.state.progress.total)}
                  </p>
                </>
              ) : null}
              {upload.state.kind === "failed" ? (
                <p role="alert" className={ERROR_TEXT}>
                  {upload.state.message}
                </p>
              ) : null}
            </div>
            {upload.state.kind === "failed" ? (
              <div className="flex flex-col items-start gap-1">
                {upload.state.retryable ? (
                  <Button variant="text" onClick={() => enqueue(upload)}>
                    {uk.kabinet.profileEdit.state.retry}
                  </Button>
                ) : null}
                <Button
                  variant="text"
                  aria-label={t.photos.dismissFailedName}
                  onClick={() => patchUpload(upload.id, null)}
                >
                  {t.photos.dismissFailed}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
        {editable ? (
          <li className="flex min-w-0 flex-col gap-2">
            {room > 0 ? (
              <>
                <Button
                  variant="secondary"
                  className="aspect-4/5 w-full rounded-rg-photo border-2 border-dashed border-rg-ink-3"
                  onClick={() => fileInput.current?.click()}
                >
                  {t.photos.add}
                </Button>
                <p className={CAPTION}>{t.photos.addHint}</p>
              </>
            ) : (
              <p className={CAPTION}>
                {fillTemplate(t.photos.capReached, { max: integer.format(MAX_ANIMAL_PHOTOS) })}
              </p>
            )}
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
          </li>
        ) : null}
      </ul>
      {editable && lastPhotoLocked && lastPhotoText !== null ? (
        <p id={lastPhotoNoteId} className={CAPTION}>
          {lastPhotoText}
        </p>
      ) : null}
      <p className={CAPTION}>
        {fillTemplate(t.photos.howItWorks, { px: integer.format(PHOTO_MAX_EDGE_PX) })}
      </p>
      <p className={CAPTION}>{t.photos.privacyNote}</p>
      {visibleListing ? <p className={CAPTION}>{t.photos.dateMoves}</p> : null}
      {removedOnce ? <p className={CAPTION}>{t.photos.removedStillReachable}</p> : null}
      <p role="status" className={CAPTION}>
        {status}
      </p>
    </section>
  );
}
