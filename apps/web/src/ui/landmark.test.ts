import { expect, it } from "vitest";
import { sourceFiles } from "../guards/scan";

/** The skip link can only land on a page whose `<main>` carries the shared id; a new page can't forget it. */
it("every <main> element spreads MAIN_LANDMARK", () => {
  const missing = sourceFiles().flatMap(({ file, lines }) =>
    lines
      .filter(
        ({ comment, text }) =>
          !comment &&
          /<main[\s>]/.test(text) &&
          !text.includes("MAIN_LANDMARK") &&
          !text.includes("<body><main>"),
      )
      .map(({ line }) => `${file}:${line}`),
  );
  expect(missing).toEqual([]);
});
