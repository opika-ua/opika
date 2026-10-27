"use client";

import type { KabinetShelterView } from "@opika/contracts";
import { uk } from "@opika/i18n";
import { useRef, useState } from "react";
import type {
  KabinetProfileClient,
  KabinetProfileClientContext,
} from "../../../api/kabinet-browser-client";
import { Button } from "../../controls/controls";
import { ShelterLogoAvatar } from "../../shelters/ShelterLogoAvatar";
import { type CompressedPhoto, compressPhoto } from "../photos/compress-photo";
import { CAPTION, CARD, CARD_TITLE, ERROR_TEXT } from "./styles";

const t = uk.kabinet.profileEdit.logo;
const photoErrors = uk.kabinet.animalForm.photoErrors;

const codeOf = (error: unknown): string | null =>
  typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : null;

type UploadState =
  | { kind: "idle" }
  | { kind: "preparing" }
  | { kind: "uploading"; progress: { sent: number; total: number } | null }
  | { kind: "failed"; message: string };

/** A device-side refusal, the same three outcomes `PhotoSection`'s own compression step can produce. */
const compressionMessage = (result: Exclude<CompressedPhoto, { kind: "ok" }>): string => {
  switch (result.kind) {
    case "heic_unsupported":
      return photoErrors.heicUnsupported;
    case "unreadable":
      return photoErrors.unreadable;
    case "too_large":
      return photoErrors.tooLarge;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled refusal; unreachable at runtime */
    default: {
      const unreachable: never = result;
      return unreachable;
    }
  }
};

/** The server's refusal of an upload, in the logo's own words, never the animal-photo ones. */
const uploadFailure = (error: unknown): string => {
  switch (codeOf(error)) {
    case "PHOTO_REJECTED":
      return t.rejected;
    case "RATE_LIMITED":
      return t.rateLimited;
    case "PHOTO_UPLOADS_UNAVAILABLE":
      return t.uploadsUnavailable;
    default:
      return t.failed;
  }
};

/**
 * K4's logo section (pet card PR 3b §C): the current logo or the
 * fallback-initials avatar, a file input («Додати логотип» with none set,
 * «Змінити логотип» once one is) and, once a logo is set, «Прибрати
 * логотип». Reuses `compressPhoto` on the device first, the same as
 * `PhotoSection`'s animal photos - a logo is still just an image upload,
 * re-encoded and stripped of metadata the same way.
 *
 * Calls `client.shelter.logo.*` directly rather than going through
 * `ProfileEditor`'s generic `write()` wrapper, for the same reason
 * `PhotoSection` doesn't use it either: a file upload has its own
 * compression step and its own error vocabulary (`PHOTO_REJECTED`,
 * `RATE_LIMITED`, `PHOTO_UPLOADS_UNAVAILABLE`), which the profile's generic
 * `CONFLICT`/`ILLEGAL_TRANSITION` mapping doesn't know about.
 */
export function LogoSection({
  logo,
  displayName,
  onView,
  client,
  compress = compressPhoto,
}: {
  logo: KabinetShelterView["logo"];
  displayName: string;
  onView: (view: KabinetShelterView) => void;
  client: Pick<KabinetProfileClient, "shelter">;
  compress?: (file: File) => Promise<CompressedPhoto>;
}) {
  const [state, setState] = useState<UploadState>({ kind: "idle" });
  const [status, setStatus] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const choose = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setState({ kind: "preparing" });
    const compressed = await compress(file).catch((): CompressedPhoto => ({ kind: "unreadable" }));
    if (compressed.kind !== "ok") {
      setState({ kind: "failed", message: compressionMessage(compressed) });
      return;
    }
    setState({ kind: "uploading", progress: null });
    try {
      const context: { context: KabinetProfileClientContext } = {
        context: {
          onUploadProgress: (progress) => setState({ kind: "uploading", progress }),
        },
      };
      const view = await client.shelter.logo.set(
        { file: new File([compressed.file], "logo.jpg", { type: "image/jpeg" }) },
        context,
      );
      onView(view);
      setState({ kind: "idle" });
      setStatus(t.updated);
    } catch (error) {
      setState({ kind: "failed", message: uploadFailure(error) });
    }
  };

  const remove = async () => {
    try {
      const view = await client.shelter.logo.remove({});
      onView(view);
      setStatus(t.removed);
    } catch {
      setStatus(t.removeFailed);
    }
  };

  return (
    <section aria-labelledby="logo-title" className={CARD}>
      <h2 id="logo-title" className={CARD_TITLE}>
        {t.title}
      </h2>
      <div className="flex items-center gap-3">
        <ShelterLogoAvatar logo={logo} displayName={displayName} />
        <div className="flex flex-col items-start gap-1">
          <Button
            variant="secondary"
            aria-busy={state.kind === "preparing" || state.kind === "uploading" || undefined}
            onClick={() => fileInput.current?.click()}
          >
            {logo === null ? t.add : t.change}
          </Button>
          {logo !== null ? (
            <Button variant="text" onClick={() => void remove()}>
              {t.remove}
            </Button>
          ) : null}
        </div>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        data-testid="logo-file-input"
        onChange={(event) => {
          void choose(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
      {state.kind === "preparing" || state.kind === "uploading" ? (
        <p className={CAPTION}>{t.uploading}</p>
      ) : null}
      {state.kind === "failed" ? (
        <p role="alert" className={ERROR_TEXT}>
          {state.message}
        </p>
      ) : null}
      <p role="status" className={CAPTION}>
        {status}
      </p>
    </section>
  );
}
