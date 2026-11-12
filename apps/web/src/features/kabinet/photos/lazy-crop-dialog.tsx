import { uk } from "@opika/i18n";
import { Component, type ComponentType, lazy, type ReactNode } from "react";
import { reportClientError } from "../../../observability/load-client";
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

type UnavailableProps = Pick<CropDialogProps, "title" | "onClose">;

/** A chunk that never arrived, or a cropper that failed: said in the dialog. «Обрізати» again retries. */
function CropDialogUnavailable({ title, onClose }: UnavailableProps) {
  return (
    <Modal open title={title} closeLabel={uk.kabinet.profileEdit.pause.close} onClose={onClose}>
      <InlineStatus tone="error">{uk.kabinet.animalForm.photos.cropLoadFailed}</InlineStatus>
    </Modal>
  );
}

/** The crop's own boundary: a cropper that throws ends in its dialog, never the kabinet page. */
class CropDialogBoundary extends Component<
  UnavailableProps & { children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    reportClientError(error);
  }

  override render() {
    const { title, onClose, children } = this.props;
    return this.state.failed ? <CropDialogUnavailable title={title} onClose={onClose} /> : children;
  }
}

/**
 * The crop dialog behind `React.lazy`, so react-easy-crop downloads with it, on demand. A new one
 * per opening: `lazy` keeps a failed load for good, and the boundary its failure; the module itself
 * is fetched only once.
 */
export function lazyCropDialog(): ComponentType<CropDialogProps> {
  const Dialog = lazy(() =>
    loadCropDialog().then(
      (module) => ({ default: module.CropDialog }),
      () => ({ default: CropDialogUnavailable }),
    ),
  );
  return function GuardedCropDialog(props: CropDialogProps) {
    return (
      <CropDialogBoundary title={props.title} onClose={props.onClose}>
        <Dialog {...props} />
      </CropDialogBoundary>
    );
  };
}
