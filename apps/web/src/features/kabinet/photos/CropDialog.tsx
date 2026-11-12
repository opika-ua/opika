"use client";

import "../../../zod-client-config";
import { PHOTO_FRAME_ASPECT, type PhotoFraming } from "@opika/domain";
import { uk } from "@opika/i18n";
import { useCallback, useId, useLayoutEffect, useMemo, useState } from "react";
import Cropper, { type Area, type MediaSize, type Point } from "react-easy-crop";
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

// Below these a move or zoom is float noise, not the person: no re-render for it.
const CROP_EPSILON_PX = 0.01;
const ZOOM_EPSILON = 0.001;

const isFiniteArea = (area: Area) =>
  [area.x, area.y, area.width, area.height].every((value) => Number.isFinite(value));

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
  // Which write is in flight: the frame shown, or the reset to the automatic crop.
  const [sending, setSending] = useState<PhotoFraming["kind"] | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const busy = sending !== null;
  const bounds = zoomBoundsOf(size);
  const shownZoom = Math.min(bounds.max, Math.max(bounds.min, zoom));
  // Read once: the cropper takes the stored frame on load only, so nothing here re-feeds it.
  const [initialArea] = useState(() => initialAreaOf(framing));
  // The cropper measures its box on mount; in a dialog not yet shown that is 0 x 0, a stored frame's
  // zoom comes out NaN and it updates until React stops it (#185). Modal's showModal is a child's
  // layout effect, so it has run before this one.
  const [dialogShown, setDialogShown] = useState(false);
  useLayoutEffect(() => setDialogShown(true), []);

  // A non-finite value is the cropper measuring nothing; neither it nor float noise re-renders.
  const moveTo = useCallback(
    (next: Point) =>
      setCrop((current) =>
        Number.isFinite(next.x) &&
        Number.isFinite(next.y) &&
        (Math.abs(next.x - current.x) >= CROP_EPSILON_PX ||
          Math.abs(next.y - current.y) >= CROP_EPSILON_PX)
          ? next
          : current,
      ),
    [],
  );
  const zoomTo = useCallback(
    (next: number) =>
      setZoom((current) =>
        Number.isFinite(next) && Math.abs(next - current) >= ZOOM_EPSILON ? next : current,
      ),
    [],
  );
  const showArea = useCallback((next: Area) => {
    if (isFiniteArea(next)) setArea(next);
  }, []);
  const takeSize = useCallback(
    (media: MediaSize) => setSize({ width: media.naturalWidth, height: media.naturalHeight }),
    [],
  );
  const mediaProps = useMemo(() => ({ onError: () => setFailed(true) }), []);
  const describedBy = image.zoomOnly ? `${hintId} ${noteId}` : hintId;
  const cropperProps = useMemo(
    () => ({ role: "application", "aria-label": t.cropAreaLabel, "aria-describedby": describedBy }),
    [describedBy],
  );

  const close = () => {
    if (!busy) onClose();
  };
  const zoomBy = (direction: "in" | "out") => {
    if (!busy) setZoom(stepZoom(shownZoom, direction, bounds));
  };
  const send = async (next: PhotoFraming) => {
    setSending(next.kind);
    setRefusal(null);
    try {
      setRefusal(await onSave(next));
    } catch {
      setRefusal(state.failed);
    } finally {
      setSending(null);
    }
  };
  const save = () => {
    if (!busy && area !== null) void send({ kind: "frame", frame: frameOfArea(area, size) });
  };
  const reset = () => {
    if (!busy) void send({ kind: "attention" });
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
        {failed || !dialogShown ? null : (
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
            onCropChange={moveTo}
            onZoomChange={zoomTo}
            onCropAreaChange={showArea}
            onMediaLoaded={takeSize}
            disableAutomaticStylesInjection
            classes={CROPPER_CLASSES}
            mediaProps={mediaProps}
            cropperProps={cropperProps}
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
          status={sending === "frame" ? "loading" : "idle"}
          aria-disabled={busy || area === null || undefined}
          onClick={save}
        >
          {sending === "frame" ? state.saving : t.cropSave}
        </Button>
        <Button variant="secondary" onClick={close}>
          {pause.cancel}
        </Button>
      </div>
      {/* Only a stored frame has something to undo; the reset needs no image, so it works if that failed. */}
      {framing.kind === "frame" ? (
        <Button
          variant="ghost"
          status={sending === "attention" ? "loading" : "idle"}
          aria-disabled={busy || undefined}
          className="self-start"
          onClick={reset}
        >
          {t.cropReset}
        </Button>
      ) : null}
    </Modal>
  );
}
