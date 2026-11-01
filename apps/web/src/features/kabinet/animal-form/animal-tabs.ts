// Not a client module, so the server page can read `?tab=` with it.
/** The editor's tabs and their `?tab=` values (Latin slugs, like the routes). The first is the default. */
export const ANIMAL_TABS = ["osnovne", "foto", "pro-tvarynu", "zdorovia", "publikatsiia"] as const;
export type AnimalTab = (typeof ANIMAL_TABS)[number];
export const animalTabOf = (raw: string | undefined): AnimalTab =>
  ANIMAL_TABS.find((tab) => tab === raw) ?? "osnovne";
