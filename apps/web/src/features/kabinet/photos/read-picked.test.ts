import { describe, expect, it } from "vitest";
import { tempFiles, withheldFile } from "./picked-fixtures";
import { readPicked } from "./read-picked";

describe("readPicked", () => {
  it("copies the bytes into memory: the copy still reads once the picked file's temp copy is gone", async () => {
    const { files, drop } = tempFiles(["IMG_0002.jpg"]);
    const [file] = files;
    if (file === undefined) throw new Error("no file");
    const picked = await readPicked(file);
    drop();
    expect(picked.kind).toBe("in_memory");
    if (picked.kind !== "in_memory") return;
    expect(picked.file.type).toBe("image/jpeg");
    expect(new TextDecoder().decode(await picked.file.arrayBuffer())).toBe("IMG_0002.jpg");
    await expect(file.arrayBuffer()).rejects.toThrow("The I/O read operation failed.");
  });

  it("a file the device won't read is not_readable, with what it threw, its type and size", async () => {
    const picked = await readPicked(withheldFile());
    expect(picked).toEqual({
      kind: "not_readable",
      error: expect.objectContaining({ name: "NotReadableError" }),
      type: "image/png",
      size: 1660,
    });
  });
});
