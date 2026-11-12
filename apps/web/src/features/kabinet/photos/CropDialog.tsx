"use client";

import "../../../zod-client-config";
import { PHOTO_FRAME_ASPECT, type PhotoFraming } from "@opika/domain";
import { uk } from "@opika/i18n";
import { useId, useState } from "react";
import Cropper, { type MediaSize, type Point } from "react-easy-crop";
import { Button } from "../../../ui/Button";
import { InlineStatus } from "../../../ui/feedback";
import { Modal } from "../../../ui/Modal";
import { Text } from "../../../ui/Text";
import { CropPreview } from "./CropPreview";
import {
  type CropArea,
  type CropImage,
  frameOfArea,
  initialAreaOf,
  partOfArea,
  stepZoom,
  zoomBoundsOf,
} from "./crop-geometry";

const t = uk.kabinet.animalForm.photos;
const pause = uk.kabinet.profileEdit.pause;
const state = uk.kabinet.profileEdit.state;

// The library's own stylesheet is off (it injects hard-coded colours); these are its rules in tokens.
const CROPPER_CLASSES = {
  containerClassName:
    "absolute inset-0 flex cursor-move touch-none select-none items-center justify-center overflow-hidden",
  mediaClassName: "absolute inset-0 m-auto max-h-full max-w-full will-change-transform",
  // The huge ring dims everything outside the frame; the outline sits inside so no edge clips it.
  cropAreaClassName:
    "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border-2 border-on-ink ring-2000 ring-ink/60 focus-ring-inset",
};

export type CropDialogProps = {
  /** «Обрізати фото {n}», filled. */
  title: string;
  image: CropImage;
  /** The photo's framing now: the cropper opens on it. */
  framing: PhotoFraming;
  /** Sends the frame: null once saved (the section then closes this dialog), else the sentence to show. */
  onSave: (framing: PhotoFraming) => Promise<string | null>;
  onClose: () => void;
};

/**
 * The crop frame (crop-frame shape §8), loaded on first use with react-easy-crop in its own chunk.
 * Drag, pinch, wheel or the arrow keys move the photo under a fixed 4:5 frame; «−» and «+» zoom
 * between the widest frame and the 400 px minimum. Nothing is cut here: the frame goes to the server.
 */
export function CropDialog({ title, image, framing, onSave, onClose }: CropDialogProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const noteId = `${id}-note`;
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<CropArea | null>(null);
  const [size, setSize] = useState(image.size);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const bounds = zoomBoundsOf(size);
  const shownZoom = Math.min(bounds.max, Math.max(bounds.min, zoom));
  const initialArea = initialAreaOf(framing);

  const close = () => {
    if (!busy) onClose();
  };
  const zoomBy = (direction: "in" | "out") => {
    if (!busy) setZoom(stepZoom(shownZoom, direction, bounds));
  };
  const save = async () => {
    if (busy || area === null) return;
    setBusy(true);
    setRefusal(null);
    try {
      setRefusal(await onSave({ kind: "frame", frame: frameOfArea(area, size) }));
    } catch {
      setRefusal(state.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={title} closeLabel={pause.close} locked={busy} onClose={close}>
      <Text id={hintId}>{t.cropHint}</Text>
      {image.zoomOnly ? (
        <Text look="hint" id={noteId}>
          {t.cropLegacyNote}
        </Text>
      ) : null}
      <div className="relative h-72 overflow-clip rounded-panel bg-ink tablet:h-80">
        {failed ? null : (
          <Cropper
            key={attempt}
            image={image.url}
            crop={crop}
            zoom={shownZoom}
            aspect={PHOTO_FRAME_ASPECT}
            objectFit="contain"
            restrictPosition
            minZoom={bounds.min}
            maxZoom={bounds.max}
            keyboardStep={10}
            {...(initialArea === undefined ? {} : { initialCroppedAreaPercentages: initialArea })}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropAreaChange={setArea}
            onMediaLoaded={(media: MediaSize) =>
              setSize({ width: media.naturalWidth, height: media.naturalHeight })
            }
            disableAutomaticStylesInjection
            classes={CROPPER_CLASSES}
            mediaProps={{ onError: () => setFailed(true) }}
            cropperProps={{
              role: "application",
              "aria-label": t.cropAreaLabel,
              "aria-describedby": image.zoomOnly ? `${hintId} ${noteId}` : hintId,
            }}
          />
        )}
      </div>
      {failed ? (
        <div className="flex flex-col items-start gap-2">
          <InlineStatus tone="error">{t.cropLoadFailed}</InlineStatus>
          <Button
            variant="secondary"
            onClick={() => {
              setFailed(false);
              setArea(null);
              setAttempt((n) => n + 1);
            }}
          >
            {state.retry}
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex gap-3">
          <Button
            variant="icon"
            aria-label={t.zoomOut}
            aria-disabled={shownZoom <= bounds.min || undefined}
            onClick={() => zoomBy("out")}
          >
            <span aria-hidden="true" className="text-title">
              −
            </span>
          </Button>
          <Button
            variant="icon"
            aria-label={t.zoomIn}
            aria-disabled={shownZoom >= bounds.max || undefined}
            onClick={() => zoomBy("in")}
          >
            <span aria-hidden="true" className="text-title">
              +
            </span>
          </Button>
        </div>
        <CropPreview url={image.url} part={area === null ? null : partOfArea(area)} size={size} />
      </div>
      {refusal === null ? null : <InlineStatus tone="error">{refusal}</InlineStatus>}
      <div className="flex flex-col gap-2 tablet:flex-row">
        <Button
          variant="primary"
          status={busy ? "loading" : "idle"}
          aria-disabled={busy || area === null || undefined}
          onClick={() => void save()}
        >
          {busy ? state.saving : t.cropSave}
        </Button>
        <Button variant="secondary" onClick={close}>
          {pause.cancel}
        </Button>
      </div>
    </Modal>
  );
}
