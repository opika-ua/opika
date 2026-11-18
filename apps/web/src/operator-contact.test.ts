import { describe, expect, it } from "vitest";
import { OPERATOR_CONTACT } from "./brand";
import { sourceFiles } from "./guards/scan";

/** One source for the operator's address and Telegram handle: `brand.ts`'s `OPERATOR_CONTACT`. */
describe("the operator's contact details", () => {
  it("no file but brand.ts builds a hello@ address or names the Telegram handle", () => {
    const handle = OPERATOR_CONTACT.telegram.slice(1);
    const hits = sourceFiles()
      .filter(({ file }) => file !== "brand.ts")
      .flatMap(({ lines }) => lines)
      .filter(({ text, comment }) => !comment && (/hello@/.test(text) || text.includes(handle)))
      .map(({ file, line, text }) => `${file}:${line}: ${text.trim()}`);
    expect(hits).toEqual([]);
  });
});
