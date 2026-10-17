import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AGE_BUCKETS, SIZE_BUCKETS } from "@opika/domain";
import { describe, expect, it } from "vitest";
import {
  ageBucketLabel,
  ageBucketLabelFor,
  PENDING_FEMININE_AGE_LABELS,
  sizeLabel,
} from "./animal-labels";
import { COPY_PENDING } from "./messages/uk";

describe("ageBucketLabel", () => {
  it("returns a distinct, non-empty word for every bucket", () => {
    const labels = AGE_BUCKETS.map(ageBucketLabel);
    expect(labels.every((label) => label.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(AGE_BUCKETS.length);
  });

  it("matches the card meta line's expected word for a known bucket", () => {
    expect(ageBucketLabel("young")).toBe("молодий");
  });
});

describe("sizeLabel", () => {
  it("returns a distinct, non-empty word for every bucket", () => {
    const labels = SIZE_BUCKETS.map(sizeLabel);
    expect(labels.every((label) => label.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(SIZE_BUCKETS.length);
  });

  it("matches the card meta line's expected word for a known bucket", () => {
    expect(sizeLabel("small")).toBe("мала");
  });
});

/** Q9 (K3-F1): sex-aware age words for the card. */
describe("ageBucketLabelFor", () => {
  it("the masculine words are the card's words today, transcribed", () => {
    expect(AGE_BUCKETS.map((bucket) => ageBucketLabelFor(bucket, "masculine"))).toEqual([
      "малюк",
      "молодий",
      "дорослий",
      "літній",
    ]);
  });

  /** When his feminine words land, this test and the scan below change together. */
  it("the feminine words are still pending his Ukrainian", () => {
    expect(
      AGE_BUCKETS.map((bucket) => ageBucketLabelFor(bucket, "feminine").startsWith(COPY_PENDING)),
    ).toEqual([true, true, true, true]);
    expect(Object.keys(PENDING_FEMININE_AGE_LABELS).sort()).toEqual([...AGE_BUCKETS].sort());
  });

  /** A pending word must never reach a card: nothing outside this package uses them yet. */
  it("nothing outside packages/i18n imports them while they're pending", () => {
    const root = resolve(fileURLToPath(import.meta.url), "../../../..");
    const skip = new Set(["node_modules", ".next", "dist", ".git", "test-results"]);
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        if (skip.has(name)) return [];
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return files(path);
        return /\.(ts|tsx)$/.test(name) ? [path] : [];
      });
    const users = [...files(join(root, "apps")), ...files(join(root, "packages"))]
      .filter((path) => !relative(root, path).replaceAll("\\", "/").startsWith("packages/i18n/"))
      .filter((path) =>
        /ageBucketLabelFor|PENDING_FEMININE_AGE_LABELS/.test(readFileSync(path, "utf8")),
      )
      .map((path) => relative(root, path));
    expect(users).toEqual([]);
  });
});
