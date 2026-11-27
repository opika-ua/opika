// Test support: picked files that behave like iOS WebKit's, whose bytes can be withheld.

export const notReadableError = () =>
  new DOMException("The I/O read operation failed.", "NotReadableError");

/** A picked file whose every read fails, as the field reports showed. */
export function withheldFile(name = "IMG_0001.png", type = "image/png"): File {
  const file = new File(["x".repeat(1660)], name, { type });
  file.arrayBuffer = () => Promise.reject(notReadableError());
  return file;
}

/** Picked files that read until `drop()`: iOS removes their temp copies when the input is reset. */
export function tempFiles(names: readonly string[]): { files: File[]; drop: () => void } {
  let dropped = false;
  const files = names.map((name) => {
    const file = new File([name], name, { type: "image/jpeg" });
    const read = file.arrayBuffer.bind(file);
    file.arrayBuffer = () => (dropped ? Promise.reject(notReadableError()) : read());
    return file;
  });
  return { files, drop: () => (dropped = true) };
}

/** Calls `onReset` when the input's value is cleared, keeping the element's own setter. */
export function watchReset(input: HTMLInputElement, onReset: () => void): void {
  const own = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  Object.defineProperty(input, "value", {
    configurable: true,
    get() {
      return own?.get?.call(this);
    },
    set(value: string) {
      if (value === "") onReset();
      own?.set?.call(this, value);
    },
  });
}
