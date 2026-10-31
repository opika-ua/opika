"use client";

import type { KabinetAnimalView } from "@opika/contracts";
import { type AnimalPhoto, isDiscoverable, MAX_ANIMAL_PHOTOS } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { KabinetAnimalClient } from "../../../api/kabinet-browser-client";
import { Badge } from "../../../ui/Badge";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { cx } from "../../../ui/cx";
import { InlineStatus } from "../../../ui/feedback";
import { Icon } from "../../../ui/Icon";
import { Menu, MenuDivider, MenuItem } from "../../../ui/Menu";
import { Photo } from "../../../ui/Photo";
import { Text } from "../../../ui/Text";
import { type CompressedPhoto, compressPhoto } from "../photos/compress-photo";
import { type ShelterVisibility, uploadProgressText } from "./labels";
import { usePhotoDrag } from "./use-photo-drag";

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
 * The order changes by dragging the tile (pointer events, `use-photo-drag`: a mouse drags, a held
 * finger lifts) or with each tile's ⋯ menu, the keyboard's and screen reader's way in. Photo writes go one at a
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
  const [announce, setAnnounce] = useState("");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState(false);
  const pointerType = useRef("mouse");
  const tileIds = useRef(new Map<string, number>());
  const fileInput = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const queue = useRef<Promise<void>>(Promise.resolve());

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

  // Every reorder, from the menu or a drag, is this one call; «Зробити обкладинкою» is move(i, 0).
  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= photos.length) return Promise.resolve(false);
    const keys = photos.map((photo) => photo.storageKey);
    const next = [...keys];
    const [moved] = next.splice(from, 1);
    if (moved === undefined) return Promise.resolve(false);
    next.splice(to, 0, moved);
    return writePhotos(
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

  const total = photos.length;
  const where = (pos: number) => ({ pos: integer.format(pos + 1), total: integer.format(total) });
  const { drag, start } = usePhotoDrag(total, {
    onPickUp: (from) =>
      setAnnounce(
        fillTemplate(t.photos.dragPickUp, { n: integer.format(from + 1), ...where(from) }),
      ),
    onMove: (over) => setAnnounce(fillTemplate(t.photos.dragMove, where(over))),
    onDrop: (from, to) => {
      setAnnounce(fillTemplate(t.photos.dragDrop, { n: integer.format(from + 1), ...where(to) }));
      void move(from, to);
    },
    onCancel: () => setAnnounce(t.photos.dragCancel),
  });
  const canDrag = editable && !writing && total > 1;
  // While dragging, the others reflow around the slot where the photo would land.
  const order = photos.map((photo, index) => ({ photo, index }));
  if (drag !== null) {
    const [lifted] = order.splice(drag.from, 1);
    if (lifted !== undefined) order.splice(drag.over, 0, lifted);
  }
  const triggerIdOf = (key: string) => {
    let id = tileIds.current.get(key);
    if (id === undefined) {
      id = tileIds.current.size + 1;
      tileIds.current.set(key, id);
    }
    return `${animal.id}-photo-menu-${id}`;
  };
  // The menu closes first; focus then goes back to the tile's ⋯ (gone after a removal: no-op).
  const runFromMenu = async (key: string, action: () => Promise<unknown>) => {
    setOpenMenu(null);
    await action();
    document.getElementById(triggerIdOf(key))?.focus();
  };

  const lastPhotoNoteId = `${animal.id}-last-photo`;
  const failed = uploads.filter((upload) => upload.state.kind === "failed");
  const inProgress = uploads.filter((upload) => upload.state.kind !== "failed");
  const sizes = "(min-width: 600px) 200px, 50vw";
  const lifted = drag === null ? undefined : photos[drag.from];
  const menuItem = "w-full justify-start";

  return (
    <>
      <ul className="grid grid-cols-2 items-start gap-3 tablet:grid-cols-3 desktop:grid-cols-4">
        {order.map(({ photo, index }, slot) => {
          const key = photo.storageKey;
          if (drag !== null && index === drag.from) {
            return (
              <li
                key={key}
                data-photo-slot={slot}
                aria-hidden="true"
                className="aspect-4/5 min-w-0 rounded-card border-2 border-species-dog bg-status-published"
              />
            );
          }
          const n = integer.format(slot + 1);
          return (
            <li key={key} data-photo-slot={slot} className="min-w-0">
              <Card tone="outline">
                <fieldset
                  aria-label={fillTemplate(t.photos.tileLabel, { n, total: integer.format(total) })}
                  className="flex min-w-0 flex-col"
                  disabled={!editable || writing}
                >
                  <div className="relative">
                    <Photo src={key} alt="" aspect="portrait" sizes={sizes} />
                    {canDrag ? (
                      // The whole tile is the drag target: a mouse drags, a held finger lifts the
                      // photo. The menu is the keyboard's and screen reader's way to every move.
                      // biome-ignore lint/a11y/noStaticElementInteractions: pointer-only layer over the photo
                      <div
                        className="absolute inset-0 cursor-grab select-none"
                        data-photo-surface=""
                        onDragStart={(event) => event.preventDefault()}
                        onContextMenu={(event) => {
                          if (pointerType.current !== "mouse") event.preventDefault();
                        }}
                        onPointerDown={(event) => {
                          pointerType.current = event.pointerType;
                          if (event.button !== 0) return;
                          if ((event.target as Element).closest("button")) return;
                          start(slot, event);
                        }}
                      />
                    ) : null}
                    <Badge tone="ink" className="pointer-events-none absolute top-2 left-2">
                      <span aria-hidden="true">{n}</span>
                    </Badge>
                    {slot === 0 ? (
                      <Badge tone="ink" className="pointer-events-none absolute bottom-2 left-2">
                        {t.photos.cover}
                      </Badge>
                    ) : null}
                    {editable ? (
                      <>
                        <div className="absolute top-0.5 right-0.5">
                          <Menu
                            open={openMenu === key}
                            onOpenChange={(open) => setOpenMenu(open ? key : null)}
                            trigger="icon-compact"
                            label={fillTemplate(t.photos.menuLabel, { n })}
                            triggerId={triggerIdOf(key)}
                          >
                            {slot > 0 ? (
                              <MenuItem>
                                <Button
                                  variant="ghost"
                                  className={menuItem}
                                  onClick={() => void runFromMenu(key, () => move(slot, 0))}
                                >
                                  {t.photos.makeCover}
                                </Button>
                              </MenuItem>
                            ) : null}
                            {slot > 0 ? (
                              <MenuItem>
                                <Button
                                  variant="ghost"
                                  className={menuItem}
                                  onClick={() => void runFromMenu(key, () => move(slot, slot - 1))}
                                >
                                  {t.photos.moveEarlier}
                                </Button>
                              </MenuItem>
                            ) : null}
                            {slot < total - 1 ? (
                              <MenuItem>
                                <Button
                                  variant="ghost"
                                  className={menuItem}
                                  onClick={() => void runFromMenu(key, () => move(slot, slot + 1))}
                                >
                                  {t.photos.moveLater}
                                </Button>
                              </MenuItem>
                            ) : null}
                            {total > 1 ? <MenuDivider /> : null}
                            <MenuItem tone="danger">
                              <Button
                                variant="ghost"
                                className={menuItem}
                                aria-disabled={lastPhotoLocked || undefined}
                                aria-describedby={lastPhotoLocked ? lastPhotoNoteId : undefined}
                                onClick={() => {
                                  if (!lastPhotoLocked) void runFromMenu(key, () => remove(photo));
                                }}
                              >
                                {t.photos.remove}
                              </Button>
                            </MenuItem>
                          </Menu>
                        </div>
                      </>
                    ) : null}
                  </div>
                </fieldset>
              </Card>
            </li>
          );
        })}
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
        {failed.map((upload) =>
          upload.state.kind === "failed" ? (
            <li key={`upload-${upload.id}`} className="min-w-0">
              <Card tone="outline" className="flex aspect-4/5 flex-col justify-between gap-2 p-3">
                <InlineStatus tone="error">{upload.state.message}</InlineStatus>
                <div className="flex flex-col items-start">
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
              </Card>
            </li>
          ) : null,
        )}
        {editable && room > 0 ? (
          <li className="min-w-0">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              onDragOver={(event) => {
                if (!event.dataTransfer.types.includes("Files")) return;
                event.preventDefault();
                setDropTarget(true);
              }}
              onDragLeave={() => setDropTarget(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDropTarget(false);
                choose(event.dataTransfer.files);
              }}
              className={cx(
                "flex aspect-4/5 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-card border-2 border-dashed p-3 text-center focus-ring",
                dropTarget ? "border-species-dog bg-status-published" : "border-line bg-surface",
              )}
            >
              <Icon name="plus" />
              <span className="text-label text-ink">{t.photos.addTile}</span>
              <span className="text-caption text-ink-2">
                {fillTemplate(t.photos.addLeft, { left: integer.format(room) })}
                <span className="hidden pointer-fine:inline"> · {t.photos.addDrop}</span>
              </span>
            </button>
          </li>
        ) : null}
      </ul>
      {drag !== null && lifted !== undefined
        ? createPortal(
            <div
              aria-hidden="true"
              style={{
                left: drag.x - drag.dx,
                top: drag.y - drag.dy,
                width: drag.width,
                height: drag.height,
              }}
              className="pointer-events-none fixed z-(--z-popover) scale-105 overflow-clip rounded-card shadow-float motion-reduce:scale-100 motion-reduce:shadow-none"
            >
              <Photo src={lifted.storageKey} alt="" aspect="portrait" sizes={sizes} />
            </div>,
            document.body,
          )
        : null}
      <p role="status" className="sr-only">
        {announce}
      </p>
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
      {visibleListing ? <Text look="hint">{t.photos.dateNote}</Text> : null}
      {removedOnce ? <Text look="hint">{t.photos.removedStillReachable}</Text> : null}
      <p role="status" className="text-caption text-ink-2 empty:sr-only">
        {status}
      </p>
    </>
  );
}
