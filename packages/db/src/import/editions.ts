import { createHash } from "node:crypto";

/**
 * The codifier editions the importer accepts, each pinned by the sha256 of the ministry's XLSX.
 * There is no stable "latest" URL (the file name changes every edition and the host has moved), so
 * the owner downloads the file and passes its path; the bytes must match a pin here. A new edition
 * is added by hand after looking at its dry run, and its counts are pinned too so a parser that
 * silently loses rows fails instead of importing fewer settlements.
 */
export type PinnedEdition = {
  /** Stored on each row it confirms (`cities.source_edition`). */
  readonly id: string;
  readonly order: string;
  readonly fileName: string;
  readonly sha256: string;
  /** Rows per settlement category: special-status cities, cities, selyshche, villages. */
  readonly settlements: {
    readonly K: number;
    readonly M: number;
    readonly X: number;
    readonly C: number;
  };
};

export const PINNED_EDITIONS: readonly PinnedEdition[] = [
  {
    id: "2026-07-07",
    order: "1321",
    fileName: "kodifikator-07-07.xlsx",
    sha256: "5c5317759b2b90208e9b00338bc3db3c5e694272a166acf73f1543b3e18ecbea",
    settlements: { K: 2, M: 461, X: 1979, C: 27261 },
  },
];

export const sha256Of = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");
