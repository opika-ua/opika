import type { ShelterId } from "@opika/domain";
import { describe, expect, it } from "vitest";
import {
  decodeKabinetHistoryCursor,
  decodeRegistryHistoryCursor,
  decodeRegistrySheltersCursor,
  encodeKabinetHistoryCursor,
  encodeRegistryHistoryCursor,
  encodeRegistrySheltersCursor,
  registrySheltersFingerprint,
} from "./cursor";

/** The registry's two cursors: signed, bound to their list and filters, never crossing lists. */

const SECRET = "test-secret";
const SHELTER = "shelter-1";
const position = { rank: 0 as const, name: "Барбос", id: "s-1" as ShelterId };
const fingerprint = registrySheltersFingerprint("бар", "pending");

describe("registry shelters cursor", () => {
  it("round-trips the position, Cyrillic name included", () => {
    const cursor = encodeRegistrySheltersCursor(position, fingerprint, SECRET);
    expect(decodeRegistrySheltersCursor(cursor, fingerprint, SECRET)).toEqual({ data: position });
  });

  it("refuses a cursor issued for another search or status", () => {
    const cursor = encodeRegistrySheltersCursor(position, fingerprint, SECRET);
    expect(
      decodeRegistrySheltersCursor(cursor, registrySheltersFingerprint("бар", null), SECRET),
    ).toBeNull();
    expect(
      decodeRegistrySheltersCursor(cursor, registrySheltersFingerprint(null, "pending"), SECRET),
    ).toBeNull();
  });

  it("refuses a tampered or foreign-signed cursor", () => {
    const cursor = encodeRegistrySheltersCursor(position, fingerprint, SECRET);
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const tampered = Buffer.from(raw.replace('"rank":0', '"rank":1')).toString("base64url");
    expect(decodeRegistrySheltersCursor(tampered, fingerprint, SECRET)).toBeNull();
    expect(decodeRegistrySheltersCursor(cursor, fingerprint, "other-secret")).toBeNull();
    expect(decodeRegistrySheltersCursor("not-a-cursor", fingerprint, SECRET)).toBeNull();
  });

  it("never accepts a history cursor as a list position", () => {
    const history = encodeRegistryHistoryCursor({ at: new Date(), id: "h" }, SHELTER, SECRET);
    expect(decodeRegistrySheltersCursor(history, SHELTER, SECRET)).toBeNull();
  });
});

describe("registry history cursor", () => {
  const at = new Date("2026-10-13T10:00:00.000Z");

  it("round-trips, bound to the shelter", () => {
    const cursor = encodeRegistryHistoryCursor({ at, id: "h-1" }, SHELTER, SECRET);
    expect(decodeRegistryHistoryCursor(cursor, SHELTER, SECRET)).toEqual({
      data: { at, id: "h-1" },
    });
    expect(decodeRegistryHistoryCursor(cursor, "shelter-2", SECRET)).toBeNull();
  });

  it("never crosses to the shelter's own history list, in either direction", () => {
    const operator = encodeRegistryHistoryCursor({ at, id: "h-1" }, SHELTER, SECRET);
    const shelterSide = encodeKabinetHistoryCursor({ at, id: "h-1" }, SHELTER, SECRET);
    expect(decodeKabinetHistoryCursor(operator, SHELTER, SECRET)).toBeNull();
    expect(decodeRegistryHistoryCursor(shelterSide, SHELTER, SECRET)).toBeNull();
  });
});
