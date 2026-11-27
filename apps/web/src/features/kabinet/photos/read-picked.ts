/**
 * A picked file copied into memory, or the device refusing to hand it over. iOS WebKit drops its temp
 * copy of picked files once the input is reset, so a file still waiting its turn read as
 * NotReadableError (Sentry 163896225); a copy taken at pick time doesn't depend on that temp file.
 */
export type PickedFile =
  | { kind: "in_memory"; file: File }
  | { kind: "not_readable"; error: unknown; type: string; size: number };

/** Any read rejection is `not_readable`: iOS throws NotFoundError as well as NotReadableError for it. */
export async function readPicked(file: File): Promise<PickedFile> {
  try {
    const bytes = await file.arrayBuffer();
    return {
      kind: "in_memory",
      file: new File([bytes], file.name, { type: file.type, lastModified: file.lastModified }),
    };
  } catch (error) {
    return { kind: "not_readable", error, type: file.type, size: file.size };
  }
}
