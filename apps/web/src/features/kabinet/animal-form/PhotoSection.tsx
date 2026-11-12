"use client";

import "../../../zod-client-config";
import type { KabinetAnimalView } from "@opika/contracts";
import { isRealPhotoKey } from "@opika/db/image-pipeline";
import { isDiscoverable, MAX_ANIMAL_PHOTOS, type PhotoFraming } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import {
  type ComponentType,
  type KeyboardEvent,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { KabinetAnimalClient } from "../../../api/kabinet-browser-client";
import { ActionPill, type ActionPillAction } from "../../../ui/ActionPill";
import { Badge } from "../../../ui/Badge";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { cx } from "../../../ui/cx";
import { InlineStatus } from "../../../ui/feedback";
import { Icon } from "../../../ui/Icon";
import { InfoTip } from "../../../ui/InfoTip";
import { Photo } from "../../../ui/Photo";
import { Text } from "../../../ui/Text";
import { type ToastHandle, ToastProvider, useToast } from "../../../ui/Toast";
import type { CropDialogProps } from "../photos/CropDialog";
import { type CompressedPhoto, compressPhoto } from "../photos/compress-photo";
import { cropImageOf } from "../photos/crop-geometry";
import { lazyCropDialog, loadCropDialog } from "../photos/lazy-crop-dialog";
import { cardsArePublic, type ShelterVisibility, uploadProgressText } from "./labels";
import { usePhotoDrag } from "./use-photo-drag";

/**
 * K3's «Фото» section (N9). «×» hides a photo and only sends the remove when its undo toast leaves
 * (or the section or page goes away). Writes run one at a time, each planned on the server's list
 * as it is when its turn comes: the server compare-and-sets on that list (P-Q3).
 */

const t = uk.kabinet.animalForm;
const integer = new Intl.NumberFormat("uk");
/** How long «Повернути» stays (the saved page's undo is the same 6 s). */
const UNDO_MS = 6000;
/** `focusNext` value for the add tile (a storage key never looks like this). */
const ADD_TILE = "add-tile";

type UploadState =
  | { kind: "preparing" }
  | { kind: "uploading"; progress: { sent: number; total: number } | null }
  | { kind: "failed"; message: string; retryable: boolean };

type Upload = { id: number; file: File; state: UploadState };

/** A photo «×» has hidden: waiting out its toast, then `sent` once its remove is on the queue. */
type PendingRemove = { toast: ToastHandle | null; sent: boolean };

const codeOf = (error: unknown): string | null =>
  typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : null;

const reasonOf = (error: unknown): unknown => {
  if (typeof error !== "object" || error === null || !("data" in error)) return null;
  const { data } = error;
  return typeof data === "object" && data !== null && "reason" in data ? data.reason : null;
};

const noop = () => undefined;

/** A device-side refusal, in his words (P-T8 (1)-(3)); retrying the same file can't help. */
const compressionMessage = (result: Exclude<CompressedPhoto, { kind: "ok" }>): string => {
  switch (result.kind) {
    case "unsupported_format":
      return t.photoErrors.unsupportedFormat;
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
      // A format the server doesn't take gets the device's own wording (gap 9).
      return {
        message:
          reasonOf(error) === "unsupported_type"
            ? t.photoErrors.unsupportedFormat
            : t.photoErrors.rejected,
        retryable: false,
      };
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

/**
 * The shown photos' new order laid over the server's list: the slots the shown photos hold get them
 * in their new order; a photo waiting out its undo, or one added meanwhile, keeps its own slot.
 */
export function refillOrder(current: readonly string[], shown: readonly string[]): string[] {
  const present = new Set(current);
  const wanted = shown.filter((key) => present.has(key));
  const moving = new Set(wanted);
  let next = 0;
  return current.map((key) => (moving.has(key) ? (wanted[next++] ?? key) : key));
}

export type PhotoSectionProps = {
  animal: KabinetAnimalView;
  editable: boolean;
  /** Where the shelter's cards stand with the public (`shelterVisibilityOf`). */
  shelterVisibility: ShelterVisibility;
  client: KabinetAnimalClient;
  onView: (view: KabinetAnimalView) => void;
  /** Reads the animal again after a refused write; the fresh view, or null if that failed too. */
  reload: () => Promise<KabinetAnimalView | null>;
  compress?: (file: File) => Promise<CompressedPhoto>;
};

/** Its own toast region: the undo belongs to this section and leaves with it. */
export function PhotoSection(props: PhotoSectionProps) {
  return (
    <ToastProvider dismissLabel={uk.kabinet.profileEdit.pause.close} durationMs={UNDO_MS}>
      <PhotoManager {...props} />
    </ToastProvider>
  );
}

function PhotoManager({
  animal,
  editable,
  shelterVisibility,
  client,
  onView,
  reload,
  compress = compressPhoto,
}: PhotoSectionProps) {
  const { show } = useToast();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [writing, setWriting] = useState(false);
  const [status, setStatus] = useState("");
  const [removedOnce, setRemovedOnce] = useState(false);
  // A new node per message, so the live region speaks a line even when it repeats the last one.
  const [announced, setAnnounced] = useState({ text: "", id: 0 });
  const setAnnounce = (text: string) => setAnnounced((current) => ({ text, id: current.id + 1 }));
  const [dropTarget, setDropTarget] = useState(false);
  // Hidden by «×», remove not yet confirmed by the server.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  // The order a drag or Alt+arrow asked for, shown until the reorders on their way have landed.
  const [asked, setAsked] = useState<readonly string[] | null>(null);
  const reordersOnTheirWay = useRef(0);
  const pending = useRef(new Map<string, PendingRemove>());
  // The list the server last gave: every write compare-and-sets on it when its turn comes.
  const serverPhotos = useRef(animal.photos);
  serverPhotos.current = animal.photos;
  const writes = useRef<Promise<void>>(Promise.resolve());
  const pointerType = useRef("mouse");
  const tileIds = useRef(new Map<string, number>());
  const fileInput = useRef<HTMLInputElement>(null);
  const addTile = useRef<HTMLButtonElement>(null);
  const nextId = useRef(1);
  const queue = useRef<Promise<void>>(Promise.resolve());
  // A fresh lazy component per opening: `lazy` would keep a failed chunk load for good.
  const [cropping, setCropping] = useState<{
    key: string;
    n: string;
    Dialog: ComponentType<CropDialogProps>;
  } | null>(null);
  /** The crop button to focus once the crop dialog is gone; the native dialog's opener has unmounted. */
  const focusAfterCrop = useRef<string | null>(null);
  useEffect(() => {
    // While a write is in flight the tiles' fieldsets are disabled, and so is the button.
    if (cropping !== null || writing || focusAfterCrop.current === null) return;
    document.getElementById(focusAfterCrop.current)?.focus();
    focusAfterCrop.current = null;
  });

  const byKey = new Map(animal.photos.map((photo) => [photo.storageKey, photo]));
  const arranged =
    asked === null
      ? animal.photos
      : refillOrder(
          animal.photos.map((photo) => photo.storageKey),
          asked,
        ).flatMap((key) => byKey.get(key) ?? []);
  const photos = arranged.filter((photo) => !hidden.has(photo.storageKey));
  const visibleListing = isDiscoverable(animal.listing);
  const lastPhotoLocked = visibleListing && photos.length === 1;
  // «бачать люди» is true only while the shelter's cards are shown. His other
  // line serves both hidden kinds: «поки її ще не бачать» ("while they still
  // don't see it") makes no claim about verification.
  const lastPhotoText = cardsArePublic(shelterVisibility)
    ? t.photos.lastPhotoKept
    : t.photos.lastPhotoKeptNotShown;
  const inProgress = uploads.filter((upload) => upload.state.kind !== "failed");
  const failed = uploads.filter((upload) => upload.state.kind === "failed");
  const room = MAX_ANIMAL_PHOTOS - photos.length - inProgress.length;

  const serverKeys = () => serverPhotos.current.map((photo) => photo.storageKey);
  const took = (view: KabinetAnimalView) => {
    serverPhotos.current = view.photos;
    onView(view);
  };
  const refresh = async () => {
    const fresh = await reload();
    if (fresh !== null) serverPhotos.current = fresh.photos;
  };
  /** One photo write at a time; a failed one never stops those queued behind it. */
  const serial = <T,>(task: () => Promise<T>): Promise<T> => {
    const run = writes.current.then(task);
    writes.current = run.then(noop, noop);
    return run;
  };
  /** A reorder or removal the server refused: the screen goes back to what the server holds. */
  const refused = async (error: unknown) => {
    const code = codeOf(error);
    if (code === "CONFLICT") {
      setStatus(t.photos.conflict);
      await refresh();
    } else if (code === "PHOTOS_REQUIRED_WHILE_VISIBLE") {
      setStatus(lastPhotoText);
      await refresh();
    } else {
      // K4's «Не збереглося – на картках нічого не змінилося…» says exactly that.
      setStatus(uk.kabinet.profileEdit.state.failed);
    }
  };

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
      // Removes sent to make room for this photo land first; the cap counts what the server holds.
      await writes.current;
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
        serverPhotos.current = view.photos;
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

  // Ids only grow (size + 1 stays above every id handed out, a crop's carried one included).
  const tileIdOf = (key: string) => {
    let id = tileIds.current.get(key);
    if (id === undefined) {
      id = tileIds.current.size + 1;
      tileIds.current.set(key, id);
    }
    return id;
  };
  const cropButtonIdOf = (key: string) => `${animal.id}-photo-crop-${tileIdOf(key)}`;
  const removeButtonIdOf = (key: string) => `${animal.id}-photo-remove-${tileIdOf(key)}`;

  /** Where focus goes once on screen: after «×» or «Повернути» a photo's key (or `ADD_TILE`); after Alt+arrow, a button's id. */
  const focusNext = useRef<{ tile: string } | { button: string } | null>(null);
  useEffect(() => {
    const target = focusNext.current;
    if (target === null) return;
    focusNext.current = null;
    const element =
      "button" in target
        ? document.getElementById(target.button)
        : target.tile === ADD_TILE
          ? addTile.current
          : document.querySelector<HTMLElement>(
              `[data-photo-tile="${tileIdOf(target.tile)}"] button`,
            );
    if (element !== null && element !== document.activeElement) element.focus();
  });

  const unhide = (key: string) =>
    setHidden((current) => {
      if (!current.has(key)) return current;
      const next = new Set(current);
      next.delete(key);
      return next;
    });

  /** The removal itself, planned on the server's list as it is now; keepalive outlives a closing tab. */
  const sendRemove = async (key: string, keepalive: boolean) => {
    const keys = serverKeys();
    try {
      // Already gone (another window, or a reload after a refusal): nothing to send.
      if (!keys.includes(key)) return;
      const input = { animalId: animal.id, expectedPhotoKeys: keys, storageKey: key };
      const view = await (keepalive
        ? client.shelter.photos.remove(input, { context: { keepalive: true } })
        : client.shelter.photos.remove(input));
      took(view);
      setRemovedOnce(true);
    } catch (error) {
      await refused(error);
    } finally {
      pending.current.delete(key);
      unhide(key);
    }
  };

  const commit = (key: string, keepalive: boolean) => {
    const entry = pending.current.get(key);
    if (entry === undefined || entry.sent) return;
    entry.sent = true;
    // Closing the toast calls `onClose` again; `sent` makes that a no-op.
    entry.toast?.dismiss();
    void serial(() => sendRemove(key, keepalive));
  };

  /** Sends every remove still waiting on its toast, now. */
  const flush = (keepalive: boolean) => {
    for (const key of [...pending.current.keys()]) commit(key, keepalive);
  };
  const latest = useRef({ commit, flush });
  latest.current = { commit, flush };

  // Leaving (unmount, a hidden or closing tab) sends what is waiting; a tab killed outright keeps
  // the photo, the safe way to fail.
  useEffect(() => {
    const leave = () => latest.current.flush(true);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") leave();
    };
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", onVisibility);
      leave();
    };
  }, []);

  const restore = (key: string) => {
    const entry = pending.current.get(key);
    if (entry === undefined || entry.sent) return;
    pending.current.delete(key);
    unhide(key);
    // The toast's button is gone once pressed: focus goes to the photo that came back.
    focusNext.current = { tile: key };
  };

  /** «×»: hidden now, removed once «Повернути» has had its time. */
  const hide = (key: string, slot: number) => {
    if (pending.current.has(key)) return;
    const entry: PendingRemove = { toast: null, sent: false };
    pending.current.set(key, entry);
    setHidden((current) => new Set(current).add(key));
    const neighbour = photos[slot + 1] ?? photos[slot - 1];
    focusNext.current = { tile: neighbour === undefined ? ADD_TILE : neighbour.storageKey };
    entry.toast = show(t.photos.removed, "info", {
      durationMs: UNDO_MS,
      action: { label: uk.likes.undo, onAction: () => restore(key) },
      onClose: (reason) => {
        if (reason !== "action") latest.current.commit(key, false);
      },
    });
  };

  const choose = (files: FileList | null) => {
    if (files === null) return;
    const accepted = [...files].slice(0, Math.max(0, room));
    if (accepted.length === 0) return;
    // The server still counts the photos waiting out their undo: past the cap, send those first.
    if (serverPhotos.current.length + inProgress.length + accepted.length > MAX_ANIMAL_PHOTOS) {
      flush(false);
    }
    const added = accepted.map((file) => ({
      id: nextId.current++,
      file,
      state: { kind: "preparing" } as const,
    }));
    setUploads((current) => [...current, ...added]);
    for (const upload of added) enqueue(upload);
  };

  // A drag or Alt+arrow reorders the shown photos (`from`, `to` are shown slots); slot 0 is the
  // cover (P-Q9). Shown at once, so focus and the next keypress follow the new order.
  const move = (from: number, to: number) => {
    const order = photos.map((photo) => photo.storageKey);
    const [moved] = order.splice(from, 1);
    if (moved === undefined || from === to) return;
    order.splice(to, 0, moved);
    setAsked(order);
    reordersOnTheirWay.current += 1;
    void serial(async () => {
      const keys = serverKeys();
      const next = refillOrder(keys, order);
      if (next.every((key, index) => key === keys[index])) return;
      try {
        took(
          await client.shelter.photos.reorder({
            animalId: animal.id,
            expectedPhotoKeys: keys,
            nextPhotoKeys: next,
          }),
        );
        setStatus(t.photos.reordered);
      } catch (error) {
        setAsked(null);
        await refused(error);
      }
    }).finally(() => {
      reordersOnTheirWay.current -= 1;
      if (reordersOnTheirWay.current === 0) setAsked(null);
    });
  };

  /** Alt+← and Alt+→ on a photo's pill move it one place: the keyboard's way to the order. */
  const moveByKey = (event: KeyboardEvent<HTMLButtonElement>, slot: number, button: string) => {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const step = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (step === 0) return;
    // Alt+← is also the browser's Back: never leave the page from here, even at either end.
    event.preventDefault();
    const to = slot + step;
    if (to < 0 || to >= photos.length) return;
    focusNext.current = { button };
    setAnnounce(
      fillTemplate(t.photos.dragDrop, {
        pos: integer.format(to + 1),
        total: integer.format(photos.length),
      }),
    );
    move(slot, to);
  };

  // One entry per photo is the contract; a photo without one is simply not offered a crop.
  const cropViewOf = (key: string) =>
    (animal.photoCrops ?? []).find((entry) => entry.storageKey === key);
  const cropImageFor = (key: string) => {
    const crop = cropViewOf(key);
    return crop === undefined
      ? null
      : cropImageOf(crop, process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL);
  };
  // A seed or demo key has no R2 object to cut from; a support view's source is withheld.
  const cropOffered = (key: string) => isRealPhotoKey(key) && cropImageFor(key) !== null;

  const openCrop = (key: string, n: string) => setCropping({ key, n, Dialog: lazyCropDialog() });
  const closeCrop = (key: string) => {
    focusAfterCrop.current = cropButtonIdOf(key);
    setCropping(null);
  };
  // Pointing at or focusing a crop button fetches the dialog's chunk, so it opens at once.
  const prefetchCrop = () => void loadCropDialog().catch(() => undefined);

  /** The crop write: null once saved or superseded (the dialog closes), else the dialog's sentence. */
  const saveCrop = (key: string, framing: PhotoFraming): Promise<string | null> => {
    setWriting(true);
    return serial(async () => {
      const keys = serverKeys();
      try {
        const view = await client.shelter.photos.crop({
          animalId: animal.id,
          expectedPhotoKeys: keys,
          storageKey: key,
          framing,
        });
        // The crop writes a new key in the same place; the tile keeps its button's id.
        const next = view.photos[keys.indexOf(key)]?.storageKey;
        if (next !== undefined) tileIds.current.set(next, tileIdOf(key));
        closeCrop(key);
        took(view);
        setStatus(t.photos.cropped);
        return null;
      } catch (error) {
        switch (codeOf(error)) {
          case "CONFLICT":
            closeCrop(key);
            setStatus(t.photos.conflict);
            await refresh();
            return null;
          case "RATE_LIMITED":
            return t.photoErrors.rateLimited;
          case "PHOTO_UPLOADS_UNAVAILABLE":
            return t.photoErrors.uploadsUnavailable;
          default:
            // PHOTO_FRAME_REJECTED too: the cropper keeps to its rules, and the card is unchanged.
            return uk.kabinet.profileEdit.state.failed;
        }
      }
    }).finally(() => setWriting(false));
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
      setAnnounce(fillTemplate(t.photos.dragDrop, where(to)));
      move(from, to);
    },
    onCancel: () => setAnnounce(t.photos.dragCancel),
  });
  const canDrag = editable && !writing && total > 1;
  const lifted = drag === null ? undefined : photos[drag.from];
  // While dragging, the others reflow around the slot where the photo would land.
  const order = [...photos];
  if (drag !== null && lifted !== undefined) {
    order.splice(drag.from, 1);
    order.splice(drag.over, 0, lifted);
  }

  const lastPhotoNoteId = `${animal.id}-last-photo`;
  const keyboardHintId = `${animal.id}-photo-keys`;
  const reorderable = editable && total > 1;
  const sizes = "(min-width: 600px) 200px, 50vw";
  const croppingView = cropping === null ? undefined : cropViewOf(cropping.key);
  const croppingImage = cropping === null ? null : cropImageFor(cropping.key);

  const actionsFor = (key: string, slot: number, n: string): ActionPillAction[] => {
    const removeLabel = fillTemplate(t.photos.removeLabel, { n });
    const remove: ActionPillAction = lastPhotoLocked
      ? {
          id: "remove",
          kind: "blocked",
          icon: "close",
          label: removeLabel,
          buttonId: removeButtonIdOf(key),
          reasonId: lastPhotoNoteId,
        }
      : {
          id: "remove",
          kind: "ready",
          icon: "close",
          label: removeLabel,
          buttonId: removeButtonIdOf(key),
          onClick: () => hide(key, slot),
        };
    if (!cropOffered(key)) return [remove];
    return [
      {
        id: "crop",
        kind: "ready",
        icon: "crop",
        label: fillTemplate(t.photos.cropTitle, { n }),
        buttonId: cropButtonIdOf(key),
        onClick: () => openCrop(key, n),
        onIntent: prefetchCrop,
      },
      remove,
    ];
  };

  return (
    <>
      <div className="flex items-center gap-3">
        <InfoTip label={t.photos.infoLabel} closeLabel={uk.kabinet.profileEdit.pause.close}>
          {t.photos.infoText}
        </InfoTip>
        <span className="text-body text-ink-2">
          {fillTemplate(t.photos.counter, {
            n: integer.format(total),
            max: integer.format(MAX_ANIMAL_PHOTOS),
          })}
        </span>
      </div>
      {editable ? <Text look="hint">{t.photos.orderHint}</Text> : null}
      {reorderable ? (
        <p id={keyboardHintId} className="sr-only">
          {t.photos.keyboardHint}
        </p>
      ) : null}
      <ul className="photo-grid items-start gap-3">
        {order.map((photo, slot) => {
          const key = photo.storageKey;
          if (photo === lifted) {
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
            <li
              key={key}
              data-photo-slot={slot}
              data-photo-tile={tileIdOf(key)}
              className="min-w-0"
            >
              <Card tone="outline">
                <fieldset
                  aria-label={fillTemplate(t.photos.tileLabel, { n, total: integer.format(total) })}
                  className="flex min-w-0 flex-col"
                  disabled={!editable || writing}
                >
                  <div className="relative">
                    <Photo src={key} alt="" aspect="portrait" sizes={sizes} />
                    {canDrag ? (
                      // The photo is the drag target: a mouse drags, a held finger lifts it. The
                      // pill is a sibling above it, so a press there never starts a drag.
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
                          start(slot, event);
                        }}
                      />
                    ) : null}
                    <Badge tone="ink" className="pointer-events-none absolute top-2 left-2">
                      {/* The tile's name says the number; the hint says the first is the cover. */}
                      <span aria-hidden="true">
                        {slot === 0 ? fillTemplate(t.photos.coverChip, { n }) : n}
                      </span>
                    </Badge>
                    {editable ? (
                      <ActionPill
                        actions={actionsFor(key, slot, n)}
                        {...(reorderable
                          ? {
                              describedBy: keyboardHintId,
                              onKeyDown: (event, action) => {
                                if (action.buttonId !== undefined) {
                                  moveByKey(event, slot, action.buttonId);
                                }
                              },
                            }
                          : {})}
                        className="absolute right-2 bottom-2"
                      />
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
              ref={addTile}
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
        {editable && room <= 0 ? (
          <li className="col-span-full rounded-card border-2 border-dashed border-line p-4">
            <Text>
              {fillTemplate(t.photos.limitNote, { max: integer.format(MAX_ANIMAL_PHOTOS) })}
            </Text>
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
        <span key={announced.id}>{announced.text}</span>
      </p>
      {cropping !== null && croppingView !== undefined && croppingImage !== null ? (
        <Suspense fallback={null}>
          <cropping.Dialog
            title={fillTemplate(t.photos.cropTitle, { n: cropping.n })}
            image={croppingImage}
            framing={croppingView.framing}
            onSave={(framing) => saveCrop(cropping.key, framing)}
            onClose={() => closeCrop(cropping.key)}
          />
        </Suspense>
      ) : null}
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
