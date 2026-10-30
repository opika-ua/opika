/** From this length a shelter's name no longer fits beside the 64px logo on a phone and goes under it. */
export const STACKED_NAME_OVER = 40;

export function isLongShelterName(name: string): boolean {
  return name.trim().length > STACKED_NAME_OVER;
}
