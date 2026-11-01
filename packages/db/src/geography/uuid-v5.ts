import { createHash } from "node:crypto";

/**
 * Fixed namespace for ids derived from official geography codes. Never change it: every region
 * and (from the importer on) settlement id is a function of it, and the same code must give the
 * same id on a child branch and on production.
 */
export const OPIKA_GEO_NAMESPACE = "7c1e8f4a-3b52-4d96-9a0e-5f2b6d8c1a47";

/** RFC 9562 UUIDv5 (SHA-1 over namespace and name); `node:crypto` only, no dependency. */
export function uuidV5(name: string, namespace: string = OPIKA_GEO_NAMESPACE): string {
  const namespaceBytes = Buffer.from(namespace.replaceAll("-", ""), "hex");
  const hash = createHash("sha1").update(namespaceBytes).update(name, "utf8").digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
