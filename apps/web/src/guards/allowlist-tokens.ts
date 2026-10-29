/**
 * Legacy token classes still in use, as per-file ceilings. `rg`: the V2 set; `fontRg`: e-Ukraine;
 * `brand`: the brand set (aliases of the single token set until DS PR 4); `bare`: the Keeper's
 * Voice set plus `font-sans` and `font-serif`. Seeded 2026-10-28. New UI uses the unprefixed
 * tokens and the type scale in `app/globals.css`; migrations only lower the numbers, to zero.
 */
export const TOKEN_CEILINGS: Readonly<
  Record<"rg" | "fontRg" | "brand" | "bare", Readonly<Record<string, number>>>
> = {
  rg: {
    "features/animal-detail/medical-labels.ts": 10,
    "features/chrome/RateLimitedScreen.tsx": 4,
    "features/controls/ModalDialog.tsx": 7,
    "features/kabinet/operator/actions/styles.ts": 4,
    "features/kabinet/operator/create/CreateShelterForm.tsx": 1,
    "features/kabinet/operator/evidence-editor/EvidenceEditor.tsx": 2,
    "features/kabinet/operator/OperatorShell.tsx": 1,
    "features/kabinet/profile-edit/styles.ts": 16,
  },
  fontRg: {
    "features/chrome/RateLimitedScreen.tsx": 1,
  },
  brand: {},
  bare: {},
};
