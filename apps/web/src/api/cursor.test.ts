import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decodeRevealCursor, encodeRevealCursor } from "./cursor";

/** The MAC is 128 bits; a cursor with the old 64-bit tag decodes as invalid (the caller's INVALID_CURSOR), never throws. */

const SECRET = "x".repeat(32);
const position = { at: new Date("2026-11-03T10:00:00Z"), id: "a-1" };

const macOf = (cursor: string) =>
  Buffer.from(cursor, "base64url").toString("utf8").split(":", 1)[0];

describe("signed cursor MAC", () => {
  it("is 128 bits (32 hex characters) and round-trips", () => {
    const cursor = encodeRevealCursor(position, SECRET);
    expect(macOf(cursor)).toMatch(/^[0-9a-f]{32}$/);
    expect(decodeRevealCursor(cursor, SECRET)?.data).toEqual(position);
  });

  it("treats a cursor issued with the old 64-bit tag as invalid, not an error", () => {
    const json = JSON.stringify({
      kind: "reveal",
      filtersFingerprint: "",
      at: position.at.toISOString(),
      id: position.id,
    });
    const oldMac = createHmac("sha256", SECRET).update(json).digest("hex").slice(0, 16);
    const old = Buffer.from(`${oldMac}:${json}`).toString("base64url");
    expect(decodeRevealCursor(old, SECRET)).toBeNull();
  });

  it("rejects a truncated tag, a wrong secret and garbage", () => {
    const cursor = encodeRevealCursor(position, SECRET);
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const truncated = Buffer.from(raw.slice(16)).toString("base64url");
    expect(decodeRevealCursor(truncated, SECRET)).toBeNull();
    expect(decodeRevealCursor(cursor, "y".repeat(32))).toBeNull();
    expect(decodeRevealCursor("not-a-cursor", SECRET)).toBeNull();
  });
});
