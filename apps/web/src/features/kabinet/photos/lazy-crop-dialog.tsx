import { uk } from "@opika/i18n";
import { type ComponentType, lazy } from "react";
import { InlineStatus } from "../../../ui/feedback";
import { Modal } from "../../../ui/Modal";
import type { CropDialogProps } from "./CropDialog";

type CropDialogModule = typeof import("./CropDialog");

let chunk: Promise<CropDialogModule> | null = null;

/** Starts, or joins, the dialog chunk's download; one that failed is asked for again next time. */
export function loadCropDialog(): Promise<CropDialogModule> {
  chunk ??= import("./CropDialog").catch((error: unknown) => {
    chunk = null;
    throw error;
  });
  return chunk;
}

/** A chunk that never arrived: said in the dialog, never a broken form. «Обрізати» again retries. */
function CropDialogUnavailable({ title, onClose }: CropDialogProps) {
  return (
    <Modal open title={title} closeLabel={uk.kabinet.profileEdit.pause.close} onClose={onClose}>
      <InlineStatus tone="error">{uk.kabinet.animalForm.photos.cropLoadFailed}</InlineStatus>
    </Modal>
  );
}

/**
 * The crop dialog behind `React.lazy`, so react-easy-crop downloads with it, on demand. A new one
 * per opening: `lazy` keeps a failed load for good, and the module itself is fetched only once.
 */
export function lazyCropDialog(): ComponentType<CropDialogProps> {
  return lazy(() =>
    loadCropDialog().then(
      (module) => ({ default: module.CropDialog }),
      () => ({ default: CropDialogUnavailable }),
    ),
  );
}
